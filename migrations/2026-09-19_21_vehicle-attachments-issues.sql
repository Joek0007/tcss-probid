-- ============================================================================
-- Migration _21 — Vehicle attachments + field-reported issues.
--
-- Two new operational tables that hang off public.assets (the fleet vehicles
-- from migration _20):
--
--   * asset_documents — photos & documents attached to a VEHICLE (registration,
--     insurance, purchase receipt, inspection, general photos, other). Mirrors
--     the wo_documents model (file stored in the private `job-photos` storage
--     bucket; row holds name/path/url/type; soft-delete via `deleted`). Rendered
--     in the app with data-sp so the signed-URL layer serves private files.
--
--   * asset_issues — a tech's field-reported problem with a vehicle (so they no
--     longer drive in to fill out a paper request). Holds reporter, description,
--     severity, an optional photo, and a lifecycle status
--     (open → acknowledged → in_progress → resolved). wo_id links the issue to a
--     work order once the office converts it.
--
-- vehicle_open_issue_rollup() gives the per-vehicle OPEN-issue count for the
-- Vehicles list badge (mirrors vehicle_wo_rollup).
--
-- RLS matches the app's operational-table model (authenticated full access;
-- authorization enforced in the app layer). Idempotent + reversible
-- (drop table public.asset_issues, public.asset_documents;).
-- ============================================================================

-- ── Vehicle documents & photos ──────────────────────────────────────────────
create table if not exists public.asset_documents (
  id           text primary key,
  asset_id     text not null,               -- FK-ish → public.assets.id
  name         text,                        -- display label
  file_name    text,                        -- original file name
  file_path    text,                        -- storage path in `job-photos` bucket
  file_type    text,                        -- MIME type
  file_size    integer,
  url          text,                        -- fallback public URL (signed at view time)
  doc_type     text,                        -- photo / registration / insurance / receipt / purchase / inspection / other
  uploaded_by  text,
  uploaded_at  timestamptz not null default now(),
  deleted      boolean not null default false
);
create index if not exists asset_documents_asset_idx   on public.asset_documents (asset_id);
create index if not exists asset_documents_deleted_idx on public.asset_documents (deleted);

alter table public.asset_documents enable row level security;
drop policy if exists "asset_documents authenticated all" on public.asset_documents;
create policy "asset_documents authenticated all" on public.asset_documents
  for all to authenticated using (true) with check (true);

-- ── Vehicle issues (field-reported) ─────────────────────────────────────────
create table if not exists public.asset_issues (
  id              text primary key,
  asset_id        text not null,            -- FK-ish → public.assets.id
  title           text,                     -- short summary
  description     text,
  severity        text not null default 'normal',  -- low / normal / high / urgent
  status          text not null default 'open',    -- open / acknowledged / in_progress / resolved
  photo_path      text,                     -- storage path in `job-photos` bucket
  photo_url       text,                     -- fallback public URL (signed at view time)
  reported_by     uuid,                     -- profiles.id of the tech
  reporter_name   text,
  wo_id           text,                     -- set when converted to a work order
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at     timestamptz,
  resolved_by     text,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists asset_issues_asset_idx  on public.asset_issues (asset_id);
create index if not exists asset_issues_status_idx on public.asset_issues (status);

alter table public.asset_issues enable row level security;
drop policy if exists "asset_issues authenticated all" on public.asset_issues;
create policy "asset_issues authenticated all" on public.asset_issues
  for all to authenticated using (true) with check (true);

-- Per-vehicle OPEN-issue count for the Vehicles list badge (load-on-demand model).
create or replace function public.vehicle_open_issue_rollup()
returns table(asset_id text, cnt bigint)
language sql stable security definer set search_path=public as $$
  select asset_id, count(*) as cnt
  from public.asset_issues
  where status <> 'resolved'
  group by asset_id
$$;
grant execute on function public.vehicle_open_issue_rollup() to authenticated, anon;

-- Verify
select 'vehicle attachments+issues migration' as status,
       (select count(*) from information_schema.columns
          where table_schema='public' and table_name='asset_documents') as doc_columns,
       (select count(*) from information_schema.columns
          where table_schema='public' and table_name='asset_issues') as issue_columns,
       (select count(*) from pg_policies
          where schemaname='public' and tablename in ('asset_documents','asset_issues')) as policies,
       (select count(*) from pg_proc where proname='vehicle_open_issue_rollup') as rollup_fn;
