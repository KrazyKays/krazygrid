import { allLegalMoves, applyMove, cloneBoard, index, occupant } from './board';
import { NO_MODS } from './perks';
import { mixSeed, Rng } from './rng';
import { Board, Cell, FloorDef, FloorState, ShapeKind, Tile } from './types';

export const FLOOR_COUNT = 9;
const MAX_ATTEMPTS = 400;

export function isGuardianFloor(floor: number): boolean {
  return floor % 3 === 0;
}

export interface FloorParams {
  size: number;
  walls: number;
  spikes: number;
  cracks: number;
  sentinels: number;
  solutionLength: number;
  spareMoves: number;
  /** Part de la valeur ramassable par la solution qu'on peut laisser de côté. */
  slack: number;
  minCells: number;
}

export function floorParams(floor: number, ascension: number): FloorParams {
  const guardian = isGuardianFloor(floor);
  const size = floor <= 3 ? 6 : floor <= 6 ? 7 : 8;
  const area = size * size;
  let sentinels = floor <= 2 ? 0 : floor <= 5 ? 1 : floor <= 8 ? 2 : 3;
  if (guardian) sentinels++;
  if (ascension >= 3 && floor >= 2) sentinels++;
  let spareMoves = floor <= 2 ? 2 : floor <= 5 ? 1 : 0;
  if (guardian) spareMoves = 0;
  if (ascension >= 1) spareMoves = Math.max(0, spareMoves - 1);
  let slack = floor <= 2 ? 0.3 : floor <= 5 ? 0.2 : 0.1;
  if (guardian) slack = 0.05;
  if (ascension >= 4) slack /= 2;
  const spikeRate = 0.05 + 0.01 * floor + (ascension >= 2 ? 0.04 : 0);
  return {
    size,
    walls: Math.round(area * 0.12),
    spikes: Math.round(area * spikeRate),
    cracks: floor >= 2 ? 1 + Math.floor(floor / 3) : 0,
    sentinels,
    solutionLength: 4 + floor,
    spareMoves,
    slack,
    minCells: 4 + floor,
  };
}

interface Attempt {
  board: Board;
  visited: Cell[];
  solution: { pieceId: number; target: Cell }[];
}

/**
 * Génère un étage dont la solution est garantie : on dessine le terrain, on fait jouer une
 * séquence de coups sans dégâts aux formes, puis on sème les pièces sur les cases traversées.
 */
export function generateFloor(runSeed: number, floor: number, roster: readonly ShapeKind[], ascension: number): FloorDef {
  const seed = mixSeed(runSeed, floor);
  const rng = new Rng(seed);
  const params = floorParams(floor, ascension);
  let best: Attempt | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = tryLayout(rng, params, roster);
    if (candidate && (!best || candidate.visited.length > best.visited.length)) {
      best = candidate;
    }
    if (best && best.visited.length >= params.minCells) {
      break;
    }
  }
  if (!best) {
    throw new Error(`Impossible de générer l'étage ${floor}.`);
  }
  return decorate(rng, best, params, floor, seed);
}

