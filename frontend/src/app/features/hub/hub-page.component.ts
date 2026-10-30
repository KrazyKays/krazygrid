import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SHAPES } from '../../core/engine/board';
import { ShapeKind } from '../../core/engine/types';
import { RunStore } from '../../core/game/run-store.service';
import {
  ASCENSION_RULES,
  canBuy,
  MAX_ASCENSION,
  nextCost,
  todayKey,
  UpgradeDef,
  upgradeLevel,
  UPGRADES,
} from '../../core/meta/meta';
import { MetaStore } from '../../core/meta/meta-store.service';
import { ShapeGlyphComponent } from '../../shared/shape-glyph.component';

@Component({
  selector: 'app-hub-page',
  imports: [ShapeGlyphComponent],
  templateUrl: './hub-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPageComponent {
  protected readonly meta = inject(MetaStore);
  private readonly runs = inject(RunStore);

  protected readonly upgrades = UPGRADES;
  protected readonly rules = ASCENSION_RULES;
  protected readonly shapes = SHAPES;
  protected readonly shapeKinds = Object.keys(SHAPES) as ShapeKind[];
  protected readonly logoShapes: ShapeKind[] = ['square', 'triangle', 'circle', 'diamond', 'hexagon'];

  protected readonly ascension = signal(this.meta.state().ascensionUnlocked);
  protected readonly ascensions = computed(() =>
    Array.from({ length: this.meta.state().ascensionUnlocked + 1 }, (_, i) => i),
  );
  protected readonly lockedAscensions = computed(() =>
    Array.from({ length: MAX_ASCENSION - this.meta.state().ascensionUnlocked }, (_, i) => i),
  );
  protected readonly showHelp = signal(!this.meta.state().tutorialSeen);

  protected readonly dailyToday = computed(() => {
    const daily = this.meta.state().daily;
    return daily?.date === todayKey() ? daily : null;
  });

  protected readonly unlockedShapes = computed(() => {
    const bonuses = this.meta.bonuses();
    return new Set<ShapeKind>(['square', 'triangle', ...bonuses.unlockedShapes]);
  });

  protected level(upgrade: UpgradeDef): number {
    return upgradeLevel(this.meta.state(), upgrade.id);
  }

  protected cost(upgrade: UpgradeDef): number | null {
    return nextCost(this.meta.state(), upgrade);
  }

  protected affordable(upgrade: UpgradeDef): boolean {
    return canBuy(this.meta.state(), upgrade);
  }

  protected locked(upgrade: UpgradeDef): boolean {
    return !!upgrade.requires && upgradeLevel(this.meta.state(), upgrade.requires) === 0;
  }

  protected requirementName(upgrade: UpgradeDef): string {
    return UPGRADES.find((candidate) => candidate.id === upgrade.requires)?.name ?? '';
  }

  protected play(): void {
    this.runs.start(this.ascension());
  }

  protected daily(): void {
    this.runs.startDaily();
  }

  protected closeHelp(): void {
    this.showHelp.set(false);
    this.meta.markTutorialSeen();
  }

  protected resetProgress(): void {
    if (confirm('Effacer toute la progression (éclats, améliorations, ascensions) ?')) {
      this.meta.reset();
      this.ascension.set(0);
    }
  }
}
