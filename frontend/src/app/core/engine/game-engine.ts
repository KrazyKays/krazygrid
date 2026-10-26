import { nextUint32 } from './rng';
import { Cell, CastReport, CastResponse, GameState, OrbType, ShapeId } from '../models/game.models';

/**
 * Moteur de règles en local. Doit rester identique à backend/app/game/rules.py :
 * toute modification doit être répercutée des deux côtés.
 */
export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 8;
export const START_LIVES = 3;
export const GOLD_PERCENT = 35;
export const MONEY_PER_TREASURE = 10;
export const LEVEL_CLEAR_BONUS = 25;
const UINT32_MASK = 0xffffffff;

export const SHAPES: Record<ShapeId, ReadonlyArray<readonly [number, number]>> = {
  line: [
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  cross: [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  square: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
};

export class GameRuleError extends Error {}

export interface LevelConfig {
  target: number;
  maxTurns: number;
  bombPercent: number;
}

export function levelConfig(level: number): LevelConfig {
  return {
    target: 3 + level,
    maxTurns: Math.max(6, 11 - level),
    bombPercent: Math.min(8 + 3 * (level - 1), 30),
  };
}

export function shapeCells(shape: ShapeId, x: number, y: number, width: number, height: number): Cell[] {
  const cells: Cell[] = [];
  for (const [dx, dy] of SHAPES[shape]) {
    const cx = x + dx;
    const cy = y + dy;
    if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
      cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

function rollOrb(rng: number, bombPercent: number): { orb: OrbType; rng: number } {
  const roll = nextUint32(rng);
  const r = roll.value % 100;
  let orb: OrbType = 'neutral';
  if (r < GOLD_PERCENT) {
    orb = 'gold';
  } else if (r < GOLD_PERCENT + bombPercent) {
    orb = 'bomb';
  }
  return { orb, rng: roll.state };
}

interface LevelData {
  level: number;
  target: number;
  maxTurns: number;
  turnsLeft: number;
  treasures: number;
  grid: OrbType[][];
  rng: number;
}

function newLevel(level: number, rng: number): LevelData {
  const { target, maxTurns, bombPercent } = levelConfig(level);
  const grid: OrbType[][] = [];
  let current = rng;
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: OrbType[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const rolled = rollOrb(current, bombPercent);
      row.push(rolled.orb);
      current = rolled.rng;
    }
    grid.push(row);
  }
  return { level, target, maxTurns, turnsLeft: maxTurns, treasures: 0, grid, rng: current };
}

/** Crée une partie déterministe à partir d'une graine (uint32). */
export function createGame(seed: number): GameState {
  const data = newLevel(1, (seed & UINT32_MASK) >>> 0);
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    lives: START_LIVES,
    gold: 0,
    status: 'playing',
    ...data,
  } as GameState;
}

/** Lance un sort. Retourne le nouvel état sans modifier l'entrée. */
export function cast(state: GameState, shape: ShapeId, x: number, y: number): CastResponse {
  if (state.status !== 'playing') {
    throw new GameRuleError('La partie est terminée.');
  }
  if (!(x >= 0 && x < state.width && y >= 0 && y < state.height)) {
    throw new GameRuleError('La case visée est hors de la grille.');
  }

  const { bombPercent } = levelConfig(state.level);
  const cells = shapeCells(shape, x, y, state.width, state.height);
  const grid = state.grid.map((row) => [...row]);
  let rng = state.rng;
  let treasuresGained = 0;
  let bombsHit = 0;

  for (const cell of cells) {
    const orb = grid[cell.y][cell.x];
    if (orb === 'gold') {
      treasuresGained++;
    } else if (orb === 'bomb') {
      bombsHit++;
    }
    const rolled = rollOrb(rng, bombPercent);
    grid[cell.y][cell.x] = rolled.orb;
    rng = rolled.rng;
  }

  let moneyGained = treasuresGained * MONEY_PER_TREASURE;
  const treasures = state.treasures + treasuresGained;
  const lives = state.lives - bombsHit;
  let gold = state.gold + moneyGained;
  const turnsLeft = state.turnsLeft - 1;

  let status: GameState['status'] = 'playing';
  let levelCleared = false;
  if (lives <= 0) {
    status = 'lost';
  } else if (treasures >= state.target) {
    levelCleared = true;
    gold += LEVEL_CLEAR_BONUS;
    moneyGained += LEVEL_CLEAR_BONUS;
  } else if (turnsLeft <= 0) {
    status = 'lost';
  }

  const levelData: LevelData = levelCleared
    ? newLevel(state.level + 1, rng)
    : {
        level: state.level,
        target: state.target,
        maxTurns: state.maxTurns,
        turnsLeft,
        treasures,
        grid,
        rng,
      };

  const newState: GameState = {
    width: state.width,
    height: state.height,
    lives: Math.max(lives, 0),
    gold,
    status,
    ...levelData,
  };

  const report: CastReport = {
    cells,
    treasuresGained,
    moneyGained,
    bombsHit,
    levelCleared,
    runOver: status === 'lost',
  };
  return { state: newState, report };
}
