# Mini-roguelike (MVP)

Le joueur lance des sorts (ligne, croix, carré) sur une grille 8×8 de billes.

- **Or** : +1 trésor et +10 argent.
- **Bombe** : -1 vie.
- Atteindre l'objectif de trésors d'un niveau avant la fin des tours permet de passer au niveau suivant.

## Architecture

- `backend/` : FastAPI, moteur de règles pur (`app/game/rules.py`) et routes `/api/game/new` et `/api/game/cast`. Le serveur est sans état : l'état de partie transite par le client.
- `frontend/` : Angular. Le moteur TypeScript (`src/app/core/engine/game-engine.ts`) reprend strictement les règles du backend. Le store (`core/game/game-store.service.ts`) appelle l'API et bascule en mode local si elle est indisponible.

## Lancement

Backend (depuis `backend/`) :

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend (depuis `frontend/`) :

```powershell
npm install
npx ng serve
```

Le frontend tourne sur http://localhost:4200 et proxifie `/api` vers `localhost:8000`. Si l'API est arrêtée, le jeu passe en mode local (badge affiché).

## Tests

```powershell
# Backend
cd backend; ..\.venv\Scripts\python.exe -m pytest

# Frontend
cd frontend; npx ng test --watch=false
```

## Hors MVP

Billes bleues, sorts spéciaux à usage unique, progression d'argent entre niveaux.
