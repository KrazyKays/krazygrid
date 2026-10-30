import { RunBonuses } from '../engine/run';
import { ShapeKind } from '../engine/types';

export type UpgradeId =
  | 'vitality'
  | 'endurance'
  | 'memory'
  | 'hammer'
  | 'dice'
  | 'kit'
  | 'grimoire'
  | 'circle'
  | 'diamond'
  | 'hexagon';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  icon: string;
  costs: number[];
  requires?: UpgradeId;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'vitality', name: 'Vitalité', description: '+1 PV au départ de chaque run.', icon: '♥', costs: [15, 40, 90] },
  { id: 'endurance', name: 'Endurance', description: '+1 coup à chaque étage.', icon: '⧗', costs: [30, 80] },
  { id: 'memory', name: 'Mémoire', description: '+1 annulation à chaque étage.', icon: '↺', costs: [20, 60] },
  { id: 'dice', name: 'Dés pipés', description: '+1 relance de coffre par run.', icon: '⚄', costs: [15, 35, 70] },
  { id: 'kit', name: 'Paquetage', description: 'Commence chaque run en ouvrant un coffre.', icon: '▣', costs: [45] },
  {
    id: 'hammer',
    name: 'Marteau',
    description: '1 charge de Marteau par étage : brise un mur ou un bloc fragile.',
    icon: '⚒',
    costs: [60],
  },
  {
    id: 'grimoire',
    name: 'Grimoire',
    description: 'Ajoute les avantages épiques Aimant, Écho et Canon de verre aux coffres.',
    icon: '✶',
    costs: [50],
  },
  {
    id: 'circle',
    name: 'Forme : Cercle',
    description: 'Le Cercle peut apparaître dans les coffres. Il saute de 2 cases.',
    icon: '●',
    costs: [30],
  },
  {
    id: 'diamond',
    name: 'Forme : Losange',
    description: 'Le Losange peut apparaître dans les coffres. Il bondit en L.',
    icon: '◆',
    costs: [70],
    requires: 'circle',
  },
  {
    id: 'hexagon',
    name: 'Forme : Hexagone',
    description: 'L’Hexagone peut apparaître dans les coffres. Il aspire les 8 cases autour.',
    icon: '⬣',
    costs: [120],
    requires: 'diamond',
  },
];

export const MAX_ASCENSION = 5;

export const ASCENSION_RULES: string[] = [
  'Règles de base.',
  '-1 coup de réserve par étage.',
  'Davantage de pics.',
  '+1 sentinelle dès l’étage 2.',
  'Objectifs plus exigeants.',
  '-1 PV de départ.',
];

export interface MetaStats {
  runs: number;
  wins: number;
  bestFloor: number;
  bestScore: number;
  totalShards: number;
}

export interface DailyRecord {
  date: string;
  floors: number;
  score: number;
  attempts: number;
}

export interface MetaState {
  version: 1;
  shards: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Plus haute ascension sélectionnable. */
  ascensionUnlocked: number;
  stats: MetaStats;
  daily: DailyRecord | null;
  tutorialSeen: boolean;
}

export function emptyMeta(): MetaState {
  return {
    version: 1,
    shards: 0,
    upgrades: {},
    ascensionUnlocked: 0,
    stats: { runs: 0, wins: 0, bestFloor: 0, bestScore: 0, totalShards: 0 },
    daily: null,
    tutorialSeen: false,
  };
}

export function upgradeLevel(meta: MetaState, id: UpgradeId): number {
  return meta.upgrades[id] ?? 0;
}

export function nextCost(meta: MetaState, upgrade: UpgradeDef): number | null {
  return upgrade.costs[upgradeLevel(meta, upgrade.id)] ?? null;
}

export function canBuy(meta: MetaState, upgrade: UpgradeDef): boolean {
  const cost = nextCost(meta, upgrade);
  const unlocked = !upgrade.requires || upgradeLevel(meta, upgrade.requires) > 0;
  return cost !== null && unlocked && meta.shards >= cost;
}

export function buy(meta: MetaState, id: UpgradeId): MetaState {
  const upgrade = UPGRADES.find((candidate) => candidate.id === id)!;
  if (!canBuy(meta, upgrade)) {
    return meta;
  }
  return {
    ...meta,
    shards: meta.shards - nextCost(meta, upgrade)!,
    upgrades: { ...meta.upgrades, [id]: upgradeLevel(meta, id) + 1 },
  };
}

export function bonusesFromMeta(meta: MetaState): RunBonuses {
  const level = (id: UpgradeId) => upgradeLevel(meta, id);
  const shapes: ShapeKind[] = (['circle', 'diamond', 'hexagon'] as const).filter((shape) => level(shape) > 0);
  return {
    hp: level('vitality'),
    moves: level('endurance'),
    undos: level('memory'),
    hammers: level('hammer'),
    rerolls: level('dice'),
    startingChest: level('kit') > 0,
    grimoire: level('grimoire') > 0,
    unlockedShapes: shapes,
  };
}

export interface RunOutcome {
  won: boolean;
  floorsCleared: number;
  score: number;
  shards: number;
  ascension: number;
  daily: boolean;
}

export function recordRun(meta: MetaState, outcome: RunOutcome, today: string): MetaState {
  const stats: MetaStats = {
    runs: meta.stats.runs + 1,
    wins: meta.stats.wins + (outcome.won ? 1 : 0),
    bestFloor: Math.max(meta.stats.bestFloor, outcome.floorsCleared),
    bestScore: Math.max(meta.stats.bestScore, outcome.score),
    totalShards: meta.stats.totalShards + outcome.shards,
  };
  let daily = meta.daily;
  if (outcome.daily) {
    const previous = daily?.date === today ? daily : null;
    daily = {
      date: today,
      floors: Math.max(previous?.floors ?? 0, outcome.floorsCleared),
      score: Math.max(previous?.score ?? 0, outcome.score),
      attempts: (previous?.attempts ?? 0) + 1,
    };
  }
  const ascensionUnlocked =
    outcome.won && !outcome.daily && outcome.ascension === meta.ascensionUnlocked
      ? Math.min(MAX_ASCENSION, meta.ascensionUnlocked + 1)
      : meta.ascensionUnlocked;
  return { ...meta, shards: meta.shards + outcome.shards, stats, daily, ascensionUnlocked };
}

/** Graine du défi du jour : identique pour tous les joueurs à une date donnée. */
export function dailySeed(date: string): number {
  let hash = 2166136261;
  for (const char of `krazygrid:${date}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export function todayKey(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
