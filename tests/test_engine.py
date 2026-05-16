"""End-to-end engine tests."""

from src.engine.loader import load_config
from src.engine.engine import SimulationEngine


def test_engine_runs_1_hour():
    """Run a 1-hour simulation and verify products complete."""
    config = load_config("configs/assembly_line_3station.yaml")
    # Override to 1 hour for test speed
    config.duration_hours = 1.0
    config.seed = 42

    engine = SimulationEngine(config)
    recorder = engine.run()

    summary = recorder.compute_summary()
    assert summary["completed_products"] > 0, "Should complete at least 1 product in 1 hour"
    assert summary["total_state_transitions"] > 0


def test_engine_metrics():
    """Run briefly and check metrics are populated."""
    config = load_config("configs/assembly_line_3station.yaml")
    config.duration_hours = 0.5
    config.seed = 123

    engine = SimulationEngine(config)
    engine.run()

    metrics = engine.get_metrics()
    assert metrics["throughput_per_hour"] >= 0
    assert metrics["elapsed_hours"] > 0


def test_engine_entities_flow_through_states():
    """Verify entities actually transition through expected states."""
    config = load_config("configs/assembly_line_3station.yaml")
    config.duration_hours = 2.0
    config.seed = 42

    engine = SimulationEngine(config)
    recorder = engine.run()

    states_seen = set()
    for t in recorder.state_transitions:
        states_seen.add(t["from_state"])
        states_seen.add(t["to_state"])

    assert "in_transit" in states_seen
    assert "cnc_milling" in states_seen
    assert "press_fitting" in states_seen
    assert "cmm_inspection" in states_seen
