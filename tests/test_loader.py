"""Tests for YAML config loading and validation."""

from src.engine.loader import load_config


def test_load_assembly_line_config():
    config = load_config("configs/assembly_line_3station.yaml")
    assert config.name == "Smartphone Chassis Line"
    assert config.duration_hours == 8
    assert config.time_step_seconds == 1
    assert config.seed == 42


def test_facility_locations():
    config = load_config("configs/assembly_line_3station.yaml")
    assert len(config.facility.locations) == 9
    loc_ids = [l.id for l in config.facility.locations]
    assert "raw_billet_intake" in loc_ids
    assert "cnc_mill_1" in loc_ids
    assert "press_fit_station" in loc_ids
    assert "cmm_inspector" in loc_ids
    assert "finished_goods_out" in loc_ids


def test_facility_paths():
    config = load_config("configs/assembly_line_3station.yaml")
    assert len(config.facility.paths) == 9


def test_state_graph():
    config = load_config("configs/assembly_line_3station.yaml")
    assert "product_flow" in config.state_graphs
    sg = config.state_graphs["product_flow"]
    assert "waiting" in sg.states
    assert "in_transit" in sg.states
    assert "cnc_milling" in sg.states
    assert "press_fitting" in sg.states
    assert "cmm_inspection" in sg.states
    assert "done" in sg.states
    assert len(sg.transitions) == 9


def test_entity_types():
    config = load_config("configs/assembly_line_3station.yaml")
    assert "chassis" in config.entity_types
    chassis = config.entity_types["chassis"]
    assert chassis.state_graph == "product_flow"
    assert chassis.initial_state == "waiting"


def test_schedule():
    config = load_config("configs/assembly_line_3station.yaml")
    assert config.schedule.type == "poisson"
    assert config.schedule.rate_per_hour == 20
    assert len(config.schedule.shifts) == 3
