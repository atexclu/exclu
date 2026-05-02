-- LinkmePopup tracking: post-signup + weekly Pro upsell modal.
alter table public.profiles
  add column if not exists linkme_popup_last_shown_at timestamptz;

comment on column public.profiles.linkme_popup_last_shown_at is
  'Last time the LinkmePopup (post-signup + weekly Pro upsell modal) was shown. Null = never shown (eligible for first display).';
