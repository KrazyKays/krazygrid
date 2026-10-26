import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CastRequest, CastResponse, GameState, NewGameRequest } from '../models/game.models';

/** Client HTTP de l'API FastAPI. Les chemins sont relatifs : proxy en dev, même origine en prod. */
@Injectable({ providedIn: 'root' })
export class GameApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/game';

  newGame(request: NewGameRequest): Observable<GameState> {
    return this.http.post<GameState>(`${this.baseUrl}/new`, request);
  }

  cast(request: CastRequest): Observable<CastResponse> {
    return this.http.post<CastResponse>(`${this.baseUrl}/cast`, request);
  }
}
