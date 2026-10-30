import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { index, inBounds, itemValue, SHAPES } from '../../../core/engine/board';
import { Board, Cell, Item, Tile } from '../../../core/engine/types';
import { RunStore } from '../../../core/game/run-store.service';
import { ShapeGlyphComponent } from '../../../shared/shape-glyph.component';

interface CellView extends Cell {
  i: number;
  tile: Tile;
  item: Item | null;
}

const TILE_LABELS: Record<Tile, string> = {
  floor: 'Sol',
  wall: 'Mur',
  spike: 'Pics',
  crack: 'Bloc fragile',
};
const ITEM_LABELS: Record<Item, string> = {
  coin: 'pièce',
  gem: 'gemme',
  chest: 'coffre',
  heart: 'cœur',
};
const STEP_MS = 65;

@Component({
  selector: 'app-board',
  imports: [ShapeGlyphComponent],
  templateUrl: './board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent {
  protected readonly store = inject(RunStore);

  protected readonly board = computed(() => this.store.run()!.floor.board);

  protected readonly cells = computed<CellView[]>(() => {
    const board = this.board();
    return board.tiles.map((tile, i) => ({
      i,
      x: i % board.width,
      y: Math.floor(i / board.width),
      tile,
      item: board.items[i],
    }));
  });

  protected readonly destinations = computed(() => {
    const board = this.board();
    return new Map(
      this.store
        .options()
        .map((option) => [index(board, option.target.x, option.target.y), option]),
    );
  });

  protected readonly pathKeys = computed(() => {
    const board = this.board();
    const option = this.store.hoveredOption();
    const keys = new Set<number>();
    option?.path.forEach((cell) => keys.add(index(board, cell.x, cell.y)));
    return keys;
  });

  /** Case où chaque sentinelle se rendra au prochain tour. */
  protected readonly dangerKeys = computed(() => {
    const board = this.board();
    const keys = new Set<number>();
    for (const sentinel of board.sentinels) {
      const next = nextSentinelCell(board, sentinel.x, sentinel.y, sentinel.dx, sentinel.dy);
      if (next) keys.add(index(board, next.x, next.y));
    }
    return keys;
  });

  protected readonly hurtKeys = computed(() => {
    const board = this.board();
    const preview = this.store.preview();
    return new Set(preview?.hurtAt.map((cell) => index(board, cell.x, cell.y)) ?? []);
  });

  /** Gains flottants du dernier coup. */
  protected readonly floats = computed(() => {
    const run = this.store.run()!;
    const mods = this.store.mods()!;
    const last = run.last;
    if (!last) return [];
    const gains = last.collected.map(({ cell, item }) => ({
      ...cell,
      text: item === 'heart' ? '+♥' : item === 'chest' ? '▣' : `+${itemValue(item, mods)}`,
      tone: item,
    }));
    // Si l'Égide a tout absorbé, on montre le bouclier plutôt qu'une blessure.
    const hurts = last.hurtAt.map((cell) =>
      last.damage > 0
        ? { ...cell, text: '-1 ♥', tone: 'hurt' }
        : { ...cell, text: '⛨', tone: 'shield' },
    );
    return [...gains, ...hurts];
  });

  /** Clé changeant à chaque blessure, pour rejouer le flash rouge. */
  protected readonly damageFlash = computed(() => {
    const tick = this.store.hurtTick();
    return tick === null ? [] : [tick];
  });

  /** Formes blessées par le dernier coup : celle posée sur la case, sinon celle qui a traversé des pics. */
  protected readonly hurtPieces = computed(() => {
    const last = this.store.run()?.last;
    const board = this.board();
    const ids = new Set<number>();
    if (!last || last.damage === 0) return ids;
    for (const cell of last.hurtAt) {
      const piece = board.pieces.find((p) => p.x === cell.x && p.y === cell.y);
      const id = piece?.id ?? this.store.travel()?.pieceId;
      if (id !== undefined) ids.add(id);
    }
    return ids;
  });

  private readonly boardEl = viewChild.required<ElementRef<HTMLElement>>('boardEl');

  constructor() {
    // Secousse du plateau et clignotement des formes touchées, à l'instant de l'impact.
    afterRenderEffect(() => {
      if (this.store.hurtTick() === null) return;
      const delay = untracked(() => this.store.impactDelay());
      const el = this.boardEl().nativeElement;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      el.animate(
        [
          { transform: 'translate(0, 0)' },
          { transform: 'translate(-10px, 4px) rotate(-0.6deg)' },
          { transform: 'translate(9px, -5px) rotate(0.5deg)' },
          { transform: 'translate(-7px, 3px)' },
          { transform: 'translate(5px, -2px)' },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 420, delay, easing: 'ease-out' },
      );
      el.querySelectorAll<HTMLElement>('.unit.hurt app-shape-glyph').forEach((unit) =>
        unit.animate(
          [
            { filter: 'none', scale: '1' },
            {
              filter: 'brightness(2) drop-shadow(0 0 12px #ef4444) hue-rotate(-60deg)',
              scale: '1.25',
            },
            { filter: 'none', scale: '0.9' },
            {
              filter: 'brightness(2) drop-shadow(0 0 12px #ef4444) hue-rotate(-60deg)',
              scale: '1.1',
            },
            { filter: 'none', scale: '1' },
          ],
          { duration: 650, delay, easing: 'ease-out' },
        ),
      );
    });
  }

  protected readonly selected = computed(() => this.store.selectedId());

  protected pos(cell: Cell): Record<string, string> {
    const board = this.board();
    return {
      left: `${(cell.x * 100) / board.width}%`,
      top: `${(cell.y * 100) / board.height}%`,
      width: `${100 / board.width}%`,
      height: `${100 / board.height}%`,
    };
  }

  protected pieceStyle(id: number, cell: Cell): Record<string, string> {
    const travel = this.store.travel();
    const ms = travel?.pieceId === id ? 90 + travel.steps * STEP_MS : 140;
    return { ...this.pos(cell), 'transition-duration': `${ms}ms` };
  }

  protected sentinelStyle(cell: Cell): Record<string, string> {
    const travel = this.store.travel();
    const delay = travel ? 90 + travel.steps * STEP_MS : 0;
    return { ...this.pos(cell), 'transition-delay': `${delay}ms` };
  }

  protected arrow(dx: number, dy: number): number {
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }

  protected label(cell: CellView): string {
    const parts = [`${TILE_LABELS[cell.tile]} (${cell.x + 1}, ${cell.y + 1})`];
    if (cell.item) parts.push(ITEM_LABELS[cell.item]);
    const piece = this.board().pieces.find((p) => p.x === cell.x && p.y === cell.y);
    if (piece) parts.push(SHAPES[piece.kind].name);
    if (this.destinations().has(cell.i)) parts.push('destination possible');
    return parts.join(', ');
  }

  protected hammerTarget(cell: CellView): boolean {
    return this.store.hammerMode() && (cell.tile === 'wall' || cell.tile === 'crack');
  }
}

function nextSentinelCell(board: Board, x: number, y: number, dx: number, dy: number): Cell | null {
  for (const [sx, sy] of [
    [dx, dy],
    [-dx, -dy],
  ]) {
    const nx = x + sx;
    const ny = y + sy;
    if (!inBounds(board, nx, ny)) continue;
    const tile = board.tiles[index(board, nx, ny)];
    if (tile === 'wall' || tile === 'crack') continue;
    if (board.sentinels.some((other) => other.x === nx && other.y === ny)) continue;
    return { x: nx, y: ny };
  }
  return null;
}
