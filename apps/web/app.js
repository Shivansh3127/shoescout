/* ── ShoeScout frontend ────────────────────────────────────────────────────── */

const API_BASE = "";   // same origin — Express serves both API and static files
let priceChart = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const form          = document.getElementById("search-form");
const searchBtn     = document.getElementById("search-btn");
const btnText       = searchBtn.querySelector(".btn-text");
const loading       = document.getElementById("loading");
const errorBanner   = document.getElementById("error-banner");
const results       = document.getElementById("results");
const offersBody    = document.getElementById("offers-body");
const resultsSummary= document.getElementById("results-summary");
const syntheticBanner = document.getElementById("synthetic-banner");

// recommendation refs
const recCard       = document.getElementById("recommendation-card");
const recModel      = document.getElementById("rec-model");
const recPick       = document.getElementById("rec-pick");
const recPrice      = document.getElementById("rec-price");
const recReasons    = document.getElementById("rec-reasons");
const recTradeoffs  = document.getElementById("rec-tradeoffs");
const recCaveats    = document.getElementById("rec-caveats");
const guardrailNote = document.getElementById("guardrail-notice");
const fallbackNote  = document.getElementById("fallback-notice");

// chart refs
const chartSection  = document.getElementById("chart-section");
const chartTitle    = document.getElementById("chart-title");
const chartClose    = document.getElementById("chart-close");

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");

function show(el)  { el.classList.remove("hidden"); }
function hide(el)  { el.classList.add("hidden"); }
function toggle(el, visible) { visible ? show(el) : hide(el); }

function setList(ul, items) {
  ul.innerHTML = "";
  if (!items || items.length === 0) { hide(ul); return; }
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    ul.appendChild(li);
  });
  show(ul);
}

function showError(msg) {
  errorBanner.textContent = "⚠️ " + msg;
  show(errorBanner);
  hide(loading);
  hide(results);
}

function clearError() { hide(errorBanner); errorBanner.textContent = ""; }

// ── Deal badge ────────────────────────────────────────────────────────────────
function dealBadge(score) {
  const label = score?.label ?? "—";
  const num   = score?.score ?? "?";
  const icons = { Excellent: "🔥", Good: "✅", Fair: "⚡", Wait: "⏳" };
  return `<span class="deal-badge deal-badge--${label}" title="${score?.summary ?? ""}">${icons[label] ?? ""}  ${label} ${num}/10</span>`;
}

// ── Render recommendation ─────────────────────────────────────────────────────
function renderRecommendation(rec) {
  if (!rec) { hide(recCard); return; }

  recModel.textContent  = rec.model ?? "";
  recPick.textContent   = rec.pick ?? "—";
  recPrice.textContent  = fmt(rec.effectivePrice);

  setList(recReasons,   rec.reasons);
  setList(recTradeoffs, rec.tradeoffs);
  setList(recCaveats,   rec.caveats);

  toggle(guardrailNote, rec.guardrailHit && rec.source === "gemma");
  toggle(fallbackNote,  rec.source === "fallback");

  show(recCard);
}

// ── Render offers table ───────────────────────────────────────────────────────
function renderOffers(offers, topPick) {
  offersBody.innerHTML = "";

  if (!offers || offers.length === 0) {
    offersBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:2rem">No offers found — try a different query or size.</td></tr>`;
    return;
  }

  offers.forEach((offer) => {
    const isTop = topPick && offer.platform.toLowerCase() === topPick.toLowerCase();
    const tr = document.createElement("tr");
    if (isTop) tr.classList.add("top-pick");

    const stockDot = offer.inStock
      ? `<span class="stock-dot stock-dot--in"></span>In stock`
      : `<span class="stock-dot stock-dot--out"></span>Out of stock`;

    tr.innerHTML = `
      <td class="platform-cell">${isTop ? "⭐ " : ""}${escHtml(offer.platform)}</td>
      <td class="title-cell">
        <a href="${escHtml(offer.url)}" target="_blank" rel="noopener"
           style="color:inherit;text-decoration:none" title="${escHtml(offer.title)}">
          ${escHtml(truncate(offer.title, 48))}
        </a>
      </td>
      <td class="num-col">${fmt(offer.price)}</td>
      <td class="num-col">${offer.shipping > 0 ? fmt(offer.shipping) : '<span style="color:var(--green)">Free</span>'}</td>
      <td class="num-col">${offer.discount > 0 ? `<span style="color:var(--green)">-${fmt(offer.discount)}</span>` : "—"}</td>
      <td class="num-col effective-price">${fmt(offer.effectivePrice)}</td>
      <td>${dealBadge(offer.dealScore)}</td>
      <td>${stockDot}</td>
      <td>
        <button class="btn-history" data-product-id="${offer.productId}" data-title="${escHtml(offer.title)}">
          📈 Chart
        </button>
      </td>`;

    offersBody.appendChild(tr);
  });

  // Wire up history buttons
  offersBody.querySelectorAll(".btn-history").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadPriceHistory(btn.dataset.productId, btn.dataset.title);
    });
  });
}

