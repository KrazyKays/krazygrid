import { describe, expect, it } from 'vitest';
import { cast, createGame, GameRuleError, levelConfig, shapeCells, GRID_HEIGHT, GRID_WIDTH } from './game-engine';
import { GameState, OrbType } from '../models/game.models';

function withGrid(grid: OrbType[][], overrides: Partial<GameState> = {}): GameState {
  return { ...createGame(42), grid, ...overrides };
}

function neutralGrid(): OrbType[][] {
  return Array.from({ length: GRID_HEIGHT }, () => Array<OrbType>(GRID_WIDTH).fill('neutral'));
}

describe('createGame', () => {
  it('reproduit la grille de référence du backend pour la graine 42', () => {
    const state = createGame(42);
    expect(state.grid[0]).toEqual(['neutral', 'neutral', 'gold', 'gold', 'neutral', 'neutral', 'gold', 'neutral']);
    expect(state.rng).toBe(1256095082);
    expect(state.maxTurns).toBe(10);
    expect(state.target).toBe(4);
    expect(state.lives).toBe(3);
    expect(state.status).toBe('playing');
  });
});

describe('levelConfig', () => {
  it('suit les formules du backend', () => {
    expect(levelConfig(1)).toEqual({ target: 4, maxTurns: 10, bombPercent: 8 });
    expect(levelConfig(2)).toEqual({ target: 5, maxTurns: 9, bombPercent: 11 });
    expect(levelConfig(20)).toEqual({ target: 23, maxTurns: 6, bombPercent: 30 });
  });
});

describe('shapeCells', () => {
  it('tronque les formes aux bords de la grille', () => {
    expect(shapeCells('square', 0, 0, GRID_WIDTH, GRID_HEIGHT)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(shapeCells('line', 0, 3, GRID_WIDTH, GRID_HEIGHT)).toEqual([
      { x: 0, y: 3 },
      { x: 1, y: 3 },
    ]);
  });
});

describe('cast', () => {
  it('compte les trésors et l’argent, et consomme un tour', () => {
    const grid = neutralGrid();
    grid[0][0] = 'gold';
    grid[0][1] = 'gold';
    const { state, report } = cast(withGrid(grid, { treasures: 0 }), 'line', 1, 0);
    expect(report.treasuresGained).toBe(2);
    expect(report.moneyGained).toBe(20);
    expect(report.bombsHit).toBe(0);
    expect(state.treasures).toBe(2);
    expect(state.gold).toBe(20);
    expect(state.turnsLeft).toBe(9);
  });

  it('fait perdre une vie par bombe touchée', () => {
    const grid = neutralGrid();
    grid[3][3] = 'bomb';
    grid[3][4] = 'bomb';
    const { state, report } = cast(withGrid(grid), 'line', 4, 3);
    expect(report.bombsHit).toBe(2);
    expect(state.lives).toBe(1);
    expect(state.status).toBe('playing');
  });

  it('perd la partie quand les vies tombent à zéro', () => {
    const grid = neutralGrid();
    grid[0][0] = 'bomb';
    grid[0][1] = 'bomb';
    const { state, report } = cast(withGrid(grid, { lives: 2 }), 'line', 1, 0);
    expect(state.lives).toBe(0);
    expect(state.status).toBe('lost');
    expect(report.runOver).toBe(true);
  });

  it('passe au niveau suivant quand l’objectif de trésors est atteint', () => {
    const grid = neutralGrid();
    grid[0][0] = 'gold';
    const before = withGrid(grid, { treasures: 3, target: 4, gold: 100 });
    const { state, report } = cast(before, 'line', 0, 0);
    expect(report.levelCleared).toBe(true);
    expect(state.level).toBe(2);
    expect(state.treasures).toBe(0);
    expect(state.target).toBe(5);
    expect(state.turnsLeft).toBe(9);
    expect(state.gold).toBe(100 + 10 + 25);
  });

  it('perd quand les tours sont épuisés sans atteindre l’objectif', () => {
    const grid = neutralGrid();
    const { state } = cast(withGrid(grid, { turnsLeft: 1 }), 'line', 3, 3);
    expect(state.turnsLeft).toBe(0);
    expect(state.status).toBe('lost');
  });

  it('refuse un sort sur une partie terminée ou hors grille', () => {
    const grid = neutralGrid();
    expect(() => cast(withGrid(grid, { status: 'lost' }), 'line', 1, 1)).toThrow(GameRuleError);
    expect(() => cast(withGrid(grid), 'line', 8, 0)).toThrow(GameRuleError);
  });
});
