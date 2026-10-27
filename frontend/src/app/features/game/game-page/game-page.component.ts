import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { GameStore } from '../../../core/game/game-store.service';
import { START_LIVES } from '../../../core/engine/game-engine';
import { Cell, ShapeId } from '../../../core/models/game.models';
import { BoardComponent } from '../board/board.component';

interface ShapeOption {
  id: ShapeId;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-game-page',
  imports: [BoardComponent],
  templateUrl: './game-page.component.html',
  styleUrl: './game-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePageComponent implements OnInit {
  protected readonly store = inject(GameStore);

  protected readonly shapes: ShapeOption[] = [
    { id: 'line', label: 'Ligne', hint: '3 cases' },
    { id: 'cross', label: 'Croix', hint: '5 cases' },
    { id: 'square', label: 'Carré', hint: '2 × 2' },
  ];

  ngOnInit(): void {
    this.store.newGame();
  }

  /** Vies affichées en cœurs pleins (restantes) et vides (perdues). */
  protected hearts(lives: number): string {
    return '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(START_LIVES - lives, 0));
  }

  protected onCellClick(cell: Cell): void {
    this.store.cast(cell.x, cell.y);
  }
}
