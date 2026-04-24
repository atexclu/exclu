-- 164_country_and_mid_routing.sql
-- Adds country tracking on profiles (for routing + compliance) and the MID
-- used for each captured sale (so rebills can target the same MID).

alter table profiles
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$');

alter table purchases
  add column if not exists ugp_mid text;
alter table tips
  add column if not exists ugp_mid text;
alter table gift_purchases
  add column if not exists ugp_mid text;
alter table custom_requests
  add column if not exists ugp_mid text;

-- Indexes only where we filter/aggregate on country
create index if not exists profiles_country_idx on profiles(country) where country is not null;
