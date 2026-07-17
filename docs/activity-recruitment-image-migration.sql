-- 已執行初版 schema 的環境請執行此 migration。
alter table public.activities
  add column if not exists image_url text;
