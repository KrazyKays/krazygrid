import { Rng } from './rng';
import { ShapeKind } from './types';

export type PerkId =
  | 'hourglass'
  | 'crystalHeart'
  | 'potion'
  | 'rewind'
  | 'aegis'
  | 'jeweler'
  | 'boots'
  | 'momentum'
  | 'greed'
  | 'hammer'
  | 'carapace'
  | 'magnet'
  | 'echo'
  | 'glassCannon'
  | 'shapeCircle'
  | 'shapeDiamond'
  | 'shapeHexagon';

export type Rarity = 'common' | 'rare' | 'epic';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  rarity: Rarity;
  icon: string;
  stackable: boolean;
  /** Forme ajoutée à l'escouade par cet avantage. */
  shape?: ShapeKind;
  /** Avantage réservé au Grimoire (déblocage de l'Atelier). */
  grimoire?: boolean;
}

export const PERKS: Record<PerkId, PerkDef> = {
  hourglass: {
    id: 'hourglass',
    name: 'Sablier',
    description: '+1 coup à chaque étage.',
    rarity: 'common',
    icon: '⧗',
    stackable: true,
  },
  crystalHeart: {
    id: 'crystalHeart',
    name: 'Cœur de cristal',
    description: '+1 PV max et soigne 1 PV.',
    rarity: 'common',
    icon: '♥',
    stackable: true,
  },
  potion: {
    id: 'potion',
    name: 'Potion',
    description: 'Soigne 2 PV immédiatement.',
    rarity: 'common',
    icon: '⚗',
    stackable: true,
  },
  rewind: {
    id: 'rewind',
    name: 'Rembobinage',
    description: '+1 annulation à chaque étage.',
    rarity: 'rare',
    icon: '↺',
    stackable: true,
  },
  aegis: {
    id: 'aegis',
    name: 'Égide',
    description: 'Absorbe la première blessure de chaque étage (cumulable).',
    rarity: 'rare',
    icon: '⛨',
    stackable: true,
  },
  jeweler: {
    id: 'jeweler',
    name: 'Joaillier',
    description: 'Les gemmes rapportent +2 pièces.',
    rarity: 'common',
    icon: '◆',
    stackable: true,
  },
  boots: {
    id: 'boots',
    name: 'Semelles de fer',
    description: 'Traverser des pics ne blesse plus. S’arrêter dessus, si.',
    rarity: 'rare',
    icon: '⩚',
    stackable: false,
  },
  momentum: {
    id: 'momentum',
    name: 'Élan',
    description: '+1 pièce par objet ramassé au-delà du 2e dans un même coup.',
    rarity: 'common',
    icon: '»',
    stackable: false,
  },
  greed: {
    id: 'greed',
    name: 'Avarice',
    description: '+3 éclats à chaque étage terminé.',
    rarity: 'common',
    icon: '✦',
    stackable: true,
  },
  hammer: {
    id: 'hammer',
    name: 'Marteau',
    description: '+1 charge de Marteau par étage : brise un mur ou un bloc fragile sans coût.',
    rarity: 'rare',
    icon: '⚒',
    stackable: true,
  },
  carapace: {
    id: 'carapace',
    name: 'Carapace',
    description: 'Les sentinelles ne vous blessent plus.',
    rarity: 'rare',
    icon: '⬢',
    stackable: false,
  },
  magnet: {
    id: 'magnet',
    name: 'Aimant',
    description: 'En fin de coup, la forme attire les objets des 4 cases voisines.',
    rarity: 'epic',
    icon: '⋒',
    stackable: false,
    grimoire: true,
  },
  echo: {
    id: 'echo',
    name: 'Écho',
    description: 'Le premier coup de chaque étage est gratuit.',
    rarity: 'epic',
    icon: '≋',
    stackable: false,
    grimoire: true,
  },
  glassCannon: {
    id: 'glassCannon',
    name: 'Canon de verre',
    description: '+3 coups à chaque étage, mais -1 PV max.',
    rarity: 'epic',
    icon: '✧',
    stackable: true,
    grimoire: true,
  },
  shapeCircle: {
    id: 'shapeCircle',
    name: 'Recrue : Cercle',
    description: 'Ajoute un Cercle à l’escouade dès le prochain étage. Il saute de 2 cases.',
    rarity: 'rare',
    icon: '●',
    stackable: false,
    shape: 'circle',
  },
  shapeDiamond: {
    id: 'shapeDiamond',
    name: 'Recrue : Losange',
    description: 'Ajoute un Losange dès le prochain étage. Il bondit comme un cavalier.',
    rarity: 'rare',
    icon: '◆',
    stackable: false,
    shape: 'diamond',
  },
  shapeHexagon: {
    id: 'shapeHexagon',
    name: 'Recrue : Hexagone',
    description: 'Ajoute un Hexagone dès le prochain étage. 1 pas, aspire les 8 cases autour.',
    rarity: 'epic',
    icon: '⬣',
    stackable: false,
    shape: 'hexagon',
  },
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
};

