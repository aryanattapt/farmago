CREATE TABLE rajaongkir_couriers (
  courier_code text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rajaongkir_couriers_code_valid
    CHECK (courier_code ~ '^[a-z0-9_-]{2,30}$')
);

INSERT INTO rajaongkir_couriers (courier_code, enabled, sort_order)
VALUES ('jne', true, 10);
