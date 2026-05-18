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
from src.engine.plan_builder import PlanSpec, StationSpec, generate_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger(__name__)

CONFIGS_DIR = Path(os.getenv("SIM_CONFIGS_DIR", "configs"))
WHATIF_DIR = CONFIGS_DIR / "whatif"
REPORTS_DIR = CONFIGS_DIR / "reports"
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
    whatif_dir = WHATIF_DIR / req.id
    whatif_count = len(list(whatif_dir.glob("*.json"))) if whatif_dir.exists() else 0
    return {
        "status": "loaded",
        "id": req.id,
        "name": _static_config.get("config", {}).get("name", ""),
        "frame_count": len(_simulation_frames),
        "whatif_count": whatif_count,
    }


class GenerateScenarioStation(BaseModel):
    name: str
    cycle_mean: float = 60.0
    cycle_std: float | None = None
    model_3d: str | None = None


class GenerateScenarioRequest(BaseModel):
    name: str
    description: str = ""
    duration_hours: float = 8.0
    entity_type: str = "part"
    entity_variants: list[str] = []
    spawn_rate_per_hour: float = 20.0
    stations: list[GenerateScenarioStation]
    seed: int | None = None


@app.post("/api/scenarios/generate")
async def generate_scenario(req: GenerateScenarioRequest):
    if not req.stations:
        return JSONResponse(status_code=400, content={"error": "At least one station is required"})

    spec = PlanSpec(
        name=req.name,
        description=req.description,
        duration_hours=req.duration_hours,
        entity_type=req.entity_type,
        entity_variants=req.entity_variants,
        spawn_rate_per_hour=req.spawn_rate_per_hour,
        stations=[
            StationSpec(
                name=s.name,
                cycle_mean=s.cycle_mean,
                cycle_std=s.cycle_std,
                model_3d=s.model_3d,
            )
            for s in req.stations
        ],
        seed=req.seed,
    )

    config_dict = generate_config(spec)
    slug = _slugify(req.name)
    if not slug:
        slug = "custom_scenario"

    config_path = CONFIGS_DIR / f"{slug}.yaml"
    with open(config_path, "w") as f:
        yaml.dump(config_dict, f, default_flow_style=False, sort_keys=False)
    logger.info("Generated scenario config: %s", config_path)

    _precompute_simulation(slug)
    return {
        "status": "generated",
        "id": slug,
        "name": req.name,
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


def _run_simulation_metrics(scenario_id: str, overrides: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
    """Run a simulation to completion and return only the final metrics. Does not touch global state."""
    config_path = CONFIGS_DIR / f"{scenario_id}.yaml"
    config = load_config(str(config_path))
    engine = SimulationEngine(config)

    if overrides:
        dev_map = {loc_id: DeviationConfig(**params) for loc_id, params in overrides.items()}
        engine.set_deviation_overrides(dev_map)

    dt = config.time_step_seconds
    while engine.sim_time < engine.end_time:
        new_entities = engine.scheduler.spawn_due(engine.elapsed_s)
        for entity in new_entities:
            first_target = engine._location_sequence[0] if engine._location_sequence else None
            if first_target:
                entity.target_location = first_target
                spawn_loc = next((l.id for l in engine.config.facility.locations if l.type == "spawn_point"), "")
                entity.route = engine.spatial.compute_route(spawn_loc, first_target)
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

        engine.sim_time += timedelta(seconds=dt)
        engine.elapsed_s += dt

    state = engine.get_current_state()
    return state["metrics"]


def _auto_name(data: dict) -> str:
    """Generate a name for an unnamed what-if from its overrides and saved_at."""
    overrides = data.get("overrides", {})
    if overrides:
        machines = list(overrides.keys())[:2]
        label = "+".join(m.replace("_", " ").title() for m in machines)
        if len(overrides) > 2:
            label += f" +{len(overrides) - 2} more"
    else:
        label = "No Deviations"
    saved = data.get("saved_at", "")
    if saved:
        date_part = saved[:10]
        label += f" ({date_part})"
    return label


class RunReportRequest(BaseModel):
    filenames: list[str] | None = None


@app.post("/api/scenarios/{scenario_id}/run-report")
async def run_scenario_report(scenario_id: str, req: RunReportRequest | None = None):
    config_path = CONFIGS_DIR / f"{scenario_id}.yaml"
    if not config_path.exists():
        return JSONResponse(status_code=404, content={"error": f"Scenario '{scenario_id}' not found"})

    t0 = wall_time.time()
    selected = req.filenames if req and req.filenames else None
    logger.info("Running report for scenario: %s (selected: %s)", scenario_id, selected or "all")

    baseline_metrics = _run_simulation_metrics(scenario_id)

    whatif_results = []
    whatif_dir = WHATIF_DIR / scenario_id
    if whatif_dir.exists():
        for f in sorted(whatif_dir.glob("*.json")):
            if selected and f.name not in selected:
                continue
            try:
                data = json.loads(f.read_text())
                name = data.get("name", "").strip() or _auto_name(data)
                overrides = data.get("overrides", {})
                metrics = _run_simulation_metrics(scenario_id, overrides=overrides if overrides else None)
                whatif_results.append({
                    "name": name,
                    "filename": f.name,
                    "overrides": overrides,
                    "metrics": metrics,
                    "saved_at": data.get("saved_at"),
                })
            except Exception as e:
                logger.warning("Failed to run what-if %s: %s", f.name, e)

    elapsed = wall_time.time() - t0
    logger.info("Report complete: baseline + %d what-ifs in %.1fs", len(whatif_results), elapsed)

    return {
        "scenario_id": scenario_id,
        "baseline": {"name": "Baseline", "metrics": baseline_metrics},
        "whatifs": whatif_results,
        "run_count": 1 + len(whatif_results),
        "elapsed_s": round(elapsed, 2),
    }


REPORTS_DIR.mkdir(parents=True, exist_ok=True)


class SaveReportRequest(BaseModel):
    scenario_id: str
    name: str
    report: dict[str, Any]
    overwrite: bool = False


@app.get("/api/reports/check/{scenario_id}/{slug}")
async def check_report_exists(scenario_id: str, slug: str):
    filepath = REPORTS_DIR / scenario_id / f"{slug}.json"
    return {"exists": filepath.exists()}


@app.get("/api/reports/list/{scenario_id}")
async def list_reports(scenario_id: str):
    dest = REPORTS_DIR / scenario_id
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
                "run_count": data.get("report", {}).get("run_count", 0),
            })
        except Exception:
            continue
    return {"items": items}


