# ProBid Tools — Custody, Field Hand-Off & Dashboard Engineering Record (Oct 2026)

_Last updated: 2026-10-06. Covers the Tools-module work in builds **gr → gw**: the sync-clobber fix that was wiping tool checkouts, the custody chain-of-responsibility toggles, the formal two-party field hand-off (transfer-of-responsibility), and the dashboard Tools fixes. Companion to `root-cause-history-2026-10.md` (gf → gq); the blob-clobber theme described there is the same one that hit the Tools module in gr._

## Design goal — an airtight chain of responsibility

The whole Tools effort is about one thing: at every moment, **one named person is responsible for a tool**, and responsibility only moves by an accountable, recorded act. A tool is never in a limbo where nobody owns it, and it can never be handed to someone who didn't agree to take it. The custody state lives on **checkout records** (`DB.toolCheckouts`), not on the tool object — a tool is "out" when it has an active (non-returned) checkout, "available" when it has none. This distinction is the source of several bugs below.

## 1. Tool checkouts silently reverting — the blob-sync clobber (build gr)

**Symptom:** Joe reported the Tools module "not working like I intended" — checkout worked, but a required part wasn't being forced, you couldn't transfer after checkout, and you couldn't check a tool back in. The behaviors looked like broken logic.

**Root cause:** not the Tools logic at all. It was the same architectural fact behind most of the proposal-email saga — the client syncs whole collections to Supabase as blobs with **last-writer-wins**. A fresh checkout would be written to `DB.toolCheckouts` in memory, then the next cloud pull would overwrite the whole array with a stale copy that didn't have it, wiping the checkout. Every downstream action (transfer, check-in, verify) then had nothing to act on. Proved by watching a checkout exist, triggering a sync, and seeing it vanish.

**Fix (gr, in `js/auth.js`) — the anti-clobber pattern:**

- `saveDB` is wrapped so any local write stamps `window.__blobDirtyAt`.
- On a cloud pull, before applying the cloud copy of the blob collections, `_blobHasUnpushedChanges()` is checked; if the local copy has unpushed changes, `_pushBlobsToCloud()` runs **first** so local changes win, then the pull proceeds.
- A successful push stamps `window.__blobPushedAt`, clearing the dirty state.
- The guarded collections (`_BLOB_KEYS`) include `tools`, `toolCheckouts`, `checkoutLog`, `invLocations`, `invTransfers`, `toolLoans`, and the attendance/payroll blobs, so the same protection covers every whole-array collection, not just tools.

Net effect: a checkout (or transfer, or check-in) made locally can no longer be stomped by a background pull. The Tools logic was correct all along; it just needed its data to survive the sync.

## 2. Custody toggles — self check-in & take-as-is (builds gs, gt, gu)

A configurable chain-of-responsibility, set in **Settings → Inventory → Tool Custody**. `_toolCustodyCfg()` returns the flags; `setToolCustody(key, v)` persists them (camelCase keys in `DB.settings`, round-tripped through `company_settings.settings_json`). `_isOfficeRole()` gates office-only powers (owner / manager / back_office / office / project_manager).

- **Self check-in** (`selfCheckin`) — a tech can submit a return after hours without the office present; the tool moves to **Pending Verify** for later office inspection rather than closing the custody record immediately. The return modal offers "Verify Now" (office closes it) or "Verify Later (self check-in)".
- **Take-as-is checkout** (`asIs`) — another tech can take a tool out of the office **before** it has been office-verified from its previous return, accepting it in its current state. The old record is marked `as_is_released` (with `asIsReleasedTo/At/By`) and a new checkout is opened carrying `takenAsIs`, `asIsFrom`, `asIsAckBy`, `asIsApprovedBy`, and `asIsPriorCoId` — so the as-is acceptance is a recorded, attributable act, not a silent gap. Surfaced via a "📦 Check Out As-Is" button on the Pending Verify tab, gated by the toggle.
- **Require approval** (`requireApproval`) — optional office sign-off on these self-service actions.

