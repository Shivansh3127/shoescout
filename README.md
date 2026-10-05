# 👟 ShoeScout

> **AI-powered running shoe price tracker for India.**  
> Find the best deals across Amazon IN, Myntra, Flipkart, Nike, Adidas, ASICS and more — with local Gemma AI recommendations that never leave your machine.

[![Built for Hacktoberfest Weekend Challenge 2026](https://img.shields.io/badge/Hacktoberfest-Weekend%20Challenge%202026-orange)](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

- 🔍 **Live price search** — queries Google Shopping via SerpApi across trusted Indian platforms only
- 🤖 **Local Gemma AI** — deal recommendations run entirely on your machine via Ollama (no data sent to the cloud)
- 💯 **Deal scoring** — additive 0–10 score based on discount, platform reputation, price history, and stock
- 📊 **Price history charts** — 45-day trend charts per product stored in TimescaleDB
- 🛡️ **Trusted platforms only** — Amazon IN, Myntra, Flipkart, Nike, Adidas, ASICS, Puma, New Balance, TataCliq, Skechers, Hoka, Brooks, Saucony, Reebok, Decathlon
- 🚻 **Gender-aware search** — Men / Women / Unisex filtering baked into the query
- 🌑 **Dark mode SPA** — Chart.js price history, deal badges, effective price sorting

---

## 🖥️ Demo (Fixture Mode — no API key needed)

```
# In fixture mode the app uses demo data — no SerpApi quota burned
$env:SERPAPI_FIXTURE_MODE="true"
$env:DATABASE_URL="postgresql://shoescout:changeme@localhost:5432/shoescout"
$env:SERPAPI_KEY="dummy"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:OLLAMA_MODEL="gemma3:1b"
pnpm --filter @shoescout/api dev
```

Open **http://localhost:3000**

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Runtime |
| pnpm | ≥ 9 | Package manager |
| Docker | any | TimescaleDB |
| Ollama | any | Local Gemma AI |

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/shoescout.git
cd shoescout
pnpm install
```

### 2. Start the database

```bash
docker compose up -d
```

Then run migrations:
```bash
docker cp apps/api/db/migrations/001_init.sql shoescout_db:/tmp/
docker exec -it shoescout_db psql -U shoescout -d shoescout -f /tmp/001_init.sql
```

### 3. Pull Gemma (local AI)

```bash
# Fast on CPU (~800 MB)
ollama pull gemma3:1b

# Or higher quality, slower (~3 GB)
ollama pull gemma3:4b
```

### 4. Get a SerpApi key (free — 100 searches/month)

Sign up at **https://serpapi.com** → copy your API key.

### 5. Start the API

```powershell
# Windows PowerShell
$env:SERPAPI_FIXTURE_MODE="false"
$env:DATABASE_URL="postgresql://shoescout:changeme@localhost:5432/shoescout"
$env:SERPAPI_KEY="your_serpapi_key_here"
$env:OLLAMA_BASE_URL="http://localhost:11434"
$env:OLLAMA_MODEL="gemma3:1b"
pnpm --filter @shoescout/api dev
```

```bash
# Linux / macOS
SERPAPI_FIXTURE_MODE=false \
DATABASE_URL=postgresql://shoescout:changeme@localhost:5432/shoescout \
SERPAPI_KEY=your_serpapi_key_here \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_MODEL=gemma3:1b \
pnpm --filter @shoescout/api dev
```

Open **http://localhost:3000** → search for any running shoe.

---

## 🏗️ Architecture

```
Browser (SPA)
    │  POST /search
    ▼
Express API (port 3000)
    ├── SerpApi Client      — Google Shopping, 10-min cache, 3 retries
    ├── Normalizer          — effective_price, trusted-platform filter
    ├── Product Matcher     — rule → vector → new
    ├── Deal Scorer         — additive 0–10 score
    ├── Gemma Service       — local Ollama prompt + guardrail
    └── TimescaleDB         — price history (45-day window)
```

### Trusted Platform Filter

Only results from verified Indian retailers are shown:

> Amazon IN · Myntra · Flipkart · Nike · Adidas · ASICS · Puma · New Balance · TataCliq · Skechers · Hoka · Brooks · Saucony · Reebok · Under Armour · Decathlon

Random or unknown sources are silently dropped.

---

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL / TimescaleDB connection string |
| `SERPAPI_KEY` | ✅ (live mode) | — | Your SerpApi key |
| `SERPAPI_FIXTURE_MODE` | ❌ | `false` | `true` = use demo fixture data |
| `OLLAMA_BASE_URL` | ❌ | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | ❌ | `gemma3:4b` | Model to use (recommend `gemma3:1b` on CPU) |
| `PORT` | ❌ | `3000` | API server port |
| `LOG_LEVEL` | ❌ | `info` | Pino log level |

---

## 🧪 Testing

```bash
pnpm test                  # all tests
pnpm --filter @shoescout/api test --coverage
```

---

## 📁 Project Structure

```
shoescout/
├── apps/
│   ├── api/               # Express API + all modules
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── serp/          # SerpApi client
│   │   │   │   ├── normalizer/    # Price normalizer + platform filter
│   │   │   │   ├── matcher/       # Product matching
│   │   │   │   ├── intelligence/  # Deal scoring
│   │   │   │   ├── gemma/         # Ollama / Gemma integration
│   │   │   │   └── search/        # Orchestration service + schema
│   │   │   └── db/                # TimescaleDB queries + migrations
│   │   └── tests/fixtures/        # Demo fixture JSON
│   └── web/               # Static SPA (HTML + CSS + JS)
├── infra/
│   └── render.yaml        # Render.com deploy blueprint
└── docker-compose.yml     # Local TimescaleDB
```

---

## 🚢 Deploy to Render

1. Fork this repo
2. Sign up at **https://render.com**
3. New → Blueprint → point to this repo
4. Set environment variables in the Render dashboard
5. Deploy ✅

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

*Built for the [Hacktoberfest Weekend Challenge 2026](https://dev.to/challenges/hacktoberfest-weekend-2026-10-01)*
