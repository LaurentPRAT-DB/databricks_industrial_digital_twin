"""Tests for plan_builder module."""

import yaml
from src.engine.plan_builder import (
    PlanSpec,
    StationSpec,
    generate_config,
    parse_process_description,
)
from src.engine.config import SimulationConfig


class TestGenerateConfig:
    def test_basic_3_station(self):
        spec = PlanSpec(
            name="Test Line",
            entity_type="widget",
            entity_variants=["type_a", "type_b"],
            spawn_rate_per_hour=30,
            stations=[
                StationSpec(name="Cutting", cycle_mean=45),
                StationSpec(name="Assembly", cycle_mean=90),
                StationSpec(name="Inspection", cycle_mean=30),
            ],
            seed=42,
        )
        config = generate_config(spec)

        # Top-level structure
        assert "simulation" in config
        assert "facility" in config
        assert "state_graphs" in config
        assert "entity_types" in config
        assert "schedule" in config

        assert config["simulation"]["name"] == "Test Line"
        assert config["simulation"]["seed"] == 42

        # Locations: spawn + 3*(buffer+machine) + exit = 8
        locs = config["facility"]["locations"]
        assert len(locs) == 8

        types = [l["type"] for l in locs]
        assert types.count("spawn_point") == 1
        assert types.count("exit_point") == 1
        assert types.count("buffer") == 3
        assert types.count("machine") == 3

        # Paths connect all sequential locations
        paths = config["facility"]["paths"]
        assert len(paths) == 7  # spawn→buf→m→buf→m→buf→m→exit = 7 edges

        # State graph has waiting + in_transit + 3 process + done = 6 states
        sg = config["state_graphs"]["product_flow"]
        assert len(sg["states"]) == 6
        assert "waiting" in sg["states"]
        assert "in_transit" in sg["states"]
        assert "cutting" in sg["states"]
        assert "assembly" in sg["states"]
        assert "inspection" in sg["states"]
        assert "done" in sg["states"]

        # Transitions: 2 generic + 3 process entry + 1 exit + 3 process→transit = 9
        assert len(sg["transitions"]) == 9

        # Entity type
        et = config["entity_types"]["widget"]
        assert et["state_graph"] == "product_flow"
        assert et["properties"]["station_index"]["initial"] == 0
        assert et["properties"]["product_type"]["values"] == ["type_a", "type_b"]

        # Schedule
        assert config["schedule"]["rate_per_hour"] == 30

    def test_single_station(self):
        spec = PlanSpec(
            name="Single",
            stations=[StationSpec(name="Welding", cycle_mean=120)],
        )
        config = generate_config(spec)
        locs = config["facility"]["locations"]
        # spawn + buffer + machine + exit = 4
        assert len(locs) == 4

    def test_validates_with_pydantic(self):
        spec = PlanSpec(
            name="Validation Test",
            entity_type="board",
            stations=[
                StationSpec(name="Paste Print", cycle_mean=15),
                StationSpec(name="Reflow", cycle_mean=240),
            ],
        )
        config = generate_config(spec)

        # Flatten for Pydantic (same as loader.py does)
        flat = {**config.pop("simulation"), **config}
        sim = SimulationConfig(**flat)
        assert sim.name == "Validation Test"
        assert len(sim.facility.locations) == 6
        assert len(sim.state_graphs["product_flow"].states) == 5

    def test_model_inference(self):
        spec = PlanSpec(
            name="Models",
            stations=[
                StationSpec(name="CNC Milling"),
                StationSpec(name="Arc Welding"),
                StationSpec(name="QC Inspection"),
            ],
        )
        config = generate_config(spec)
        machines = [l for l in config["facility"]["locations"] if l["type"] == "machine"]
        assert machines[0]["properties"]["model"] == "machine_bed"
        assert machines[1]["properties"]["model"] == "machine_heavy"
        assert machines[2]["properties"]["model"] == "scanner"


class TestParseProcessDescription:
    def test_arrow_format_with_times(self):
        text = "Stamping (60s) → Welding (120s, σ=15s) → Painting (300s)"
        stations = parse_process_description(text)
        assert len(stations) == 3
        assert stations[0].name == "Stamping"
        assert stations[0].cycle_mean == 60.0
        assert stations[1].name == "Welding"
        assert stations[1].cycle_mean == 120.0
        assert stations[1].cycle_std == 15.0
        assert stations[2].name == "Painting"
        assert stations[2].cycle_mean == 300.0

    def test_arrow_format_no_times(self):
        text = "Cutting → Sanding → Assembly → Finishing"
        stations = parse_process_description(text)
        assert len(stations) == 4
        assert stations[0].name == "Cutting"
        assert stations[0].cycle_mean == 60.0  # default

    def test_numbered_format(self):
        text = "1. Stamping 60 seconds\n2. Welding 120 seconds\n3. QC Inspection 45 seconds"
        stations = parse_process_description(text)
        assert len(stations) == 3
        assert stations[0].name == "Stamping"
        assert stations[0].cycle_mean == 60.0
        assert stations[2].name == "QC Inspection"
        assert stations[2].cycle_mean == 45.0

    def test_dash_arrow_format(self):
        text = "Mixing (30s) -> Filling (15s) -> Capping (10s)"
        stations = parse_process_description(text)
        assert len(stations) == 3
        assert stations[0].name == "Mixing"
        assert stations[2].cycle_mean == 10.0

    def test_model_inference_from_name(self):
        text = "CNC Mill (60s) → Arc Welding (120s) → X-Ray Scan (30s)"
        stations = parse_process_description(text)
        assert stations[0].model_3d == "machine_bed"
        assert stations[1].model_3d == "machine_heavy"
        assert stations[2].model_3d == "scanner"

    def test_empty_input(self):
        assert parse_process_description("") == []
        assert parse_process_description("   ") == []
