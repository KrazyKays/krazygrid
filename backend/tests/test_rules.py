import pytest

from app.game import rules
from app.game.models import GameState
from app.game.rng import next_uint32


def _neutral_grid() -> list[list[str]]:
    return [["neutral"] * rules.GRID_WIDTH for _ in range(rules.GRID_HEIGHT)]


def _state_with(grid, **overrides) -> GameState:
    state = rules.create_game(42)
    return state.model_copy(update={"grid": grid, **overrides})


def test_rng_matches_reference_vector():
    # Vecteur partagé avec frontend/src/app/core/engine/rng.spec.ts
    state = 42
    values = []
    for _ in range(5):
        value, state = next_uint32(state)
        values.append(value)
    assert values == [2581720956, 1925393290, 3661312704, 2876485805, 750819978]


def test_create_game_is_deterministic_and_matches_reference():
    game = rules.create_game(42)
    assert game.grid[0] == ["neutral", "neutral", "gold", "gold", "neutral", "neutral", "gold", "neutral"]
    assert game.rng == 1256095082
    assert rules.create_game(42) == game


def test_new_game_starts_at_level_one():
    game = rules.create_game(7)
    target, max_turns, _ = rules.level_config(1)
    assert (game.level, game.target, game.max_turns, game.turns_left) == (1, target, max_turns, max_turns)
    assert (game.treasures, game.lives, game.gold, game.status) == (0, rules.START_LIVES, 0, "playing")
    assert len(game.grid) == rules.GRID_HEIGHT
    assert all(len(row) == rules.GRID_WIDTH for row in game.grid)


def test_gold_orb_gives_treasure_and_money():
    grid = _neutral_grid()
    grid[2][3] = "gold"
    state = _state_with(grid)

    new_state, report = rules.cast(state, "line", 3, 2)

    assert report.treasures_gained == 1
    assert report.money_gained == rules.MONEY_PER_TREASURE
    assert new_state.treasures == 1
    assert new_state.gold == rules.MONEY_PER_TREASURE
    assert new_state.turns_left == state.turns_left - 1


def test_bomb_costs_one_life():
    grid = _neutral_grid()
    grid[0][0] = "bomb"
    state = _state_with(grid)

    new_state, report = rules.cast(state, "square", 0, 0)

    assert report.bombs_hit == 1
    assert new_state.lives == rules.START_LIVES - 1
    assert new_state.status == "playing"


def test_losing_last_life_ends_run():
    grid = _neutral_grid()
    grid[4][4] = "bomb"
    state = _state_with(grid, lives=1)

    new_state, report = rules.cast(state, "line", 4, 4)

    assert new_state.lives == 0
    assert new_state.status == "lost"
    assert report.run_over is True


def test_reaching_target_advances_level_and_keeps_gold():
    grid = _neutral_grid()
    grid[1][1] = "gold"
    state = _state_with(grid, treasures=rules.level_config(1)[0] - 1, gold=50)

    new_state, report = rules.cast(state, "cross", 1, 1)

    assert report.level_cleared is True
    assert new_state.level == 2
    assert new_state.treasures == 0
    assert new_state.target == rules.level_config(2)[0]
    assert new_state.turns_left == rules.level_config(2)[1]
    assert new_state.gold == 50 + rules.MONEY_PER_TREASURE + rules.LEVEL_CLEAR_BONUS
    assert new_state.status == "playing"


def test_running_out_of_turns_loses_run():
    grid = _neutral_grid()
    state = _state_with(grid, turns_left=1)

    new_state, report = rules.cast(state, "line", 0, 0)

    assert new_state.turns_left == 0
    assert new_state.status == "lost"
    assert report.run_over is True


def test_shape_is_clipped_at_grid_border():
    cells = rules.shape_cells("cross", 0, 0, rules.GRID_WIDTH, rules.GRID_HEIGHT)
    assert {(c.x, c.y) for c in cells} == {(0, 0), (1, 0), (0, 1)}


def test_cast_out_of_bounds_is_rejected():
    state = rules.create_game(1)
    with pytest.raises(rules.GameRuleError):
        rules.cast(state, "line", rules.GRID_WIDTH, 0)


def test_cast_on_finished_run_is_rejected():
    state = _state_with(_neutral_grid(), status="lost")
    with pytest.raises(rules.GameRuleError):
        rules.cast(state, "line", 0, 0)
