"""Modèles de domaine et contrat d'API (JSON en camelCase)."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from .rng import MASK

OrbType = Literal["gold", "bomb", "neutral"]
ShapeId = Literal["line", "cross", "square"]
RunStatus = Literal["playing", "lost"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Cell(CamelModel):
    x: int
    y: int


class GameState(CamelModel):
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    grid: list[list[OrbType]]
    level: int = Field(ge=1)
    target: int = Field(ge=1)
    max_turns: int = Field(ge=1)
    turns_left: int
    treasures: int = Field(ge=0)
    lives: int = Field(ge=0)
    gold: int = Field(ge=0)
    status: RunStatus
    rng: int = Field(ge=0, le=MASK)


class NewGameRequest(CamelModel):
    seed: Optional[int] = Field(default=None, ge=0, le=MASK)


class CastRequest(CamelModel):
    state: GameState
    shape: ShapeId
    x: int
    y: int


class CastReport(CamelModel):
    cells: list[Cell]
    treasures_gained: int
    money_gained: int
    bombs_hit: int
    level_cleared: bool
    run_over: bool


class CastResponse(CamelModel):
    state: GameState
    report: CastReport
