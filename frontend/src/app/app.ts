import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GamePageComponent } from './features/game/game-page/game-page.component';

@Component({
  selector: 'app-root',
  imports: [GamePageComponent],
  template: '<app-game-page />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
