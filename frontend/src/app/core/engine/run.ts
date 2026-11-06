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
  stars: number;
  shards: number;
  /** Le coffre n'avait pas été ouvert : il est récupéré à la sortie, avec un choix réduit. */
  lateChest: boolean;
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
  /** Le recommencement gratuit de l'étage a déjà servi. */
  freeRetryUsed: boolean;
  /** Étoiles obtenues sur chaque étage terminé. */
  stars: number[];
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
/** Taille du choix d'un coffre récupéré à la sortie de l'étage, au lieu de 3. */
export const LATE_CHEST_CHOICES = 2;
/** Éclats par étoile au-delà de la première. */
export const STAR_SHARDS = 2;
/** Coups à garder en réserve pour la 3e étoile. */
export const STAR_MOVES = 2;

export function ascensionMultiplier(ascension: number): number {
  return 1 + 0.25 * ascension;
}

export function runMods(run: Pick<RunState, 'perks' | 'config' | 'def'>): Mods {
  return computeMods(run.perks, run.config.bonuses, run.def.rule);
}

/** Surplus de pièces à atteindre pour la 2e étoile. */
export function overshootGoal(target: number): number {
  return Math.max(2, Math.ceil(target * 0.25));
}

/** ★ objectif · ★ surplus suffisant · ★ coups gardés en réserve. */
export function floorStars(floor: Pick<FloorState, 'coins' | 'target' | 'movesLeft'>): number {
  const overshoot = floor.coins - floor.target;
  if (overshoot < 0) return 0;
  return 1 + (overshoot >= overshootGoal(floor.target) ? 1 : 0) + (floor.movesLeft >= STAR_MOVES ? 1 : 0);
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
    floor: freshFloor(def, computeMods([], config.bonuses, def.rule), false),
    history: [],
    chestTaken: false,
    freeRetryUsed: false,
    stars: [],
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

function openChest(run: RunState, size = 3): RunState {
  const rng = new Rng(run.lootRng);
  const loot = rollLoot(
    rng,
    {
      owned: run.perks,
      roster: run.roster,
      unlockedShapes: run.config.bonuses.unlockedShapes,
      grimoire: run.config.bonuses.grimoire,
      guardian: run.def.guardian,
    },
    size,
  );
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
  return resolve(next);
}

export function quotaMet(run: RunState): boolean {
  return run.floor.coins >= run.floor.target;
}

/**
 * Détermine la suite après un coup : mort, plus de coups, ou rien.
 * Atteindre l'objectif ne termine plus l'étage : le joueur choisit quand sortir.
 */
function resolve(run: RunState): RunState {
  const floor = run.floor;
  if (run.hp <= 0) {
    return { ...run, hp: 0, phase: 'dead', loot: null };
  }
  if (run.phase !== 'playing' || floor.movesLeft > 0) {
    return run;
  }
  if (quotaMet(run)) {
    // Un coffre tout juste ouvert se règle d'abord ; la sortie suit le choix.
    return run.loot ? run : exitFloor(run);
  }
  // Le premier échec d'un étage est gratuit, les suivants coûtent 1 PV.
  const hp = run.hp - retryCost(run);
  return { ...run, hp: Math.max(hp, 0), phase: hp <= 0 ? 'dead' : 'failed', loot: hp <= 0 ? null : run.loot };
}

/** Quitte l'étage une fois l'objectif atteint : bilan, étoiles et, s'il a été oublié, le coffre. */
export function exitFloor(run: RunState): RunState {
  if (run.phase !== 'playing' || run.loot || !quotaMet(run)) {
    return run;
  }
  const floor = run.floor;
  const overshoot = floor.coins - floor.target;
  const stars = floorStars(floor);
  const base = 2 + run.def.number + floor.movesLeft + overshoot + STAR_SHARDS * (stars - 1);
  const shards = Math.round(base * ascensionMultiplier(run.config.ascension));
  const last = run.def.number >= FLOOR_COUNT;
  const lateChest = !last && !run.chestTaken && floor.board.items.includes('chest');
  const summary: FloorSummary = {
    floor: run.def.number,
    movesLeft: floor.movesLeft,
    overshoot,
    stars,
    shards,
    lateChest,
  };
  const victoryBonus = last ? Math.round(VICTORY_SHARDS * ascensionMultiplier(run.config.ascension)) : 0;
  const next: RunState = {
    ...run,
    phase: last ? 'won' : 'cleared',
    shards: run.shards + shards + victoryBonus,
    score: run.score + 10 * run.def.number + 5 * floor.movesLeft + 10 * stars,
    floorsCleared: run.floorsCleared + 1,
    stars: [...run.stars, stars],
    summary,
  };
  return lateChest ? openChest({ ...next, chestTaken: true }, LATE_CHEST_CHOICES) : next;
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

/** Coût en PV d'un recommencement : le premier de chaque étage est gratuit. */
export function retryCost(run: RunState): number {
  return run.freeRetryUsed ? 1 : 0;
}

/** Recommence l'étage à l'identique. Après un échec, le coût a déjà été payé. */
export function retryFloor(run: RunState): RunState {
  if (run.phase === 'playing' && !run.loot) {
    const cost = retryCost(run);
    if (cost > 0 && run.hp <= cost) {
      return run;
    }
    run = { ...run, hp: run.hp - cost };
  } else if (run.phase !== 'failed') {
    return run;
  }
  return {
    ...run,
    phase: 'playing',
    floor: freshFloor(run.def, runMods(run), run.chestTaken),
    history: [],
    freeRetryUsed: true,
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
  // Coffre ouvert sur le dernier coup disponible : la suite se décide une fois l'avantage choisi.
  return resolve({ ...run, hp, maxHp, roster, floor, perks: [...run.perks, perk], loot: null });
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
  return resolve({ ...run, loot: null, shards: run.shards + SKIP_LOOT_SHARDS });
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
    floor: freshFloor(def, runMods({ ...run, def }), false),
    history: [],
    chestTaken: false,
    freeRetryUsed: false,
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
