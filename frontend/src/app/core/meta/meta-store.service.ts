import { computed, Injectable, signal } from '@angular/core';
import { bonusesFromMeta, buy, emptyMeta, MetaState, recordRun, RunOutcome, todayKey, UpgradeId } from './meta';

const STORAGE_KEY = 'krazygrid.meta.v1';

/** Méta-progression persistée entre les runs (localStorage). */
@Injectable({ providedIn: 'root' })
export class MetaStore {
  readonly state = signal<MetaState>(load());
  readonly bonuses = computed(() => bonusesFromMeta(this.state()));

  buy(id: UpgradeId): void {
    this.update(buy(this.state(), id));
  }

  record(outcome: RunOutcome): void {
    this.update(recordRun(this.state(), outcome, todayKey()));
  }

  markTutorialSeen(): void {
    this.update({ ...this.state(), tutorialSeen: true });
  }

  reset(): void {
    this.update(emptyMeta());
  }

  private update(next: MetaState): void {
    this.state.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Stockage indisponible (navigation privée) : la progression reste en mémoire.
    }
  }
}

function load(): MetaState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MetaState>;
      if (parsed.version === 1) {
        const empty = emptyMeta();
        return { ...empty, ...parsed, stats: { ...empty.stats, ...parsed.stats } };
      }
    }
  } catch {
    // Sauvegarde illisible : on repart de zéro.
  }
  return emptyMeta();
}
