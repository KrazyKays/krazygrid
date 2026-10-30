import { describe, expect, it } from 'vitest';
import { applyHammer, applyMove, legalMoves, stepSentinels } from './board';
import { Mods, NO_MODS } from './perks';
import { Board, FloorState, Item, Piece, Sentinel, Tile } from './types';

/**
 * Plateau décrit en ASCII : `#` mur, `^` pics, `%` bloc fragile, `.` sol,
 * `o` pièce, `g` gemme, `c` coffre, `h` cœur.
 */
function board(rows: string[], pieces: Piece[] = [], sentinels: Sentinel[] = []): Board {
  const tiles: Tile[] = [];
  const items: (Item | null)[] = [];
  const tileOf: Record<string, Tile> = { '#': 'wall', '^': 'spike', '%': 'crack' };
  const itemOf: Record<string, Item> = { o: 'coin', g: 'gem', c: 'chest', h: 'heart' };
  for (const row of rows) {
    for (const char of row) {
      tiles.push(tileOf[char] ?? 'floor');
      items.push(itemOf[char] ?? null);
    }
  }
  return { width: rows[0].length, height: rows.length, tiles, items, pieces, sentinels };
}

function floorOf(b: Board, overrides: Partial<FloorState> = {}): FloorState {
  return { board: b, coins: 0, target: 99, movesLeft: 5, turn: 0, shieldsLeft: 0, hammersLeft: 0, undosLeft: 0, ...overrides };
}

const mods = (overrides: Partial<Mods> = {}): Mods => ({ ...NO_MODS, ...overrides });

