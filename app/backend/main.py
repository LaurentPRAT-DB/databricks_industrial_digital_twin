"""FastAPI application for Industrial Digital Twin."""

import asyncio
import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from app.backend.api.websocket import websocket_router, broadcaster
from src.engine.loader import load_config
from src.engine.engine import SimulationEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger(__name__)

CONFIGS_DIR = Path(os.getenv("SIM_CONFIGS_DIR", "configs"))
DEFAULT_CONFIG = os.getenv("SIM_CONFIG", "assembly_line_3station")

_engine: SimulationEngine | None = None
_engine_thread: threading.Thread | None = None
_engine_stop = threading.Event()
_active_scenario_id: str = ""


def _run_engine_loop(engine: SimulationEngine, dt: float, stop_event: threading.Event) -> None:
    import time
    speed_factor = float(os.getenv("SIM_SPEED", "60"))
    real_interval = dt / speed_factor

    while engine.sim_time < engine.end_time and not stop_event.is_set():
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

        from datetime import timedelta
        engine.sim_time += timedelta(seconds=dt)
        engine.elapsed_s += dt

        time.sleep(real_interval)


def _start_engine(scenario_id: str) -> None:
    global _engine, _engine_thread, _engine_stop, _active_scenario_id

    # Stop existing engine
    if _engine_thread and _engine_thread.is_alive():
        _engine_stop.set()
        _engine_thread.join(timeout=3)

    _engine_stop = threading.Event()

    config_path = CONFIGS_DIR / f"{scenario_id}.yaml"
    logger.info("Loading config: %s", config_path)
    config = load_config(str(config_path))
    _engine = SimulationEngine(config)
    _active_scenario_id = scenario_id
    broadcaster.set_engine(_engine)

    _engine_thread = threading.Thread(
        target=_run_engine_loop,
        args=(_engine, config.time_step_seconds, _engine_stop),
        daemon=True,
    )
    _engine_thread.start()
    logger.info("Simulation started: %s", config.name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _start_engine(DEFAULT_CONFIG)
    yield
    logger.info("Shutting down simulation")
    _engine_stop.set()


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


@app.get("/api/scenarios")
async def list_scenarios():
    scenarios = []
    for f in sorted(CONFIGS_DIR.glob("*.yaml")):
        try:
            with open(f) as fh:
                raw = yaml.safe_load(fh)
            sim = raw.get("simulation", {})
            scenarios.append({
                "id": f.stem,
                "name": sim.get("name", f.stem),
                "description": sim.get("description", ""),
                "active": f.stem == _active_scenario_id,
            })
        except Exception:
            logger.warning("Skipping invalid config: %s", f)
    return scenarios


class LoadScenarioRequest(BaseModel):
    id: str


@app.post("/api/scenarios/load")
async def load_scenario(req: LoadScenarioRequest):
    config_path = CONFIGS_DIR / f"{req.id}.yaml"
    if not config_path.exists():
        return JSONResponse(status_code=404, content={"error": f"Scenario '{req.id}' not found"})

    _start_engine(req.id)

    # Broadcast initial state to all connected clients
    if _engine and broadcaster.connection_count > 0:
        state = _engine.get_current_state()
        await broadcaster.broadcast({"type": "initial", "data": state})

    return {"status": "loaded", "id": req.id, "name": _engine.config.name if _engine else ""}


@app.get("/api/config")
async def get_config():
    if _engine is None:
        return {"name": "", "description": "", "facility_name": ""}
    return {
        "name": _engine.config.name,
        "description": _engine.config.description,
        "facility_name": _engine.config.facility.name,
    }


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
