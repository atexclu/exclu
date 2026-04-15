-- 130_email_templates.sql
-- DB-stored editable email templates + version history.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null default 'transactional'
    check (category in ('transactional','campaign','system')),
  subject text not null,
  html_body text not null,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  sample_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_templates_category_idx on public.email_templates(category);

create table if not exists public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  subject text not null,
  html_body text not null,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  edited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index email_template_versions_template_id_idx
  on public.email_template_versions(template_id, created_at desc);

create or replace function public.email_templates_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists email_templates_touch_trg on public.email_templates;
create trigger email_templates_touch_trg
  before update on public.email_templates
  for each row execute function public.email_templates_touch();

create or replace function public.email_templates_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE') and (
    old.subject is distinct from new.subject
    or old.html_body is distinct from new.html_body
    or old.text_body is distinct from new.text_body
    or old.variables is distinct from new.variables
  ) then
    insert into public.email_template_versions
      (template_id, subject, html_body, text_body, variables, edited_by)
    values
      (old.id, old.subject, old.html_body, old.text_body, old.variables, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists email_templates_snapshot_trg on public.email_templates;
create trigger email_templates_snapshot_trg
  before update on public.email_templates
  for each row execute function public.email_templates_snapshot();

alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;

create policy "admins write templates" on public.email_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins read template versions" on public.email_template_versions
  for select to authenticated using (public.is_admin());
