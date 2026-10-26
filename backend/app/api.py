"""Routes HTTP. Le serveur est sans état : l'état de partie transite par le client."""

from secrets import randbits

from fastapi import APIRouter, HTTPException

from .game import rules
from .game.models import CastRequest, CastResponse, GameState, NewGameRequest

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/game/new", response_model=GameState)
def new_game(body: NewGameRequest) -> GameState:
    seed = body.seed if body.seed is not None else randbits(32)
    return rules.create_game(seed)


@router.post("/game/cast", response_model=CastResponse)
def cast_spell(body: CastRequest) -> CastResponse:
    try:
        state, report = rules.cast(body.state, body.shape, body.x, body.y)
    except rules.GameRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return CastResponse(state=state, report=report)
