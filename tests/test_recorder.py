"""Tests for SimulationRecorder."""

import json
import os
from datetime import datetime

from src.engine.recorder import SimulationRecorder


def test_record_position():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_position(t, "e1", 1.5, 2.5, "idle")
    assert len(rec.position_snapshots) == 1
    snap = rec.position_snapshots[0]
    assert snap["entity_id"] == "e1"
    assert snap["x"] == 1.5
    assert snap["y"] == 2.5
    assert snap["state"] == "idle"


def test_record_position_with_properties():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_position(t, "e1", 0, 0, "idle", {"custom": "val"})
    assert rec.position_snapshots[0]["custom"] == "val"


def test_record_transition():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_transition(t, "e1", "idle", "processing", location="m1")
    assert len(rec.state_transitions) == 1
    tr = rec.state_transitions[0]
    assert tr["entity_id"] == "e1"
    assert tr["from_state"] == "idle"
    assert tr["to_state"] == "processing"
    assert tr["location"] == "m1"


def test_record_event():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_event(t, "failure", "Machine broke", {"machine": "m1"})
    assert len(rec.events) == 1
    ev = rec.events[0]
    assert ev["event_type"] == "failure"
    assert ev["description"] == "Machine broke"
    assert ev["machine"] == "m1"


def test_record_resources():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_resources(t, [{"id": "m1", "status": "busy"}])
    assert len(rec.resource_snapshots) == 1
    assert rec.resource_snapshots[0]["resources"][0]["id"] == "m1"


def test_compute_summary():
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_transition(t, "e1", "processing", "done")
    rec.record_transition(t, "e2", "processing", "done")
    rec.record_transition(t, "e3", "idle", "processing")
    rec.record_position(t, "e1", 0, 0, "done")
    rec.record_event(t, "spawn", "New entity")

    summary = rec.compute_summary()
    assert summary["completed_products"] == 2
    assert summary["total_state_transitions"] == 3
    assert summary["total_events"] == 1
    assert summary["total_position_snapshots"] == 1


def test_write_output(tmp_path):
    rec = SimulationRecorder()
    t = datetime(2026, 1, 1, 12, 0)
    rec.record_transition(t, "e1", "idle", "done")
    rec.record_position(t, "e1", 1, 2, "done")
    rec.record_event(t, "complete", "Entity done")

    path = str(tmp_path / "output.json")
    rec.write_output(path)

    assert os.path.exists(path)
    with open(path) as f:
        data = json.load(f)
    assert data["summary"]["completed_products"] == 1
    assert len(data["position_snapshots"]) == 1
    assert len(data["state_transitions"]) == 1
    assert len(data["events"]) == 1
