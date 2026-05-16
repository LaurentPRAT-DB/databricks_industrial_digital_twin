"""FastAPI application for Industrial Digital Twin."""

import json
import logging
import os
import re
import time as wall_time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from src.engine.loader import load_config
from src.engine.engine import SimulationEngine
from src.engine.config import DeviationConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger(__name__)

CONFIGS_DIR = Path(os.getenv("SIM_CONFIGS_DIR", "configs"))
WHATIF_DIR = CONFIGS_DIR / "whatif"
DEFAULT_CONFIG = os.getenv("SIM_CONFIG", "assembly_line_3station")
SNAPSHOT_INTERVAL_S = int(os.getenv("SIM_SNAPSHOT_INTERVAL", "5"))


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:64]

_active_scenario_id: str = ""
_active_whatif_name: str | None = None
_static_config: dict[str, Any] = {}
_simulation_frames: list[dict[str, Any]] = []


def _precompute_simulation(scenario_id: str, overrides: dict[str, dict[str, float]] | None = None, whatif_name: str | None = None) -> None:
    global _active_scenario_id, _active_whatif_name, _static_config, _simulation_frames
    _active_whatif_name = whatif_name

    config_path = CONFIGS_DIR / f"{scenario_id}.yaml"
    logger.info("Loading config: %s", config_path)
    config = load_config(str(config_path))
    engine = SimulationEngine(config)

    if overrides:
        dev_map = {
            loc_id: DeviationConfig(**params)
            for loc_id, params in overrides.items()
        }
        engine.set_deviation_overrides(dev_map)
    _active_scenario_id = scenario_id

    dt = config.time_step_seconds
    snapshot_every = max(1, int(SNAPSHOT_INTERVAL_S / dt))
    tick = 0

    logger.info("Pre-computing simulation: %s (%sh at dt=%ss, snapshot every %ss)...",
                config.name, config.duration_hours, dt, SNAPSHOT_INTERVAL_S)
    t0 = wall_time.time()

    frames: list[dict[str, Any]] = []

    # Record initial frame
    state = engine.get_current_state()
    frames.append({
        "sim_time": state["sim_time"],
        "elapsed_s": engine.elapsed_s,
        "entities": state["entities"],
        "resources": state["resources"],
        "metrics": state["metrics"],
    })

    # Store static config from initial state
    _static_config = {
        "config": state["config"],
        "paths": state["paths"],
        "locations": state["locations"],
        "state_descriptions": state["state_descriptions"],
        "scenario_id": scenario_id,
        "whatif_name": whatif_name,
        "whatif_overrides": overrides,
    }

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

        # Update
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

        engine.sim_time += timedelta(seconds=dt)
        engine.elapsed_s += dt
        tick += 1

        if tick % snapshot_every == 0:
            state = engine.get_current_state()
            frames.append({
                "sim_time": state["sim_time"],
                "elapsed_s": engine.elapsed_s,
                "entities": state["entities"],
                "resources": state["resources"],
                "metrics": state["metrics"],
            })

    elapsed = wall_time.time() - t0
    _simulation_frames = frames
    logger.info("Pre-computed %d frames in %.1fs (%.0fx real-time)",
                len(frames), elapsed, config.duration_hours * 3600 / max(elapsed, 0.001))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _precompute_simulation(DEFAULT_CONFIG)
    yield
    logger.info("Shutting down")


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
    _precompute_simulation(req.id)
    return {
        "status": "loaded",
        "id": req.id,
        "name": _static_config.get("config", {}).get("name", ""),
        "frame_count": len(_simulation_frames),
    }


@app.get("/api/simulation/frames")
async def get_simulation_frames():
    return {
        **_static_config,
        "frames": _simulation_frames,
        "frame_count": len(_simulation_frames),
        "snapshot_interval_s": SNAPSHOT_INTERVAL_S,
    }


class SimulateRequest(BaseModel):
    id: str
    name: str = ""
    overrides: dict[str, dict[str, float]] = {}


@app.post("/api/scenarios/simulate")
async def simulate_with_overrides(req: SimulateRequest):
    config_path = CONFIGS_DIR / f"{req.id}.yaml"
    if not config_path.exists():
        return JSONResponse(status_code=404, content={"error": f"Scenario '{req.id}' not found"})
    whatif_name = req.name.strip() or "What-If"
    _precompute_simulation(req.id, overrides=req.overrides if req.overrides else None, whatif_name=whatif_name)
    return {
        "status": "computed",
        "id": req.id,
        "name": whatif_name,
        "frame_count": len(_simulation_frames),
    }


@app.get("/api/scenarios/{scenario_id}/parameters")
async def get_scenario_parameters(scenario_id: str):
    config_path = CONFIGS_DIR / f"{scenario_id}.yaml"
    if not config_path.exists():
        return JSONResponse(status_code=404, content={"error": f"Scenario '{scenario_id}' not found"})
    config = load_config(str(config_path))
    locations = []
    for loc in config.facility.locations:
        if loc.type != "machine":
            continue
        dev = loc.deviations or DeviationConfig()
        locations.append({
            "id": loc.id,
            "label": loc.label or loc.id.replace("_", " ").title(),
            "cycle_time_mean": loc.properties.get("cycle_time_mean"),
            "mtbf_hours": loc.properties.get("mtbf_hours"),
            "deviations": dev.model_dump(),
        })
    return {"scenario_id": scenario_id, "locations": locations}


class SaveWhatIfRequest(BaseModel):
    scenario_id: str
    name: str
    overrides: dict[str, dict[str, float]] = {}


@app.post("/api/whatif/save")
async def save_whatif(req: SaveWhatIfRequest):
    name = req.name.strip()
    if not name:
        return JSONResponse(status_code=400, content={"error": "Name is required"})
    slug = _slugify(name)
    if not slug:
        return JSONResponse(status_code=400, content={"error": "Invalid name"})
    dest = WHATIF_DIR / req.scenario_id
    dest.mkdir(parents=True, exist_ok=True)
    payload = {
        "name": name,
        "scenario_id": req.scenario_id,
        "overrides": req.overrides,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    filepath = dest / f"{slug}.json"
    filepath.write_text(json.dumps(payload, indent=2))
    return {"status": "saved", "filename": f"{slug}.json"}


@app.get("/api/whatif/list/{scenario_id}")
async def list_whatifs(scenario_id: str):
    dest = WHATIF_DIR / scenario_id
    if not dest.exists():
        return {"items": []}
    items = []
    for f in sorted(dest.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            items.append({
                "name": data.get("name", f.stem),
                "filename": f.name,
                "saved_at": data.get("saved_at"),
            })
        except Exception:
            continue
    return {"items": items}


@app.get("/api/whatif/load/{scenario_id}/{filename}")
async def load_whatif(scenario_id: str, filename: str):
    filepath = WHATIF_DIR / scenario_id / filename
    if not filepath.exists():
        return JSONResponse(status_code=404, content={"error": "What-if not found"})
    data = json.loads(filepath.read_text())
    return data


@app.get("/api/status")
async def get_status():
    if not _simulation_frames:
        return {"status": "not_started"}
    last = _simulation_frames[-1]
    return {
        "status": "ready",
        "frame_count": len(_simulation_frames),
        "scenario": _active_scenario_id,
        "duration_s": last["elapsed_s"],
    }


# Serve frontend static files
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=_frontend_dist / "assets"), name="assets")

    @app.get("/{path:path}")
    async def serve_frontend(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"error": "Not found"})
        file_path = _frontend_dist / path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_frontend_dist / "index.html")
