"""FastAPI application for Industrial Digital Twin."""

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.backend.api.websocket import websocket_router, broadcaster
from src.engine.loader import load_config
from src.engine.engine import SimulationEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger(__name__)

CONFIG_PATH = os.getenv("SIM_CONFIG", "configs/assembly_line_3station.yaml")
_engine: SimulationEngine | None = None
_engine_thread: threading.Thread | None = None


def _run_engine_loop(engine: SimulationEngine, dt: float) -> None:
    """Run simulation in a background thread, advancing one tick per real interval."""
    import time
    speed_factor = float(os.getenv("SIM_SPEED", "60"))  # 1 real second = N sim seconds
    real_interval = dt / speed_factor

    while engine.sim_time < engine.end_time:
        # Spawn
        new_entities = engine.scheduler.spawn_due(engine.elapsed_s)
        for entity in new_entities:
            first_target = engine._location_sequence[0] if engine._location_sequence else None
            if first_target:
                entity.target_location = first_target
                spawn_loc = next(
                    (l.id for l in engine.config.facility.locations if l.type == "spawn_point"),
                    ""
                )
                route = engine.spatial.compute_route(spawn_loc, first_target)
                entity.route = route
                entity.route_progress = 0.0
                entity.state = "in_transit"
                entity.current_location = spawn_loc
            engine.entities[entity.id] = entity

        # Update entities
        to_remove: list[str] = []
        for entity in list(engine.entities.values()):
            if entity.destroyed:
                to_remove.append(entity.id)
                continue
            engine._update_entity(entity, dt)
            if entity.destroyed:
                to_remove.append(entity.id)
        for eid in to_remove:
            del engine.entities[eid]

        # Advance time
        from datetime import timedelta
        engine.sim_time += timedelta(seconds=dt)
        engine.elapsed_s += dt

        time.sleep(real_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _engine_thread

    logger.info("Loading config: %s", CONFIG_PATH)
    config = load_config(CONFIG_PATH)
    _engine = SimulationEngine(config)
    broadcaster.set_engine(_engine)

    # Start simulation in background thread
    _engine_thread = threading.Thread(
        target=_run_engine_loop,
        args=(_engine, config.time_step_seconds),
        daemon=True,
    )
    _engine_thread.start()
    logger.info("Simulation started: %s", config.name)

    yield

    logger.info("Shutting down simulation")


app = FastAPI(
    title="Industrial Digital Twin",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router)


@app.get("/api/status")
async def get_status():
    if _engine is None:
        return {"status": "not_started"}
    return {
        "status": "running",
        "sim_time": _engine.sim_time.isoformat(),
        "elapsed_hours": round(_engine.elapsed_s / 3600, 2),
        "config_name": _engine.config.name,
    }


@app.get("/api/entities")
async def get_entities():
    if _engine is None:
        return {"entities": []}
    return {
        "entities": [e.to_dict() for e in _engine.entities.values() if not e.destroyed]
    }


@app.get("/api/resources")
async def get_resources():
    if _engine is None:
        return {"resources": []}
    return {
        "resources": [r.to_dict() for r in _engine.resource_mgr.resources.values()]
    }


@app.get("/api/metrics")
async def get_metrics():
    if _engine is None:
        return {}
    return _engine.get_metrics()


# Serve frontend static files
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        file_path = _frontend_dist / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_frontend_dist / "index.html")
