import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { cast as castLocally, createGame, GameRuleError, LEVEL_CLEAR_BONUS } from '../engine/game-engine';
import { CastReport, CastResponse, GameState, ShapeId } from '../models/game.models';
import { GameApiService } from '../api/game-api.service';

export type PlayMode = 'api' | 'local';

/**
 * État de jeu côté client. Tente l'API en priorité et bascule sur le moteur local
 * si elle est injoignable. L'état transite par le client, donc la bascule est transparente en cours de partie.
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly api = inject(GameApiService);

  readonly state = signal<GameState | null>(null);
  readonly mode = signal<PlayMode>('api');
  readonly selectedShape = signal<ShapeId>('cross');
  readonly lastReport = signal<CastReport | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);
  readonly isOver = computed(() => this.state()?.status === 'lost');

  newGame(): void {
    const seed = randomSeed();
    this.busy.set(true);
    this.api
      .newGame({ seed })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (state) => {
          this.mode.set('api');
          this.startGame(state, 'Nouvelle partie lancée.');
        },
        error: () => {
          this.mode.set('local');
          this.startGame(createGame(seed), 'API indisponible : partie jouée en mode local.');
        },
      });
  }

  selectShape(shape: ShapeId): void {
    this.selectedShape.set(shape);
  }

  cast(x: number, y: number): void {
    const current = this.state();
    if (!current || current.status !== 'playing' || this.busy()) {
      return;
    }
    const shape = this.selectedShape();

    if (this.mode() === 'local') {
      this.castLocal(current, shape, x, y);
      return;
    }

    this.busy.set(true);
    this.api
      .cast({ state: current, shape, x, y })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (response) => this.applyResponse(response),
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.message.set(error.error?.detail ?? 'Action refusée.');
            return;
          }
          this.mode.set('local');
          this.castLocal(current, shape, x, y);
        },
      });
  }

  private castLocal(state: GameState, shape: ShapeId, x: number, y: number): void {
    try {
      this.applyResponse(castLocally(state, shape, x, y));
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
