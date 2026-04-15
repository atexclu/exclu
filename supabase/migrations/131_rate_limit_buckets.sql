-- 131_rate_limit_buckets.sql
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rate_limit_buckets_window_idx
  on public.rate_limit_buckets(window_start);

-- Called with service role. Returns true if allowed, false if throttled.
create or replace function public.rate_limit_check(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql as $$
declare
  row public.rate_limit_buckets%rowtype;
begin
  insert into public.rate_limit_buckets(bucket_key, count, window_start)
  values (p_key, 0, now())
  on conflict (bucket_key) do nothing;

  select * into row from public.rate_limit_buckets
  where bucket_key = p_key for update;

  if row.window_start < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
       set count = 1, window_start = now(), updated_at = now()
     where bucket_key = p_key;
    return true;
  end if;

  if row.count >= p_limit then
    return false;
  end if;

  update public.rate_limit_buckets
     set count = count + 1, updated_at = now()
   where bucket_key = p_key;
  return true;
end;
$$;

-- Cron-friendly cleanup: remove buckets older than 1 day.
create or replace function public.rate_limit_gc() returns void
language sql as $$
  delete from public.rate_limit_buckets
   where updated_at < now() - interval '1 day';
$$;

alter table public.rate_limit_buckets enable row level security;
-- No policies: only service role touches this table.
