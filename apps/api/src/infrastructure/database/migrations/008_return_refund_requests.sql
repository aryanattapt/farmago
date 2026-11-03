ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE TABLE IF NOT EXISTS return_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  bank_name text NOT NULL,
  account_holder_name text NOT NULL,
  account_number text NOT NULL,
  video_object_key text,
  video_mime_type text,
  received_at timestamptz NOT NULL,
  eligible_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','refunded')),
  decided_by uuid REFERENCES users(id),
  decision_reason text,
  refund_id uuid REFERENCES refunds(id),
  refund_amount numeric(14,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
  refund_due_at timestamptz,
  refunded_at timestamptz,
  transfer_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK ((video_object_key IS NULL) = (video_mime_type IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS return_refund_one_active_per_order
  ON return_refund_requests(order_id)
  WHERE status IN ('requested','approved','refunded');
CREATE INDEX IF NOT EXISTS return_refund_pharmacy_status_idx
  ON return_refund_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS shipments_delivered_at_idx
  ON shipments(delivered_at) WHERE delivered_at IS NOT NULL;