// ── Price history chart ───────────────────────────────────────────────────────
async function loadPriceHistory(productId, title) {
  chartTitle.textContent = `Price History — ${title}`;
  show(chartSection);
  chartSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const res = await fetch(`${API_BASE}/products/${productId}/history?days=45`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderChart(data);
  } catch (err) {
    chartTitle.textContent = `Price History — Error loading data`;
    console.error("History fetch failed:", err);
  }
}

function renderChart(data) {
  // Group points by platform
  const platforms = {};
  for (const point of data.history) {
    if (!platforms[point.platform]) platforms[point.platform] = [];
    platforms[point.platform].push({
      x: new Date(point.time).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      y: parseFloat(point.price),
      seeded: point.is_seeded,
    });
  }

  const colors = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#ef4444"];
  const datasets = Object.entries(platforms).map(([platform, points], i) => ({
    label: platform,
    data: points.map((p) => ({ x: p.x, y: p.y })),
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length] + "20",
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: false,
  }));

  const ctx = document.getElementById("price-chart").getContext("2d");
  if (priceChart) priceChart.destroy();

  priceChart = new Chart(ctx, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: { color: "#94a3b8", font: { family: "Inter" }, padding: 16 },
        },
        tooltip: {
          backgroundColor: "#1a2236",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e2d45",
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ₹${Number(ctx.parsed.y).toLocaleString("en-IN")}`,
          },
        },
      },
      scales: {
        x: {
          type: "category",
          ticks: { color: "#64748b", font: { size: 11 }, maxRotation: 45 },
          grid: { color: "#1e2d45" },
        },
        y: {
          ticks: {
            color: "#64748b",
            font: { size: 11 },
            callback: (v) => "₹" + Number(v).toLocaleString("en-IN"),
          },
          grid: { color: "#1e2d45" },
        },
      },
    },
  });

  // Show synthetic data notice if any seeded rows
  const hasSeeded = data.history.some((p) => p.is_seeded);
  toggle(syntheticBanner, hasSeeded);
}

// ── Main search handler ───────────────────────────────────────────────────────
async function handleSearch(e) {
  e.preventDefault();
  clearError();

  const query  = document.getElementById("query-input").value.trim();
  const gender = document.getElementById("gender-input").value || "men";
  const size   = parseFloat(document.getElementById("size-input").value) || undefined;
  const budget = parseFloat(document.getElementById("budget-input").value) || undefined;
  const notes  = document.getElementById("notes-input").value.trim() || undefined;

  if (!query || query.length < 2) {
    showError("Please enter a shoe name (at least 2 characters).");
    return;
  }

  // UI: loading state
  searchBtn.disabled = true;
  btnText.textContent = "Searching…";
  hide(results);
  show(loading);

  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, gender, size, budget, notes }),
    });

    const data = await res.json();

    if (!res.ok) {
      const detail = data.details
        ? Object.entries(data.details).map(([k, v]) => `${k}: ${v}`).join("; ")
        : data.error;
      showError(detail || "Search failed. Please try again.");
      return;
    }

    // ── Render ────────────────────────────────────────────────────────────────
    hide(loading);
    show(results);

    // Summary line
    const budgetNote = budget ? ` within ₹${budget.toLocaleString("en-IN")} budget` : "";
    resultsSummary.textContent =
      `Found ${data.totalFound} offer${data.totalFound !== 1 ? "s" : ""}${budgetNote} · ` +
      (data.fromFixture ? "Demo fixture mode" : "Live SerpApi data");

    renderRecommendation(data.recommendation);
    renderOffers(data.offers, data.recommendation?.pick);

  } catch (err) {
    showError("Network error — is the API running on port 3000?");
    console.error(err);
  } finally {
    searchBtn.disabled = false;
    btnText.textContent = "Find Deals";
    hide(loading);
  }
}

// ── Chart close ───────────────────────────────────────────────────────────────
chartClose.addEventListener("click", () => {
  hide(chartSection);
  if (priceChart) { priceChart.destroy(); priceChart = null; }
});

// ── Init ──────────────────────────────────────────────────────────────────────
form.addEventListener("submit", handleSearch);

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}
