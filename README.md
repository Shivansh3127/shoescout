# 👟 ShoeScout

> **Built for Sanskar** — finds the best running shoe deals across Amazon IN, Myntra, Flipkart, and Nike.in, then uses a locally-running Gemma model to explain *why* a price is good and *which* one to buy.

Built for the [DEV Hacktoberfest Weekend Challenge 2026](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01): *Build for a Friend*.

---

## The problem Sanskar had

Sanskar runs 5 km on roads, three times a week. He wears **Nike Pegasus 41, UK 9**. He knows the shoe he wants — but he kept buying it at ₹10,995 on Nike.in while Myntra had it for ₹7,999 the same week. He just never checked multiple sites at once.

ShoeScout fixes that: one search, all platforms, ranked by *effective price* (price + shipping − discount), with an AI recommendation that never leaves his machine.

---

## Architecture

```
Browser (http://localhost:3000)
    │
    ▼
Express API (/search  /products/:id/history  /health)
    │
    ├── SerpApi (Google Shopping)   ← external, cached 10 min, fixture mode for dev
    │       ↓
    │   Normalizer (₹ parser, shipping, discount)
    │       ↓
    │   Matcher (rule-based → pgvector cosine fallback)
    │       ↓
    │   Deal Scorer (vs 30d avg, vs 30d low, discount%, stock)
    │       ↓
    ├── Gemma 3 4B via Ollama       ← runs LOCAL, Sanskar's data never leaves machine
    │   ├── Structured JSON prompt  ← no free text → no hallucinated prices
    │   ├── Guardrail validation    ← rejects fabricated platforms / prices
    │   └── Retry → deterministic fallback
    │
    └── TimescaleDB (Postgres)      ← price history hypertable + pgvector
```

---

## Why Gemma? (challenge requirement)

- **Open-weight model** — Gemma 3 4B runs via Ollama on your own hardware
- **Genuinely needed** — the recommendation reasoning (why this price, vs 30-day average, tradeoffs) is the core value-add
- **Privacy first** — Sanskar's shoe size, budget, and usage pattern never hit a cloud API
- **Guardrail layer** — the app validates every number and platform name Gemma returns against the input data; hallucinated prices are caught and rejected before the user sees them

---

## Quick start (local)

### Prerequisites
- Docker Desktop
- Node.js 20+ and pnpm (`npm i -g pnpm`)
- A free [SerpApi key](https://serpapi.com) (100 searches/month free) — or use fixture mode below

```bash
git clone https://github.com/YOUR_USER/shoescout.git
cd shoescout

# 1. Environment
cp .env.example .env
# Edit .env — set DATABASE_URL and SERPAPI_KEY (see below for fixture mode)

# 2. Start Postgres + Ollama
docker compose up -d

# 3. Pull models (~2 GB first time)
docker exec shoescout-ollama ollama pull gemma3:4b
docker exec shoescout-ollama ollama pull nomic-embed-text

# 4. Run DB migrations
pnpm migrate

# 5. Install deps
pnpm install

# 6. Start the API (serves frontend too)
pnpm dev:api
```

Open **http://localhost:3000** — ShoeScout loads with Sanskar's defaults pre-filled.

### No SerpApi key? Use fixture mode

```bash
SERPAPI_FIXTURE_MODE=true pnpm dev:api
```

Fixture mode replays a realistic 6-offer sample (Amazon IN / Myntra / Flipkart / Nike.in / TataCliq) — all API calls, normalization, matching, deal scoring, and Gemma recommendation work exactly the same.

---

## Running tests

```bash
pnpm --filter @shoescout/api test
# 59 tests passing across:
#   priceParser  (24) — ₹/INR/Rs. parsing, edge cases
#   normalizer   (11) — effective price, sorting, bad data skipping
#   searchLogic  (7)  — budget filter, discount ranking, response shape
#   dealScore    (8)  — component scoring, no-history fallback
#   guardrail    (9)  — JSON parsing, platform/price hallucination detection
```

---

## Deploying to Render

The `infra/render.yaml` blueprint configures:
- **Web service** — Docker, `shoescout-api`, auto-deploys from main
- **Database** — Postgres (Render managed), injected via `DATABASE_URL`

Steps:
1. Push to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**
3. Point to this repo — Render reads `infra/render.yaml` automatically
4. Set the two manual env vars in the dashboard:
   - `SERPAPI_KEY` — your SerpApi key
   - `OLLAMA_BASE_URL` — URL to a running Ollama instance (see note below)

> **Note on Ollama hosting**: Render's starter plan can't run Gemma locally. Options for the demo:
> - Run Ollama on your laptop and expose it via [ngrok](https://ngrok.com): `ngrok http 11434`
> - Deploy Ollama to a $5/mo DigitalOcean droplet
> - Set `SERPAPI_FIXTURE_MODE=true` — Gemma still runs, just SerpApi is mocked

---

## Project structure

```
shoescout/
├── apps/
│   ├── api/                   # Express + TypeScript
│   │   ├── src/
│   │   │   ├── config/        # env validation (Zod)
│   │   │   ├── db/
│   │   │   │   └── queries/   # priceHistory, products
│   │   │   ├── modules/
│   │   │   │   ├── serp/      # SerpApi client + types
│   │   │   │   ├── normalizer/# price parser + normalizer
│   │   │   │   ├── matcher/   # rule-based + pgvector matcher
│   │   │   │   ├── intelligence/ # deal scorer (0-10)
│   │   │   │   ├── gemma/     # Ollama client, prompt, guardrail
│   │   │   │   └── search/    # orchestrator + Zod schemas
│   │   │   └── routes/        # /search /products /health
│   │   └── tests/unit/        # 59 Vitest tests
│   └── web/                   # Vanilla HTML + CSS + JS frontend
├── db/migrations/             # TimescaleDB schema + seed
├── docker-compose.yml         # Postgres/TimescaleDB + Ollama
└── infra/render.yaml          # Render deploy blueprint
```

---

## Data disclosure

Any price history rows seeded during development have `is_seeded = TRUE` in the database. The API surfaces this in `GET /products/:id/history` as a `dataDisclosure` field, and the frontend shows a banner: *"Some data is synthetic — for demo purposes only."*

No real historical price data is claimed unless gathered by a live SerpApi call (`is_seeded = FALSE`).

---

## What's next (post-challenge)

- **Phase 4 — TabPFN forecast**: integrate the TabPFN FastAPI microservice for price-drop prediction (already scaffolded at `TABPFN_SERVICE_URL`)
- **Phase 6 — Alerts**: email/WhatsApp notification when the price drops below a threshold
- **Gemma 3 27B**: drop-in swap — change `OLLAMA_MODEL=gemma3:27b`, same code

---

*Made with ❤️ for Sanskar. Hacktoberfest Weekend Challenge 2026.*
