import { computed, Injectable, signal } from '@angular/core';
import { cast as castLocally, createGame, GameRuleError, LEVEL_CLEAR_BONUS } from '../engine/game-engine';
import { CastReport, CastResponse, GameState, ShapeId } from '../models/game.models';

/** Ton visuel du message de retour : pilote sa couleur. */
export type MessageTone = 'neutral' | 'good' | 'bad' | 'level';

/** État de jeu côté client, avec le moteur de règles local. */
@Injectable({ providedIn: 'root' })
export class GameStore {
  readonly state = signal<GameState | null>(null);
  readonly selectedShape = signal<ShapeId>('cross');
  readonly lastReport = signal<CastReport | null>(null);
  /** Incrémenté à chaque sort réussi, pour rejouer les animations du plateau. */
  readonly castCount = signal(0);
  readonly message = signal('');
  readonly messageTone = signal<MessageTone>('neutral');
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
        this.messageTone.set('neutral');
        return;
      }
      throw error;
    }
  }

  private startGame(state: GameState, message: string): void {
    this.state.set(state);
    this.lastReport.set(null);
    this.message.set(message);
    this.messageTone.set('neutral');
  }

  private applyResponse({ state, report }: CastResponse): void {
    const { text, tone } = describeReport(report, state);
    this.state.set(state);
    this.lastReport.set(report);
    this.castCount.update((count) => count + 1);
    this.message.set(text);
    this.messageTone.set(tone);
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function describeReport(report: CastReport, state: GameState): { text: string; tone: MessageTone } {
  if (report.runOver) {
    return { text: 'Partie perdue.', tone: 'bad' };
  }
  if (report.levelCleared) {
    return {
      text: `Niveau ${state.level - 1} réussi ! Bonus de ${LEVEL_CLEAR_BONUS} or. Niveau ${state.level} lancé.`,
      tone: 'level',
    };
  }
  const parts: string[] = [];
  if (report.treasuresGained > 0) {
    parts.push(`+${report.treasuresGained} trésor(s), +${report.moneyGained} or`);
  }
  if (report.bombsHit > 0) {
    parts.push(`-${report.bombsHit} vie(s) (bombe)`);
  }
  if (parts.length === 0) {
    return { text: 'Rien de précieux.', tone: 'neutral' };
  }
  return { text: parts.join(' · '), tone: report.bombsHit > 0 ? 'bad' : 'good' };
}
