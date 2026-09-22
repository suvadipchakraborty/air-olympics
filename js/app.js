/* ============================================================
   Air Olympics — app.js
   Wires AirOlympicsData + CommentaryEngine to the DOM.
   ============================================================ */

const EVENT_META = {
  sprint: {
    title: "The 100m Sprint",
    short: "100m Sprint",
    explainer: "Ranked on yesterday's PM2.5 reading alone. No averages to hide behind — this is who showed up clean yesterday.",
    colLabel: "Yesterday",
    unit: "µg/m³",
    format: (v) => v.toFixed(1)
  },
  marathon: {
    title: "The Marathon",
    short: "Marathon",
    explainer: "Ranked on the 7-day rolling average. One bad morning won't cost you this one — but a bad week will.",
    colLabel: "7-day avg",
    unit: "µg/m³",
    format: (v) => v.toFixed(1)
  },
  relay: {
    title: "The Relay",
    short: "Relay",
    explainer: "Ranked on improvement since last month (Month -1 minus yesterday). The biggest drop in pollution takes gold.",
    colLabel: "Improvement",
    unit: "µg/m³ better",
    format: (v) => (v >= 0 ? `−${v.toFixed(1)}` : `+${Math.abs(v).toFixed(1)}`)
  },
  weightlifting: {
    title: "Weightlifting",
    short: "Weightlifting",
    explainer: "The anti-medal. Ranked on each city's worst PM2.5 reading anywhere in its history. Nobody trains for this podium.",
    colLabel: "Historic peak",
    unit: "µg/m³",
    format: (v) => v.toFixed(0)
  }
};

// Metrics shown in the Compare tab. "better" tells the comparator which
// direction wins: lower value wins, or higher value wins (deltas, where
// a bigger positive number means more improvement).
const COMPARE_METRICS = [
  { key: "current", label: "Yesterday (Sprint)", unit: "µg/m³", better: "lower", format: (v) => v.toFixed(1) },
  { key: "weekAvg", label: "7-day average (Marathon)", unit: "µg/m³", better: "lower", format: (v) => v.toFixed(1) },
  { key: "monthDelta", label: "Monthly improvement (Relay)", unit: "µg/m³", better: "higher", format: (v) => v.toFixed(1) },
  { key: "yearDelta", label: "Change vs. last year", unit: "µg/m³", better: "higher", format: (v) => v.toFixed(1) },
  { key: "year2Delta", label: "Change vs. two years ago", unit: "µg/m³", better: "higher", format: (v) => v.toFixed(1) },
  { key: "personalBest", label: "Personal best", unit: "µg/m³", better: "lower", format: (v) => v.toFixed(1) },
  { key: "historicalPeak", label: "Historical peak (Weightlifting)", unit: "µg/m³", better: "lower", format: (v) => v.toFixed(0) }
];

const state = {
  tab: "home",
  event: "sprint",
  search: "",
  continent: "all"
};

/* ---------------------- Boot ---------------------- */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  spawnParticulates();
  wireStaticUI();

  try {
    await AirOlympicsData.load();
  } catch (err) {
    console.error(err);
    showLoadError();
    return;
  }

  populateContinentFilter();
  populateCompareSelectors();
  renderGlobalReadout();
  renderPodium(state.event);
  renderLeaderboard();
}

function showLoadError() {
  const body = document.getElementById("leaderboardBody");
  body.innerHTML = `<tr><td colspan="3" class="loading-row">Couldn't reach the results feed. The scoreboard operator has been notified. Try refreshing in a moment.</td></tr>`;
  document.getElementById("podiumLoading").textContent = "Results feed unavailable.";
}

/* ---------------------- Tabs ---------------------- */

