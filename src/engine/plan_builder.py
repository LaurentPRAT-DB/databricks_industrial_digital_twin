"""Plan Builder — generates a complete simulation config from a high-level spec."""

from __future__ import annotations

import re
import random
from dataclasses import dataclass, field


@dataclass
class StationSpec:
    name: str
    cycle_mean: float = 60.0
    cycle_std: float | None = None
    model_3d: str | None = None

    def __post_init__(self):
        if self.cycle_std is None:
            self.cycle_std = self.cycle_mean * 0.1


@dataclass
class PlanSpec:
    name: str
    description: str = ""
    duration_hours: float = 8.0
    entity_type: str = "part"
    entity_variants: list[str] = field(default_factory=list)
    spawn_rate_per_hour: float = 20.0
    stations: list[StationSpec] = field(default_factory=list)
    seed: int | None = None


MODEL_HINTS = {
    "robot": "robot_arm",
    "arm": "robot_arm",
    "pick": "robot_arm",
    "place": "robot_arm",
    "weld": "machine_heavy",
    "furnace": "machine_heavy",
    "melt": "machine_heavy",
    "forge": "machine_heavy",
    "stamp": "machine_heavy",
    "press": "machine_heavy",
    "roll": "machine_heavy",
    "oven": "machine_window",
    "cure": "machine_window",
    "pasteur": "machine_window",
    "heat": "machine_window",
    "anneal": "machine_window",
    "coat": "robot_arm",
    "spray": "robot_arm",
    "paint": "robot_arm",
    "inspect": "scanner",
    "scan": "scanner",
    "aoi": "scanner",
    "xray": "scanner",
    "vision": "scanner",
    "test": "scanner",
    "qc": "scanner",
    "cut": "piston",
    "shear": "piston",
    "punch": "piston",
    "drill": "piston",
    "cnc": "machine_bed",
    "mill": "machine_bed",
    "lathe": "machine_bed",
    "grind": "machine_bed",
    "print": "machine_bed",
    "fill": "machine_window",
    "pack": "machine_bed",
    "label": "machine_bed",
}


def _infer_model(station_name: str) -> str:
    name_lower = station_name.lower()
    for keyword, model in MODEL_HINTS.items():
        if keyword in name_lower:
            return model
    return "machine"


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug


def _make_state_id(name: str) -> str:
    return _slugify(name)


