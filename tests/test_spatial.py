"""Tests for spatial graph and pathfinding."""

from src.engine.loader import load_config
from src.engine.spatial import SpatialGraph, advance_along_route
from src.engine.models import Position


def test_graph_from_config():
    config = load_config("configs/assembly_line_3station.yaml")
    g = SpatialGraph.from_config(config.facility)
    assert g.position_of("raw_billet_intake") is not None
    assert g.position_of("cnc_mill_1") is not None


def test_shortest_path_direct():
    config = load_config("configs/assembly_line_3station.yaml")
    g = SpatialGraph.from_config(config.facility)
    path = g.shortest_path("raw_billet_intake", "billet_queue")
    assert path == ["raw_billet_intake", "billet_queue"]


def test_shortest_path_multi_hop():
    config = load_config("configs/assembly_line_3station.yaml")
    g = SpatialGraph.from_config(config.facility)
    path = g.shortest_path("raw_billet_intake", "cnc_mill_1")
    assert path == ["raw_billet_intake", "billet_queue", "cnc_mill_1"]


def test_shortest_path_to_exit():
    config = load_config("configs/assembly_line_3station.yaml")
    g = SpatialGraph.from_config(config.facility)
    path = g.shortest_path("cmm_inspector", "finished_goods_out")
    assert path == ["cmm_inspector", "finished_goods_out"]


def test_compute_route_positions():
    config = load_config("configs/assembly_line_3station.yaml")
    g = SpatialGraph.from_config(config.facility)
    route = g.compute_route("raw_billet_intake", "billet_queue")
    assert len(route) == 2
    assert route[0].x == 5 and route[0].y == 25
    assert route[1].x == 18 and route[1].y == 25


def test_advance_along_route():
    route = [Position(0, 0), Position(10, 0)]
    pos, progress, arrived = advance_along_route(route, 0.0, 2.0, 1.0)
    assert pos.x == 2.0
    assert pos.y == 0.0
    assert not arrived
    assert progress == 2.0


def test_advance_arrival():
    route = [Position(0, 0), Position(5, 0)]
    pos, progress, arrived = advance_along_route(route, 4.5, 2.0, 1.0)
    assert arrived
    assert pos.x == 5.0
