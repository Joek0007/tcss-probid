-- ============================================================================
-- Migration _20 — Fleet Assets (Vehicles).
--
-- Adds public.assets: a first-class fleet-vehicle record so vehicle work
-- (maintenance / general / reported-issue fixes) is tracked against a VEHICLE
-- instead of a fake "customer" account. Work orders gain a nullable vehicle_id
-- so a WO can belong to a customer OR a vehicle. vehicle_wo_rollup() gives the
-- per-vehicle work-order count for the Vehicles list card (mirrors
-- customer_wo_rollup / customer_invoice_rollup).
--
-- RLS matches the app's operational-table model (authenticated full access;
-- authorization enforced in the app layer). Idempotent.
-- ============================================================================

create table if not exists public.assets (
  id                    text primary key,
  number                text,            -- e.g. "Vehicle #20"
  name                  text,            -- nickname / label
  type                  text,            -- Van / Truck / Trailer / Car / Other
  make                  text,
  model                 text,
  year                  integer,
  color                 text,
  vin                   text,
  plate                 text,            -- license plate
  status                text,            -- active / in_shop / sold / inactive
  assigned_tech         text,            -- driver / assigned tech
  home_base             text,            -- location
  odometer              numeric,         -- current mileage
  purchase_date         date,
  purchase_cost         numeric,
  registration_expires  date,
  insurance_expires     date,
  notes                 text,
  is_active             boolean not null default true,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists assets_status_idx on public.assets (status);
create index if not exists assets_active_idx on public.assets (is_active);

alter table public.assets enable row level security;
drop policy if exists "assets authenticated all" on public.assets;
create policy "assets authenticated all" on public.assets
  for all to authenticated using (true) with check (true);

-- Work orders can be logged against a vehicle instead of a customer.
alter table public.work_orders add column if not exists vehicle_id text;
create index if not exists work_orders_vehicle_idx on public.work_orders (vehicle_id);

-- Per-vehicle work-order count for the Vehicles list card (load-on-demand model).
create or replace function public.vehicle_wo_rollup()
returns table(vehicle_id text, cnt bigint)
language sql stable security definer set search_path=public as $$
  select vehicle_id, count(*) as cnt
  from public.work_orders
  where vehicle_id is not null
  group by vehicle_id
$$;
grant execute on function public.vehicle_wo_rollup() to authenticated, anon;

-- Verify
select 'assets fleet migration' as status,
       (select count(*) from information_schema.columns
          where table_schema='public' and table_name='assets') as asset_columns,
       (select count(*) from information_schema.columns
          where table_schema='public' and table_name='work_orders' and column_name='vehicle_id') as wo_vehicle_col,
       (select count(*) from pg_policies
          where schemaname='public' and tablename='assets') as policies,
       (select count(*) from pg_proc where proname='vehicle_wo_rollup') as rollup_fn;
