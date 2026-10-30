import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SHAPES } from '../../core/engine/board';
import { FLOOR_COUNT } from '../../core/engine/generator';
import { PerkDef, PerkId, PERKS, RARITY_LABELS } from '../../core/engine/perks';
import { ascensionMultiplier, SKIP_LOOT_SHARDS } from '../../core/engine/run';
import { RunStore } from '../../core/game/run-store.service';
import { ShapeGlyphComponent } from '../../shared/shape-glyph.component';
import { BoardComponent } from './board/board.component';

@Component({
  selector: 'app-run-page',
  imports: [BoardComponent, ShapeGlyphComponent],
  templateUrl: './run-page.component.html',
  host: { '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunPageComponent {
  protected readonly store = inject(RunStore);
  protected readonly shapes = SHAPES;
  protected readonly perkDefs = PERKS;
  protected readonly rarityLabels = RARITY_LABELS;
  protected readonly floorCount = FLOOR_COUNT;
  protected readonly skipShards = SKIP_LOOT_SHARDS;

  protected readonly run = computed(() => this.store.run()!);

  protected readonly floors = Array.from({ length: FLOOR_COUNT }, (_, i) => i + 1);

  /** Avantages possédés, regroupés avec leur nombre d'exemplaires. */
  protected readonly ownedPerks = computed(() => {
    const counts = new Map<PerkId, number>();
    for (const perk of this.run().perks) counts.set(perk, (counts.get(perk) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ def: PERKS[id], count }));
  });

  protected readonly lootCards = computed<PerkDef[]>(() =>
    (this.run().loot ?? []).map((id) => PERKS[id]),
  );

  protected readonly showLoot = computed(() => {
    const run = this.run();
    return !!run.loot && run.phase !== 'dead' && run.phase !== 'won';
  });

  protected readonly progress = computed(() => {
    const floor = this.run().floor;
    return Math.min(100, (floor.coins / floor.target) * 100);
  });

  protected readonly previewText = computed(() => {
    const preview = this.store.preview();
    if (this.store.hammerMode()) {
      return 'Marteau : cliquez un mur ou un bloc fragile pour le briser (gratuit).';
    }
    if (!preview) {
      return this.store.selectedId() === null
        ? 'Sélectionnez une forme (clic ou touches 1-5).'
        : 'Survolez une destination pour voir le résultat du coup.';
    }
    const parts: string[] = [];
    parts.push(
      preview.coinsGained > 0
        ? `+${preview.coinsGained} pièce${preview.coinsGained > 1 ? 's' : ''}`
        : 'Aucune pièce',
    );
    if (preview.chest) parts.push('ouvre le coffre');
    if (preview.heal > 0) parts.push(`+${preview.heal} PV`);
    if (preview.blocked > 0) parts.push(`Égide absorbe ${preview.blocked} blessure`);
    if (preview.damage > 0)
      parts.push(`⚠ ${preview.damage} blessure${preview.damage > 1 ? 's' : ''}`);
    const floor = this.run().floor;
    if (floor.coins + preview.coinsGained >= floor.target) parts.push('✓ objectif atteint');
    return parts.join(' · ');
  });

  protected readonly previewDanger = computed(() => (this.store.preview()?.damage ?? 0) > 0);

  protected readonly multiplier = computed(() => ascensionMultiplier(this.run().config.ascension));

  /** Clé qui change à chaque blessure : recrée les éléments animés pour rejouer l'effet. */
  protected readonly hurtKey = computed(() => {
    const tick = this.store.hurtTick();
    return [tick === null ? 'calm' : `hit-${tick}`];
  });

  protected hearts(): { full: boolean; lost: boolean }[] {
    const run = this.run();
    const lost = this.store.hurtTick() === null ? 0 : (run.last?.damage ?? 0);
    return Array.from({ length: run.maxHp }, (_, i) => ({
      full: i < run.hp,
      lost: i >= run.hp && i < run.hp + lost,
    }));
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const run = this.run();
    if (this.showLoot()) {
      const n = Number(event.key);
      if (n >= 1 && n <= (run.loot?.length ?? 0)) this.store.choose(run.loot![n - 1]);
      else if (event.key === 'r') this.store.reroll();
      return;
    }
    if (event.key === 'Enter') {
      if (run.phase === 'cleared') this.store.next();
      else if (run.phase === 'failed') this.store.retry();
      else return;
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case 'z':
      case 'u':
      case 'Backspace':
        this.store.undo();
        break;
      case 'h':
        this.store.toggleHammer();
        break;
      case 'Tab':
        this.store.cycle();
        event.preventDefault();
        break;
      case 'Escape':
        this.store.select(null);
        break;
      default: {
        const n = Number(event.key);
        if (n >= 1 && n <= 5) this.store.cycle(n - 1);
      }
    }
  }

  protected confirmRetry(): void {
    if (confirm('Recommencer l’étage depuis le début ? Cela coûte 1 PV.')) this.store.retry();
  }

  protected confirmAbandon(): void {
    if (confirm('Abandonner la run ? Les éclats gagnés sont conservés.')) this.store.abandon();
  }
}
