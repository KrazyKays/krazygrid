import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { shapeCells } from '../../../core/engine/game-engine';
import { Cell, OrbType, ShapeId } from '../../../core/models/game.models';

const ORB_LABELS: Record<OrbType, string> = {
  gold: 'Bille dorée (trésor)',
  bomb: 'Bombe (-1 vie)',
  neutral: 'Bille neutre',
};

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent {
  readonly grid = input.required<OrbType[][]>();
  readonly shape = input.required<ShapeId>();
  readonly disabled = input(false);

  readonly cellClick = output<Cell>();

  protected readonly hovered = signal<Cell | null>(null);

  protected readonly width = computed(() => this.grid()[0]?.length ?? 0);
  protected readonly height = computed(() => this.grid().length);

  /** Indices (y * width + x) des cases qui seraient touchées par le sort survolé. */
  protected readonly previewKeys = computed(() => {
    const hover = this.hovered();
    if (!hover) {
      return new Set<number>();
    }
    const cells = shapeCells(this.shape(), hover.x, hover.y, this.width(), this.height());
    return new Set(cells.map((cell) => cell.y * this.width() + cell.x));
  });

  protected label(orb: OrbType): string {
    return ORB_LABELS[orb];
  }

  protected isAnchor(x: number, y: number): boolean {
    const hover = this.hovered();
    return hover?.x === x && hover?.y === y;
  }

  protected onHover(x: number, y: number): void {
    this.hovered.set({ x, y });
  }

  protected onLeave(): void {
    this.hovered.set(null);
  }

  protected onCellClick(x: number, y: number): void {
    if (!this.disabled()) {
      this.cellClick.emit({ x, y });
    }
  }
}
