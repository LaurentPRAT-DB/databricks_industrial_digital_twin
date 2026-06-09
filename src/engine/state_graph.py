"""State graph executor — evaluates transitions and fires actions."""

from __future__ import annotations
import random
from src.engine.config import ConditionConfig, TransitionConfig, StateGraphConfig
from src.engine.models import EntityState, SimulationContext


class ConditionEvaluator:
    """Evaluates condition trees against entity + context."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()

    def evaluate(self, cond: ConditionConfig, entity: EntityState, ctx: SimulationContext) -> bool:
        t = cond.type
        if t == "and":
            return all(self.evaluate(c, entity, ctx) for c in cond.conditions)
        if t == "or":
            return any(self.evaluate(c, entity, ctx) for c in cond.conditions)
        if t == "not":
            return not self.evaluate(cond.conditions[0], entity, ctx) if cond.conditions else True
        if t == "duration_elapsed":
            return self._duration_elapsed(entity, ctx)
        if t == "resource_available":
            return self._resource_available(cond, entity, ctx)
        if t == "resource_busy":
            return not self._resource_available(cond, entity, ctx)
        if t == "arrived_at_destination":
            return self._arrived(entity)
        if t == "queue_not_full":
            return self._queue_not_full(cond, ctx)
        if t == "property_threshold":
            return self._property_threshold(cond, entity)
        if t == "random_failure":
            return self._rng.random() < (cond.probability_per_tick or 0.0)
        return False

    def _duration_elapsed(self, entity: EntityState, ctx: SimulationContext) -> bool:
        return entity.state_duration <= 0

    def _resource_available(self, cond: ConditionConfig, entity: EntityState, ctx: SimulationContext) -> bool:
        rt = cond.resource_type or ""
        for r in ctx.resources.values():
            if r.type == rt and r.is_available:
                return True
        return False

    def _arrived(self, entity: EntityState) -> bool:
        if not entity.route or len(entity.route) < 2:
            return True
        total = sum(
            entity.route[i].distance_to(entity.route[i + 1])
            for i in range(len(entity.route) - 1)
        )
        return entity.route_progress >= total - 0.01

    def _queue_not_full(self, cond: ConditionConfig, ctx: SimulationContext) -> bool:
        loc_id = cond.location_id or ""
        r = ctx.resources.get(loc_id)
        if r is None:
            return True
        return len(r.queue) < r.max_queue

    def _property_threshold(self, cond: ConditionConfig, entity: EntityState) -> bool:
        prop = cond.property or ""
        val = entity.properties.get(prop)
        if val is None:
            return False
        target = cond.value
        op = cond.operator or "=="
        if op == "==":
            return val == target
        if op == "!=":
            return val != target
        if op == "<":
            return val < target
        if op == "<=":
            return val <= target
        if op == ">":
            return val > target
        if op == ">=":
            return val >= target
        return False


class StateGraphExecutor:
    """Evaluates transitions and determines state changes for entities."""

    def __init__(self, graph: StateGraphConfig, rng: random.Random | None = None) -> None:
        self.graph = graph
        self.evaluator = ConditionEvaluator(rng)

    def evaluate(self, entity: EntityState, ctx: SimulationContext) -> TransitionConfig | None:
        """Find the highest-priority valid transition for this entity."""
        candidates: list[TransitionConfig] = []
        for t in self.graph.transitions:
            if t.from_state != entity.state:
                continue
            if self.evaluator.evaluate(t.condition, entity, ctx):
                candidates.append(t)
        if not candidates:
            return None
        candidates.sort(key=lambda t: t.priority, reverse=True)
        return candidates[0]

    def get_state_config(self, state_name: str):
        return self.graph.states.get(state_name)
