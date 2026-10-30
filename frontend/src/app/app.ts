import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RunStore } from './core/game/run-store.service';
import { HubPageComponent } from './features/hub/hub-page.component';
import { RunPageComponent } from './features/run/run-page.component';

@Component({
  selector: 'app-root',
  imports: [HubPageComponent, RunPageComponent],
  template: `
    @if (runs.run()) {
      <app-run-page />
    } @else {
      <app-hub-page />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly runs = inject(RunStore);
}
