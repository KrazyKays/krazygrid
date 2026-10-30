# KrazyGrid

Roguelite / casse-tête : une escouade de formes géométriques ramasse des pièces sur une grille.

## Règles

- **Objectif** : atteindre le quota de pièces de l'étage avant d'épuiser ses coups. L'étage se termine dès que le quota est atteint.
- **Formes** : chacune bouge à sa façon et ramasse tout ce qu'elle traverse.
  - Carré : glisse orthogonalement jusqu'à un obstacle.
  - Triangle : glisse en diagonale jusqu'à un obstacle.
  - Cercle : saute exactement 2 cases (par-dessus les murs).
  - Losange : bondit en L.
  - Hexagone : avance d'une case et aspire les objets des 8 cases voisines.
- **Obstacles** : murs, blocs fragiles (se brisent quand on les percute), pics (-1 PV au passage), sentinelles (avancent après chaque coup, blessent au contact ; la case rouge annonce leur prochaine position).
- **Coffres** : choix d'1 avantage parmi 3 pour la suite de la run (relances possibles, ou ignorer contre des éclats).
- **Échec** : plus de coups = -1 PV et on retente le **même** étage. À 0 PV, la run s'arrête.
- **Run** : 9 étages, dont 3 gardiens (3, 6, 9) plus serrés avec un coffre rare.

Chaque étage est généré de façon déterministe à partir de la graine de la run : le générateur joue une séquence de coups sans dégâts et sème les pièces sur ce trajet, ce qui garantit qu'une solution existe dans le budget de coups.

## Progression entre les runs

- **Éclats** gagnés à chaque étage (coups restants, surplus, multiplicateur d'ascension), conservés même en cas de défaite.
- **Atelier** : PV, coups, annulations, marteau, relances, coffre de départ, avantages épiques, nouvelles formes.
- **Ascensions 1 à 5** : débloquées en gagnant au niveau précédent, chacune ajoute une contrainte et augmente les gains.
- **Défi du jour** : graine commune, sans bonus d'Atelier.

La progression est sauvegardée dans le `localStorage` du navigateur.

## Architecture (`frontend/`, Angular)

- `src/app/core/engine/` : moteur pur et testé — `board.ts` (déplacements, ramassage, sentinelles), `generator.ts` (étages), `perks.ts` (avantages), `run.ts` (déroulé d'une run), `rng.ts`.
- `src/app/core/meta/` : méta-progression (`meta.ts`) et sa persistance (`meta-store.service.ts`).
- `src/app/core/game/run-store.service.ts` : état de la run en signaux.
- `src/app/features/hub/` (accueil + Atelier) et `src/app/features/run/` (plateau, HUD, coffres).

## Lancement

```powershell
cd frontend
npm install
npx ng serve
```

Puis http://localhost:4200. Raccourcis : `1`-`5` choisir une forme, `Tab` forme suivante, `Z` annuler, `H` marteau, `Entrée` continuer.

## Tests

```powershell
cd frontend; npx ng test --watch=false
```
