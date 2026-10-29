# README cards

Generates every image in `profile/`. No third-party card services; text is outlined with
Geist (vendored in `assets/fonts`), so the SVGs render the same everywhere.

| Script | Writes | Runs |
|---|---|---|
| `data.mjs` | `data.json`, `geocache.json` — GitHub API, Wakapi, OpenStreetMap (cached) | daily, workflow |
| `cards.mjs` | github, activity, languages, week, rank, stargazers | daily, workflow |
| `badges.mjs` | about-\*, connect-\* | daily, workflow |
| `skills.mjs`, `hero.mjs`, `work.mjs` | skills, hero, work-* | by hand: `npm install && npm run static` |
| `build-world.mjs` | `assets/world-grid.json` | by hand, once |

Each data source falls back to its previous value in `data.json` if it fails.
`WAKAPI_API_KEY` is needed for the day-by-day week card; without it the last week on file is kept.
