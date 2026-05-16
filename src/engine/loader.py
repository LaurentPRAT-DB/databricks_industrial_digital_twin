"""YAML configuration loader with Pydantic validation."""

import yaml
from pathlib import Path
from src.engine.config import SimulationConfig


def load_config(path: str | Path) -> SimulationConfig:
    """Load and validate a simulation config from a YAML file."""
    with open(path) as f:
        raw = yaml.safe_load(f) or {}

    # Flatten top-level 'simulation' key if present
    if "simulation" in raw and isinstance(raw["simulation"], dict):
        sim_meta = raw.pop("simulation")
        raw = {**sim_meta, **raw}

    return SimulationConfig(**raw)
