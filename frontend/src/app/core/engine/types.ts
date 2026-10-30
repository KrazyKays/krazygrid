export type ShapeKind = 'square' | 'triangle' | 'circle' | 'diamond' | 'hexagon';
export type Tile = 'floor' | 'wall' | 'spike' | 'crack';
export type Item = 'coin' | 'gem' | 'chest' | 'heart';

export interface Cell {
  x: number;
  y: number;
}

export interface Piece extends Cell {
  id: number;
  kind: ShapeKind;
}

/** Garde qui patrouille sur un axe et blesse la forme qu'elle percute. */
export interface Sentinel extends Cell {
  id: number;
  dx: number;
  dy: number;
}

/** Plateau d'un étage. Les tableaux `tiles` et `items` sont à plat (index y * width + x). */
export interface Board {
  width: number;
  height: number;
  tiles: Tile[];
  items: (Item | null)[];
  pieces: Piece[];
  sentinels: Sentinel[];
}

/** Étage tel que généré : plateau initial + contraintes, rejoué tel quel à chaque nouvelle tentative. */
export interface FloorDef {
  number: number;
  seed: number;
  guardian: boolean;
  board: Board;
  target: number;
  baseMoves: number;
  /** Séquence de coups jouée par le générateur : preuve que l'étage est faisable. */
  solution: { pieceId: number; target: Cell }[];
}

/** État vivant d'un étage en cours. */
export interface FloorState {
  board: Board;
  coins: number;
  target: number;
  movesLeft: number;
  turn: number;
  shieldsLeft: number;
  hammersLeft: number;
  undosLeft: number;
}

export interface MoveOption {
  pieceId: number;
  /** Case à cliquer pour jouer ce coup (la case d'atterrissage, ou le bloc à briser). */
  target: Cell;
  landing: Cell;
  /** Cases traversées dans l'ordre, case d'atterrissage incluse. */
  path: Cell[];
  /** Bloc fragile brisé par l'impact. */
  breaks: Cell | null;
}

export interface MoveResult {
  floor: FloorState;
  /** Cases dont l'objet a été ramassé, et l'objet en question. */
  collected: { cell: Cell; item: Item }[];
  coinsGained: number;
  damage: number;
  /** Dégâts absorbés par l'Égide. */
  blocked: number;
  heal: number;
  chest: boolean;
  /** Cases où la forme a été blessée (pics ou sentinelle). */
  hurtAt: Cell[];
}