describe('legalMoves', () => {
  it('fait glisser le Carré jusqu’au mur ou au bord', () => {
    const b = board(['.....', '.#...', '.....'], [{ id: 0, kind: 'square', x: 1, y: 2 }]);
    const targets = legalMoves(b, 0).map((option) => option.landing);
    expect(targets).toContainEqual({ x: 4, y: 2 });
    expect(targets).toContainEqual({ x: 0, y: 2 });
    // Le mur en (1,1) bloque la montée.
    expect(targets.some((cell) => cell.x === 1 && cell.y < 2)).toBe(false);
  });

  it('fait glisser le Triangle en diagonale', () => {
    const b = board(['....', '....', '....', '....'], [{ id: 0, kind: 'triangle', x: 0, y: 0 }]);
    const [only] = legalMoves(b, 0);
    expect(only.landing).toEqual({ x: 3, y: 3 });
    expect(only.path).toHaveLength(3);
  });

  it('fait sauter le Cercle par-dessus un mur', () => {
    const b = board(['.#.'], [{ id: 0, kind: 'circle', x: 0, y: 0 }]);
    expect(legalMoves(b, 0).map((option) => option.landing)).toEqual([{ x: 2, y: 0 }]);
  });

  it('propose de briser un bloc fragile adjacent', () => {
    const b = board(['.%.'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const [option] = legalMoves(b, 0);
    expect(option.breaks).toEqual({ x: 1, y: 0 });
    expect(option.target).toEqual({ x: 1, y: 0 });
    const result = applyMove(floorOf(b), option, NO_MODS);
    expect(result.floor.board.tiles[1]).toBe('floor');
    expect(result.floor.board.pieces[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('ne traverse pas une autre forme', () => {
    const b = board(['....'], [
      { id: 0, kind: 'square', x: 0, y: 0 },
      { id: 1, kind: 'square', x: 3, y: 0 },
    ]);
    expect(legalMoves(b, 0).map((option) => option.landing)).toEqual([{ x: 2, y: 0 }]);
  });
});

describe('applyMove', () => {
  it('ramasse pièces et gemmes le long du trajet', () => {
    const b = board(['.oog'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const result = applyMove(floorOf(b), legalMoves(b, 0)[0], NO_MODS);
    expect(result.coinsGained).toBe(5);
    expect(result.floor.coins).toBe(5);
    expect(result.floor.movesLeft).toBe(4);
    expect(result.floor.board.items.every((item) => item === null)).toBe(true);
  });

  it('blesse en traversant des pics, sauf avec les Semelles', () => {
    const b = board(['.^..'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const option = legalMoves(b, 0)[0];
    expect(applyMove(floorOf(b), option, NO_MODS).damage).toBe(1);
    expect(applyMove(floorOf(b), option, mods({ boots: true })).damage).toBe(0);
  });

  it('blesse en s’arrêtant sur des pics, même avec les Semelles', () => {
    const b = board(['..^'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    expect(applyMove(floorOf(b), legalMoves(b, 0)[0], mods({ boots: true })).damage).toBe(1);
  });

  it('absorbe la blessure avec l’Égide', () => {
    const b = board(['.^..'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const result = applyMove(floorOf(b, { shieldsLeft: 1 }), legalMoves(b, 0)[0], NO_MODS);
    expect(result.damage).toBe(0);
    expect(result.blocked).toBe(1);
    expect(result.floor.shieldsLeft).toBe(0);
  });

  it('attire les objets voisins avec l’Aimant', () => {
    const b = board(['...', '..o'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const option = legalMoves(b, 0).find((candidate) => candidate.landing.x === 2)!;
    expect(applyMove(floorOf(b), option, NO_MODS).coinsGained).toBe(0);
    expect(applyMove(floorOf(b), option, mods({ magnet: true })).coinsGained).toBe(1);
  });

  it('fait aspirer les 8 cases voisines à l’Hexagone', () => {
    const b = board(['o.o', '...', 'o.o'], [{ id: 0, kind: 'hexagon', x: 0, y: 1 }]);
    const option = legalMoves(b, 0).find((candidate) => candidate.landing.x === 1 && candidate.landing.y === 1)!;
    expect(applyMove(floorOf(b), option, NO_MODS).coinsGained).toBe(4);
  });

  it('rend le premier coup gratuit avec l’Écho', () => {
    const b = board(['...'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const option = legalMoves(b, 0)[0];
    expect(applyMove(floorOf(b), option, mods({ echo: true })).floor.movesLeft).toBe(5);
    expect(applyMove(floorOf(b, { turn: 1 }), option, mods({ echo: true })).floor.movesLeft).toBe(4);
  });

  it('signale le coffre et soigne avec un cœur', () => {
    const b = board(['.ch'], [{ id: 0, kind: 'square', x: 0, y: 0 }]);
    const result = applyMove(floorOf(b), legalMoves(b, 0)[0], NO_MODS);
    expect(result.chest).toBe(true);
    expect(result.heal).toBe(1);
  });
});

describe('stepSentinels', () => {
  it('fait avancer puis rebondir une sentinelle contre un mur', () => {
    const b = board(['..#'], [], [{ id: 0, x: 0, y: 0, dx: 1, dy: 0 }]);
    stepSentinels(b);
    expect(b.sentinels[0]).toMatchObject({ x: 1, dx: 1 });
    stepSentinels(b);
    expect(b.sentinels[0]).toMatchObject({ x: 0, dx: -1 });
  });

  it('blesse la forme qu’elle percute', () => {
    const b = board(['...'], [{ id: 0, kind: 'square', x: 1, y: 0 }], [{ id: 0, x: 0, y: 0, dx: 1, dy: 0 }]);
    expect(stepSentinels(b)).toEqual([{ x: 1, y: 0 }]);
    expect(b.sentinels[0]).toMatchObject({ x: 0, dx: -1 });
  });

  it('ne blesse pas avec la Carapace', () => {
    const b = board(['....'], [{ id: 0, kind: 'square', x: 3, y: 0 }], [{ id: 0, x: 1, y: 0, dx: 1, dy: 0 }]);
    const option = legalMoves(b, 0)[0];
    // La forme glisse jusqu'en (2,0), la sentinelle la percute ensuite.
    expect(applyMove(floorOf(b), option, NO_MODS).damage).toBe(1);
    expect(applyMove(floorOf(b), option, mods({ carapace: true })).damage).toBe(0);
  });
});

describe('applyHammer', () => {
  it('brise un mur avec une charge', () => {
    const b = board(['.#.']);
    const result = applyHammer(floorOf(b, { hammersLeft: 1 }), { x: 1, y: 0 });
    expect(result?.board.tiles[1]).toBe('floor');
    expect(result?.hammersLeft).toBe(0);
    expect(applyHammer(floorOf(b), { x: 1, y: 0 })).toBeNull();
    expect(applyHammer(floorOf(b, { hammersLeft: 1 }), { x: 0, y: 0 })).toBeNull();
  });
});
