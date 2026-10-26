export type OrbType = 'gold' | 'bomb' | 'neutral';
export type ShapeId = 'line' | 'cross' | 'square';
export type RunStatus = 'playing' | 'lost';

export interface Cell {
  x: number;
  y: number;
}

export interface GameState {
  width: number;
  height: number;
  grid: OrbType[][];
  level: number;
  target: number;
  maxTurns: number;
  turnsLeft: number;
  treasures: number;
  lives: number;
  gold: number;
  status: RunStatus;
  rng: number;
}

export interface CastReport {
  cells: Cell[];
  treasuresGained: number;
  moneyGained: number;
  bombsHit: number;
  levelCleared: boolean;
  runOver: boolean;
}

export interface CastResponse {
  state: GameState;
  report: CastReport;
}

export interface CastRequest {
  state: GameState;
  shape: ShapeId;
  x: number;
  y: number;
}

export interface NewGameRequest {
  seed?: number;
}