/** Modificateurs de règles dérivés des avantages et de l'Atelier. */
export interface Mods {
  extraMoves: number;
  undos: number;
  hammers: number;
  shields: number;
  gemBonus: number;
  greed: number;
  boots: boolean;
  momentum: boolean;
  carapace: boolean;
  magnet: boolean;
  echo: boolean;
}

export const NO_MODS: Mods = {
  extraMoves: 0,
  undos: 0,
  hammers: 0,
  shields: 0,
  gemBonus: 0,
  greed: 0,
  boots: false,
  momentum: false,
  carapace: false,
  magnet: false,
  echo: false,
};

export interface BaseBonuses {
  moves: number;
  undos: number;
  hammers: number;
}

export function computeMods(perks: readonly PerkId[], base: BaseBonuses): Mods {
  const count = (id: PerkId) => perks.filter((perk) => perk === id).length;
  return {
    extraMoves: base.moves + count('hourglass') + 3 * count('glassCannon'),
    undos: base.undos + count('rewind'),
    hammers: base.hammers + count('hammer'),
    shields: count('aegis'),
    gemBonus: 2 * count('jeweler'),
    greed: 3 * count('greed'),
    boots: perks.includes('boots'),
    momentum: perks.includes('momentum'),
    carapace: perks.includes('carapace'),
    magnet: perks.includes('magnet'),
    echo: perks.includes('echo'),
  };
}

const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 };
const GUARDIAN_WEIGHTS: Record<Rarity, number> = { common: 0, rare: 70, epic: 30 };

export interface LootContext {
  owned: readonly PerkId[];
  roster: readonly ShapeKind[];
  unlockedShapes: readonly ShapeKind[];
  grimoire: boolean;
  guardian: boolean;
}

/** Avantages pouvant encore apparaître dans un coffre. */
export function lootPool(ctx: LootContext): PerkId[] {
  return (Object.values(PERKS) as PerkDef[])
    .filter((perk) => perk.stackable || !ctx.owned.includes(perk.id))
    .filter((perk) => !perk.grimoire || ctx.grimoire)
    .filter((perk) => !perk.shape || (ctx.unlockedShapes.includes(perk.shape) && !ctx.roster.includes(perk.shape)))
    .map((perk) => perk.id);
}

/** Tire 3 avantages distincts, pondérés par rareté. */
export function rollLoot(rng: Rng, ctx: LootContext, size = 3): PerkId[] {
  const weights = ctx.guardian ? GUARDIAN_WEIGHTS : RARITY_WEIGHTS;
  let pool = lootPool(ctx);
  if (ctx.guardian && pool.filter((id) => weights[PERKS[id].rarity] > 0).length >= size) {
    pool = pool.filter((id) => weights[PERKS[id].rarity] > 0);
  }
  const picks: PerkId[] = [];
  while (picks.length < size && pool.length > 0) {
    const total = pool.reduce((sum, id) => sum + Math.max(weights[PERKS[id].rarity], 1), 0);
    let roll = rng.int(total);
    const choice =
      pool.find((id) => {
        roll -= Math.max(weights[PERKS[id].rarity], 1);
        return roll < 0;
      }) ?? pool[0];
    picks.push(choice);
    pool = pool.filter((id) => id !== choice);
  }
  return picks;
}