**Location & Assigned Tech (gt).** The edit-tool form splits into **Location** (a tool's home — a dropdown of real inventory locations *plus* people) and **Assigned Tech** (a dropdown of existing team members). `assignedTech` is saved on the tool; the permanent-owner concept applies only to personal tools being loaned out. `_populateToolLocAssignLists()` fills both lists from `getLocations()` and the team roster.

**Polished as-is modal (gu).** Rebuilt to a high-end standard (explicit request: "no more half-ass skinning"): tool photo header, a capped scrolling parts list with photo thumbnails and REQUIRED/OPTIONAL badges, and an amber acknowledgment callout the taker must tick to accept responsibility.

## 3. Formal field hand-off — transfer of responsibility (build gv)

The most important part of the design. A transfer is **not** a one-way push; it is a **two-party handshake**. Responsibility moves only when the receiver affirmatively accepts.

**States (on the sender's checkout record):**

- `pendingTransfer` — `{ to, by, byUser, at, travel[], stay[], note, expiresAt }`. While this is set, the tool shows "⏳ Transfer pending → [receiver]" and the **sender stays responsible**. No new active custody exists yet.
- On accept, `_executeTransferMove()` runs a shared move: it closes the sender's record (`returnedAt`, `status='verified'`, `transferredTo`), opens the receiver's record (`transferMode`, `acceptedBy`, `acceptedAt`, `transferredFrom`, `acceptCondition`, `transferPriorCoId`), and — if the sender held pieces back — pushes a `isGroupSplit` record so the stayed-behind pieces remain with the sender.

**The three paths, each recorded distinctly:**

1. **Peer accept** (`transferMode:'peer'`, `acceptedBy` = receiver) — the sender sends a request (`sendTransferRequest(modalId,false)`) or hands off in person ("Accept Now", `acceptNow=true`). The receiver opens the Accept Hand-Off modal (`openAcceptTransfer`), confirms all parts present, ticks the green "I … received this tool … and accept responsibility" callout, and confirms (`confirmAcceptTransfer`). Only then does custody move.
2. **Dispute** (`disputeTransfer`) — the receiver declines with a reason. `pendingTransfer` is cleared, **no custody moves**, the sender stays responsible, and the record carries `transferDispute { by, reason, at }` so the office can see it bounced.
3. **Office brokered reassign** (`transferMode:'brokered'`, `brokeredBy` = office user, `acceptedBy:null`) — `brokerTransfer`, office-only (`_isOfficeRole()` + `allowBrokered`), optionally requiring manager/owner (`requireApprovalBrokered`). Moves custody immediately but is **clearly labeled an exception** — it is explicitly not peer-accepted, so the trail never pretends a receiver agreed when the office forced the move.

**Other properties:** 24-hour auto-expire of stale pending transfers (`_sweepExpiredTransfers()`, `transferExpiryHours`, run on every render); no-login techs accept on the sender's device; a legacy one-way `confirmTransfer` remains for when "require receiver acceptance" is turned off. Toggles live in the same Tool Custody settings card: require receiver acceptance (`transferRequireAccept`, default on), allow brokered (default on), brokered requires manager/owner (default off).

**Verification (2026-10-06, live in Joe's Chrome, `tools.js?v=20260919gv`, on the Fluke Network Tester):** all three paths confirmed by programmatic state checks (the renderer freezes during the heavy cold re-sync, so state was read from JS rather than screenshots where needed; the Accept modal itself was screenshotted and renders high-end).

- *Peer:* checkout to Tech A → request to Tech B with one part (OTDR) held back → while pending, Tech A still held and no new active custody existed → on accept, Tech A's record closed (`transferredTo: Tech B`), Tech B's opened (`peer`, `acceptedBy: Tech B`, `transferredFrom: Tech A`), and the held-back OTDR stayed with Tech A as a split. ✔
- *Dispute:* Tech B → Tech C request, Tech C declined with reason → pending cleared, no custody moved, Tech B stayed responsible, `transferDispute` recorded. ✔
- *Brokered:* office reassigned Tech B → Tech C → old record closed, new record `brokered`, `brokeredBy: Joe Kucinski`, `acceptedBy: null`. ✔

All test checkouts were then returned+verified through the app's own flow (tool back to **Available**), the state pushed to cloud, and the four synthetic Tech A/B/C history rows purged.

## 4. Dashboard "Tools" showed nothing — wrong data source (build gw)

**Symptom:** Joe noticed "tools on the dashboard doesn't push anything to the dashboard." The **Tools Out** stat tile sat at 0 and the **🔩 Tools** overview card always said "All tools accounted for," even with tools checked out.

**Root cause:** `renderDash()` in `js/reports.js` read the tool object's own `status` field — `tools.filter(t => t.status==='checked_out'||t.status==='out')` for the tile (line ~1421) and the same filter plus a nonexistent `t.checkedOutTo` for the overview card (line ~1583). But tool objects **don't carry a custody status** — out/available lives on `DB.toolCheckouts`. So both filters always returned empty.

**Fix (gw):** both spots now derive from active checkouts, matching the Tools page's own "Out" definition (an active, non-returned checkout whose status isn't `pending_verify`), deduped by `toolId` so a tool split across several field techs counts once:

- **Tile:** build a set of `toolId`s from `DB.toolCheckouts` where `!returnedAt && status!=='pending_verify'`; the count is its size.
- **Overview card:** list those same tools (deduped), one row each as "[tool name] — **[holder]**" from the checkout's `toName`, capped at 5 with a "+N more out" line.

Logic validated against a representative checkout set (out tool counted, split not double-counted, pending-verify and returned excluded) before deploy. Cache-bust token bumped `20260919gv` → `20260919gw` across `index.html`.

## Build timeline (quick reference)

- **gr** — anti-clobber for blob collections in `js/auth.js` (`_BLOB_KEYS`, `_ensureSaveDBWrapped`, `_blobHasUnpushedChanges`, `_pushBlobsToCloud`); fixes tool checkouts reverting. Same clobber theme as the gf→gq saga.
- **gs** — take-as-is checkout + self-check-in gating (`js/tools.js`).
- **gt** — Location (locations + people) & Assigned Tech (team dropdown) on the tool form; `_populateToolLocAssignLists`.
- **gu** — polished high-end as-is modal.
- **gv** — formal field hand-off handshake: pending state, peer accept, dispute, office-brokered exception, 24h expiry; `_executeTransferMove`, `sendTransferRequest`, `openAcceptTransfer`/`confirmAcceptTransfer`, `disputeTransfer`, `brokerTransfer`, `_sweepExpiredTransfers`. Settings toggles in `index.html` / `js/inventory.js`.
- **gw** — dashboard Tools Out tile + 🔩 Tools overview card read from `toolCheckouts` instead of the nonexistent `tool.status` (`js/reports.js`).
