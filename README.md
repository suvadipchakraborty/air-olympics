# Air Olympics — The Smog Games

A client-side, no-build web app that turns daily PM2.5 readings for 100 global cities into a dystopian sports league: sprints, marathons, relays, an anti-medal in weightlifting, and a head-to-head Compare tool.

## Files

```
index.html          Page shell, markup, meta tags, three tabs (Home / Compare / About)
css/styles.css       "Athletic Dystopia" theme
js/data.js           CSV fetch + parsing + event scoring logic
js/app.js            Rendering, interactivity, D3 sparklines, tab + compare logic
assets/preview.jpg   Placeholder social-share image (swap for your own)
```

No build step, no `node_modules`, no framework. Just static files.

## Structure

The page is a single HTML document split into three tab panels, switched client-side (no reloads, no routing needed on your host):

- **Home** — hero, event-aware podium (top 3 update to match whichever event is selected), event switcher, and the leaderboard.
- **Compare** — pick any two cities and see every metric (sprint, marathon, relay, both year-over-year deltas, personal best, historical peak) lined up side by side, with a computed head-to-head winner.
- **About** — the explainer content (what PM2.5 is, how each event is scored, data source, refresh cadence). Plain in-page content now, not a popup.

The athlete profile (opened by tapping any city) is still a modal, since it's a quick detail lookup rather than a page.

## Data source

Pulls a published Google Sheet CSV (via `js/data.js` → `AIR_OLYMPICS_CSV_URL`) with PapaParse. Expected columns per row:

```
Date, City, Country, Continent, Yesterday (Base),
Day -1 … Day -7, Month -1 … Month -11, Year -1, Year -2
```

The sheet is append-only (one row per city per run date); the app automatically keeps only the most recent row per city. Scale from the 5-city sample in the attached Apps Script to your full 100-city list by adding more entries to the `cities` array there — no app code changes are needed as long as column names stay identical.

## Events logic (in `js/data.js`)

- **100m Sprint** — sorts on `Yesterday (Base)` ascending.
- **Marathon** — mean of `Yesterday (Base)` through `Day -6` (7-day window), ascending.
- **Relay** — `Month -1` minus `Yesterday (Base)`; biggest positive drop wins.
- **Weightlifting** — max value across every historical column per city; highest "wins" the anti-medal.

## Deploying to Cloudflare Pages

1. Push this folder's contents to a GitHub repo (drag-and-drop upload works fine — no build tooling required).
2. In Cloudflare Pages, create a project from that repo.
3. Build command: leave blank. Build output directory: `/` (repo root).
4. Deploy. Every push to the connected branch redeploys automatically.

## Before going live

- Replace `assets/preview.jpg` with a real share-card image (1200×630 recommended) — the placeholder here is theme-matched but generic.
- Double-check the CSV URL in `js/data.js` still points at your published sheet (Google's "Publish to web" links can change if you republish under a new sheet/tab).
- Live at https://air-olympics.suvadipchakraborty.workers.dev/ — `og:url`, canonical link, and the OG/Twitter image tags in `index.html` are already pointed at this domain. If the domain ever changes, update those in one pass.
