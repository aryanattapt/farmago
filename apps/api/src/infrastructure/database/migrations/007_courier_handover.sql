ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz;

CREATE INDEX IF NOT EXISTS shipments_provider_order_no_lookup
  ON shipments(provider,provider_order_no)
  WHERE provider_order_no IS NOT NULL;
