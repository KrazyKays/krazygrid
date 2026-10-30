import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ShapeKind } from '../core/engine/types';

/** Silhouette SVG d'une forme, colorée via la variable CSS `--shape`. */
@Component({
  selector: 'app-shape-glyph',
  template: `
    <svg viewBox="0 0 100 100" aria-hidden="true" [class]="'glyph shape-' + kind()">
      @switch (kind()) {
        @case ('square') {
          <rect x="17" y="17" width="66" height="66" rx="10" />
        }
        @case ('triangle') {
          <polygon points="50,12 90,84 10,84" stroke-linejoin="round" />
        }
        @case ('circle') {
          <circle cx="50" cy="50" r="35" />
        }
        @case ('diamond') {
          <polygon points="50,8 90,50 50,92 10,50" stroke-linejoin="round" />
        }
        @case ('hexagon') {
          <polygon points="50,10 85,30 85,70 50,90 15,70 15,30" stroke-linejoin="round" />
        }
      }
    </svg>
  `,
  host: { class: 'shape-glyph' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShapeGlyphComponent {
  readonly kind = input.required<ShapeKind>();
}
