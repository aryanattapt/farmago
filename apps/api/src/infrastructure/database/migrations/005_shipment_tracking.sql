ALTER TABLE shipments
  ADD COLUMN tracking_status text,
  ADD COLUMN tracking_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN tracking_checked_at timestamptz,
  ADD COLUMN tracking_attempted_at timestamptz;
