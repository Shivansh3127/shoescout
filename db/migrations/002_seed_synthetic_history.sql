-- ============================================================
-- ShoeScout — Synthetic Price History Seed
-- ⚠️  DEMO DATA ONLY — NOT REAL PRICES
-- All rows have is_seeded = TRUE and are clearly labelled as
-- synthetic in the UI, API responses, and README.
-- Purpose: give TabPFN and deal-score logic enough history to
-- demo during the challenge without real API calls.
-- ============================================================

-- Seed a placeholder product (Nike Air Zoom Pegasus 41)
INSERT INTO products (brand, model, gender, category, canonical_name) VALUES
  ('Nike', 'Air Zoom Pegasus 41', 'mens', 'running', 'Nike Air Zoom Pegasus 41')
ON CONFLICT (canonical_name) DO NOTHING;

-- Seed 45 days of synthetic daily prices across 3 platforms
-- Pattern: gradual decline then rebound (realistic for seasonal sale)
DO $$
DECLARE
  pid    INT;
  d      DATE;
  i      INT := 0;
  amazon NUMERIC;
  myntra NUMERIC;
  flipkart NUMERIC;
BEGIN
  SELECT id INTO pid FROM products WHERE canonical_name = 'Nike Air Zoom Pegasus 41';

  FOR d IN SELECT generate_series(
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '1 day',
    '1 day'::INTERVAL
  )::DATE LOOP
    -- Simulate a price drop around day 20-30 (sale window)
    amazon   := 9499 - (CASE WHEN i BETWEEN 18 AND 28 THEN 1000 ELSE 0 END)
                      + (random() * 200 - 100);
    myntra   := 9999 - (CASE WHEN i BETWEEN 20 AND 30 THEN 1500 ELSE 0 END)
                      + (random() * 300 - 150);
    flipkart := 9299 - (CASE WHEN i BETWEEN 15 AND 25 THEN  800 ELSE 0 END)
                      + (random() * 250 - 125);

    INSERT INTO price_history (time, product_id, platform, price, is_seeded) VALUES
      (d::TIMESTAMPTZ + TIME '10:00:00', pid, 'Amazon IN',  ROUND(amazon,   2), TRUE),
      (d::TIMESTAMPTZ + TIME '10:05:00', pid, 'Myntra',     ROUND(myntra,   2), TRUE),
      (d::TIMESTAMPTZ + TIME '10:10:00', pid, 'Flipkart',   ROUND(flipkart, 2), TRUE);

    i := i + 1;
  END LOOP;
END $$;
