alter table orders
  add column if not exists shipping_full_name text,
  add column if not exists shipping_phone text,
  add column if not exists shipping_province text,
  add column if not exists shipping_district text,
  add column if not exists shipping_ward text,
  add column if not exists shipping_address_detail text,
  add column if not exists promotion_code text,
  add column if not exists customer_note text;

alter table notifications
  add column if not exists type text,
  add column if not exists link text;

alter table bank_accounts
  add column if not exists bank_code text;
