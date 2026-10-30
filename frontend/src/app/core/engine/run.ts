import { applyHammer, applyMove, cloneBoard } from './board';
import { FLOOR_COUNT, generateFloor } from './generator';
import { computeMods, Mods, PerkId, PERKS, rollLoot } from './perks';
import { Rng } from './rng';
import { Cell, FloorDef, FloorState, MoveOption, MoveResult, ShapeKind } from './types';

export type Phase = 'playing' | 'cleared' | 'failed' | 'dead' | 'won';

/** Bonus permanents apportés par l'Atelier (méta-progression). */
export interface RunBonuses {
  hp: number;
  moves: number;
  undos: number;
  hammers: number;
  rerolls: number;
  startingChest: boolean;
  grimoire: boolean;
  unlockedShapes: ShapeKind[];
}

export const NO_BONUSES: RunBonuses = {
  hp: 0,
  moves: 0,
  undos: 0,
  hammers: 0,
  rerolls: 0,
  startingChest: false,
  grimoire: false,
  unlockedShapes: [],
};

export interface RunConfig {
  seed: number;
  ascension: number;
  daily: boolean;
  bonuses: RunBonuses;
}

export interface FloorSummary {
  floor: number;
  movesLeft: number;
  overshoot: number;
  shards: number;
}

export interface RunState {
  config: RunConfig;
  phase: Phase;
  hp: number;
  maxHp: number;
  perks: PerkId[];
  roster: ShapeKind[];
  rerolls: number;
  def: FloorDef;
  floor: FloorState;
  history: { floor: FloorState; hp: number }[];
  chestTaken: boolean;
  loot: PerkId[] | null;
  lootRng: number;
  shards: number;
  score: number;
  floorsCleared: number;
  summary: FloorSummary | null;
  /** Dernier coup joué, pour l'animation. */
  last: MoveResult | null;
}

export const START_HP = 3;
export const STARTING_ROSTER: ShapeKind[] = ['square', 'triangle'];
export const VICTORY_SHARDS = 25;

export function ascensionMultiplier(ascension: number): number {
  return 1 + 0.25 * ascension;
}

export function runMods(run: Pick<RunState, 'perks' | 'config'>): Mods {
  return computeMods(run.perks, run.config.bonuses);
}

function freshFloor(def: FloorDef, mods: Mods, chestTaken: boolean): FloorState {
  const board = cloneBoard(def.board);
  if (chestTaken) {
    board.items = board.items.map((item) => (item === 'chest' ? null : item));
  }
  return {
    board,
    coins: 0,
    target: def.target,
    movesLeft: def.baseMoves + mods.extraMoves,
    turn: 0,
    shieldsLeft: mods.shields,
    hammersLeft: mods.hammers,
    undosLeft: mods.undos,
  };
}

export function startRun(config: RunConfig): RunState {
  const roster = [...STARTING_ROSTER];
  const def = generateFloor(config.seed, 1, roster, config.ascension);
  const maxHp = Math.max(1, START_HP + config.bonuses.hp - (config.ascension >= 5 ? 1 : 0));
  const run: RunState = {
    config,
    phase: 'playing',
    hp: maxHp,
    maxHp,
    perks: [],
    roster,
    rerolls: config.bonuses.rerolls,
    def,
    floor: freshFloor(def, computeMods([], config.bonuses), false),
    history: [],
    chestTaken: false,
    loot: null,
    lootRng: config.seed ^ 0x5bd1e995,
    shards: 0,
    score: 0,
    floorsCleared: 0,
    summary: null,
    last: null,
  };
  return config.bonuses.startingChest ? openChest(run) : run;
}

function openChest(run: RunState): RunState {
  const rng = new Rng(run.lootRng);
  const loot = rollLoot(rng, {
    owned: run.perks,
    roster: run.roster,
    unlockedShapes: run.config.bonuses.unlockedShapes,
    grimoire: run.config.bonuses.grimoire,
    guardian: run.def.guardian,
  });
  return { ...run, loot: loot.length > 0 ? loot : null, lootRng: rng.state };
}

export function playMove(run: RunState, option: MoveOption): RunState {
  if (run.phase !== 'playing' || run.loot) {
    return run;
  }
  const mods = runMods(run);
  const result = applyMove(run.floor, option, mods);
  let next: RunState = {
    ...run,
    floor: result.floor,
    hp: Math.min(run.maxHp, run.hp - result.damage + result.heal),
    score: run.score + result.coinsGained,
    history: result.chest ? [] : [...run.history, { floor: run.floor, hp: run.hp }],
    last: result,
  };
  if (result.chest) {
    next = openChest({ ...next, chestTaken: true });
  }
  return resolve(next, mods);
}

