# ProBid Reliability Remediation Plan — the "real fix" (Oct 2026)

_Written 2026-10-06 after a night where tool photos were lost and a string of patches didn't hold. This is the deliberate, longer route that actually ends the "my work disappeared" problem, instead of patching symptoms on a fragile foundation. Execute top to bottom; do not start destructive work on the live system — use the staging environment (Step 2) for everything structural._

## The root cause (one sentence)

Tools, tool checkouts, checkout log, inventory locations/transfers, tool loans and similar collections are saved to the cloud as **one big blob per collection with "last writer wins."** Any stale copy — a background sync, a second tab, a fresh build reloading — can overwrite the fresh one, so edits (photos, parts, checkouts) silently vanish. Quotes, customers and work orders don't have this problem because they already live in **real per-record tables**. The cure is to make the fragile collections work the same way.

## What was already done (interim mitigations — NOT the cure)

- **Tool photos moved to Supabase Storage** (build gz): photos upload to the public `tool-photos` bucket and the record keeps only a short URL. The image bytes now live completely outside the blob sync, so even if the link were clobbered the picture itself is safe. Verified: a photo survived a hard refresh. This is why photos are now safe to re-add.
- **Anti-clobber flush on pull** (build gr): on a cloud pull, local unpushed blob changes are flushed first. Helps, but does not remove the underlying last-writer-wins design.

## Known concrete bugs to fix along the way

1. **Auto-save push is flaky.** On 2026-10-06, a normal in-app "Save" did not push to the cloud (the `app_state.tools` row didn't update); a *manual* `pushAllToCloud()` did. Interim seatbelt for the user: after editing, force a push and hard-refresh to confirm. Root-cause the debounced `saveDB` → `setTimeout(pushAllToCloud, 2000)` path (is it being cleared before firing? interrupted by modal close / navigation?).
2. **Invalid-UUID inventory record breaks inventory sync.** The `inventory` table's `id` is `uuid`, but at least one record has a legacy text id `inv-1788642022481`. Its sync (a PATCH / tombstone update) returns HTTP 400 every push. Migrate legacy `inv-…` ids to real UUIDs (or make the inventory sync skip/convert non-UUID ids). Audit how many such records exist (likely from a bulk import — note the `import_batch` column).

## The plan, in order

### Step 1 — Safety net first (so nothing is ever permanently lost again)
- The project is on Supabase's **free tier, which keeps no restorable backups** — that is why tonight's photos were unrecoverable. Options: upgrade to a tier with daily backups / point-in-time restore, **or** stand up our own automated export.
- Automated export option: a scheduled job that dumps the key tables + `app_state` blobs to a dated file (the app already has a client-side full-backup; the goal is to make it run on a schedule without someone remembering to click it).
- Deliverable: a backup that runs on a schedule, retained off the live DB, with a tested restore path. Until it exists, keep using the manual push + hard-refresh seatbelt after any important edit.

### Step 2 — Staging environment (so changes are proven before touching live)
- A separate deploy (its own URL) pointed at a **throwaway Supabase project/branch** seeded with copied-but-non-production data.
- All structural work below is built and verified on staging first; only proven changes go to the live site. This ends "the user is the tester."
- Deliverable: a staging URL + its own DB, and a one-page "how to deploy to staging vs. live" note.

### Step 3 — Move the fragile collections to real per-record tables
- Target collections (currently blob / last-writer-wins): `tools`, `toolCheckouts`, `checkoutLog`, `invLocations`, `invTransfers`, `toolLoans` (confirm the full set against `_BLOB_KEYS` in `auth.js`).
- For each: create a real table with a proper primary key, write per-row upsert/delete on save (mirroring the quotes/customers/work-orders pattern), and migrate existing blob data in once.
- Result: editing one tool writes only that tool's row and merges with others — a stale tab can no longer wipe the whole list. This is the structural end of the disappearing-data class of bug.
- Do it one collection at a time on staging, verify each (create → reload → still there → second-tab edit → both survive) before the next.

## Guardrails for all of it
- Follow the delivery gate: verify every change live (on staging) as a real user before it reaches the live site; never ship a code-checked-only guess.
- One verified change at a time over rapid patches.
- Keep this document updated as steps complete.
