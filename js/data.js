/* ============================================================
   Air Olympics — data.js
   Fetches the published Google Sheet CSV, parses it, and turns
   it into everything the UI needs: leaderboards, podiums,
   athlete profiles, and commentary fodder.
   ============================================================ */

const AIR_OLYMPICS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTN60HYkIZZKRoBjTygBEcVSL3JXhjEa-2sEyCx9asRBbOJpSaqIMvVIiul_Mq6xKKWFrbrFvJl7lws/pub?gid=0&single=true&output=csv";

// Ordered list of the historical columns, oldest logic kept identical
// to the sheet: Yesterday (Base), Day -1..-7, Month -1..-11, Year -1..-2
const DAY_COLUMNS = ["Yesterday (Base)", "Day -1", "Day -2", "Day -3", "Day -4", "Day -5", "Day -6", "Day -7"];
const MONTH_COLUMNS = Array.from({ length: 11 }, (_, i) => `Month -${i + 1}`);
const YEAR_COLUMNS = ["Year -1", "Year -2"];
const ALL_HISTORY_COLUMNS = [...DAY_COLUMNS, ...MONTH_COLUMNS, ...YEAR_COLUMNS];

const AirOlympicsData = {
  raw: [],       // parsed CSV rows, one per city (latest run date only)
  cities: [],    // normalized city objects
  runDate: null,

  /**
   * Fetch + parse the CSV, normalize numbers, and de-duplicate to the
   * most recent run date per city (the sheet is append-only).
   */
  async load() {
    const csvText = await this._fetchCsv(AIR_OLYMPICS_CSV_URL);
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    if (parsed.errors && parsed.errors.length) {
      console.warn("Air Olympics: CSV parse warnings", parsed.errors.slice(0, 3));
    }

    this.raw = parsed.data;
    this.cities = this._normalize(this.raw);
    return this.cities;
  },

  async _fetchCsv(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    return res.text();
  },

  _toNumber(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (s === "" || s.toUpperCase() === "N/A" || s.toUpperCase() === "NA") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  },

  /**
   * Collapse raw rows to one entry per city (keep the most recent Date),
   * and coerce every historical column to a number (or null).
   */
  _normalize(rows) {
    const byCity = new Map();

    rows.forEach((row) => {
      const city = (row["City"] || "").trim();
      if (!city) return;
      const dateStr = (row["Date"] || "").trim();
      const existing = byCity.get(city);
      if (existing && existing.date >= dateStr) return; // keep latest only

      const history = {};
      ALL_HISTORY_COLUMNS.forEach((col) => {
        history[col] = this._toNumber(row[col]);
      });

      byCity.set(city, {
        id: city.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        city,
        country: (row["Country"] || "").trim(),
        continent: (row["Continent"] || "").trim(),
        date: dateStr,
        history
      });
    });

    const list = Array.from(byCity.values());
    if (list.length) this.runDate = list[0].date;

    // Derived stats used everywhere else
    list.forEach((c) => {
      const dayVals = DAY_COLUMNS.map((k) => c.history[k]).filter((v) => v !== null);
      const allVals = ALL_HISTORY_COLUMNS.map((k) => c.history[k]).filter((v) => v !== null);

      c.current = c.history["Yesterday (Base)"];
      c.weekAvg = dayVals.length ? dayVals.reduce((a, b) => a + b, 0) / dayVals.length : null;
      c.personalBest = allVals.length ? Math.min(...allVals) : null;
      c.historicalPeak = allVals.length ? Math.max(...allVals) : null;
      c.monthDelta =
        c.history["Month -1"] !== null && c.current !== null
          ? c.history["Month -1"] - c.current
          : null;
      c.yearDelta =
        c.history["Year -1"] !== null && c.current !== null
          ? c.history["Year -1"] - c.current
          : null;
      c.year2Delta =
        c.history["Year -2"] !== null && c.current !== null
          ? c.history["Year -2"] - c.current
          : null;
      c.sparkline = DAY_COLUMNS.slice().reverse().map((k) => c.history[k]); // oldest -> newest
    });

    return list;
  },

  /** Global average of "Yesterday (Base)" across all cities with data. */
  globalAverage() {
    const vals = this.cities.map((c) => c.current).filter((v) => v !== null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },

  /**
   * Rankings for each event, lowest value = best, EXCEPT weightlifting
   * where highest = "wins" the anti-medal.
   * Returns array of { city, value } sorted best-first, nulls excluded.
   */
  rankings(eventKey) {
    const valueFns = {
      sprint: (c) => c.current,
      marathon: (c) => c.weekAvg,
      relay: (c) => c.monthDelta,
      weightlifting: (c) => c.historicalPeak
    };
    const fn = valueFns[eventKey];
    if (!fn) return [];

    const rows = this.cities
      .map((c) => ({ city: c, value: fn(c) }))
      .filter((r) => r.value !== null && Number.isFinite(r.value));

    if (eventKey === "relay") {
      // Biggest positive drop wins; ties/negatives sort naturally to the bottom
      rows.sort((a, b) => b.value - a.value);
    } else if (eventKey === "weightlifting") {
      rows.sort((a, b) => b.value - a.value); // highest peak "wins" the anti-medal
    } else {
      rows.sort((a, b) => a.value - b.value); // lowest wins
    }
    return rows;
  },

  continents() {
    return Array.from(new Set(this.cities.map((c) => c.continent).filter(Boolean))).sort();
  },

  getCity(id) {
    return this.cities.find((c) => c.id === id);
  }
};

/* ============================================================
   Commentary engine — used only to describe an athlete's current
   form on their profile card (the scrolling ticker was removed).
   ============================================================ */

const CommentaryEngine = {
  bandLabel(v) {
    if (v === null) return "unranked";
    if (v <= 12) return "elite";
    if (v <= 35) return "solid";
    if (v <= 55) return "shaky";
    if (v <= 90) return "rough";
    if (v <= 150) return "brutal";
    return "apocalyptic";
  }
};
