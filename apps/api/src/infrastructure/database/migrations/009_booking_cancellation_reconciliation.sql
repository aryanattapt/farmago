ALTER TABLE shipments
  ADD COLUMN booking_cancellation_reference text,
  ADD COLUMN booking_cancelled_at timestamptz,
  ADD COLUMN booking_cancelled_by uuid REFERENCES users(id);
