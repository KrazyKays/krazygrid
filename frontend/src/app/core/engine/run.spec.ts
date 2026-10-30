import { describe, expect, it } from 'vitest';
import { allLegalMoves, applyMove, legalMoves } from './board';
import { FLOOR_COUNT, generateFloor } from './generator';
import { NO_MODS } from './perks';
import { choosePerk, NO_BONUSES, nextFloor, playMove, retryFloor, RunState, startRun, undo } from './run';
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
    // En jeu, l'étage se termine dès l'objectif atteint (et les sentinelles s'arrêtent).
    if (floor.coins >= floor.target) break;
    const option = legalMoves(floor.board, step.pieceId).find(
      (candidate) => candidate.target.x === step.target.x && candidate.target.y === step.target.y,
    );
    expect(option, `coup ${JSON.stringify(step)} introuvable`).toBeDefined();
    const result = applyMove(floor, option!, NO_MODS);
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
      if (run.phase !== 'playing') break;
      if (run.loot) run = choosePerk(run, run.loot[0]);
      const option = legalMoves(run.floor.board, step.pieceId).find(
        (candidate) => candidate.target.x === step.target.x && candidate.target.y === step.target.y,
      )!;
      run = playMove(run, option);
    }
    if (run.loot) run = choosePerk(run, run.loot[0]);
    expect(run.phase).toBe('cleared');
    expect(run.shards).toBeGreaterThan(0);
    run = nextFloor(run);
    expect(run.phase).toBe('playing');
    expect(run.def.number).toBe(2);
  });

  it('coûte 1 PV quand les coups sont épuisés, puis permet de réessayer', () => {
    let run = startRun(config);
    run = { ...run, floor: { ...run.floor, movesLeft: 1, target: 999 } };
    run = playMove(run, firstMove(run));
    expect(run.phase).toBe('failed');
    expect(run.hp).toBeLessThan(3);
    const hp = run.hp;
    run = retryFloor(run);
    expect(run.phase).toBe('playing');
    expect(run.hp).toBe(hp);
    expect(run.floor.board.pieces).toEqual(run.def.board.pieces);
    expect(run.floor.board.tiles).toEqual(run.def.board.tiles);
    // Un coffre déjà ouvert ne réapparaît pas.
    expect(run.floor.board.items.includes('chest')).toBe(!run.chestTaken && run.def.board.items.includes('chest'));
  });

  it('annule un coup si une annulation est disponible', () => {
    let run = startRun({ ...config, bonuses: { ...NO_BONUSES, undos: 1 } });
    const before = run.floor;
    run = playMove(run, firstMove(run));
    if (run.loot) return;
    run = undo(run);
    expect(run.floor.board).toEqual(before.board);
    expect(run.floor.undosLeft).toBe(0);
    expect(undo(run)).toBe(run);
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
