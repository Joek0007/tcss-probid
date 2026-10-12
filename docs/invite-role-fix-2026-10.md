# Invite role not propagating — root cause + fix (2026-10-04)

## Symptom
Joe invited Lisa Lammonds and Dawn Brown (Fri 2026-10-02). He switched a role at invite time;
the roster/login didn't reflect it. Both also still showed "invited."

## Findings (from the live DB)
- **"Invited" is correct until first sign-in.** Both accounts were created at invite and Joe
  approved them (profiles `is_active=true`), but neither had ever signed in or confirmed email
  (`last_sign_in_at`/`email_confirmed_at` null). The roster correctly shows "invited" until the
  person clicks the link, sets a password, and signs in. **Invite links expire (~24h), so the
  Friday links are dead — resend via Team → edit → Save & Send Invite.**
- **Root cause of the role mismatch:** `public.handle_new_user()` (trigger on new auth users)
  **hardcoded every new profile's role to `helper_tech`** and ignored the chosen role (comment:
  "NOT taken from metadata" — a deliberate anti-escalation choice). So the owner's chosen role
  only ever hit the roster (`team.role`), never the login profile (`profiles.role`). The existing
  write-through only syncs role *changes* later, not the initial invite.
- Their roster rows have existed since May (owner-created); the invite only created the auth
  account → TEAM_FIRST ordering, so the role is reliably present before the profile is born.

## Fix applied (DB migration `invite_role_sync_handle_new_user_20261004`, certified)
- New helpers `_role_from_text(text)` (maps legacy `office`→`back_office`, validates the
  `user_role` enum, safe-defaults `helper_tech`) and `resolve_invited_role(email)` (reads the role
  from the **owner-created, non-deleted** roster row for that email — trusted source, never the
  signup's own metadata, so no self-escalation).
- `handle_new_user()` now sets the new profile's role from `resolve_invited_role(new.email)`
  instead of hardcoded `helper_tech`; still lands PENDING (`is_active=false`) and keeps the
  never-block-signup exception guard. search_path pinned; execute revoked from public/anon/authenticated.
- Verified: `resolve_invited_role` / `_role_from_text` return correct values across real + edge
  cases. End-to-end proof is the next brand-new invite (existing profiles don't re-trigger it).

## Lisa & Dawn reconciled to Back Office (both stores)
Set both to `back_office` on roster AND login. **Gotcha learned:** `team` (roster) is
blob-synced from the client, so a direct SQL update to `team.role` gets **clobbered** when the
app next pushes its cached copy. The durable fix is to change the app's own copy first
(DB.team in memory + `saveDB()` to `tcssv8` localStorage), *then* write the cloud — once local and
cloud agree there's nothing to revert it. Done via Claude-in-Chrome on Joe's live session;
verified it held through a save+sync cycle. `profiles.role` is NOT blob-synced (set via
owner-gated RPC), so it persisted on its own.

## Still open for Joe (he's out ~2 days)
- Resend both invites (expired links) when back.
- When they first sign in, "invited" flips on its own; they'll have Back Office access.
