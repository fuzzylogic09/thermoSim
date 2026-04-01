# ThermoSim 2D

Simulateur de thermique 2D par différences finies (Navier-Stokes incompressible + diffusion/advection thermique avec flottabilité de Boussinesq).

## Structure des fichiers

```
thermosim/
├── index.html              ← Interface principale
├── css/
│   └── style.css           ← Design system ALS (thème dark/light, tokens CSS)
├── js/
│   ├── geo.js              ← Système d'objets géométriques (source de vérité)
│   ├── sim.js              ← Solveur Navier-Stokes + chaleur
│   ├── renderer.js         ← Rendu canvas, colormap, règles
│   ├── probes.js           ← Sondes T(t) et graphique temps réel
│   ├── ui.js               ← Panneaux, onglets, sliders, modals
│   ├── saveload.js         ← Sauvegarde/chargement JSON + exemples
│   └── main.js             ← Boucle principale, saisie, presets
└── examples/
    ├── index.json          ← Liste des exemples (chargée au démarrage)
    ├── 00_benard_cells.json
    ├── 01_chimney.json
    ├── 02_room_radiator.json
    ├── 03_hot_pipe.json
    ├── 04_cpu_cooling.json
    ├── 05_diffusion_pure.json
    ├── 06_rayleigh_benard_intense.json
    └── 07_lid_driven.json
```

## Architecture clé : géométrie découplée du maillage

La géométrie est définie par des **objets** (ex: `{ name: "Radiateur", type: "hot", shape: "rect", x0: 0.2, y0: 0, x1: 1.2, y1: 0.15 }`), stockés en coordonnées physiques réelles (mètres). 

Lors du lancement ou d'un changement de domaine, `rasterizeGeoObjects()` convertit ces objets en cellules de la grille. Cela permet de :
- Changer la résolution du maillage (Nx×Ny) **sans retoucher la géométrie**
- Éditer les objets précisément (position, taille en mètres)
- Sauvegarder/charger la scène complète en JSON

## Format JSON de sauvegarde

```json
{
  "version": 3,
  "domain": { "Lx": 5, "Ly": 3, "Nx": 96, "Ny": 48 },
  "boundary_conditions": { "top": "wall", "bottom": "wall", "left": "wall", "right": "wall" },
  "physics": { "visc": 1.5e-5, "diff": 2.1e-5, "beta": 3.4e-3, "gravity": 9.81,
               "T_amb": 20, "T_hot": 80, "T_cold": 0, "fan_speed": 2.0 },
  "numerics": { "cfl": 0.5, "spf": 2, "iter": 20, "sim_speed": 1.0 },
  "geometry_objects": [
    { "id": 1, "name": "Radiateur", "type": "hot", "shape": "rect",
      "x0": 0.2, "y0": 0, "x1": 1.2, "y1": 0.15, "radius": null,
      "visible": true, "props": { "temperature": 60 } }
  ],
  "probes": [
    { "id": 1, "label": "S1", "color": "#f0e040", "x": 3.0, "y": 1.5 }
  ]
}
```

## Ajouter un exemple

1. Créer un fichier JSON dans `examples/` (voir format ci-dessus)
2. L'ajouter dans `examples/index.json` :
   ```json
   { "file": "mon_cas.json", "label": "🔥 Mon cas physique" }
   ```
3. Il apparaît automatiquement dans la liste déroulante au chargement

## Types d'objets disponibles

| Type        | Description                        |
|-------------|----------------------------------- |
| `wall`      | Mur CFD adiabatique (bloque flux)  |
| `hot`       | Source à température imposée haute |
| `cold`      | Source à température imposée basse |
| `fan_right` | Ventilateur → (vitesse imposée)    |
| `fan_left`  | Ventilateur ←                      |
| `fan_up`    | Ventilateur ↑                      |
| `fan_down`  | Ventilateur ↓                      |

## Formes disponibles

| Forme    | Description                                      |
|----------|--------------------------------------------------|
| `rect`   | Rectangle (x0,y0)→(x1,y1)                        |
| `circle` | Cercle centré sur la boîte englobante, rayon `radius` |
| `hline`  | Ligne horizontale fine                           |
| `vline`  | Ligne verticale fine                             |

## Déploiement GitHub Pages

```yaml
# .github/workflows/pages.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/configure-pages@v3
      - uses: actions/upload-pages-artifact@v2
        with:
          path: '.'
      - uses: actions/deploy-pages@v2
```

Les fichiers JSON sont chargés avec `?v=Date.now()` pour contourner le cache GitHub Pages.

## Ordre de chargement des scripts

```
geo.js       → définit C_*, GEO_TYPES, objets géométriques
sim.js       → définit solveur, tableaux U/V/T, P, BC
renderer.js  → définit canvas, getGeo(), fmtM(), fmtTime(), render()
probes.js    → définit sondes, graphique T(t)
ui.js        → définit panneaux, sliders, modals
saveload.js  → définit save/load/exemples
main.js      → définit boucle, input, presets, init
```