/** Détermine la suite après un coup : mort, étage réussi, ou plus de coups. */
function resolve(run: RunState, mods: Mods): RunState {
  const floor = run.floor;
  if (run.hp <= 0) {
    return { ...run, hp: 0, phase: 'dead', loot: null };
  }
  if (floor.coins >= floor.target) {
    const overshoot = floor.coins - floor.target;
    const base = 2 + run.def.number + floor.movesLeft + overshoot + mods.greed;
    const shards = Math.round(base * ascensionMultiplier(run.config.ascension));
    const summary: FloorSummary = { floor: run.def.number, movesLeft: floor.movesLeft, overshoot, shards };
    const last = run.def.number >= FLOOR_COUNT;
    const victoryBonus = last ? Math.round(VICTORY_SHARDS * ascensionMultiplier(run.config.ascension)) : 0;
    return {
      ...run,
      phase: last ? 'won' : 'cleared',
      shards: run.shards + shards + victoryBonus,
      score: run.score + 10 * run.def.number + 5 * floor.movesLeft,
      floorsCleared: run.floorsCleared + 1,
      summary,
    };
  }
  if (floor.movesLeft <= 0) {
    const hp = run.hp - 1;
    return { ...run, hp: Math.max(hp, 0), phase: hp <= 0 ? 'dead' : 'failed', loot: hp <= 0 ? null : run.loot };
  }
  return run;
}

export function undo(run: RunState): RunState {
  const snapshot = run.history.at(-1);
  if (!snapshot || run.floor.undosLeft <= 0 || run.loot || (run.phase !== 'playing' && run.phase !== 'failed')) {
    return run;
  }
  return {
    ...run,
    phase: 'playing',
    hp: snapshot.hp,
    floor: { ...snapshot.floor, undosLeft: run.floor.undosLeft - 1 },
    history: run.history.slice(0, -1),
    last: null,
  };
}

export function useHammer(run: RunState, cell: Cell): RunState {
  if (run.phase !== 'playing' || run.loot) {
    return run;
  }
  const floor = applyHammer(run.floor, cell);
  if (!floor) {
    return run;
  }
  return { ...run, floor, history: [...run.history, { floor: run.floor, hp: run.hp }], last: null };
}

/** Recommence l'étage à l'identique. Volontairement, cela coûte 1 PV ; après un échec, c'est déjà payé. */
export function retryFloor(run: RunState): RunState {
  if (run.phase === 'playing' && !run.loot) {
    if (run.hp <= 1) {
      return run;
    }
    run = { ...run, hp: run.hp - 1 };
  } else if (run.phase !== 'failed') {
    return run;
  }
  return {
    ...run,
    phase: 'playing',
    floor: freshFloor(run.def, runMods(run), run.chestTaken),
    history: [],
    last: null,
  };
}

export function choosePerk(run: RunState, perk: PerkId): RunState {
  if (!run.loot?.includes(perk)) {
    return run;
  }
  const def = PERKS[perk];
  let { hp, maxHp, roster } = run;
  const floor = { ...run.floor };
  switch (perk) {
    case 'crystalHeart':
      maxHp++;
      hp++;
      break;
    case 'potion':
      hp = Math.min(maxHp, hp + 2);
      break;
    case 'glassCannon':
      maxHp = Math.max(1, maxHp - 1);
      hp = Math.min(hp, maxHp);
      floor.movesLeft += 3;
      break;
    case 'hourglass':
      floor.movesLeft++;
      break;
    case 'rewind':
      floor.undosLeft++;
      break;
    case 'hammer':
      floor.hammersLeft++;
      break;
    case 'aegis':
      floor.shieldsLeft++;
      break;
  }
  if (def.shape && !roster.includes(def.shape)) {
    roster = [...roster, def.shape];
  }
  return { ...run, hp, maxHp, roster, floor, perks: [...run.perks, perk], loot: null };
}

export function rerollLoot(run: RunState): RunState {
  if (!run.loot || run.rerolls <= 0) {
    return run;
  }
  return { ...openChest(run), rerolls: run.rerolls - 1 };
}

/** Renoncer au coffre rapporte quelques éclats. */
export const SKIP_LOOT_SHARDS = 4;

export function skipLoot(run: RunState): RunState {
  if (!run.loot) {
    return run;
  }
  return { ...run, loot: null, shards: run.shards + SKIP_LOOT_SHARDS };
}

export function nextFloor(run: RunState): RunState {
  if (run.phase !== 'cleared' || run.loot) {
    return run;
  }
  const def = generateFloor(run.config.seed, run.def.number + 1, run.roster, run.config.ascension);
  return {
    ...run,
    phase: 'playing',
    def,
    floor: freshFloor(def, runMods(run), false),
    history: [],
    chestTaken: false,
    summary: null,
    last: null,
  };
}

/** Objets restants sur le plateau (pour l'affichage). */
export function remainingValue(floor: FloorState, mods: Mods): number {
  return floor.board.items.reduce((sum, item) => {
    if (item === 'coin') return sum + 1;
    if (item === 'gem') return sum + 3 + mods.gemBonus;
    return sum;
  }, 0);
}
