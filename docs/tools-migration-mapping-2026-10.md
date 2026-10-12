# Tools Per-Row Migration — Field Mapping & Schema Additions (Oct 2026)

> **STATUS — 2026-10-06: TOOL RECORDS CUT OVER AND LIVE (build `hd`).**
> Tools + linked-groups now persist per-row in the real `tools` / `tool_linked_groups`
> tables for everyone (the `app_state` 'tools' blob is no longer read or written when the
> per-row flag is on, which is now the default). Verified live on the default path:
> per-row load, per-row save with an optimistic-concurrency guard (same-tool concurrent
> edit → stale writer **rejected**, not clobbered), photo + 14 parts intact, Tools page
> renders correctly, and checkouts still link (the app keeps the legacy string id as the
> tool's `id`, with the table UUID tracked as `_uuid`). Emergency revert: `?perrow=0`
> (or set the default back in `js/tools_db.js`).
>
> **New file:** `js/tools_db.js` (window.ToolsDB: load / saveTool / retireTool /
> migrateFromBlob, + `_toolsPerRow()` flag). Hooks are in `js/auth.js` (skip blob apply +
> load from tables on sync; exclude 'tools' from the two blob-push loops) and
> `js/tools.js` (saveToolItem per-row branch). Existing data (the Fluke tool + 14 parts +
> photo) migrated and verified.
>
> **STILL ON THE BLOB — next and final phase before field-tech rollout:** `toolCheckouts`
> / custody records. Same pattern: map to `tool_checkouts` (+ `tool_checkout_groups`),
> build the per-row layer, prove with the two-writer test, migrate, cut over. Do NOT
> re-run `migrateFromBlob` for tools — the blob's Fluke is photo-less and would overwrite
> the re-attached photo; the tables are authoritative now.

_Working doc for moving tools/linked-groups/checkouts off the `app_state` blob (last-writer-wins) onto the real per-row tables. The two-writer proof (2026-10-06) confirmed per-row survives concurrent writers where the blob loses data. This doc records the exact field mapping and the small schema additions needed before building the data layer._

## Schema additions needed (run once)

The real tool tables predate the app's current "assigned tech" and "cost" fields, and we want a lossless safety net. Additive only — nothing dropped, existing columns untouched:

```sql
alter table public.tools              add column if not exists assigned_tech text;
alter table public.tools              add column if not exists unit_cost     numeric;
alter table public.tools              add column if not exists legacy_id     text;
alter table public.tools              add column if not exists legacy_extra  jsonb;
alter table public.tool_linked_groups add column if not exists legacy_id     text;
alter table public.tool_linked_groups add column if not exists legacy_extra  jsonb;
alter table public.tool_checkouts     add column if not exists legacy_id     text;
alter table public.tool_checkouts     add column if not exists legacy_extra  jsonb;
```

- `legacy_id` keeps each record's old blob string id (e.g. `1791232931584`, `g179…`) so checkouts and groups can be re-pointed to the new UUIDs during migration, and so we can re-run the migration idempotently.
- `legacy_extra` (jsonb) catches any app field not mapped to a real column, so the migration is lossless even if a field was missed.

## Field mapping — tools (app blob object → `tools` table)

| app field (camelCase) | → table column | notes |
|---|---|---|
| id (string) | legacy_id | app-facing `id` STAYS the legacy string (so checkouts link); table `id` = UUID, tracked as `_uuid` |
| name | name | |
| tag | asset_tag | |
| cat | category | NOT NULL — default `'Other'` |
| location | home_location | |
| assignedTech | assigned_tech | NEW column |
| cost | unit_cost | NEW column |
| serial | serial_number | |
| notes | notes | |
| purchaseDate | purchase_date | |
| photoUrl | photo_url | storage URL (already fixed) |
| ownerType | owner_type | enum `company`/`personal` |
| ownerId | personal_owner_id if UUID, else legacy_extra | app sometimes stored a name |
| requireReturnPhoto | share_return_photo (`'required'`/`'never'`) | table col is text NOT NULL |
| linkedGroups[] | → `tool_linked_groups` rows | see below |
| (derived) | current_status | `'available'` at migration; live status comes from checkouts |
| — | is_vehicle_permanent | false default |
| — | is_shareable | from personal-share settings, else false |
| — | created_by | owner uid |
| — | is_active | true |
| anything else | legacy_extra | lossless catch-all |

## Field mapping — linked groups (app `linkedGroups[]` → `tool_linked_groups`)

| app field | → table column | notes |
|---|---|---|
| id (`g…`) | legacy_id | new `id` = UUID |
| label | label | |
| description | description | |
| mode (`required`/`optional`) | tracking_mode | → `required_with_parent` / `optional_with_parent` |
| photoUrl | photo_url | |
| (parent tool) | parent_tool_id | UUID of migrated tool |
| (array index) | sort_order | |
| — | is_active | true |
| anything else | legacy_extra | |

## Field mapping — checkouts (NEXT PASS — not yet done)

`tool_checkouts` already has rich transfer columns (transfer_pending, transfer_initiated/accepted/declined_at, verify/return fields, groups_included jsonb, status + checkout_type enums) that line up with the custody/hand-off model. The app's status names map to the table enum, e.g. the as-is reissue → `reissued_assumed_responsibility`, pending-verify → `pending_verification`, verified close → `closed_verified`. Detailed checkout mapping is built and verified after tools + groups are proven.

Enum reference (confirmed): `tool_status` = available, checked_out, pending_verification, reissued_assumed_responsibility, closed_verified, closed_with_discrepancy, damaged, lost, retired. `checkout_type` = office_checkout, field_transfer, personal_share. `linked_group_mode` = required_with_parent, optional_with_parent, independent_optional. `tool_owner_type` = company, personal.

## Removal = soft delete

Confirmed via the proof run: the tools table blocks client-side hard-DELETE by RLS; removal is `is_active=false`. The data layer retires tools/groups that way (correct pattern; matches the `is_active` columns). (Note: a couple of inactive `PROOF-`/`PR2-` test rows remain in `tools` from testing — harmless, filtered out by `is_active`; a hard-delete sweep via SQL timed out and can be retried later.)

## Build order (each gated by the two-writer test)

1. ✅ Run the schema additions above.
2. ✅ Build the per-row tools + linked-groups data layer (load/save/retire); proven with two concurrent writers.
3. ⬜ Build the checkouts/custody mapping; prove. **(remaining)**
4. ✅ One-time migrate existing blob tool data into the tables (idempotent via legacy_id); verified.
5. ✅ Cut the live app over to the per-row layer for tool records (flag default on, build `hd`); blob path skipped for 'tools'; verified on the default path. **(checkouts cutover still pending — step 3)**
