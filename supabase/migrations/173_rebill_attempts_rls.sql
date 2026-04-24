-- 173_rebill_attempts_rls.sql
-- Allow each user to read their own rebill_attempts rows so the subscription
-- settings UI can show a per-user billing history. Writes stay service-role
-- only (the cron is the sole writer; the table is not user-mutable).

alter table rebill_attempts enable row level security;

create policy rebill_attempts_self_read on rebill_attempts
  for select
  using (
    (subject_table = 'profiles' and subject_id = auth.uid())
    or
    (
      subject_table = 'fan_creator_subscriptions'
      and subject_id in (
        select id from fan_creator_subscriptions where fan_id = auth.uid()
      )
    )
  );
