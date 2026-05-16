"""WebSocket endpoint for real-time entity state broadcasting."""

import asyncio
import json
import logging
from typing import Any, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
websocket_router = APIRouter(tags=["websocket"])

_DELTA_FIELDS = {"x", "y", "state", "target_location", "current_location"}


def _compute_deltas(
    prev: dict[str, dict], current: list[dict],
) -> tuple[list[dict], list[str]]:
    deltas: list[dict] = []
    current_ids = {e["id"] for e in current}
    removed = [k for k in prev if k not in current_ids]

    for entity in current:
        eid = entity["id"]
        old = prev.get(eid)
        if old is None:
            deltas.append(entity)
            continue
        diff: dict = {"id": eid}
        for key in _DELTA_FIELDS:
            if entity.get(key) != old.get(key):
                diff[key] = entity.get(key)
        for key in entity:
            if key not in _DELTA_FIELDS and key != "id":
                if entity[key] != old.get(key):
                    diff[key] = entity[key]
        if len(diff) > 1:
            deltas.append(diff)

    return deltas, removed


class EntityBroadcaster:
    """Broadcasts entity state diffs to WebSocket clients."""

    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._broadcast_task: asyncio.Task | None = None
        self._prev_entities: dict[str, dict] = {}
        self._engine = None

    def set_engine(self, engine) -> None:
        self._engine = engine

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        if self._broadcast_task is None or self._broadcast_task.done():
            self._broadcast_task = asyncio.create_task(self._broadcast_loop())

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def broadcast(self, data: dict) -> None:
        if not self._connections:
            return
        message = json.dumps(data, default=str)
        disconnected = set()
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)
        self._connections -= disconnected

    async def _broadcast_loop(self, interval: float = 1.0) -> None:
        while True:
            if not self._connections:
                return
            if self._engine is None:
                await asyncio.sleep(interval)
                continue
            try:
                state = self._engine.get_current_state()
                entities = state.get("entities", [])
                deltas, removed = _compute_deltas(self._prev_entities, entities)
                self._prev_entities = {e["id"]: e for e in entities}

                await self.broadcast({
                    "type": "entity_delta",
                    "data": {
                        "deltas": deltas,
                        "removed": removed,
                        "count": len(entities),
                        "metrics": state.get("metrics", {}),
                        "resources": state.get("resources", []),
                        "sim_time": state.get("sim_time"),
                    },
                })
            except Exception as e:
                logger.error("Broadcast error: %s", e)

            await asyncio.sleep(interval)


broadcaster = EntityBroadcaster()


@websocket_router.websocket("/ws/entities")
async def websocket_entities(websocket: WebSocket):
    await broadcaster.connect(websocket)
    try:
        if broadcaster._engine:
            state = broadcaster._engine.get_current_state()
            await websocket.send_json({
                "type": "initial",
                "data": state,
            })
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            if data == "refresh" and broadcaster._engine:
                state = broadcaster._engine.get_current_state()
                await websocket.send_json({"type": "update", "data": state})
    except WebSocketDisconnect:
        broadcaster.disconnect(websocket)
    except Exception:
        broadcaster.disconnect(websocket)
