"""Pydantic v2 configuration models for the simulation engine."""

from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class DurationConfig(BaseModel):
    distribution: str = "constant"
    params: dict[str, float] = Field(default_factory=dict)


class StateConfig(BaseModel):
    type: Literal["stationary", "moving", "queued", "terminal"]
    description: str = ""
    location_type: Optional[str] = None
    duration: Optional[DurationConfig] = None
    speed: Optional[DurationConfig] = None
    queue_discipline: str = "FIFO"
    max_queue_depth: int = 100
    pathfinding: str = "graph"
    on_enter: list[dict[str, Any]] = Field(default_factory=list)
    on_exit: list[dict[str, Any]] = Field(default_factory=list)
    properties: list[str] = Field(default_factory=list)


class ConditionConfig(BaseModel):
    type: str
    resource_type: Optional[str] = None
    location_id: Optional[str] = None
    property: Optional[str] = None
    operator: Optional[str] = None
    value: Optional[Any] = None
    probability_per_tick: Optional[float] = None
    conditions: list["ConditionConfig"] = Field(default_factory=list)


class TransitionConfig(BaseModel):
    from_state: str = Field(alias="from")
    to_state: str = Field(alias="to")
    condition: ConditionConfig
    priority: int = 1
    next_location: Optional[dict[str, str]] = None

    model_config = {"populate_by_name": True}


class StateGraphConfig(BaseModel):
    states: dict[str, StateConfig]
    transitions: list[TransitionConfig]


class LocationConfig(BaseModel):
    id: str
    type: str
    position: dict[str, float]
    capacity: int = 1
    properties: dict[str, Any] = Field(default_factory=dict)


class PathConfig(BaseModel):
    from_id: str = Field(alias="from")
    to_id: str = Field(alias="to")
    distance: float
    speed_limit: Optional[float] = None

    model_config = {"populate_by_name": True}


class FacilityConfig(BaseModel):
    name: str = "Unnamed Facility"
    coordinate_system: str = "cartesian_2d"
    bounds: dict[str, Any] = Field(default_factory=lambda: {"width": 100, "height": 50})
    locations: list[LocationConfig] = Field(default_factory=list)
    paths: list[PathConfig] = Field(default_factory=list)


class EntityPropertyConfig(BaseModel):
    type: str = "string"
    values: Optional[list[str]] = None
    weights: Optional[list[float]] = None
    initial: Optional[Any] = None
    constant: Optional[Any] = None
    distribution: Optional[str] = None
    params: Optional[dict[str, float]] = None


class EntityTypeConfig(BaseModel):
    state_graph: str
    initial_state: str = "waiting"
    spawn_rule: str = "schedule"
    count: Optional[int] = None
    properties: dict[str, EntityPropertyConfig] = Field(default_factory=dict)


class ShiftConfig(BaseModel):
    name: str
    start: str
    end: str
    rate_multiplier: float = 1.0


class ScheduleConfig(BaseModel):
    type: str = "poisson"
    rate_per_hour: float = 10.0
    shifts: list[ShiftConfig] = Field(default_factory=list)


class SimulationConfig(BaseModel):
    name: str = "Unnamed Simulation"
    description: str = ""
    duration_hours: float = 8.0
    time_step_seconds: float = 1.0
    seed: Optional[int] = None
    facility: FacilityConfig = Field(default_factory=FacilityConfig)
    state_graphs: dict[str, StateGraphConfig] = Field(default_factory=dict)
    entity_types: dict[str, EntityTypeConfig] = Field(default_factory=dict)
    schedule: ScheduleConfig = Field(default_factory=ScheduleConfig)
