import { describe, expect, it } from 'vitest';
import { allLegalMoves, applyMove, legalMoves } from './board';
import { FLOOR_COUNT, generateFloor } from './generator';
import { NO_MODS, ruleMods } from './perks';
import {
  choosePerk,
  exitFloor,
  floorStars,
  LATE_CHEST_CHOICES,
  NO_BONUSES,
  nextFloor,
  playMove,
  retryFloor,
  RunState,
  startRun,
  undo,
} from './run';
import { FloorDef, FloorState, MoveOption, ShapeKind } from './types';

function replay(def: FloorDef): { floor: FloorState; damage: number } {
  let floor: FloorState = {
    board: def.board,
    coins: 0,
    target: def.target,
    movesLeft: def.baseMoves,
    turn: 0,
    shieldsLeft: 0,
    hammersLeft: 0,
    undosLeft: 0,
  };
  let damage = 0;
  for (const step of def.solution) {
    // Le joueur peut sortir dès l'objectif atteint.
    if (floor.coins >= floor.target) break;
    const option = legalMoves(floor.board, step.pieceId).find(
      (candidate) => candidate.target.x === step.target.x && candidate.target.y === step.target.y,
    );
    expect(option, `coup ${JSON.stringify(step)} introuvable`).toBeDefined();
    const result = applyMove(floor, option!, { ...NO_MODS, ...ruleMods(def.rule) });
    damage += result.damage;
    floor = result.floor;
  }
  return { floor, damage };
}

describe('generateFloor', () => {
  it('est déterministe pour une graine donnée', () => {
    expect(generateFloor(42, 3, ['square', 'triangle'], 0)).toEqual(generateFloor(42, 3, ['square', 'triangle'], 0));
  });

  const rosters: ShapeKind[][] = [
    ['square', 'triangle'],
    ['square', 'triangle', 'circle'],
    ['square', 'triangle', 'diamond', 'hexagon'],
  ];
  it('produit toujours un étage faisable sans dégâts dans le budget de coups', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
        for (const ascension of [0, 5]) {
          const def = generateFloor(seed * 7919, floor, rosters[seed % rosters.length], ascension);
          const { floor: end, damage } = replay(def);
          expect(damage).toBe(0);
          expect(def.solution.length).toBeLessThanOrEqual(def.baseMoves);
          expect(end.coins).toBeGreaterThanOrEqual(def.target);
        }
      }
    }
  });

  it('place un coffre atteignable sur les étages', () => {
    const def = generateFloor(123, 2, ['square', 'triangle'], 0);
    expect(def.board.items).toContain('chest');
  });

  it('donne une règle spéciale aux seuls gardiens', () => {
    for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
      const def = generateFloor(777, floor, ['square', 'triangle'], 0);
      expect(def.rule !== null).toBe(def.guardian);
    }
  });
});

function firstMove(run: RunState): MoveOption {
  return allLegalMoves(run.floor.board)[0];
}

describe('run', () => {
  const config = { seed: 99, ascension: 0, daily: false, bonuses: NO_BONUSES };

  it('démarre au premier étage avec les formes de base', () => {
    const run = startRun(config);
    expect(run.def.number).toBe(1);
    expect(run.roster).toEqual(['square', 'triangle']);
    expect(run.hp).toBe(3);
    expect(run.loot).toBeNull();
  });

  it('ouvre un coffre de départ avec le Paquetage', () => {
    const run = startRun({ ...config, bonuses: { ...NO_BONUSES, startingChest: true } });
    expect(run.loot).toHaveLength(3);
  });

  it('termine l’étage en suivant la solution, puis passe au suivant', () => {
    let run = startRun(config);
    for (const step of run.def.solution) {
      if (run.phase !== 'playing' || run.floor.coins >= run.floor.target) break;
      if (run.loot) run = choosePerk(run, run.loot[0]);
      const option = legalMoves(run.floor.board, step.pieceId).find(
        (candidate) => candidate.target.x === step.target.x && candidate.target.y === step.target.y,
      )!;
      run = playMove(run, option);
    }
    if (run.loot) run = choosePerk(run, run.loot[0]);
    // L'objectif atteint ne termine pas l'étage : c'est au joueur de sortir.
    if (run.phase === 'playing') {
      expect(run.floor.coins).toBeGreaterThanOrEqual(run.floor.target);
      run = exitFloor(run);
    }
    if (run.loot) run = choosePerk(run, run.loot[0]);
    expect(run.phase).toBe('cleared');
    expect(run.shards).toBeGreaterThan(0);
    expect(run.stars).toHaveLength(1);
    run = nextFloor(run);
    expect(run.phase).toBe('playing');
    expect(run.def.number).toBe(2);
  });

  it('offre le premier échec, puis coûte 1 PV quand les coups sont épuisés', () => {
    let run = startRun(config);
    const fail = (state: RunState) =>
      playMove({ ...state, floor: { ...state.floor, movesLeft: 1, target: 999 } }, firstMove(state));
    run = fail(run);
    expect(run.phase).toBe('failed');
    const afterFree = run.hp;
    run = retryFloor(run);
    expect(run.hp).toBe(afterFree);
    run = fail(run);
    expect(run.phase).toBe('failed');
    expect(run.hp).toBeLessThan(afterFree);
    const hp = run.hp;
    run = retryFloor(run);
    expect(run.phase).toBe('playing');
    expect(run.hp).toBe(hp);
    expect(run.floor.board.pieces).toEqual(run.def.board.pieces);
    expect(run.floor.board.tiles).toEqual(run.def.board.tiles);
    // Un coffre déjà ouvert ne réapparaît pas.
    expect(run.floor.board.items.includes('chest')).toBe(!run.chestTaken && run.def.board.items.includes('chest'));
  });

  it('offre une annulation de base à chaque étage', () => {
    let run = startRun(config);
    expect(run.floor.undosLeft).toBe(1);
    const before = run.floor;
    run = playMove(run, firstMove(run));
    if (run.loot) return;
    run = undo(run);
    expect(run.floor.board).toEqual(before.board);
    expect(run.floor.undosLeft).toBe(0);
    expect(undo(run)).toBe(run);
  });

  it('sort de l’étage seulement une fois l’objectif atteint, avec le coffre oublié', () => {
    let run = startRun(config);
    expect(exitFloor(run)).toBe(run);
    run = { ...run, floor: { ...run.floor, coins: run.floor.target } };
    run = exitFloor(run);
    expect(run.phase).toBe('cleared');
    expect(run.summary?.lateChest).toBe(true);
    expect(run.loot).toHaveLength(LATE_CHEST_CHOICES);
  });

  it('attribue les étoiles selon le surplus et les coups gardés', () => {
    expect(floorStars({ coins: 9, target: 10, movesLeft: 5 })).toBe(0);
    expect(floorStars({ coins: 10, target: 10, movesLeft: 0 })).toBe(1);
    expect(floorStars({ coins: 13, target: 10, movesLeft: 0 })).toBe(2);
    expect(floorStars({ coins: 13, target: 10, movesLeft: 2 })).toBe(3);
  });

  it('applique immédiatement le Sablier et ajoute une forme recrue au prochain étage', () => {
    let run = startRun(config);
    const moves = run.floor.movesLeft;
    run = choosePerk({ ...run, loot: ['hourglass', 'shapeCircle', 'potion'] }, 'hourglass');
    expect(run.floor.movesLeft).toBe(moves + 1);
    run = choosePerk({ ...run, loot: ['shapeCircle'] }, 'shapeCircle');
    expect(run.roster).toContain('circle');
  });
});
