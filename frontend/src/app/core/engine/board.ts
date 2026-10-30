import { Mods } from './perks';
import { Board, Cell, FloorState, Item, MoveOption, MoveResult, ShapeKind } from './types';

type Vector = readonly [number, number];

const ORTHO: Vector[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const DIAGONAL: Vector[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const JUMP: Vector[] = ORTHO.map(([dx, dy]) => [dx * 2, dy * 2] as const);
const KNIGHT: Vector[] = [
  [1, -2],
  [2, -1],
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
];
const KING: Vector[] = [...ORTHO, ...DIAGONAL];

export interface ShapeDef {
  kind: ShapeKind;
  name: string;
  /** `slide` : glisse jusqu'à l'obstacle ; `leap` : atterrit directement sur la case visée. */
  motion: 'slide' | 'leap';
  vectors: readonly Vector[];
  rule: string;
}

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  square: {
    kind: 'square',
    name: 'Carré',
    motion: 'slide',
    vectors: ORTHO,
    rule: 'Glisse en ligne droite jusqu’à heurter un obstacle.',
  },
  triangle: {
    kind: 'triangle',
    name: 'Triangle',
    motion: 'slide',
    vectors: DIAGONAL,
    rule: 'Glisse en diagonale jusqu’à heurter un obstacle.',
  },
  circle: {
    kind: 'circle',
    name: 'Cercle',
    motion: 'leap',
    vectors: JUMP,
    rule: 'Saute exactement 2 cases, par-dessus tout obstacle.',
  },
  diamond: {
    kind: 'diamond',
    name: 'Losange',
    motion: 'leap',
    vectors: KNIGHT,
    rule: 'Bondit en L, comme un cavalier.',
  },
  hexagon: {
    kind: 'hexagon',
    name: 'Hexagone',
    motion: 'leap',
    vectors: KING,
    rule: 'Avance d’une case et aspire les objets des 8 cases autour.',
  },
};

export const index = (board: Board, x: number, y: number) => y * board.width + x;

export function inBounds(board: Board, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < board.width && y < board.height;
}

export function occupant(board: Board, x: number, y: number): 'piece' | 'sentinel' | null {
  if (board.pieces.some((piece) => piece.x === x && piece.y === y)) {
    return 'piece';
  }
  if (board.sentinels.some((sentinel) => sentinel.x === x && sentinel.y === y)) {
    return 'sentinel';
  }
  return null;
}

/** Une forme peut-elle entrer sur cette case ? */
function enterable(board: Board, x: number, y: number): boolean {
  if (!inBounds(board, x, y)) {
    return false;
  }
  const tile = board.tiles[index(board, x, y)];
  return (tile === 'floor' || tile === 'spike') && occupant(board, x, y) === null;
}

export function cloneBoard(board: Board): Board {
  return {
    ...board,
    tiles: [...board.tiles],
    items: [...board.items],
    pieces: board.pieces.map((piece) => ({ ...piece })),
    sentinels: board.sentinels.map((sentinel) => ({ ...sentinel })),
  };
}

/** Coups jouables par une forme. */
export function legalMoves(board: Board, pieceId: number): MoveOption[] {
  const piece = board.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    return [];
  }
  const shape = SHAPES[piece.kind];
  const options: MoveOption[] = [];
  for (const [dx, dy] of shape.vectors) {
    if (shape.motion === 'leap') {
      const landing = { x: piece.x + dx, y: piece.y + dy };
      if (enterable(board, landing.x, landing.y)) {
        options.push({ pieceId, target: landing, landing, path: [landing], breaks: null });
      }
      continue;
    }
    const path: Cell[] = [];
    let { x, y } = piece;
    while (enterable(board, x + dx, y + dy)) {
      x += dx;
      y += dy;
      path.push({ x, y });
    }
    const next = { x: x + dx, y: y + dy };
    const breaks =
      inBounds(board, next.x, next.y) && board.tiles[index(board, next.x, next.y)] === 'crack' ? next : null;
    if (path.length === 0 && !breaks) {
      continue;
    }
    const landing = { x, y };
    options.push({ pieceId, target: path.length > 0 ? landing : breaks!, landing, path, breaks });
  }
  return options;
}

export function allLegalMoves(board: Board): MoveOption[] {
  return board.pieces.flatMap((piece) => legalMoves(board, piece.id));
}

