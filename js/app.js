/* ============================================================
   Air Olympics — app.js
   Wires AirOlympicsData + CommentaryEngine to the DOM.
   ============================================================ */

const EVENT_META = {
  sprint: {
    title: "The 100m Sprint",
    explainer: "Ranked on yesterday's PM2.5 reading alone. No averages to hide behind — this is who showed up clean yesterday.",
    colLabel: "Yesterday",
    unit: "µg/m³",
    format: (v) => v.toFixed(1)
  },
  marathon: {
    title: "The Marathon",
    explainer: "Ranked on the 7-day rolling average. One bad morning won't cost you this one — but a bad week will.",
    colLabel: "7-day avg",
    unit: "µg/m³",
    format: (v) => v.toFixed(1)
  },
  relay: {
    title: "The Relay",
    explainer: "Ranked on improvement since last month (Month -1 minus yesterday). The biggest drop in pollution takes gold.",
    colLabel: "Improvement",
    unit: "µg/m³ better",
    format: (v) => (v >= 0 ? `−${v.toFixed(1)}` : `+${Math.abs(v).toFixed(1)}`)
  },
  weightlifting: {
    title: "Weightlifting",
    explainer: "The anti-medal. Ranked on each city's worst PM2.5 reading anywhere in its history. Nobody trains for this podium.",
    colLabel: "Historic peak",
    unit: "µg/m³",
    format: (v) => v.toFixed(0)
  }
};

const state = {
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
  renderGlobalReadout();
  renderPodium();
  renderLeaderboard();
  startTicker();
}

function showLoadError() {
  const body = document.getElementById("leaderboardBody");
  body.innerHTML = `<tr><td colspan="4" class="loading-row">Couldn't reach the results feed. The scoreboard operator has been notified. Try refreshing in a moment.</td></tr>`;
  document.getElementById("podiumLoading").textContent = "Results feed unavailable.";
  document.getElementById("tickerTrack").innerHTML = `<span class="ticker-item">Commentary feed is offline — waiting on the data connection.</span>`;
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

function renderPodium() {
  const top3 = AirOlympicsData.rankings("sprint").slice(0, 3);
  const wrap = document.getElementById("podiumWrap");

  if (!top3.length) {
    wrap.innerHTML = `<div class="podium-loading">No qualifying results yet.</div>`;
    return;
  }

  // Order for visual podium: 2nd, 1st, 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = { 0: 132, 1: 176, 2: 100 }; // matches gold/silver/bronze visual order below
  const placeLabel = (rank) => (rank === 0 ? "GOLD" : rank === 1 ? "SILVER" : "BRONZE");

  wrap.innerHTML = "";
  order.forEach((entry) => {
    const rank = top3.indexOf(entry);
    const step = document.createElement("button");
    step.className = `podium-step podium-step--${rank}`;
    step.style.setProperty("--step-h", `${heights[rank]}px`);
    step.setAttribute("aria-label", `${entry.city.city}, ${placeLabel(rank)}, ${entry.value.toFixed(1)} µg/m³`);
    step.innerHTML = `
      <div class="podium-medal">${placeLabel(rank)}</div>
      <div class="podium-city">${escapeHtml(entry.city.city)}</div>
      <div class="podium-country">${escapeHtml(entry.city.country)}</div>
      <div class="podium-value">${entry.value.toFixed(1)} <span>µg/m³</span></div>
      <div class="podium-riser"></div>
    `;
    step.addEventListener("click", () => openAthleteModal(entry.city.id));
    wrap.appendChild(step);
  });
}

/* ---------------------- Events nav ---------------------- */

function wireStaticUI() {
  document.getElementById("eventsNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".event-tab");
    if (!btn) return;
    document.querySelectorAll(".event-tab").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.event = btn.dataset.event;
    renderLeaderboard();
  });

  document.getElementById("citySearch").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderLeaderboard();
  });

  document.getElementById("continentFilter").addEventListener("change", (e) => {
    state.continent = e.target.value;
    renderLeaderboard();
  });

  document.getElementById("aboutBtn").addEventListener("click", () => toggleModal("aboutModal", true));
  document.getElementById("aboutModalClose").addEventListener("click", () => toggleModal("aboutModal", false));
  document.getElementById("athleteModalClose").addEventListener("click", () => toggleModal("athleteModal", false));

  [document.getElementById("aboutModal"), document.getElementById("athleteModal")].forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) toggleModal(overlay.id, false);
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleModal("aboutModal", false);
      toggleModal("athleteModal", false);
    }
  });

  document.getElementById("shareBtn").addEventListener("click", handleShare);
}

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
    body.innerHTML = `<tr><td colspan="4" class="loading-row">No cities match that search.</td></tr>`;
    return;
  }

  const maxVal = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.className = "leaderboard-row";
    if (i === 0) tr.classList.add("rank-gold");
    else if (i === 1) tr.classList.add("rank-silver");
    else if (i === 2) tr.classList.add("rank-bronze");

    const barPct = Math.max(4, (Math.abs(r.value) / maxVal) * 100);

    tr.innerHTML = `
      <td class="col-rank">${i + 1}</td>
      <td class="col-city">
        <span class="city-name">${escapeHtml(r.city.city)}</span>
        <span class="city-country">${escapeHtml(r.city.country)}</span>
      </td>
      <td class="col-value">${meta.format(r.value)} <span class="unit">${meta.unit}</span></td>
      <td class="col-bar"><div class="bar-track"><div class="bar-fill" style="width:${barPct}%"></div></div></td>
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
  toggleModal("athleteModal", true);
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

  // Highlight the most recent point
  const last = points[points.length - 1];
  svg.append("circle")
    .attr("class", "sparkline-dot sparkline-dot--current")
    .attr("cx", x(last.i))
    .attr("cy", y(last.v))
    .attr("r", 6);
}

/* ---------------------- Modals ---------------------- */

function toggleModal(id, show) {
  const el = document.getElementById(id);
  el.hidden = !show;
  document.body.classList.toggle("modal-open", !document.getElementById("aboutModal").hidden || !document.getElementById("athleteModal").hidden);
}

/* ---------------------- Ticker ---------------------- */

function startTicker() {
  renderTicker();
  // Refresh commentary variety every couple of minutes without refetching data
  setInterval(renderTicker, 120000);
}

function renderTicker() {
  const lines = CommentaryEngine.generate(AirOlympicsData.cities);
  const track = document.getElementById("tickerTrack");
  track.innerHTML = "";
  // Duplicate the line set so the CSS marquee loops seamlessly
  [...lines, ...lines].forEach((line) => {
    const span = document.createElement("span");
    span.className = "ticker-item";
    span.textContent = line;
    track.appendChild(span);
  });
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
    const original = btn.textContent;
    btn.textContent = "Link copied!";
    setTimeout(() => (btn.textContent = original), 1800);
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
