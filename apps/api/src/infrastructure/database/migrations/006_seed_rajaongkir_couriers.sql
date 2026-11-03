INSERT INTO rajaongkir_couriers (courier_code, enabled, sort_order)
VALUES
  ('sicepat', true, 20),
  ('ide', true, 30),
  ('sap', true, 40),
  ('jnt', true, 50),
  ('ninja', true, 60),
  ('tiki', true, 70),
  ('lion', true, 80),
  ('anteraja', true, 90),
  ('pos', true, 100),
  ('ncs', true, 110),
  ('rex', true, 120),
  ('rpx', true, 130),
  ('sentral', true, 140),
  ('star', true, 150),
  ('wahana', true, 160),
  ('dse', true, 170)
ON CONFLICT (courier_code) DO NOTHING;
