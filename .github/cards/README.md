# README cards

Generates every image in `profile/`. No third-party card services; text is outlined with
Geist (vendored in `assets/fonts`), so the SVGs render the same everywhere.

| Script | Writes | Runs |
|---|---|---|
| `data.mjs` | `data.json`, `geocache.json` — GitHub API, Wakapi, OpenStreetMap (cached) | daily, workflow |
| `cards.mjs` | github, activity, languages, week, rank, stargazers | daily, workflow |
| `badges.mjs` | about-\*, connect-\*, updated | daily, workflow |
| `skills.mjs`, `hero.mjs`, `work.mjs`, `sections.mjs` | skills, hero, work-\*, section-\* | by hand: `npm install && npm run static` |
| `build-world.mjs` | `assets/world-grid.json` | by hand, once |

Each data source falls back to its previous value in `data.json` if it fails.
Coding cards read Wakapi first and WakaTime as the backup (`WAKAPI_API_KEY`, `WAKATIME_API_KEY`);
the all-time total in the About badges reads WakaTime first. The week card needs one of the keys.