@app.get("/api/reports/load/{scenario_id}/{filename}")
async def load_report(scenario_id: str, filename: str):
    filepath = REPORTS_DIR / scenario_id / filename
    if not filepath.exists():
        return JSONResponse(status_code=404, content={"error": "Report not found"})
    return json.loads(filepath.read_text())


@app.post("/api/reports/save")
async def save_report(req: SaveReportRequest):
    name = req.name.strip()
    if not name:
        return JSONResponse(status_code=400, content={"error": "Name is required"})
    slug = _slugify(name)
    if not slug:
        return JSONResponse(status_code=400, content={"error": "Invalid name"})
    dest = REPORTS_DIR / req.scenario_id
    dest.mkdir(parents=True, exist_ok=True)
    filepath = dest / f"{slug}.json"
    if filepath.exists() and not req.overwrite:
        return JSONResponse(status_code=409, content={"error": "Report already exists", "filename": f"{slug}.json"})
    payload = {
        "name": name,
        "scenario_id": req.scenario_id,
        "report": req.report,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    filepath.write_text(json.dumps(payload, indent=2))
    logger.info("Saved report: %s", filepath)
    return {"status": "saved", "filename": f"{slug}.json"}


class PrintReportRequest(BaseModel):
    scenario_id: str
    scenario_name: str
    report: dict


@app.post("/api/reports/print")
async def print_report(req: PrintReportRequest):
    """Generate a markdown report and save to disk."""
    report = req.report
    baseline = report.get("baseline", {})
    whatifs = report.get("whatifs", [])
    run_count = report.get("run_count", 0)
    elapsed_s = report.get("elapsed_s", 0)

    lines = [
        f"# Simulation Report: {req.scenario_name}",
        "",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}  ",
        f"**Scenario:** {req.scenario_id}  ",
        f"**Runs:** {run_count} | **Elapsed:** {elapsed_s}s  ",
        "",
        "---",
        "",
        "## KPI Comparison",
        "",
        "| Run | Throughput/hr | Completed | Utilization % | WIP | Queue |",
        "|-----|--------------|-----------|---------------|-----|-------|",
    ]

    bm = baseline.get("metrics", {})
    lines.append(f"| **Baseline** | {bm.get('throughput_per_hour', 0)} | {bm.get('completed', 0)} | {bm.get('avg_utilization_pct', 0)}% | {bm.get('wip_count', 0)} | {bm.get('total_queue_depth', 0)} |")

    for wi in whatifs:
        wm = wi.get("metrics", {})
        lines.append(f"| {wi.get('name', '?')} | {wm.get('throughput_per_hour', 0)} | {wm.get('completed', 0)} | {wm.get('avg_utilization_pct', 0)}% | {wm.get('wip_count', 0)} | {wm.get('total_queue_depth', 0)} |")

    if whatifs:
        lines += ["", "---", "", "## Deviation Details", ""]
        for wi in whatifs:
            lines.append(f"### {wi.get('name', '?')}")
            overrides = wi.get("overrides", {})
            machines = {k: v for k, v in overrides.items() if v}
            if not machines:
                lines.append("No deviations — same as baseline.")
            else:
                for loc_id, params in machines.items():
                    param_strs = [f"{k}={v}" for k, v in params.items()]
                    lines.append(f"- **{loc_id.replace('_', ' ').title()}**: {', '.join(param_strs)}")
            lines.append("")

    lines += ["---", "", f"*Report generated by Industrial Digital Twin*"]

    md_content = "\n".join(lines)

    dest = REPORTS_DIR / req.scenario_id
    dest.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y_%m_%d_%H_%M")
    filename = f"{_slugify(req.scenario_name)}_report_{ts}.md"
    filepath = dest / filename
    filepath.write_text(md_content)
    logger.info("Printed markdown report: %s", filepath)

    return {"status": "ok", "filename": filename, "path": str(filepath)}


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
