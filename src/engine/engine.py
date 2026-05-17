"""Main simulation engine — runs the configurable state machine at accelerated speed."""

from __future__ import annotations
import logging
import random
import time as wall_time
from datetime import datetime, timedelta, timezone
from typing import Any

from src.engine.config import SimulationConfig, StateConfig, DeviationConfig
from src.engine.models import EntityState, ResourceState, Position, SimulationContext
from src.engine.state_graph import StateGraphExecutor
from src.engine.resource_manager import ResourceManager
from src.engine.spatial import SpatialGraph, advance_along_route
from src.engine.scheduler import EntityScheduler
from src.engine.recorder import SimulationRecorder

logger = logging.getLogger(__name__)

# Sequence of locations entities should visit in order
_LOCATION_SEQUENCE: list[list[str]] = []


class SimulationEngine:
    """Runs a deterministic, accelerated industrial simulation."""

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config

        if config.seed is not None:
            random.seed(config.seed)

        # Virtual clock
        self.sim_time = datetime.now(timezone.utc).replace(
            hour=6, minute=0, second=0, microsecond=0
        )
        self.end_time = self.sim_time + timedelta(hours=config.duration_hours)
        self.elapsed_s: float = 0.0

        # Core systems
        self.resource_mgr = ResourceManager()
        self.spatial = SpatialGraph.from_config(config.facility)
        self.recorder = SimulationRecorder()

        # State graph executors (one per graph type)
        self.state_graphs: dict[str, StateGraphExecutor] = {}
        for name, sg_config in config.state_graphs.items():
            self.state_graphs[name] = StateGraphExecutor(sg_config)

        # Initialize resources from facility locations
        self._init_resources()

        # Build location sequence for product flow
        self._location_sequence = self._build_location_sequence()

        # Spawn point for new entities
        spawn_pos = self._find_spawn_position()

        # Scheduler
        self.scheduler = EntityScheduler(
            schedule=config.schedule,
            entity_types=config.entity_types,
            spawn_position=spawn_pos,
            seed=config.seed,
        )

        # Deviation overrides (location_id -> DeviationConfig)
        self._deviation_overrides: dict[str, DeviationConfig] = {}

        # Active entities
        self.entities: dict[str, EntityState] = {}

        # Metrics
        self._completed_count: int = 0
        self._total_wait_time: float = 0.0
        self._total_cycle_time: float = 0.0
        self._snapshot_interval: float = 5.0
        self._last_snapshot_s: float = 0.0

    def _init_resources(self) -> None:
        for loc in self.config.facility.locations:
            r = ResourceState(
                id=loc.id,
                type=loc.type,
                position=Position(loc.position["x"], loc.position["y"]),
                capacity=loc.capacity,
                max_queue=loc.capacity if loc.type == "buffer" else 1,
                properties=dict(loc.properties),
            )
            self.resource_mgr.add_resource(r)

    def _find_spawn_position(self) -> Position:
        for loc in self.config.facility.locations:
            if loc.type == "spawn_point":
                return Position(loc.position["x"], loc.position["y"])
        return Position(0, 0)

    def _build_location_sequence(self) -> list[str]:
        """Build the ordered sequence of machine locations to visit."""
        # Use topological order from paths: spawn -> buffers -> machines -> exit
        machines = [
            loc.id for loc in self.config.facility.locations
            if loc.type == "machine"
        ]
        buffers = [
            loc.id for loc in self.config.facility.locations
            if loc.type == "buffer"
        ]
        exits = [
            loc.id for loc in self.config.facility.locations
            if loc.type == "exit_point"
        ]
        # For the 3-station line: buf_1 -> cnc -> buf_2 -> assembly -> buf_3 -> qc -> dock_out
        # We build this by following paths from spawn_point
        sequence: list[str] = []
        visited: set[str] = set()
        queue = [loc.id for loc in self.config.facility.locations if loc.type == "spawn_point"]

        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            if current not in [l.id for l in self.config.facility.locations if l.type == "spawn_point"]:
                sequence.append(current)
            for path in self.config.facility.paths:
                if path.from_id == current and path.to_id not in visited:
                    queue.append(path.to_id)

        return sequence

    def _get_next_target(self, entity: EntityState) -> str | None:
        """Get the next location in sequence for this entity."""
        station_idx = entity.properties.get("station_index", 0)
        # Map station_index to location sequence positions
        # Station 0,1 = CNC (machines), 2 = assembly, 3 = QC
        machine_locations = [
            loc.id for loc in self.config.facility.locations
            if loc.type == "machine"
        ]
        if station_idx < len(machine_locations):
            return machine_locations[station_idx]

        # Past all machines — head to exit
        exits = [
            loc.id for loc in self.config.facility.locations
            if loc.type == "exit_point"
        ]
        return exits[0] if exits else None

    def set_deviation_overrides(self, overrides: dict[str, DeviationConfig]) -> None:
        self._deviation_overrides = overrides

    def _get_deviation(self, location_id: str) -> DeviationConfig | None:
        if location_id in self._deviation_overrides:
            return self._deviation_overrides[location_id]
        loc_cfg = next((l for l in self.config.facility.locations if l.id == location_id), None)
        return loc_cfg.deviations if loc_cfg else None

    def _compute_state_duration(self, state_config: StateConfig, location_id: str | None = None) -> float:
        """Compute duration for a stationary state, applying any deviations."""
        if state_config.duration is None:
            return 0.0
        d = state_config.duration
        if d.distribution == "constant":
            base = d.params.get("value", 0.0)
        elif d.distribution == "normal":
            mean = d.params.get("mean", 60.0)
            std = d.params.get("std", 10.0)
            dev = self._get_deviation(location_id) if location_id else None
            if dev:
                std *= dev.cycle_time_variability
            base = random.gauss(mean, std)
        elif d.distribution == "exponential":
            mean = d.params.get("mean", 60.0)
            base = random.expovariate(1.0 / mean)
        elif d.distribution == "uniform":
            lo = d.params.get("min", 0.0)
            hi = d.params.get("max", 60.0)
            base = random.uniform(lo, hi)
        else:
            base = d.params.get("value", 0.0)

        if location_id:
            dev = self._get_deviation(location_id)
            if dev:
                base *= dev.cycle_time_factor
                base += dev.degradation_rate * (self.elapsed_s / 3600.0)

        return max(1.0, base)

    def _get_entity_speed(self, entity: EntityState, state_config: StateConfig) -> float:
        if state_config.speed:
            return state_config.speed.params.get("value", 1.5)
        return 1.5

    def _handle_transition(self, entity: EntityState, transition) -> None:
        """Execute a state transition for an entity."""
        old_state = entity.state
        new_state = transition.to_state

        # Get graph executor
        et_config = self.config.entity_types.get(entity.entity_type)
        if not et_config:
            return
        executor = self.state_graphs.get(et_config.state_graph)
        if not executor:
            return

        new_state_config = executor.get_state_config(new_state)
        if not new_state_config:
            return

        # Execute exit actions for old state
        old_state_config = executor.get_state_config(old_state)
        if old_state_config:
            self._execute_actions(entity, old_state_config.on_exit)

        # Update state
        entity.state = new_state
        entity.state_entered_at = self.elapsed_s

        # Execute enter actions for new state
        self._execute_actions(entity, new_state_config.on_enter)

        # Set up new state
        if new_state_config.type == "stationary":
            entity.state_duration = self._compute_state_duration(new_state_config, entity.current_location)
        elif new_state_config.type == "moving":
            entity.speed = self._get_entity_speed(entity, new_state_config)
            # Compute route to next target
            target = self._get_next_target(entity)
            if target:
                entity.target_location = target
                from_loc = entity.current_location or self._nearest_location(entity.position)
                route = self.spatial.compute_route(from_loc, target)
                entity.route = route
                entity.route_progress = 0.0
        elif new_state_config.type == "terminal":
            entity.destroyed = True
            self._completed_count += 1

        # Record transition
        self.recorder.record_transition(
            self.sim_time, entity.id, old_state, new_state,
            location=entity.current_location,
        )

    def _execute_actions(self, entity: EntityState, actions: list[dict]) -> None:
        for action in actions:
            act_type = action.get("action", "")
            if act_type == "acquire_resource":
                target = entity.target_location or entity.current_location
                if target:
                    self.resource_mgr.acquire(target, entity.id, self.elapsed_s)
                    entity.current_location = target
            elif act_type == "release_resource":
                loc = entity.current_location
                if loc:
                    self.resource_mgr.release(loc, entity.id, self.elapsed_s)
            elif act_type == "emit_event":
                self.recorder.record_event(
                    self.sim_time,
                    action.get("event_type", "unknown"),
                    description=f"{entity.id}",
                    details={"entity_id": entity.id, "location": entity.current_location},
                )
            elif act_type == "destroy_entity":
                entity.destroyed = True
                self._completed_count += 1
            elif act_type == "set_property":
                prop = action.get("property", "")
                val = action.get("value")
                if prop:
                    entity.properties[prop] = val
            elif act_type == "compute_route":
                pass  # Handled in transition logic

    def _nearest_location(self, pos: Position) -> str:
        best_id = ""
        best_dist = float("inf")
        for loc in self.config.facility.locations:
            lp = Position(loc.position["x"], loc.position["y"])
            d = pos.distance_to(lp)
            if d < best_dist:
                best_dist = d
                best_id = loc.id
        return best_id

    def _update_entity(self, entity: EntityState, dt: float) -> None:
        """Per-tick update for a single entity."""
        et_config = self.config.entity_types.get(entity.entity_type)
        if not et_config:
            return
        executor = self.state_graphs.get(et_config.state_graph)
        if not executor:
            return

        state_config = executor.get_state_config(entity.state)
        if not state_config:
            return

        # Update duration countdown for stationary states
        if state_config.type == "stationary" and entity.state_duration > 0:
            entity.state_duration -= dt

        # Advance position for moving entities
        if state_config.type == "moving" and entity.route:
            new_pos, new_progress, arrived = advance_along_route(
                entity.route, entity.route_progress, entity.speed, dt,
            )
            entity.position = new_pos
            entity.route_progress = new_progress
            if arrived and entity.target_location:
                entity.current_location = entity.target_location
                # Increment station_index when arriving at a machine
                r = self.resource_mgr.get(entity.target_location)
                if r and r.type == "machine":
                    pass  # Will increment after processing

        # Handle breakdown countdown — entity stuck at machine during repair
        if entity.breakdown_remaining > 0:
            entity.breakdown_remaining -= dt
            if entity.breakdown_remaining <= 0:
                entity.breakdown_remaining = 0.0
                self.recorder.record_event(
                    self.sim_time, "breakdown_resolved",
                    description=f"{entity.id} at {entity.current_location}",
                    details={"entity_id": entity.id, "location": entity.current_location},
                )
            return

        # Evaluate transitions
        ctx = SimulationContext(
            sim_time=self.sim_time,
            dt=dt,
            elapsed_s=self.elapsed_s,
            entities=self.entities,
            resources=self.resource_mgr.resources,
        )
        transition = executor.evaluate(entity, ctx)
        if transition:
            # On completing any stationary (processing) state, advance station_index
            if state_config and state_config.type == "stationary" and transition.to_state == "in_transit":
                loc = entity.current_location
                dev = self._get_deviation(loc) if loc else None

                # Failure injection: machine breaks down after processing
                if dev and dev.failure_probability > 0 and random.random() < dev.failure_probability:
                    repair_time = max(10.0, random.gauss(dev.failure_duration_mean, dev.failure_duration_std))
                    entity.breakdown_remaining = repair_time
                    self.recorder.record_event(
                        self.sim_time, "machine_breakdown",
                        description=f"{entity.id} at {loc}",
                        details={"entity_id": entity.id, "location": loc, "repair_time": round(repair_time, 1)},
                    )
                    return

                # Quality defect: entity reworks at same station
                if dev and dev.quality_defect_rate > 0 and random.random() < dev.quality_defect_rate:
                    entity.state_duration = self._compute_state_duration(state_config, loc)
                    self.recorder.record_event(
                        self.sim_time, "quality_defect_rework",
                        description=f"{entity.id} at {loc}",
                        details={"entity_id": entity.id, "location": loc},
                    )
                    return

                entity.properties["station_index"] = entity.properties.get("station_index", 0) + 1

            self._handle_transition(entity, transition)

    def get_current_state(self) -> dict[str, Any]:
        """Get current simulation state for WebSocket broadcasting."""
        loc_pos = {l.id: l.position for l in self.config.facility.locations}
        paths = []
        for p in self.config.facility.paths:
            f = loc_pos.get(p.from_id)
            t = loc_pos.get(p.to_id)
            if f and t:
                paths.append({"from": {"x": f["x"], "y": f["y"]}, "to": {"x": t["x"], "y": t["y"]}})

        locations_meta = []
        for loc in self.config.facility.locations:
            meta: dict[str, Any] = {
                "id": loc.id,
                "type": loc.type,
                "label": loc.label or loc.id.replace("_", " ").title(),
                "x": loc.position["x"],
                "y": loc.position["y"],
                "capacity": loc.capacity,
            }
            if loc.properties:
                props = dict(loc.properties)
                model_3d = props.pop("model", None)
                if model_3d is not None:
                    meta["model_3d"] = str(model_3d)
                if props:
                    meta["properties"] = props
            locations_meta.append(meta)

        state_descriptions = {}
        for sg_name, sg in self.config.state_graphs.items():
            for state_name, state_cfg in sg.states.items():
                info: dict[str, Any] = {"description": state_cfg.description, "type": state_cfg.type}
                if state_cfg.duration and state_cfg.duration.params:
                    info["duration"] = state_cfg.duration.params
                state_descriptions[state_name] = info

        return {
            "entities": [e.to_dict() for e in self.entities.values() if not e.destroyed],
            "resources": [r.to_dict() for r in self.resource_mgr.resources.values()],
            "metrics": self.get_metrics(),
            "config": {
                "name": self.config.name,
                "description": self.config.description,
                "facility_name": self.config.facility.name,
            },
            "paths": paths,
            "locations": locations_meta,
            "state_descriptions": state_descriptions,
            "sim_time": self.sim_time.isoformat(),
            "elapsed_s": self.elapsed_s,
        }

    def get_metrics(self) -> dict[str, Any]:
        """Compute real-time metrics."""
        active = sum(1 for e in self.entities.values() if not e.destroyed)
        hours = max(self.elapsed_s / 3600.0, 0.001)
        throughput = self._completed_count / hours

        # Machine utilization
        machines = [r for r in self.resource_mgr.resources.values() if r.type == "machine"]
        if machines and self.elapsed_s > 0:
            total_util = sum(r.total_busy_time for r in machines)
            # Add current busy time for machines still occupied
            for r in machines:
                if r.status == "busy":
                    total_util += self.elapsed_s - r.last_busy_start
            avg_util = total_util / (len(machines) * self.elapsed_s) * 100
        else:
            avg_util = 0.0

        # Queue depths
        buffers = [r for r in self.resource_mgr.resources.values() if r.type == "buffer"]
        total_queue = sum(len(r.queue) + r.occupancy for r in buffers)

        return {
            "throughput_per_hour": round(throughput, 1),
            "wip_count": active,
            "completed": self._completed_count,
            "avg_utilization_pct": round(avg_util, 1),
            "total_queue_depth": total_queue,
            "elapsed_hours": round(hours, 2),
        }

    def run(self) -> SimulationRecorder:
        """Run the simulation from start to end."""
        dt = self.config.time_step_seconds
        total_ticks = int(
            (self.end_time - self.sim_time).total_seconds() / dt
        )

        print(f"Starting simulation: {self.config.name}")
        print(f"  Duration: {self.config.duration_hours}h | Time step: {dt}s | Ticks: {total_ticks:,}")

        start_wall = wall_time.time()
        tick = 0

        while self.sim_time < self.end_time:
            # 1. Spawn entities
            new_entities = self.scheduler.spawn_due(self.elapsed_s)
            for entity in new_entities:
                # Route to first buffer
                first_target = self._location_sequence[0] if self._location_sequence else None
                if first_target:
                    entity.target_location = first_target
                    spawn_loc = next(
                        (l.id for l in self.config.facility.locations if l.type == "spawn_point"),
                        ""
                    )
                    route = self.spatial.compute_route(spawn_loc, first_target)
                    entity.route = route
                    entity.route_progress = 0.0
                    entity.state = "in_transit"
                    entity.current_location = spawn_loc
                self.entities[entity.id] = entity

            # 2. Update all entities
            to_remove: list[str] = []
            for entity in list(self.entities.values()):
                if entity.destroyed:
                    to_remove.append(entity.id)
                    continue
                self._update_entity(entity, dt)
                if entity.destroyed:
                    to_remove.append(entity.id)

            for eid in to_remove:
                del self.entities[eid]

            # 3. Record snapshots periodically
            if self.elapsed_s - self._last_snapshot_s >= self._snapshot_interval:
                for entity in self.entities.values():
                    if not entity.destroyed:
                        self.recorder.record_position(
                            self.sim_time, entity.id,
                            entity.position.x, entity.position.y,
                            entity.state, entity.properties,
                        )
                self._last_snapshot_s = self.elapsed_s

            # 4. Advance time
            self.sim_time += timedelta(seconds=dt)
            self.elapsed_s += dt
            tick += 1

            # 5. Progress
            if tick % (total_ticks // 10 or 1) == 0:
                pct = tick / total_ticks * 100
                metrics = self.get_metrics()
                print(
                    f"  [{pct:5.1f}%] "
                    f"WIP={metrics['wip_count']} "
                    f"Done={metrics['completed']} "
                    f"Thr={metrics['throughput_per_hour']}/hr "
                    f"Util={metrics['avg_utilization_pct']:.0f}%"
                )

        elapsed_wall = wall_time.time() - start_wall
        print(f"\n  Completed in {elapsed_wall:.1f}s wall time")
        print(f"  Speed: {self.config.duration_hours * 3600 / max(elapsed_wall, 0.001):.0f}x real-time")

        summary = self.recorder.compute_summary()
        print(f"  Products completed: {summary['completed_products']}")
        print(f"  State transitions: {summary['total_state_transitions']}")

        return self.recorder
