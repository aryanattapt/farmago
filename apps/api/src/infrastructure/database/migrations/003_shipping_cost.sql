ALTER TABLE pharmacies
  ADD COLUMN rajaongkir_origin_id integer,
  ADD CONSTRAINT pharmacies_rajaongkir_origin_positive
    CHECK (rajaongkir_origin_id IS NULL OR rajaongkir_origin_id > 0);

ALTER TABLE addresses
  ADD COLUMN rajaongkir_destination_id integer,
  ADD CONSTRAINT addresses_rajaongkir_destination_positive
    CHECK (rajaongkir_destination_id IS NULL OR rajaongkir_destination_id > 0);

ALTER TABLE products
  ADD COLUMN shipping_weight_grams integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT products_shipping_weight_grams_range
    CHECK (shipping_weight_grams BETWEEN 0 AND 30000);

ALTER TABLE checkout_quotes
  ADD COLUMN shipping_snapshot jsonb;

ALTER TABLE orders
  ADD COLUMN shipping_snapshot jsonb;
