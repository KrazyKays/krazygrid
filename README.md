# Mini-roguelike (MVP)

Le joueur lance des sorts (ligne, croix, carré) sur une grille 8×8 de billes.

- **Or** : +1 trésor et +10 argent.
- **Bombe** : -1 vie.
- Atteindre l'objectif de trésors d'un niveau avant la fin des tours permet de passer au niveau suivant.

## Architecture

- `frontend/` : Angular, entièrement autonome. Le moteur TypeScript (`src/app/core/engine/game-engine.ts`) porte les règles et le store (`core/game/game-store.service.ts`) gère l'état de partie.

## Lancement

Frontend (depuis `frontend/`) :

```powershell
npm install
npx ng serve
```

Le frontend tourne sur http://localhost:4200.

## Tests

```powershell
cd frontend; npx ng test --watch=false
```

## Hors MVP

Billes bleues, sorts spéciaux à usage unique, progression d'argent entre niveaux.