/** Cases voisines dont les objets sont aspirés en fin de coup. */
function pullCells(board: Board, kind: ShapeKind, landing: Cell, mods: Mods): Cell[] {
  const vectors = kind === 'hexagon' ? KING : mods.magnet ? ORTHO : [];
  return vectors
    .map(([dx, dy]) => ({ x: landing.x + dx, y: landing.y + dy }))
    .filter((cell) => inBounds(board, cell.x, cell.y));
}

export function itemValue(item: Item, mods: Mods): number {
  switch (item) {
    case 'coin':
      return 1;
    case 'gem':
      return 3 + mods.gemBonus;
    default:
      return 0;
  }
}

/**
 * Joue un coup : déplacement, ramassage, puis tour des sentinelles.
 * Retourne un nouvel état sans modifier l'entrée.
 */
export function applyMove(floor: FloorState, option: MoveOption, mods: Mods): MoveResult {
  const board = cloneBoard(floor.board);
  const piece = board.pieces.find((candidate) => candidate.id === option.pieceId)!;
  const result: MoveResult = {
    floor: { ...floor, board },
    collected: [],
    coinsGained: 0,
    damage: 0,
    blocked: 0,
    heal: 0,
    chest: false,
    hurtAt: [],
  };

  piece.x = option.landing.x;
  piece.y = option.landing.y;
  if (option.breaks) {
    board.tiles[index(board, option.breaks.x, option.breaks.y)] = 'floor';
  }

  const collect = (cell: Cell) => {
    const i = index(board, cell.x, cell.y);
    const item = board.items[i];
    if (!item) {
      return;
    }
    board.items[i] = null;
    result.collected.push({ cell, item });
    result.coinsGained += itemValue(item, mods);
    if (item === 'heart') {
      result.heal++;
    } else if (item === 'chest') {
      result.chest = true;
    }
  };

  option.path.forEach((cell, step) => {
    const isLanding = step === option.path.length - 1;
    if (board.tiles[index(board, cell.x, cell.y)] === 'spike' && (isLanding || !mods.boots)) {
      result.damage++;
      result.hurtAt.push(cell);
    }
    collect(cell);
  });
  for (const cell of pullCells(board, piece.kind, option.landing, mods)) {
    collect(cell);
  }
  if (mods.momentum) {
    result.coinsGained += Math.max(0, result.collected.length - 2);
  }

  const free = mods.echo && floor.turn === 0;
  const next = result.floor;
  next.coins = floor.coins + result.coinsGained;
  next.movesLeft = floor.movesLeft - (free ? 0 : 1);
  next.turn = floor.turn + 1;

  if (next.coins < next.target) {
    for (const hit of stepSentinels(board)) {
      if (!mods.carapace) {
        result.damage++;
        result.hurtAt.push(hit);
      }
    }
  }

  const absorbed = Math.min(result.damage, next.shieldsLeft);
  result.blocked = absorbed;
  result.damage -= absorbed;
  next.shieldsLeft -= absorbed;
  return result;
}

/**
 * Chaque sentinelle avance d'une case sur son axe et fait demi-tour contre un obstacle.
 * Si elle percute une forme, elle la blesse et rebondit. Retourne les cases des formes blessées.
 */
export function stepSentinels(board: Board): Cell[] {
  const hits: Cell[] = [];
  for (const sentinel of board.sentinels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const x = sentinel.x + sentinel.dx;
      const y = sentinel.y + sentinel.dy;
      const piece = board.pieces.find((candidate) => candidate.x === x && candidate.y === y);
      if (piece) {
        hits.push({ x, y });
        sentinel.dx = -sentinel.dx;
        sentinel.dy = -sentinel.dy;
        break;
      }
      const tile = inBounds(board, x, y) ? board.tiles[index(board, x, y)] : 'wall';
      const blocked = tile === 'wall' || tile === 'crack' || occupant(board, x, y) === 'sentinel';
      if (!blocked) {
        sentinel.x = x;
        sentinel.y = y;
        break;
      }
      sentinel.dx = -sentinel.dx;
      sentinel.dy = -sentinel.dy;
    }
  }
  return hits;
}

/** Utilise une charge de Marteau sur un mur ou un bloc fragile. */
export function applyHammer(floor: FloorState, cell: Cell): FloorState | null {
  const tile = floor.board.tiles[index(floor.board, cell.x, cell.y)];
  if (floor.hammersLeft <= 0 || (tile !== 'wall' && tile !== 'crack')) {
    return null;
  }
  const board = cloneBoard(floor.board);
  board.tiles[index(board, cell.x, cell.y)] = 'floor';
  return { ...floor, board, hammersLeft: floor.hammersLeft - 1 };
}