def generate_config(spec: PlanSpec) -> dict:
    """Generate a complete simulation config dict from a PlanSpec."""
    n_stations = len(spec.stations)
    if n_stations == 0:
        raise ValueError("PlanSpec must have at least one station")

    seed = spec.seed if spec.seed is not None else random.randint(1, 9999)

    # --- Layout algorithm ---
    # Coordinate space: 100×50 meters
    # Spawn at x=5, exit at x=95, stations spread evenly between x=12..88
    spawn_x = 5.0
    exit_x = 95.0
    station_x_start = 12.0
    station_x_end = 88.0
    center_y = 25.0

    if n_stations == 1:
        station_xs = [(station_x_start + station_x_end) / 2]
    else:
        step = (station_x_end - station_x_start) / (n_stations - 1)
        station_xs = [station_x_start + i * step for i in range(n_stations)]

    # Buffer positioned 4 units before each station
    buffer_offset = 4.0

    # --- Build locations ---
    locations = []
    spawn_id = f"{_slugify(spec.entity_type)}_intake"
    exit_id = f"finished_{_slugify(spec.entity_type)}_out"

    locations.append({
        "id": spawn_id,
        "type": "spawn_point",
        "label": "Intake",
        "position": {"x": spawn_x, "y": center_y},
    })

    station_ids = []
    buffer_ids = []

    for i, station in enumerate(spec.stations):
        sx = station_xs[i]
        bx = max(spawn_x + 2, sx - buffer_offset)

        buf_id = f"{_make_state_id(station.name)}_queue"
        sta_id = _make_state_id(station.name)

        # Avoid duplicate IDs
        if buf_id in [l["id"] for l in locations]:
            buf_id = f"{buf_id}_{i}"
        if sta_id in [l["id"] for l in locations]:
            sta_id = f"{sta_id}_{i}"

        buffer_ids.append(buf_id)
        station_ids.append(sta_id)

        locations.append({
            "id": buf_id,
            "type": "buffer",
            "label": f"{station.name} Queue",
            "position": {"x": round(bx, 1), "y": center_y},
            "capacity": 10,
        })

        model = station.model_3d or _infer_model(station.name)
        loc_entry = {
            "id": sta_id,
            "type": "machine",
            "label": station.name,
            "position": {"x": round(sx, 1), "y": center_y},
            "capacity": 1,
            "properties": {
                "cycle_time_mean": station.cycle_mean,
                "mtbf_hours": 400,
                "model": model,
            },
        }
        locations.append(loc_entry)

    locations.append({
        "id": exit_id,
        "type": "exit_point",
        "label": "Output",
        "position": {"x": exit_x, "y": center_y},
    })

    # --- Build paths ---
    paths = []
    all_ordered_ids = [spawn_id]
    for buf_id, sta_id in zip(buffer_ids, station_ids):
        all_ordered_ids.extend([buf_id, sta_id])
    all_ordered_ids.append(exit_id)

    loc_positions = {loc["id"]: loc["position"] for loc in locations}

    for j in range(len(all_ordered_ids) - 1):
        from_id = all_ordered_ids[j]
        to_id = all_ordered_ids[j + 1]
        p1 = loc_positions[from_id]
        p2 = loc_positions[to_id]
        dist = round(((p2["x"] - p1["x"]) ** 2 + (p2.get("y", 25) - p1.get("y", 25)) ** 2) ** 0.5, 1)
        paths.append({"from": from_id, "to": to_id, "distance": max(dist, 1.0)})

    # --- Build state graph ---
    states = {
        "waiting": {
            "type": "queued",
            "description": f"{spec.entity_type.replace('_', ' ').title()} waiting in buffer",
            "queue_discipline": "FIFO",
        },
        "in_transit": {
            "type": "moving",
            "description": "Moving between stations on conveyor",
            "speed": {"distribution": "constant", "params": {"value": 2.0}},
        },
    }

    state_ids = []
    for station in spec.stations:
        sid = _make_state_id(station.name)
        if sid in states:
            sid = f"{sid}_process"
        state_ids.append(sid)

        states[sid] = {
            "type": "stationary",
            "description": station.name,
            "location_type": "machine",
            "duration": {
                "distribution": "normal",
                "params": {"mean": station.cycle_mean, "std": station.cycle_std},
            },
            "on_enter": [
                {"action": "acquire_resource", "resource_type": "machine"},
                {"action": "emit_event", "event_type": f"{sid}_started"},
            ],
            "on_exit": [
                {"action": "release_resource", "resource_type": "machine"},
                {"action": "emit_event", "event_type": f"{sid}_completed"},
            ],
        }

    states["done"] = {
        "type": "terminal",
        "description": f"{spec.entity_type.replace('_', ' ').title()} complete",
        "on_enter": [
            {"action": "emit_event", "event_type": f"{_slugify(spec.entity_type)}_completed"},
            {"action": "destroy_entity"},
        ],
    }

    # --- Build transitions ---
    transitions = [
        {
            "from": "waiting",
            "to": "in_transit",
            "condition": {"type": "resource_available", "resource_type": "machine"},
            "priority": 1,
        },
        {
            "from": "in_transit",
            "to": "waiting",
            "condition": {
                "type": "and",
                "conditions": [
                    {"type": "arrived_at_destination"},
                    {"type": "resource_busy", "resource_type": "machine"},
                ],
            },
            "priority": 1,
        },
    ]

    # in_transit → processing state transitions (station_index based)
    for i, sid in enumerate(state_ids):
        transitions.append({
            "from": "in_transit",
            "to": sid,
            "condition": {
                "type": "and",
                "conditions": [
                    {"type": "arrived_at_destination"},
                    {"type": "property_threshold", "property": "station_index", "operator": "==", "value": i},
                ],
            },
            "priority": 2,
        })

    # Exit transition
    transitions.append({
        "from": "in_transit",
        "to": "done",
        "condition": {
            "type": "and",
            "conditions": [
                {"type": "arrived_at_destination"},
                {"type": "property_threshold", "property": "station_index", "operator": ">", "value": n_stations - 1},
            ],
        },
        "priority": 2,
    })

    # processing → in_transit transitions
    for sid in state_ids:
        transitions.append({
            "from": sid,
            "to": "in_transit",
            "condition": {"type": "duration_elapsed"},
            "priority": 1,
            "next_location": {"type": "next_in_sequence"},
        })

    # --- Entity types ---
    entity_props = {
        "station_index": {"type": "integer", "initial": 0},
    }
    if spec.entity_variants:
        n_variants = len(spec.entity_variants)
        entity_props["product_type"] = {
            "type": "categorical",
            "values": spec.entity_variants,
            "weights": [round(1.0 / n_variants, 2)] * n_variants,
        }

    # --- Schedule ---
    schedule = {
        "type": "poisson",
        "rate_per_hour": spec.spawn_rate_per_hour,
        "shifts": [
            {"name": "morning", "start": "06:00", "end": "14:00", "rate_multiplier": 1.0},
            {"name": "afternoon", "start": "14:00", "end": "22:00", "rate_multiplier": 0.9},
            {"name": "night", "start": "22:00", "end": "06:00", "rate_multiplier": 0.5},
        ],
    }

    # --- Assemble final config ---
    config = {
        "simulation": {
            "name": spec.name,
            "description": spec.description or " → ".join(s.name for s in spec.stations),
            "duration_hours": spec.duration_hours,
            "time_step_seconds": 1,
            "seed": seed,
        },
        "facility": {
            "name": spec.name,
            "coordinate_system": "cartesian_2d",
            "bounds": {"width": 100, "height": 50, "unit": "meters"},
            "locations": locations,
            "paths": paths,
        },
        "state_graphs": {
            "product_flow": {
                "states": states,
                "transitions": transitions,
            },
        },
        "entity_types": {
            _slugify(spec.entity_type): {
                "state_graph": "product_flow",
                "initial_state": "waiting",
                "spawn_rule": "schedule",
                "properties": entity_props,
            },
        },
        "schedule": schedule,
    }

    return config


