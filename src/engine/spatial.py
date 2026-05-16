"""Spatial engine — graph-based pathfinding and position interpolation."""

from __future__ import annotations
import heapq
from src.engine.models import Position
from src.engine.config import FacilityConfig


class SpatialGraph:
    """Graph of facility paths for routing entities between locations."""

    def __init__(self) -> None:
        self._adj: dict[str, list[tuple[str, float]]] = {}
        self._positions: dict[str, Position] = {}

    @classmethod
    def from_config(cls, facility: FacilityConfig) -> SpatialGraph:
        g = cls()
        for loc in facility.locations:
            g._positions[loc.id] = Position(loc.position["x"], loc.position["y"])
            g._adj.setdefault(loc.id, [])
        for path in facility.paths:
            g._adj.setdefault(path.from_id, []).append((path.to_id, path.distance))
        return g

    def position_of(self, location_id: str) -> Position | None:
        return self._positions.get(location_id)

    def shortest_path(self, from_id: str, to_id: str) -> list[str] | None:
        """Dijkstra shortest path returning list of location IDs."""
        if from_id not in self._adj or to_id not in self._adj:
            return None
        if from_id == to_id:
            return [from_id]

        dist: dict[str, float] = {from_id: 0.0}
        prev: dict[str, str | None] = {from_id: None}
        pq: list[tuple[float, str]] = [(0.0, from_id)]

        while pq:
            d, u = heapq.heappop(pq)
            if u == to_id:
                break
            if d > dist.get(u, float("inf")):
                continue
            for v, w in self._adj.get(u, []):
                nd = d + w
                if nd < dist.get(v, float("inf")):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))

        if to_id not in prev:
            return None

        path: list[str] = []
        node: str | None = to_id
        while node is not None:
            path.append(node)
            node = prev.get(node)
        path.reverse()
        return path

    def compute_route(self, from_id: str, to_id: str) -> list[Position]:
        """Compute a route as a list of positions from start to destination."""
        path_ids = self.shortest_path(from_id, to_id)
        if not path_ids:
            return []
        return [self._positions[loc_id] for loc_id in path_ids if loc_id in self._positions]

    def route_length(self, route: list[Position]) -> float:
        total = 0.0
        for i in range(1, len(route)):
            total += route[i - 1].distance_to(route[i])
        return total


def advance_along_route(
    route: list[Position],
    progress: float,
    speed: float,
    dt: float,
) -> tuple[Position, float, bool]:
    """Move along a route by speed*dt meters.

    Returns (new_position, new_progress, arrived).
    progress is distance traveled along route in meters.
    """
    if not route or len(route) < 2:
        return route[0] if route else Position(0, 0), progress, True

    total_length = sum(
        route[i].distance_to(route[i + 1]) for i in range(len(route) - 1)
    )
    if total_length <= 0:
        return route[-1], total_length, True

    new_progress = min(progress + speed * dt, total_length)

    # Find which segment we're on
    accumulated = 0.0
    for i in range(len(route) - 1):
        seg_len = route[i].distance_to(route[i + 1])
        if accumulated + seg_len >= new_progress:
            t = (new_progress - accumulated) / seg_len if seg_len > 0 else 1.0
            pos = Position(
                route[i].x + t * (route[i + 1].x - route[i].x),
                route[i].y + t * (route[i + 1].y - route[i].y),
            )
            return pos, new_progress, new_progress >= total_length - 0.01
        accumulated += seg_len

    return route[-1], total_length, True
