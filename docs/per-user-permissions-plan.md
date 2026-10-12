# Per-User Permission Overrides (RBAC + per-person exceptions)

**STATUS: Phase 1 DELIVERED in delta `dj` (migration `_26`). Full editor chosen by Joe.**

_Decision (Joe, 2026-09-19): roles carry sensible DEFAULT permissions, and the **owner** can
grant an individual a permission **beyond** their role — or revoke one **below** it — per person.
This is required for multi-company licensing: every company draws these lines differently._

## Why (the model)
Standard multi-tenant RBAC: **effective permission = per-user override (if set) ELSE role default.**
- Role default comes from the permission matrix (`PERM_DEFS` + role-level saved overrides).
- Per-user override is explicit: **Allow** (grant beyond role), **Deny** (revoke below role), or **unset** (follow role).
- Only the **owner** may change overrides; every change is audited. Owner is exempt (always full access).

## Data (built)
- `profiles.perm_overrides jsonb not null default '{}'` — map of `{ "<permKey>": true|false }`. Absent = follow role.
- `can_view_pay` remains a separate bespoke flag (pay); Phase 2 may fold it in.

## Enforcement — client (built)
- `hasPermission(permKey)`: if role !== owner and `_currentUser.perm_overrides` has the key → return it;
  else role-matrix value. Owner never reduced by an override.
- `_currentUser` loads via `select('*')`, so overrides come along automatically.
- CAVEAT: DB RLS is role/office-level, not per-permission — determined users could still hit some tables
  directly. UI gating is correct for the pilot; per-user **server-side** RLS is Phase 2 hardening.

## Owner control — server (built)
- `set_user_perm_override(p_user_id uuid, p_key text, p_value boolean)` — owner-only, SECURITY DEFINER,
  audited. `p_value = null` clears (back to role default).
- `list_user_profiles()` returns `perm_overrides`.

## Owner UI (built)
- **Team → 🔑 User Login Access → "⚙ Access"** per user opens the **Customize Access** modal: all perms
  grouped, each **Default (role) / Allow / Deny** with the role default shown; a count badge on the row
  shows how many are non-default. Payroll perms are excluded (governed by the "Sees Pay" toggle).

## Immediate application (done)
- `settings.catalog` back_office default reverted to **0** — catalog editing is now a per-person elevation.
- TO DO (owner, when Dawn is approved Mon): open her "⚙ Access" → set **Edit Price Catalog = Allow**.
  Lisa stays Default (off). Same pattern for any future exception (quote.send, etc.).

## Phase 2 (later)
- Fold `can_view_pay` into `perm_overrides`; per-user **server-side** RLS enforcement for sensitive tables.

## Verification
- node --check + override precedence logic table (no-override→role; Allow→true; Deny→false; owner exempt).
- Live end-to-end (RPC round-trip + editor) to be run in-app after `dj` is uploaded.
