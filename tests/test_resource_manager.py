"""Tests for ResourceManager."""

from src.engine.resource_manager import ResourceManager
from src.engine.models import ResourceState, Position


def _make_resource(id: str = "m1", capacity: int = 1, rtype: str = "machine", x: float = 0, y: float = 0) -> ResourceState:
    return ResourceState(
        id=id, type=rtype, status="available",
        capacity=capacity, occupants=[], queue=[], max_queue=5,
        position=Position(x=x, y=y),
        total_busy_time=0.0, last_busy_start=0.0,
    )


class TestResourceManager:
    def test_add_and_get(self):
        rm = ResourceManager()
        r = _make_resource("m1")
        rm.add_resource(r)
        assert rm.get("m1") is r
        assert rm.get("nonexistent") is None

    def test_is_available(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1"))
        assert rm.is_available("m1") is True
        assert rm.is_available("nonexistent") is False

    def test_acquire_and_release(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1", capacity=1))

        assert rm.acquire("m1", "entity_1", 0.0) is True
        assert rm.is_available("m1") is False
        assert rm.get("m1").status == "busy"

        # Can't acquire again
        assert rm.acquire("m1", "entity_2", 1.0) is False

        # Release
        assert rm.release("m1", "entity_1", 10.0) is True
        assert rm.is_available("m1") is True
        assert rm.get("m1").total_busy_time == 10.0

    def test_release_nonexistent(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1"))
        assert rm.release("m1", "not_there", 0.0) is False
        assert rm.release("nonexistent", "e1", 0.0) is False

    def test_acquire_nonexistent(self):
        rm = ResourceManager()
        assert rm.acquire("nonexistent", "e1", 0.0) is False

    def test_multi_capacity(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("buf", capacity=3))

        assert rm.acquire("buf", "e1", 0.0) is True
        assert rm.is_available("buf") is True  # Still has room
        assert rm.acquire("buf", "e2", 1.0) is True
        assert rm.acquire("buf", "e3", 2.0) is True
        assert rm.is_available("buf") is False  # Full

        rm.release("buf", "e1", 5.0)
        assert rm.is_available("buf") is True

    def test_enqueue_and_dequeue(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1"))

        assert rm.enqueue("m1", "e1") is True
        assert rm.enqueue("m1", "e2") is True
        # Duplicate should not re-add
        assert rm.enqueue("m1", "e1") is True
        assert len(rm.get("m1").queue) == 2

        assert rm.dequeue("m1") == "e1"
        assert rm.dequeue("m1") == "e2"
        assert rm.dequeue("m1") is None

    def test_enqueue_nonexistent(self):
        rm = ResourceManager()
        assert rm.enqueue("nonexistent", "e1") is False

    def test_dequeue_nonexistent(self):
        rm = ResourceManager()
        assert rm.dequeue("nonexistent") is None

    def test_enqueue_full(self):
        rm = ResourceManager()
        r = _make_resource("m1")
        r.max_queue = 2
        rm.add_resource(r)

        assert rm.enqueue("m1", "e1") is True
        assert rm.enqueue("m1", "e2") is True
        assert rm.enqueue("m1", "e3") is False

    def test_find_available_by_type(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1", rtype="machine"))
        rm.add_resource(_make_resource("m2", rtype="machine"))
        rm.add_resource(_make_resource("b1", rtype="buffer"))

        rm.acquire("m1", "e1", 0.0)
        result = rm.find_available_by_type("machine")
        assert result is not None
        assert result.id == "m2"

        assert rm.find_available_by_type("conveyor") is None

    def test_any_available_of_type(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1", rtype="machine"))
        assert rm.any_available_of_type("machine") is True
        rm.acquire("m1", "e1", 0.0)
        assert rm.any_available_of_type("machine") is False

    def test_find_nearest_available(self):
        rm = ResourceManager()
        rm.add_resource(_make_resource("m1", rtype="machine", x=0, y=0))
        rm.add_resource(_make_resource("m2", rtype="machine", x=10, y=0))
        rm.add_resource(_make_resource("m3", rtype="machine", x=5, y=0))

        pos = Position(x=4, y=0)
        result = rm.find_nearest_available("machine", pos)
        assert result is not None
        assert result.id == "m3"

        # Make m3 busy, nearest is now m1
        rm.acquire("m3", "e1", 0.0)
        result = rm.find_nearest_available("machine", pos)
        assert result.id == "m1"