function wireStaticUI() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  document.getElementById("eventsNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".event-tab");
    if (!btn) return;
    document.querySelectorAll(".event-tab").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.event = btn.dataset.event;
    renderLeaderboard();
    renderPodium(state.event);
  });

  document.getElementById("citySearch").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderLeaderboard();
  });

  document.getElementById("continentFilter").addEventListener("change", (e) => {
    state.continent = e.target.value;
    renderLeaderboard();
  });

  document.getElementById("athleteModalClose").addEventListener("click", () => toggleAthleteModal(false));
  document.getElementById("athleteModal").addEventListener("click", (e) => {
    if (e.target.id === "athleteModal") toggleAthleteModal(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleAthleteModal(false);
  });

  document.getElementById("shareBtn").addEventListener("click", handleShare);

  document.getElementById("compareCityA").addEventListener("change", renderComparison);
  document.getElementById("compareCityB").addEventListener("change", renderComparison);
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  document.getElementById("panel-home").hidden = tab !== "home";
  document.getElementById("panel-compare").hidden = tab !== "compare";
  document.getElementById("panel-about").hidden = tab !== "about";
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------------------- Global readout ---------------------- */

function renderGlobalReadout() {
  const avg = AirOlympicsData.globalAverage();
  const el = document.getElementById("globalAvgValue");
  el.textContent = avg !== null ? avg.toFixed(1) : "—";
  const readout = document.getElementById("globalReadout");
  readout.classList.toggle("readout-bad", avg !== null && avg > 55);
  readout.classList.toggle("readout-good", avg !== null && avg <= 20);
}

/* ---------------------- Podium ---------------------- */

function renderPodium(eventKey) {
  const meta = EVENT_META[eventKey];
  const top3 = AirOlympicsData.rankings(eventKey).slice(0, 3);
  const wrap = document.getElementById("podiumWrap");

  document.getElementById("podiumEventLabel").textContent = `${meta.short} · Top 3`;
  wrap.setAttribute("aria-label", `Top 3 cities, ${meta.title}`);

  if (!top3.length) {
    wrap.innerHTML = `<div class="podium-loading">No qualifying results yet.</div>`;
    return;
  }

  // Order for visual podium: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = { 0: 132, 1: 176, 2: 100 };
  const placeLabel = (rank) => (rank === 0 ? "GOLD" : rank === 1 ? "SILVER" : "BRONZE");

  wrap.innerHTML = "";
  order.forEach((entry) => {
    const rank = top3.indexOf(entry);
    const step = document.createElement("button");
    step.className = `podium-step podium-step--${rank}`;
    step.style.setProperty("--step-h", `${heights[rank]}px`);
    step.setAttribute("aria-label", `${entry.city.city}, ${placeLabel(rank)}, ${meta.format(entry.value)} ${meta.unit}`);
    step.innerHTML = `
      <div class="podium-medal">${placeLabel(rank)}</div>
      <div class="podium-city">${escapeHtml(entry.city.city)}</div>
      <div class="podium-country">${escapeHtml(entry.city.country)}</div>
      <div class="podium-value">${meta.format(entry.value)} <span>${meta.unit}</span></div>
      <div class="podium-riser"></div>
    `;
    step.addEventListener("click", () => openAthleteModal(entry.city.id));
    wrap.appendChild(step);
  });
}

/* ---------------------- Continent filter ---------------------- */

function populateContinentFilter() {
  const select = document.getElementById("continentFilter");
  AirOlympicsData.continents().forEach((cont) => {
    const opt = document.createElement("option");
    opt.value = cont;
    opt.textContent = cont;
    select.appendChild(opt);
  });
}

/* ---------------------- Leaderboard ---------------------- */

function renderLeaderboard() {
  const meta = EVENT_META[state.event];
  document.getElementById("eventTitle").textContent = meta.title;
  document.getElementById("eventExplainer").textContent = meta.explainer;
  document.getElementById("colValueLabel").textContent = meta.colLabel;

  let rows = AirOlympicsData.rankings(state.event);

  if (state.continent !== "all") {
    rows = rows.filter((r) => r.city.continent === state.continent);
  }
  if (state.search) {
    rows = rows.filter(
      (r) =>
        r.city.city.toLowerCase().includes(state.search) ||
        r.city.country.toLowerCase().includes(state.search)
    );
  }

  const body = document.getElementById("leaderboardBody");
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3" class="loading-row">No cities match that search.</td></tr>`;
    return;
  }

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.className = "leaderboard-row";
    if (i === 0) tr.classList.add("rank-gold");
    else if (i === 1) tr.classList.add("rank-silver");
    else if (i === 2) tr.classList.add("rank-bronze");

    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td class="col-city">
        <span class="city-name">${escapeHtml(r.city.city)}</span>
        <span class="city-country">${escapeHtml(r.city.country)}</span>
      </td>
      <td class="col-value">${meta.format(r.value)}<span class="unit">${meta.unit}</span></td>
    `;
    tr.addEventListener("click", () => openAthleteModal(r.city.id));
    body.appendChild(tr);
  });
}

/* ---------------------- Athlete modal ---------------------- */

function openAthleteModal(cityId) {
  const c = AirOlympicsData.getCity(cityId);
  if (!c) return;

  document.getElementById("athleteModalTitle").textContent = c.city;
  document.getElementById("athleteCountry").textContent = c.country;
  document.getElementById("athleteCurrentValue").textContent = c.current !== null ? c.current.toFixed(1) : "—";
  document.getElementById("athletePB").textContent = c.personalBest !== null ? `${c.personalBest.toFixed(1)} µg/m³` : "—";
  document.getElementById("athletePeak").textContent = c.historicalPeak !== null ? `${c.historicalPeak.toFixed(1)} µg/m³` : "—";
  document.getElementById("athleteWeekAvg").textContent = c.weekAvg !== null ? `${c.weekAvg.toFixed(1)} µg/m³` : "—";
  document.getElementById("athleteMonthDelta").textContent = formatDelta(c.monthDelta);
  document.getElementById("athleteYearDelta").textContent = formatDelta(c.yearDelta);
  document.getElementById("athleteYear2Delta").textContent = formatDelta(c.year2Delta);
  document.getElementById("athleteCommentary").textContent = athleteBlurb(c);

  drawSparkline(c.sparkline);
  toggleAthleteModal(true);
}

function formatDelta(v) {
  if (v === null) return "—";
  if (Math.abs(v) < 0.5) return "flat";
  return v > 0 ? `▼ ${v.toFixed(1)} cleaner` : `▲ ${Math.abs(v).toFixed(1)} dirtier`;
}

function athleteBlurb(c) {
  const band = CommentaryEngine.bandLabel(c.current);
  const byBand = {
    elite: `${c.city} is in career-best form — yesterday's air belongs in a highlight reel.`,
    solid: `${c.city} turns in a steady, unremarkable performance. No records, no disasters.`,
    shaky: `${c.city} is drifting into uncomfortable territory. Coaching staff are reviewing the tape.`,
    rough: `${c.city} is having a difficult stretch. This is not the form that wins medals.`,
    brutal: `${c.city} is deep in the danger zone. Spectators are advised to bring masks, not flags.`,
    apocalyptic: `${c.city} is redefining the bottom of the leaderboard. This is a five-alarm performance.`,
    unranked: `${c.city} has no current reading on file.`
  };
  return byBand[band] || byBand.unranked;
}

