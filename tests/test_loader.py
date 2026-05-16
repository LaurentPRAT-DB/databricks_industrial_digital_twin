"""Tests for YAML config loading and validation."""

from src.engine.loader import load_config


def test_load_assembly_line_config():
    config = load_config("configs/assembly_line_3station.yaml")
    assert config.name == "3-Station Assembly Line"
    assert config.duration_hours == 8
    assert config.time_step_seconds == 1
    assert config.seed == 42


def test_facility_locations():
    config = load_config("configs/assembly_line_3station.yaml")
    assert len(config.facility.locations) == 9
    loc_ids = [l.id for l in config.facility.locations]
    assert "dock_in" in loc_ids
    assert "cnc_1" in loc_ids
    assert "assembly_1" in loc_ids
    assert "qc_1" in loc_ids
    assert "dock_out" in loc_ids


def test_facility_paths():
    config = load_config("configs/assembly_line_3station.yaml")
    assert len(config.facility.paths) == 9


def test_state_graph():
    config = load_config("configs/assembly_line_3station.yaml")
    assert "product_flow" in config.state_graphs
    sg = config.state_graphs["product_flow"]
    assert "waiting" in sg.states
    assert "in_transit" in sg.states
    assert "machining" in sg.states
    assert "assembling" in sg.states
    assert "inspecting" in sg.states
    assert "done" in sg.states
    assert len(sg.transitions) == 9


def test_entity_types():
    config = load_config("configs/assembly_line_3station.yaml")
    assert "widget" in config.entity_types
    widget = config.entity_types["widget"]
    assert widget.state_graph == "product_flow"
    assert widget.initial_state == "waiting"


def test_schedule():
    config = load_config("configs/assembly_line_3station.yaml")
    assert config.schedule.type == "poisson"
    assert config.schedule.rate_per_hour == 20
    assert len(config.schedule.shifts) == 3
