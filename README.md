# Air Olympics — The Smog Games

A client-side, no-build web app that turns daily PM2.5 readings for 100 global cities into a dystopian sports league: sprints, marathons, relays, and an anti-medal in weightlifting.

## Files

```
index.html          Page shell, markup, meta tags
css/styles.css       "Athletic Dystopia" theme
js/data.js           CSV fetch + parsing + event scoring logic
js/app.js            Rendering, interactivity, D3 sparklines, ticker
assets/preview.jpg   Placeholder social-share image (swap for your own)
```

No build step, no `node_modules`, no framework. Just static files.

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
- Update the `og:url`/canonical link once you have your final Cloudflare Pages domain, if you want exact-match previews.
