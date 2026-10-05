-- ============================================================
-- ShoeScout — Initial Schema
-- TimescaleDB (hypertable) + pgvector
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;           -- pgvector (for product embeddings)
CREATE EXTENSION IF NOT EXISTS timescaledb;      -- time-series

-- ── friend_profile ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friend_profile (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  budget       NUMERIC(10, 2) NOT NULL,           -- INR
  size         NUMERIC(4, 1) NOT NULL,             -- UK size, e.g. 9.0
  usage_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Sanskar's profile
INSERT INTO friend_profile (name, budget, size, usage_notes) VALUES (
  'Sanskar',
  10000,
  9,
  'Runs 5 km three times a week on roads. Prefers neutral cushioning. Tired of overpaying because prices differ across sites.'
) ON CONFLICT DO NOTHING;

-- ── products ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  gender          TEXT CHECK (gender IN ('mens', 'womens', 'unisex', 'unknown')) DEFAULT 'unknown',
  category        TEXT DEFAULT 'running',
  canonical_name  TEXT NOT NULL,                  -- normalised: "Nike Air Zoom Pegasus 41"
  embedding       vector(768),                    -- nomic-embed-text output dimension
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (canonical_name)
);

CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── product_variants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        NUMERIC(4, 1),                      -- UK size; NULL = size unknown
  color       TEXT,
  sku         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, size, color)
);

-- ── offers ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id              SERIAL PRIMARY KEY,
  variant_id      INT REFERENCES product_variants(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,                  -- e.g. "Amazon IN", "Myntra"
  url             TEXT NOT NULL,
  price           NUMERIC(10, 2) NOT NULL,        -- INR
  shipping        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  effective_price NUMERIC(10, 2) GENERATED ALWAYS AS (price + shipping - discount) STORED,
  in_stock        BOOLEAN DEFAULT TRUE,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  INDEX           (variant_id, platform, fetched_at DESC)
);

-- ── price_history (TimescaleDB hypertable) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  time        TIMESTAMPTZ NOT NULL,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  is_seeded   BOOLEAN DEFAULT FALSE              -- TRUE = synthetic demo data; never shown as real
);

-- Convert to hypertable (partitioned by time, 7-day chunks)
SELECT create_hypertable(
  'price_history', 'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS price_history_product_platform_idx
  ON price_history (product_id, platform, time DESC);

-- ── alerts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            SERIAL PRIMARY KEY,
  friend_id     INT NOT NULL REFERENCES friend_profile(id) ON DELETE CASCADE,
  product_id    INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  threshold     NUMERIC(10, 2) NOT NULL,          -- alert when effective_price drops below this
  channel       TEXT CHECK (channel IN ('email', 'telegram')) DEFAULT 'email',
  last_sent_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
