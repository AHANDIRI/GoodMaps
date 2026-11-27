# GoodMaps

Application web permettant de trouver des activités et lieux accessibles (PMR, sensoriel, cognitif, etc.) autour de soi ou dans n'importe quelle ville.

## Fonctionnalités principales

- **Profil d'accessibilité & préférences** : choix du profil (handicap moteur, sensoriel, mental, psychique, cognitif, multi-handicap, sans handicap) et préférences d'activités sauvegardés localement.
- **Carte interactive (Leaflet + OpenStreetMap)** : fonctionne directement sans clé API payante.
- **Recherche par ville/adresse** : géocodage gratuit via Nominatim OpenStreetMap.
- **Suggestions d'activités adaptées** : via le backend Express (`/api/suggestions`, utilisant OpenAI si `VITE_OPENAI_API_KEY` est définie, sinon l'API OpenStreetMap Overpass) avec repli automatique côté client.
- **Filtres, distance, favoris et itinéraire** : filtrage par catégorie et mot-clé, calcul de distance, sauvegarde des favoris (`localStorage`), lien itinéraire et contacts.

## Installation et lancement en local

```bash
git clone https://github.com/AHANDIRI/GoodMaps.git
cd GoodMaps
npm install
```

### Lancer le frontend + l'API (recommandé)

```bash
npm run dev:all
```

- Application web : `http://localhost:5173/`
- Serveur API Express : `http://localhost:3002`

*(Optionnel)* Créer un fichier `.env` à la racine avec `VITE_OPENAI_API_KEY=...` pour activer les suggestions via OpenAI ; sans clé, l'application utilise automatiquement OpenStreetMap (Overpass API).

### Build de production

```bash
npm run build
npm run lint
```
