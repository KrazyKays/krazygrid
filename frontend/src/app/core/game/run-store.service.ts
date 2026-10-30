import { computed, inject, Injectable, signal } from '@angular/core';
import { applyMove, index, legalMoves } from '../engine/board';
import { PerkId } from '../engine/perks';
import * as engine from '../engine/run';
import { Cell, MoveOption, MoveResult } from '../engine/types';
import { dailySeed, todayKey } from '../meta/meta';
import { MetaStore } from '../meta/meta-store.service';

/** Run en cours : relie le moteur pur aux composants. */
@Injectable({ providedIn: 'root' })
export class RunStore {
  private readonly meta = inject(MetaStore);

  readonly run = signal<engine.RunState | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly hammerMode = signal(false);
  readonly hovered = signal<Cell | null>(null);
  /** Incrémenté à chaque action, pour rejouer les animations. */
  readonly tick = signal(0);
  /** Forme déplacée par la dernière action et longueur du trajet, pour doser l'animation. */
  readonly travel = signal<{ pieceId: number; steps: number } | null>(null);
  private recorded = false;

  readonly mods = computed(() => {
    const run = this.run();
    return run ? engine.runMods(run) : null;
  });

  /** Vaut le numéro d'action quand le dernier coup a blessé, pour rejouer les effets de dégâts. */
  readonly hurtTick = computed(() => ((this.run()?.last?.damage ?? 0) > 0 ? this.tick() : null));

  /** Délai avant l'impact : le temps que la forme termine son trajet. */
  readonly impactDelay = computed(() => {
    const travel = this.travel();
    return travel ? 90 + travel.steps * 65 : 0;
  });

  readonly canAct = computed(() => {
    const run = this.run();
    return !!run && run.phase === 'playing' && !run.loot;
  });

  readonly options = computed<MoveOption[]>(() => {
    const run = this.run();
    const id = this.selectedId();
    if (!run || id === null || !this.canAct() || this.hammerMode()) {
      return [];
    }
    return legalMoves(run.floor.board, id);
  });

  readonly hoveredOption = computed(() => {
    const hover = this.hovered();
    return hover ? this.optionAt(hover) : null;
  });

  /** Simulation du coup survolé : ce qu'il rapporterait et coûterait. */
  readonly preview = computed<MoveResult | null>(() => {
    const run = this.run();
    const option = this.hoveredOption();
    const mods = this.mods();
    return run && option && mods ? applyMove(run.floor, option, mods) : null;
  });

  start(ascension: number): void {
    this.begin({
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
      ascension,
      daily: false,
      bonuses: this.meta.bonuses(),
    });
  }

  startDaily(): void {
    this.begin({ seed: dailySeed(todayKey()), ascension: 0, daily: true, bonuses: engine.NO_BONUSES });
  }

  quit(): void {
    this.run.set(null);
  }

  optionAt(cell: Cell): MoveOption | null {
    return this.options().find((option) => option.target.x === cell.x && option.target.y === cell.y) ?? null;
  }

  select(id: number | null): void {
    this.hammerMode.set(false);
    this.selectedId.set(id);
  }

  /** Sélectionne la forme suivante (ou la n-ième si `position` est fourni). */
  cycle(position?: number): void {
    const pieces = this.run()?.floor.board.pieces ?? [];
    if (pieces.length === 0) return;
    if (position !== undefined) {
      if (pieces[position]) this.select(pieces[position].id);
      return;
    }
    const current = pieces.findIndex((piece) => piece.id === this.selectedId());
    this.select(pieces[(current + 1) % pieces.length].id);
  }

  toggleHammer(): void {
    const run = this.run();
    if (run && run.floor.hammersLeft > 0 && this.canAct()) {
      this.hammerMode.update((mode) => !mode);
    }
  }

  clickCell(cell: Cell): void {
    const run = this.run();
    if (!run || !this.canAct()) return;
    if (this.hammerMode()) {
      const tile = run.floor.board.tiles[index(run.floor.board, cell.x, cell.y)];
      if (tile === 'wall' || tile === 'crack') {
        this.hammerMode.set(false);
        this.apply(engine.useHammer(run, cell));
      }
      return;
    }
    const option = this.optionAt(cell);
    if (option) {
      this.travel.set({ pieceId: option.pieceId, steps: Math.max(1, option.path.length) });
      this.apply(engine.playMove(run, option));
      return;
    }
    const piece = run.floor.board.pieces.find((candidate) => candidate.x === cell.x && candidate.y === cell.y);
    this.select(piece && piece.id !== this.selectedId() ? piece.id : null);
  }

  undo(): void {
    this.mutate(engine.undo);
  }

  retry(): void {
    this.mutate(engine.retryFloor);
  }

  choose(perk: PerkId): void {
    this.mutate((run) => engine.choosePerk(run, perk));
  }

  reroll(): void {
    this.mutate(engine.rerollLoot);
  }

  skipLoot(): void {
    this.mutate(engine.skipLoot);
  }

  next(): void {
    this.mutate(engine.nextFloor);
    this.selectFirst();
  }

  /** Abandonner compte comme une défaite, mais conserve les éclats gagnés. */
  abandon(): void {
    this.mutate((run) => ({ ...run, phase: 'dead', loot: null }));
  }

  private begin(config: engine.RunConfig): void {
    this.recorded = false;
    this.run.set(engine.startRun(config));
    this.selectFirst();
  }

  private selectFirst(): void {
    this.hammerMode.set(false);
    this.selectedId.set(this.run()?.floor.board.pieces[0]?.id ?? null);
  }

  private mutate(action: (run: engine.RunState) => engine.RunState): void {
    const run = this.run();
    if (run) this.apply(action(run));
  }

  private apply(next: engine.RunState): void {
    const previous = this.run();
    if (next === previous) return;
    if (!next.last) this.travel.set(null);
    this.run.set(next);
    this.tick.update((tick) => tick + 1);
    if ((next.phase === 'dead' || next.phase === 'won') && !this.recorded) {
      this.recorded = true;
      this.meta.record({
        won: next.phase === 'won',
        floorsCleared: next.floorsCleared,
        score: next.score,
        shards: next.shards,
        ascension: next.config.ascension,
        daily: next.config.daily,
      });
    }
  }
}