function tryLayout(rng: Rng, params: FloorParams, roster: readonly ShapeKind[]): Attempt | null {
  const { size } = params;
  const board: Board = {
    width: size,
    height: size,
    tiles: Array<Tile>(size * size).fill('floor'),
    items: Array(size * size).fill(null),
    pieces: [],
    sentinels: [],
  };
  const cells = rng.shuffle(Array.from({ length: size * size }, (_, i) => ({ x: i % size, y: Math.floor(i / size) })));
  const take = () => cells.pop()!;
  for (let i = 0; i < params.walls; i++) board.tiles[index(board, ...xy(take()))] = 'wall';
  for (let i = 0; i < params.cracks; i++) board.tiles[index(board, ...xy(take()))] = 'crack';
  for (let i = 0; i < params.spikes; i++) board.tiles[index(board, ...xy(take()))] = 'spike';
  roster.forEach((kind, id) => board.pieces.push({ id, kind, ...take() }));
  for (let i = 0; i < params.sentinels; i++) {
    const cell = take();
    const horizontal = rng.chance(0.5);
    const sign = rng.chance(0.5) ? 1 : -1;
    board.sentinels.push({ id: i, ...cell, dx: horizontal ? sign : 0, dy: horizontal ? 0 : sign });
  }
  // Une sentinelle collée à une forme dès le départ serait injuste.
  for (const sentinel of board.sentinels) {
    if (board.pieces.some((piece) => Math.abs(piece.x - sentinel.x) + Math.abs(piece.y - sentinel.y) <= 1)) {
      return null;
    }
  }

  let floor: FloorState = {
    board: cloneBoard(board),
    coins: 0,
    target: Number.MAX_SAFE_INTEGER,
    movesLeft: params.solutionLength,
    turn: 0,
    shieldsLeft: 0,
    hammersLeft: 0,
    undosLeft: 0,
  };
  const seen = new Set(board.pieces.map((piece) => index(board, piece.x, piece.y)));
  const visited: Cell[] = [];
  const solution: Attempt['solution'] = [];
  for (let step = 0; step < params.solutionLength; step++) {
    const scored = allLegalMoves(floor.board)
      .map((option) => ({ option, result: applyMove(floor, option, NO_MODS) }))
      .filter(({ result }) => result.damage === 0)
      .map((entry) => ({
        ...entry,
        fresh: entry.option.path.filter((cell) => !seen.has(index(board, cell.x, cell.y))),
      }));
    if (scored.length === 0) {
      return null;
    }
    const productive = scored.filter((entry) => entry.fresh.length > 0);
    const pool = productive.length > 0 && rng.chance(0.85) ? productive : scored;
    const chosen = rng.pick(pool);
    solution.push({ pieceId: chosen.option.pieceId, target: chosen.option.target });
    for (const cell of chosen.fresh) {
      if (!seen.has(index(board, cell.x, cell.y))) {
        seen.add(index(board, cell.x, cell.y));
        visited.push(cell);
      }
    }
    floor = chosen.result.floor;
  }
  return { board, visited, solution };
}

function decorate(rng: Rng, attempt: Attempt, params: FloorParams, floor: number, seed: number): FloorDef {
  const board = cloneBoard(attempt.board);
  const guardian = isGuardianFloor(floor);
  const path = attempt.visited;

  // Le coffre se trouve sur la première moitié du parcours : atteignable avant l'objectif.
  const chestAt = path.length > 2 ? 1 + rng.int(Math.max(1, Math.floor(path.length / 2))) : -1;
  let value = 0;
  path.forEach((cell, i) => {
    const at = index(board, cell.x, cell.y);
    if (i === chestAt) {
      board.items[at] = 'chest';
    } else if (rng.chance(0.14 + floor * 0.01)) {
      board.items[at] = 'gem';
      value += 3;
    } else if (rng.chance(0.8)) {
      board.items[at] = 'coin';
      value++;
    }
  });
  if (value === 0 && path.length > 0) {
    const cell = path.find((_, i) => i !== chestAt) ?? path[0];
    board.items[index(board, cell.x, cell.y)] = 'coin';
    value = 1;
  }

  // Leurres : des objets hors du parcours, parfois piégés, pour ouvrir d'autres pistes.
  const onPath = new Set(path.map((cell) => index(board, cell.x, cell.y)));
  const free = rng.shuffle(
    board.tiles
      .map((tile, i) => ({ tile, i }))
      .filter(
        ({ tile, i }) =>
          tile !== 'wall' &&
          tile !== 'crack' &&
          !onPath.has(i) &&
          occupant(board, i % board.width, Math.floor(i / board.width)) === null,
      )
      .map(({ i }) => i),
  );
  const decoys = Math.floor(path.length * 0.35);
  for (let i = 0; i < decoys && free.length > 0; i++) {
    board.items[free.pop()!] = rng.chance(0.2) ? 'gem' : 'coin';
  }
  if (free.length > 0 && rng.chance(guardian ? 0.6 : 0.25)) {
    board.items[free.pop()!] = 'heart';
  }

  const target = Math.max(1, value - Math.floor(value * params.slack));
  return {
    number: floor,
    seed,
    guardian,
    board,
    target,
    baseMoves: attempt.solution.length + params.spareMoves,
    solution: attempt.solution,
  };
}

function xy(cell: Cell): [number, number] {
  return [cell.x, cell.y];
}