def parse_process_description(text: str) -> list[StationSpec]:
    """Parse free-text process description into a list of StationSpecs.

    Supported formats:
      - "Stamping (60s) → Welding (120s, σ=15s) → Painting (300s)"
      - "Stamping → Welding → Painting"
      - "1. Stamping - 60 seconds\\n2. Welding - 120 seconds"
    """
    # Split on arrows or numbered lines
    if re.search(r"^\d+[\.\)]\s", text, re.MULTILINE):
        parts = re.findall(r"^\d+[\.\)]\s*(.+)$", text, re.MULTILINE)
    elif re.search(r"→|->|>>", text):
        parts = re.split(r"\s*(?:→|->|>>)\s*", text)
    else:
        parts = [p.strip() for p in text.split(",") if p.strip()]

    stations = []
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Extract name: text before parentheses, or before digits that look like times
        name_match = re.match(r"^([^(]+?)(?:\s*\(|\s*$)", part)
        if name_match:
            name = name_match.group(1).strip()
        else:
            name = part

        # Strip trailing time specs from name (e.g. "Stamping 60 seconds" → "Stamping")
        name = re.sub(r"\s+\d+(?:\.\d+)?\s*(?:s|sec|seconds?|min|minutes?).*$", "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"\s*-\s*$", "", name).strip()

        if not name:
            continue

        # Extract cycle time mean
        mean_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)", part)
        cycle_mean = float(mean_match.group(1)) if mean_match else 60.0

        # Extract std deviation
        std_match = re.search(r"[σσ]=\s*(\d+(?:\.\d+)?)\s*s?|std\s*=\s*(\d+(?:\.\d+)?)", part)
        if std_match:
            cycle_std = float(std_match.group(1) or std_match.group(2))
        else:
            cycle_std = cycle_mean * 0.1

        stations.append(StationSpec(
            name=name,
            cycle_mean=cycle_mean,
            cycle_std=cycle_std,
            model_3d=_infer_model(name),
        ))

    return stations
