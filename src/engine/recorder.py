"""Generic simulation event recorder."""

from __future__ import annotations
import json
import os
from datetime import datetime
from typing import Any


class SimulationRecorder:
    """Collects simulation events and writes structured output."""

    def __init__(self) -> None:
        self.position_snapshots: list[dict[str, Any]] = []
        self.state_transitions: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.resource_snapshots: list[dict[str, Any]] = []

    def record_position(
        self, sim_time: datetime, entity_id: str, x: float, y: float,
        state: str, properties: dict[str, Any] | None = None,
    ) -> None:
        self.position_snapshots.append({
            "time": sim_time.isoformat(),
            "entity_id": entity_id,
            "x": round(x, 2),
            "y": round(y, 2),
            "state": state,
            **(properties or {}),
        })

    def record_transition(
        self, sim_time: datetime, entity_id: str,
        from_state: str, to_state: str,
        location: str | None = None,
    ) -> None:
        self.state_transitions.append({
            "time": sim_time.isoformat(),
            "entity_id": entity_id,
            "from_state": from_state,
            "to_state": to_state,
            "location": location,
        })

    def record_event(
        self, sim_time: datetime, event_type: str,
        description: str = "", details: dict[str, Any] | None = None,
    ) -> None:
        self.events.append({
            "time": sim_time.isoformat(),
            "event_type": event_type,
            "description": description,
            **(details or {}),
        })

    def record_resources(
        self, sim_time: datetime, resources: list[dict[str, Any]],
    ) -> None:
        self.resource_snapshots.append({
            "time": sim_time.isoformat(),
            "resources": resources,
        })

    def compute_summary(self) -> dict[str, Any]:
        completed = sum(
            1 for t in self.state_transitions if t.get("to_state") == "done"
        )
        total_transitions = len(self.state_transitions)
        total_events = len(self.events)
        total_snapshots = len(self.position_snapshots)

        return {
            "completed_products": completed,
            "total_state_transitions": total_transitions,
            "total_events": total_events,
            "total_position_snapshots": total_snapshots,
        }

    def write_output(self, path: str) -> None:
        output = {
            "summary": self.compute_summary(),
            "position_snapshots": self.position_snapshots,
            "state_transitions": self.state_transitions,
            "events": self.events,
        }
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(output, f, default=str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
