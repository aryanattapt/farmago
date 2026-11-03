ALTER TABLE pharmacies
  ADD COLUMN delivery_contact_name text,
  ADD COLUMN delivery_phone text,
  ADD COLUMN delivery_email text;

ALTER TABLE products
  ADD COLUMN shipping_width_cm integer,
  ADD COLUMN shipping_height_cm integer,
  ADD COLUMN shipping_length_cm integer,
  ADD CONSTRAINT products_shipping_width_cm_range CHECK (shipping_width_cm IS NULL OR shipping_width_cm BETWEEN 1 AND 200),
  ADD CONSTRAINT products_shipping_height_cm_range CHECK (shipping_height_cm IS NULL OR shipping_height_cm BETWEEN 1 AND 200),
  ADD CONSTRAINT products_shipping_length_cm_range CHECK (shipping_length_cm IS NULL OR shipping_length_cm BETWEEN 1 AND 200);

ALTER TABLE order_items
  ADD COLUMN shipping_weight_grams_snapshot integer,
  ADD COLUMN shipping_width_cm_snapshot integer,
  ADD COLUMN shipping_height_cm_snapshot integer,
  ADD COLUMN shipping_length_cm_snapshot integer;

ALTER TABLE shipments
  ADD COLUMN provider_order_no text,
  ADD COLUMN pickup_date date,
  ADD COLUMN pickup_time time,
  ADD COLUMN pickup_vehicle text,
  ADD CONSTRAINT shipments_pickup_vehicle_valid
    CHECK (pickup_vehicle IS NULL OR pickup_vehicle IN ('Motor','Mobil','Truk'));

ALTER TABLE shipment_attempts
  ADD COLUMN operation text NOT NULL DEFAULT 'store_order',
  ADD CONSTRAINT shipment_attempts_operation_valid
    CHECK (operation IN ('store_order','pickup','label'));