function drawSparkline(values) {
  const svg = d3.select("#athleteSparkline");
  svg.selectAll("*").remove();

  const points = values
    .map((v, i) => ({ i, v }))
    .filter((p) => p.v !== null);
  if (points.length < 2) {
    svg.append("text")
      .attr("x", 300).attr("y", 90)
      .attr("text-anchor", "middle")
      .attr("class", "sparkline-empty")
      .text("Not enough data for a trend line yet");
    return;
  }

  const width = 600, height = 180, padding = 16;
  const x = d3.scaleLinear().domain([0, values.length - 1]).range([padding, width - padding]);
  const vals = points.map((p) => p.v);
  const y = d3
    .scaleLinear()
    .domain([Math.min(...vals) * 0.9, Math.max(...vals) * 1.1])
    .range([height - padding, padding]);

  const line = d3.line().x((p) => x(p.i)).y((p) => y(p.v)).curve(d3.curveMonotoneX);
  const area = d3
    .area()
    .x((p) => x(p.i))
    .y0(height - padding)
    .y1((p) => y(p.v))
    .curve(d3.curveMonotoneX);

  svg.append("path").datum(points).attr("d", area).attr("class", "sparkline-area");
  svg.append("path").datum(points).attr("d", line).attr("class", "sparkline-line");

  svg
    .selectAll(".sparkline-dot")
    .data(points)
    .enter()
    .append("circle")
    .attr("class", "sparkline-dot")
    .attr("cx", (p) => x(p.i))
    .attr("cy", (p) => y(p.v))
    .attr("r", 3.5);

  const last = points[points.length - 1];
  svg.append("circle")
    .attr("class", "sparkline-dot sparkline-dot--current")
    .attr("cx", x(last.i))
    .attr("cy", y(last.v))
    .attr("r", 6);
}

function toggleAthleteModal(show) {
  const el = document.getElementById("athleteModal");
  el.hidden = !show;
  document.body.classList.toggle("modal-open", show);
}

/* ---------------------- Compare tab ---------------------- */

