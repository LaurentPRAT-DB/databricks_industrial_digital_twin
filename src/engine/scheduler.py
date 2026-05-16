"""Entity scheduler — spawns entities based on demand profiles."""

from __future__ import annotations
import random
from datetime import datetime, timedelta
from src.engine.config import ScheduleConfig, EntityTypeConfig
from src.engine.models import EntityState, Position


class EntityScheduler:
    """Spawns entities using Poisson arrivals with shift-based rate modifiers."""

    def __init__(
        self,
        schedule: ScheduleConfig,
        entity_types: dict[str, EntityTypeConfig],
        spawn_position: Position,
        seed: int | None = None,
    ) -> None:
        self.schedule = schedule
        self.entity_types = entity_types
        self.spawn_position = spawn_position
        self._rng = random.Random(seed)
        self._next_spawn_time: float = 0.0
        self._entity_counter: int = 0
        self._schedule_next_arrival(0.0)

    def _get_rate_multiplier(self, sim_time_s: float) -> float:
        """Get shift-based rate multiplier for current sim time."""
        if not self.schedule.shifts:
            return 1.0

        hour_of_day = (sim_time_s / 3600.0) % 24.0
        for shift in self.schedule.shifts:
            start_h, start_m = map(int, shift.start.split(":"))
            end_h, end_m = map(int, shift.end.split(":"))
            start_frac = start_h + start_m / 60.0
            end_frac = end_h + end_m / 60.0

            if start_frac < end_frac:
                if start_frac <= hour_of_day < end_frac:
                    return shift.rate_multiplier
            else:
                if hour_of_day >= start_frac or hour_of_day < end_frac:
                    return shift.rate_multiplier

        return 1.0

    def _schedule_next_arrival(self, current_time_s: float) -> None:
        rate = self.schedule.rate_per_hour * self._get_rate_multiplier(current_time_s)
        if rate <= 0:
            self._next_spawn_time = current_time_s + 3600.0
            return
        inter_arrival = self._rng.expovariate(rate / 3600.0)
        self._next_spawn_time = current_time_s + inter_arrival

    def spawn_due(self, sim_time_s: float) -> list[EntityState]:
        """Return entities that should spawn at or before sim_time_s."""
        spawned: list[EntityState] = []
        while self._next_spawn_time <= sim_time_s:
            entity = self._create_entity(self._next_spawn_time)
            if entity:
                spawned.append(entity)
            self._schedule_next_arrival(self._next_spawn_time)
        return spawned

    def _create_entity(self, spawn_time_s: float) -> EntityState | None:
        """Create a new entity of the first entity type."""
        if not self.entity_types:
            return None

        type_name = next(iter(self.entity_types))
        et_config = self.entity_types[type_name]

        self._entity_counter += 1
        entity_id = f"{type_name}_{self._entity_counter:04d}"

        properties: dict = {"station_index": 0}
        for prop_name, prop_config in et_config.properties.items():
            if prop_config.initial is not None:
                properties[prop_name] = prop_config.initial
            elif prop_config.constant is not None:
                properties[prop_name] = prop_config.constant
            elif prop_config.type == "categorical" and prop_config.values:
                weights = prop_config.weights or [1.0] * len(prop_config.values)
                properties[prop_name] = self._rng.choices(prop_config.values, weights=weights)[0]
            elif prop_config.type == "integer":
                properties[prop_name] = prop_config.initial or 0

        return EntityState(
            id=entity_id,
            entity_type=type_name,
            state=et_config.initial_state,
            position=Position(self.spawn_position.x, self.spawn_position.y),
            properties=properties,
            state_entered_at=spawn_time_s,
            state_duration=0.0,
        )
