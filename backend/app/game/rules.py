"""Règles du jeu : niveaux, formes de sorts et résolution d'un lancer.

Module pur (aucune dépendance HTTP). Le moteur frontend
(`frontend/src/app/core/engine/game-engine.ts`) reproduit ces règles à l'identique :
toute modification doit être répercutée des deux côtés.
"""

from .models import Cell, CastReport, GameState, OrbType, ShapeId
from .rng import MASK, next_uint32

GRID_WIDTH = 8
GRID_HEIGHT = 8
START_LIVES = 3
GOLD_PERCENT = 35
MONEY_PER_TREASURE = 10
LEVEL_CLEAR_BONUS = 25

# Décalages relatifs à l'ancre (case visée).
SHAPES: dict[ShapeId, tuple[tuple[int, int], ...]] = {
    "line": ((-1, 0), (0, 0), (1, 0)),
    "cross": ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)),
    "square": ((0, 0), (1, 0), (0, 1), (1, 1)),
}


class GameRuleError(Exception):
    """Action refusée par les règles (partie terminée, case hors grille...)."""


def level_config(level: int) -> tuple[int, int, int]:
    """Retourne (objectif de trésors, nombre max de tours, pourcentage de bombes)."""
    target = 3 + level
    max_turns = max(6, 11 - level)
    bomb_percent = min(8 + 3 * (level - 1), 30)
    return target, max_turns, bomb_percent


def shape_cells(shape: ShapeId, x: int, y: int, width: int, height: int) -> list[Cell]:
    """Cases couvertes par un sort, tronquées à la grille."""
    cells: list[Cell] = []
    for dx, dy in SHAPES[shape]:
        cx, cy = x + dx, y + dy
        if 0 <= cx < width and 0 <= cy < height:
            cells.append(Cell(x=cx, y=cy))
    return cells


def _roll_orb(rng: int, bomb_percent: int) -> tuple[OrbType, int]:
    roll, rng = next_uint32(rng)
    r = roll % 100
    if r < GOLD_PERCENT:
        return "gold", rng
    if r < GOLD_PERCENT + bomb_percent:
        return "bomb", rng
    return "neutral", rng


def _new_level(level: int, rng: int) -> dict:
    target, max_turns, bomb_percent = level_config(level)
    grid: list[list[OrbType]] = []
    for _ in range(GRID_HEIGHT):
        row: list[OrbType] = []
        for _ in range(GRID_WIDTH):
            orb, rng = _roll_orb(rng, bomb_percent)
            row.append(orb)
        grid.append(row)
    return {
        "level": level,
        "target": target,
        "max_turns": max_turns,
        "turns_left": max_turns,
        "treasures": 0,
        "grid": grid,
        "rng": rng,
    }


def create_game(seed: int) -> GameState:
    """Crée une nouvelle partie déterministe à partir d'une graine."""
    level_data = _new_level(1, seed & MASK)
    return GameState(
        width=GRID_WIDTH,
        height=GRID_HEIGHT,
        lives=START_LIVES,
        gold=0,
        status="playing",
        **level_data,
    )


def cast(state: GameState, shape: ShapeId, x: int, y: int) -> tuple[GameState, CastReport]:
    """Lance un sort : collecte les billes couvertes, remplace-les et applique les règles."""
    if state.status != "playing":
        raise GameRuleError("La partie est terminée.")
    if not (0 <= x < state.width and 0 <= y < state.height):
        raise GameRuleError("La case visée est hors de la grille.")

    _, _, bomb_percent = level_config(state.level)
    cells = shape_cells(shape, x, y, state.width, state.height)
    grid = [row.copy() for row in state.grid]
    rng = state.rng
    treasures_gained = 0
    bombs_hit = 0

    for cell in cells:
        orb = grid[cell.y][cell.x]
        if orb == "gold":
            treasures_gained += 1
        elif orb == "bomb":
            bombs_hit += 1
        grid[cell.y][cell.x], rng = _roll_orb(rng, bomb_percent)

    money_gained = treasures_gained * MONEY_PER_TREASURE
    treasures = state.treasures + treasures_gained
    lives = state.lives - bombs_hit
    gold = state.gold + money_gained
    turns_left = state.turns_left - 1

    status = "playing"
    level_cleared = False
    if lives <= 0:
        status = "lost"
    elif treasures >= state.target:
        level_cleared = True
        gold += LEVEL_CLEAR_BONUS
        money_gained += LEVEL_CLEAR_BONUS
    elif turns_left <= 0:
        status = "lost"

    if level_cleared:
        level_data = _new_level(state.level + 1, rng)
    else:
        level_data = {
            "level": state.level,
            "target": state.target,
            "max_turns": state.max_turns,
            "turns_left": turns_left,
            "treasures": treasures,
            "grid": grid,
            "rng": rng,
        }

    new_state = GameState(
        width=state.width,
        height=state.height,
        lives=max(lives, 0),
        gold=gold,
        status=status,
        **level_data,
    )
    report = CastReport(
        cells=cells,
        treasures_gained=treasures_gained,
        money_gained=money_gained,
        bombs_hit=bombs_hit,
        level_cleared=level_cleared,
        run_over=status == "lost",
    )
    return new_state, report
