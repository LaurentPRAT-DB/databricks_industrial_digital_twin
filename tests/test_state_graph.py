"""Tests for state graph condition evaluation and transition selection."""

from src.engine.loader import load_config
from src.engine.state_graph import StateGraphExecutor, ConditionEvaluator
from src.engine.config import ConditionConfig
from src.engine.models import EntityState, Position, SimulationContext, ResourceState
from datetime import datetime, timezone


def _make_ctx(resources=None) -> SimulationContext:
    return SimulationContext(
        sim_time=datetime.now(timezone.utc),
        dt=1.0,
        elapsed_s=100.0,
        entities={},
        resources=resources or {},
    )


def _make_entity(state="waiting", station_index=0, duration=0.0) -> EntityState:
    return EntityState(
        id="test_001",
        entity_type="widget",
        state=state,
        position=Position(5, 25),
        properties={"station_index": station_index},
        state_duration=duration,
    )


def test_condition_property_threshold_eq():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(type="property_threshold", property="station_index", operator="==", value=0)
    entity = _make_entity(station_index=0)
    ctx = _make_ctx()
    assert evaluator.evaluate(cond, entity, ctx) is True


def test_condition_property_threshold_lt():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(type="property_threshold", property="station_index", operator="<", value=2)
    entity = _make_entity(station_index=1)
    ctx = _make_ctx()
    assert evaluator.evaluate(cond, entity, ctx) is True


def test_condition_resource_available():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(type="resource_available", resource_type="machine")
    r = ResourceState(id="cnc_1", type="machine", position=Position(35, 15), capacity=1)
    ctx = _make_ctx(resources={"cnc_1": r})
    entity = _make_entity()
    assert evaluator.evaluate(cond, entity, ctx) is True


def test_condition_resource_busy():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(type="resource_busy", resource_type="machine")
    r = ResourceState(id="cnc_1", type="machine", position=Position(35, 15), capacity=1)
    r.occupants = ["other_entity"]
    r.status = "busy"
    ctx = _make_ctx(resources={"cnc_1": r})
    entity = _make_entity()
    assert evaluator.evaluate(cond, entity, ctx) is True


def test_condition_duration_elapsed():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(type="duration_elapsed")
    entity = _make_entity(duration=0.0)
    ctx = _make_ctx()
    assert evaluator.evaluate(cond, entity, ctx) is True

    entity.state_duration = 50.0
    assert evaluator.evaluate(cond, entity, ctx) is False


def test_condition_and():
    evaluator = ConditionEvaluator()
    cond = ConditionConfig(
        type="and",
        conditions=[
            ConditionConfig(type="duration_elapsed"),
            ConditionConfig(type="property_threshold", property="station_index", operator="==", value=0),
        ],
    )
    entity = _make_entity(duration=0.0, station_index=0)
    ctx = _make_ctx()
    assert evaluator.evaluate(cond, entity, ctx) is True


def test_executor_selects_highest_priority():
    config = load_config("configs/assembly_line_3station.yaml")
    sg_config = config.state_graphs["product_flow"]
    executor = StateGraphExecutor(sg_config)

    entity = _make_entity(state="in_transit", station_index=0)
    entity.route = [Position(5, 25), Position(20, 25)]
    entity.route_progress = 100.0  # arrived

    r = ResourceState(id="cnc_1", type="machine", position=Position(35, 15), capacity=1)
    ctx = _make_ctx(resources={"cnc_1": r})

    transition = executor.evaluate(entity, ctx)
    assert transition is not None
    assert transition.to_state == "cnc_milling"
