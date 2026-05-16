"""Core data models for the simulation engine."""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class Position:
    x: float
    y: float

    def distance_to(self, other: Position) -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


@dataclass
class EntityState:
    id: str
    entity_type: str
    state: str
    position: Position
    properties: dict[str, Any] = field(default_factory=dict)
    route: list[Position] = field(default_factory=list)
    route_progress: float = 0.0
    target_location: Optional[str] = None
    current_location: Optional[str] = None
    state_entered_at: float = 0.0
    state_duration: float = 0.0
    speed: float = 1.5
    destroyed: bool = False
    breakdown_remaining: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        d = {
            "id": self.id,
            "entity_type": self.entity_type,
            "state": self.state,
            "x": round(self.position.x, 2),
            "y": round(self.position.y, 2),
            "target_location": self.target_location,
            "current_location": self.current_location,
            "properties": self.properties,
        }
        if self.breakdown_remaining > 0:
            d["breakdown_remaining"] = round(self.breakdown_remaining, 1)
        return d


@dataclass
class ResourceState:
    id: str
    type: str
    position: Position
    capacity: int = 1
    occupants: list[str] = field(default_factory=list)
    queue: list[str] = field(default_factory=list)
    max_queue: int = 100
    status: str = "available"
    properties: dict[str, Any] = field(default_factory=dict)
    total_busy_time: float = 0.0
    last_busy_start: float = 0.0

    @property
    def is_available(self) -> bool:
        return self.status == "available" and len(self.occupants) < self.capacity

    @property
    def occupancy(self) -> int:
        return len(self.occupants)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "x": round(self.position.x, 2),
            "y": round(self.position.y, 2),
            "capacity": self.capacity,
            "occupants": list(self.occupants),
            "queue_depth": len(self.queue),
            "status": self.status,
            "properties": self.properties,
        }


@dataclass
class SimulationContext:
    sim_time: datetime
    dt: float
    elapsed_s: float
    entities: dict[str, EntityState]
    resources: dict[str, ResourceState]
    events: list[dict[str, Any]] = field(default_factory=list)
