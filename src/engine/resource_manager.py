"""Resource manager — tracks location occupancy, queues, and availability."""

from __future__ import annotations
from src.engine.models import ResourceState, Position


class ResourceManager:
    """Manages facility resources (machines, buffers, docks)."""

    def __init__(self) -> None:
        self.resources: dict[str, ResourceState] = {}

    def add_resource(self, resource: ResourceState) -> None:
        self.resources[resource.id] = resource

    def get(self, resource_id: str) -> ResourceState | None:
        return self.resources.get(resource_id)

    def is_available(self, resource_id: str) -> bool:
        r = self.resources.get(resource_id)
        return r is not None and r.is_available

    def find_available_by_type(self, resource_type: str) -> ResourceState | None:
        for r in self.resources.values():
            if r.type == resource_type and r.is_available:
                return r
        return None

    def acquire(self, resource_id: str, entity_id: str, sim_time_s: float) -> bool:
        r = self.resources.get(resource_id)
        if r is None or not r.is_available:
            return False
        r.occupants.append(entity_id)
        if len(r.occupants) >= r.capacity:
            r.status = "busy"
            r.last_busy_start = sim_time_s
        return True

    def release(self, resource_id: str, entity_id: str, sim_time_s: float) -> bool:
        r = self.resources.get(resource_id)
        if r is None or entity_id not in r.occupants:
            return False
        r.occupants.remove(entity_id)
        if r.status == "busy":
            r.total_busy_time += sim_time_s - r.last_busy_start
        if len(r.occupants) < r.capacity:
            r.status = "available"
        return True

    def enqueue(self, resource_id: str, entity_id: str) -> bool:
        r = self.resources.get(resource_id)
        if r is None or len(r.queue) >= r.max_queue:
            return False
        if entity_id not in r.queue:
            r.queue.append(entity_id)
        return True

    def dequeue(self, resource_id: str) -> str | None:
        r = self.resources.get(resource_id)
        if r is None or not r.queue:
            return None
        return r.queue.pop(0)

    def any_available_of_type(self, resource_type: str) -> bool:
        return any(
            r.is_available for r in self.resources.values() if r.type == resource_type
        )

    def find_nearest_available(self, resource_type: str, pos: Position) -> ResourceState | None:
        best: ResourceState | None = None
        best_dist = float("inf")
        for r in self.resources.values():
            if r.type == resource_type and r.is_available:
                d = pos.distance_to(r.position)
                if d < best_dist:
                    best = r
                    best_dist = d
        return best