function populateCompareSelectors() {
  const sorted = AirOlympicsData.cities.slice().sort((a, b) => a.city.localeCompare(b.city));
  const selA = document.getElementById("compareCityA");
  const selB = document.getElementById("compareCityB");

  sorted.forEach((c) => {
    const label = `${c.city}, ${c.country}`;
    const optA = document.createElement("option");
    optA.value = c.id;
    optA.textContent = label;
    selA.appendChild(optA);

    const optB = document.createElement("option");
    optB.value = c.id;
    optB.textContent = label;
    selB.appendChild(optB);
  });
}

function renderComparison() {
  const idA = document.getElementById("compareCityA").value;
  const idB = document.getElementById("compareCityB").value;
  const table = document.getElementById("compareTable");
  const empty = document.getElementById("compareEmpty");
  const summary = document.getElementById("compareSummary");

  if (!idA || !idB || idA === idB) {
    table.hidden = true;
    summary.hidden = true;
    empty.hidden = false;
    empty.textContent = idA && idA === idB
      ? "Pick two different cities to compare."
      : "Choose two different cities above to start the head-to-head.";
    return;
  }

  const cityA = AirOlympicsData.getCity(idA);
  const cityB = AirOlympicsData.getCity(idB);
  empty.hidden = true;
  table.hidden = false;
  summary.hidden = false;

  document.getElementById("cmpNameA").innerHTML = `${escapeHtml(cityA.city)}<span>${escapeHtml(cityA.country)}</span>`;
  document.getElementById("cmpNameB").innerHTML = `${escapeHtml(cityB.city)}<span>${escapeHtml(cityB.country)}</span>`;

  let winsA = 0, winsB = 0;
  const body = document.getElementById("compareBody");
  body.innerHTML = "";

  COMPARE_METRICS.forEach((metric) => {
    const vA = cityA[metric.key];
    const vB = cityB[metric.key];
    let aWins = false, bWins = false;

    if (vA !== null && vB !== null && Math.abs(vA - vB) > 0.05) {
      if (metric.better === "lower") {
        aWins = vA < vB;
        bWins = vB < vA;
      } else {
        aWins = vA > vB;
        bWins = vB > vA;
      }
    }
    if (aWins) winsA++;
    if (bWins) winsB++;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cmp-metric">${metric.label}</td>
      <td class="cmp-val ${aWins ? "cmp-win" : ""}">${formatCompareValue(vA, metric)}</td>
      <td class="cmp-val ${bWins ? "cmp-win" : ""}">${formatCompareValue(vB, metric)}</td>
    `;
    body.appendChild(tr);
  });

  if (winsA === winsB) {
    summary.innerHTML = `It's a dead heat — <strong>${escapeHtml(cityA.city)}</strong> and <strong>${escapeHtml(cityB.city)}</strong> split the metrics ${winsA}–${winsB}.`;
  } else {
    const winner = winsA > winsB ? cityA : cityB;
    const loser = winsA > winsB ? cityB : cityA;
    const score = winsA > winsB ? `${winsA}–${winsB}` : `${winsB}–${winsA}`;
    summary.innerHTML = `🏆 <strong>${escapeHtml(winner.city)}</strong> takes the head-to-head over ${escapeHtml(loser.city)}, ${score}.`;
  }
}

function formatCompareValue(v, metric) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const formatted = metric.format(v);
  return `${formatted} <span class="unit">${metric.unit}</span>`;
}

/* ---------------------- Share ---------------------- */

async function handleShare() {
  const shareData = {
    title: "Air Olympics — The Smog Games",
    text: "100 cities compete for gold in the world's least breathable sport.",
    url: window.location.href
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      /* user cancelled — no-op */
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(shareData.url);
    const btn = document.getElementById("shareBtn");
    btn.classList.add("share-copied");
    setTimeout(() => btn.classList.remove("share-copied"), 1800);
  }
}

/* ---------------------- Ambient particulate layer ---------------------- */

function spawnParticulates() {
  const layer = document.getElementById("particulateLayer");
  const count = window.innerWidth < 600 ? 18 : 34;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const size = 1 + Math.random() * 2.5;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${18 + Math.random() * 24}s`;
    p.style.animationDelay = `-${Math.random() * 30}s`;
    p.style.opacity = (0.15 + Math.random() * 0.35).toFixed(2);
    layer.appendChild(p);
  }
}

/* ---------------------- Utils ---------------------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
