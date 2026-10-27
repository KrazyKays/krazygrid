import { computed, Injectable, signal } from '@angular/core';
import { cast as castLocally, createGame, GameRuleError, LEVEL_CLEAR_BONUS } from '../engine/game-engine';
import { CastReport, CastResponse, GameState, ShapeId } from '../models/game.models';

/** État de jeu côté client, avec le moteur de règles local. */
@Injectable({ providedIn: 'root' })
export class GameStore {
  readonly state = signal<GameState | null>(null);
  readonly selectedShape = signal<ShapeId>('cross');
  readonly lastReport = signal<CastReport | null>(null);
  readonly message = signal('');
  readonly isOver = computed(() => this.state()?.status === 'lost');

  newGame(): void {
    this.startGame(createGame(randomSeed()), 'Nouvelle partie lancée.');
  }

  selectShape(shape: ShapeId): void {
    this.selectedShape.set(shape);
  }

  cast(x: number, y: number): void {
    const current = this.state();
    if (!current || current.status !== 'playing') {
      return;
    }
    try {
      this.applyResponse(castLocally(current, this.selectedShape(), x, y));
    } catch (error) {
      if (error instanceof GameRuleError) {
        this.message.set(error.message);
        return;
      }
      throw error;
    }
  }

  private startGame(state: GameState, message: string): void {
    this.state.set(state);
    this.lastReport.set(null);
    this.message.set(message);
  }

  private applyResponse({ state, report }: CastResponse): void {
    this.state.set(state);
    this.lastReport.set(report);
    this.message.set(describeReport(report, state));
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function describeReport(report: CastReport, state: GameState): string {
  if (report.runOver) {
    return 'Partie perdue.';
  }
  if (report.levelCleared) {
    return `Niveau ${state.level - 1} réussi ! Bonus de ${LEVEL_CLEAR_BONUS} or. Niveau ${state.level} lancé.`;
  }
  const parts: string[] = [];
  if (report.treasuresGained > 0) {
    parts.push(`+${report.treasuresGained} trésor(s), +${report.moneyGained} or`);
  }
  if (report.bombsHit > 0) {
    parts.push(`-${report.bombsHit} vie(s) (bombe)`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Rien de précieux.';
}
