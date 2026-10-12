# ProBid Root-Cause History — Proposal Email, Approval Portal & Contact Sync (Oct 2026)

_Last updated: 2026-10-05. Covers the cluster of proposal-email, approval-link, PDF, change-request, contact-reverting, and notify-list bugs worked through in builds **gf → gq**, with the root cause of each and how it was fixed and verified._

## The one underlying theme

Most of these bugs were not independent. The majority trace back to a single architectural fact: **the client syncs to Supabase as a blob (`pushAllToCloud`), where the browser's in-memory copy overwrites the cloud row (last-writer-wins).** Any field the client failed to carry correctly in memory — an approval token, a scope note, a valid-until date, a contact email, a notify recipient — would get silently stomped on the next sync. So a fix that looked correct in isolation would "revert" as soon as the app pushed again. Several of the fixes below are really about making sure the in-memory object keeps the right value so the sync stops clobbering it. This is worth remembering for any future field that mysteriously resets.

## 1. Proposal email rendering defects (builds gf, gg)

Three layout defects in the proposal email HTML (`buildEmailBodyHTML` in `js/quotes.js`): the header phone/website wrapped awkwardly, the footer "City, ST ZIP" orphaned the ZIP onto its own line, and the "Request Changes" button was clipped. Root cause was email-client CSS quirks (notably Outlook's Word rendering engine) rather than logic. Fixed by forcing `white-space:nowrap` on the header contact line, building the footer locality as a single `_emLocality` string ("City, ST ZIP") so it can't break mid-value, and correcting the button container sizing.

## 2. Proposal PDF showed raw HTML; approval portal rendered badly (build gh)

The Scope of Work was being dropped into the PDF and the customer approval portal as raw/escaped markup, because scope text pasted from Word, Google Docs, or ChatGPT carries messy nested tags, namespaced elements (`<o:p>`, `<w:…>`), conditional comments, and empty blocks. Root cause: no normalization step — the raw HTML was rendered directly.

Fix: a shared DOM-based sanitizer, **`cleanScopeHtml`**, that whitelists a small set of tags, unwraps spans/fonts, drops empty Word blocks, fixes invalid heading-wraps-block nesting, and escapes plain text with line breaks preserved. It runs in three places so the Scope of Work looks identical everywhere: the in-app quote view, the generated PDF (`buildPrintHTML`), and the customer approval portal (`portal.html`). The intent was explicitly "model how it was done in the quote" — same rendering path, same result.

## 3. Approval links returned "Proposal Not Found" (build gi + DB grant)

Customers clicking the approval link (and Joe testing from Gmail/Outlook, i.e. outside the app) got "Proposal Not Found." Two distinct causes stacked here:

First, a **permissions error**: the portal runs as the anonymous Supabase role, and the token lookup called a `SECURITY DEFINER` helper (`get_my_role()`) that the `anon` role lacked execute permission on — the portal got `42501 permission denied for function get_my_role`. Fixed with migration `portal_anon_grant_get_my_role_20261004` (`GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon`). Verified live from the device browser.

Second was the token-churn problem, below.

## 4. Approval button turned dark/pinkish-purple after clicking in Outlook (builds gi → gj)

After a click, the email's action button went purple in Outlook desktop. This is the classic "followed-hyperlink" color that Outlook's Word engine applies to visited links; a plain CSS `:visited` rule (gi) was not enough. Fixed in **gj** with **VML "bulletproof" buttons** — the Outlook-specific vector-markup button construction — plus explicit visited-state styling, so the button keeps its green/outline styling before and after clicking across clients.

## 5. Approval links broke again ("quote not found") after any update/refresh — token churn/clobber (builds gk, gl, gm, gn + DB trigger)

This was the stubborn one. A link would work, then break after Joe re-saved or refreshed the quote. Root cause was the blob-sync clobber acting on the **approval token**:

- `getQData` (in `js/reports.js`), which reads the form back into the quote object, **was not carrying `approvalToken`** — so every save produced a quote object with no token, and the sync pushed that null over the real token.
- The sync upserts in `js/auth.js` were also **writing `approval_token` on every push**, giving two code paths that could overwrite a good token with a stale or empty one.

Layered fix:

- **gk / gl** — removed `approval_token` from the two sync upserts in `auth.js` so ordinary syncs no longer touch the token at all.
- **DB trigger `preserve_approval_token`** — a server-side guard so that even if a null/blank token comes up in an update, the existing token is preserved rather than wiped.
- **gm** — `fireEmailQuote` now reuses the saved token instead of minting a new one: if `q.approvalToken` is empty it looks up the saved quote and reuses its token.
- **gn** — `getQData` now carries `approvalToken` through from the existing record so a save can't drop it.

Net effect: the token is generated once, preserved by the client on save, preserved by the server on update, and reused when emailing. Links stop dying on refresh.

## 6. `valid_until` reverted to the 30-day default after extension

After Joe extended a quote's expiration, it snapped back to quote-date + 30 days. Same clobber mechanism: the extended date wasn't surviving the in-memory round-trip, so the sync pushed the default. Addressed as part of the sync field-mapping cleanup (`vu` ↔ `valid_until` in `auth.js` push/pull), and the affected quote's date was restored directly in the DB.

## 7. Customer "Request Changes" produced no notification

A customer requesting changes from the portal silently did nothing — no email to the quoter. Two bugs in `portal.html`'s `sendChangesRequest`:

- It set `status: 'Followup'`, which is **not a valid value** in the `quote_status` enum, so Postgres rejected the whole update with `22P02` (invalid enum input).
- There was **no error check** on the update, so the rejection was swallowed and the UI acted as if it succeeded.

Fix: use the valid status `'Review'`, append the customer's note into `scope_notes`/`approval_note`, set `approval_status: 'changes_requested'`, and actually throw on error. The notification edge function (`notify-quote-approval`) then fires. Verified end-to-end: a real change request produced the email "✏️ Changes requested on Quote Proposal Q-2047 — PPG" to the quoter inbox.

## 8. "No proposal" / empty Scope in the generated PDF

The PDF sometimes rendered with no scope content. Root cause: `getQData` read the Scope of Work via `.value` on what is actually a **contenteditable `<div>`** (the rich-text notes editor has no `.value`), so it always came back empty. Fixed in **gn** to read `innerHTML` from the contenteditable element (falling back correctly when empty), so the scope reaches the PDF.

## 9. Contact email reverting to the original contact (e.g. Jeff Dixon) — build go

**Symptom:** Joe would override the contact email on a quote (swapping in his own address so the customer wouldn't get test notifications), and it would revert to the contact's saved email (Jeff Dixon / Jdixon@ppg.com on Q-2047).

**Why it happened:** this was partly the sync clobber and partly by-design — the quote pulls the contact's email, and there was no way to say "I mean to use a different email here" versus "I'm about to lose my edit." Rather than silently stripping or silently keeping, Joe chose the professional fix: a **confirmation prompt** that fires when you edit the email on the quote form, offering to save the change back to the contact.

**What was built (go):** a modal `#modal-email-contact-sync` wired to a `change` watcher on the quote's email field. When the typed email differs from the linked contact's saved email, it asks "Email differs from the contact" and offers three choices:

1. **Use this email for this quote only** — keeps the typed email on the quote, leaves the contact record untouched, and sets a per-value acknowledgment so it won't nag again for that same address.
2. **Also update [contact]'s saved email** — updates the contact record locally *and* pushes it to the cloud, so future quotes use the corrected email.
3. **Cancel — keep the contact's email** — reverts the field to the contact's saved email.

**Verification (2026-10-05, live in Joe's logged-in Chrome, build `quotes.js?v=20260919go`, against Q-2047 / Jeff Dixon):** the prompt fires correctly with the real values interpolated. Option 1 keeps the quote email and leaves the contact unchanged; the per-value ack correctly suppresses a repeat prompt for the same address but re-prompts for a different one. Option 3 reverts the field. Option 2 updated the contact both in memory and in the Supabase `contacts` row (confirmed by direct query). The test contact was then restored to Jdixon@ppg.com in both the cloud and the app, and Q-2047 itself was never saved during testing.

## 10. Removed employee (John Wilson) kept reappearing on the notification lists — build gq

**Symptom:** A former employee (John Wilson, spam3@tcss.com) kept showing back up in **Settings → Notifications → Quote Proposal Response Alerts → People to notify**, even though Joe had deleted him. Joe's concern was that something was actively re-adding him — a security worry.

**Why it happened (not a breach):** two things stacked.

- **Decoupled lists.** `DB.settings.notifyRecipients` stores *copied snapshots* of name/email/phone with **no link to the team table**. John was correctly soft-deleted from the team on 2026-09-25 (`team.is_active=false`, `deleted_at` set, `deleted_by`=Joe) and correctly excluded from the roster (the pull filters `is_active=true`), but nothing ever pruned him from this separate notify list. The same applies to the free-text `vehIssueEmailTo`, `absenceAlertSmsTo`, and `urgentWOAlertSmsTo` fields.
- **Blob-sync clobber.** `DB.settings` round-trips through `company_settings.settings_json` via the whole-DB last-writer-wins push, so even a manual removal could be resurrected by a stale in-memory copy from another tab/device.

**What was built (gq, in `js/auth.js`):** the notify lists now **reconcile against the team roster** instead of being standalone snapshots.

- `refreshRemovedTeamContacts()` queries the full `team` table (RLS policy "Authenticated users can read team" = `true`, so inactive/deleted rows are visible even though the normal roster pull filters them out) and builds sets of **removed** emails and phones — anyone `is_active=false` or `deleted_at`-set — minus any email/phone that *also* belongs to an active member (**re-hire safety**).
- `pruneNotifyRecipients()` drops matching entries from all four lists: `notifyRecipients` (objects, by email), `vehIssueEmailTo` (CSV emails), and `absenceAlertSmsTo` / `urgentWOAlertSmsTo` (CSV phones, compared via `_normPhone` on the last 10 digits so formatting differences don't matter). Entries that match **no** team record — shared mailboxes like shop@/fleet@, the office line, outside contacts — are always kept; only a departed employee's own contact is removed.
- It runs at the **end of every cloud pull** (authoritative clean, then a targeted `_pushSettingsToCloud()` so the cloud copy is corrected) and again **synchronously before every full push** (so a stale list can never be written). This makes it clobber-proof and self-healing for any future termination.

**Verification (2026-10-05):** logic unit-tested in isolation for all four lists and the edge cases (manual external recipient kept, re-hired active member kept, phone match across differing formats, shared mailboxes/office line untouched) — all pass. Live end-to-end: after gq deployed, Joe's session completed a sync and the reconcile fired on its own — the cloud `company_settings.settings_json.notifyRecipients` went from `[Joe, John Wilson]` to `[Joe]` (confirmed by direct query, `updated_at` 05:30:23), with `vehIssueEmailTo` / `absenceAlertSmsTo` / `urgentWOAlertSmsTo` left intact (all Joe's own active contact info). Note: the first load after a new build triggers a heavy full cold re-sync of the large dataset, which can leave the tab busy for a while — normal warm sessions don't re-pull.

## Build timeline (quick reference)

- **gf, gg** — proposal email header/footer/button layout.
- **gh** — `cleanScopeHtml` sanitizer for scope in app, PDF, and portal.
- **gi** — portal/approval CSS + initial visited-state attempt; paired with the `anon` grant on `get_my_role()`.
- **gj** — VML bulletproof email buttons (Outlook purple fix).
- **gk, gl** — stop sync from writing/clobbering `approval_token`.
- **gm** — `fireEmailQuote` reuses the saved approval token.
- **gn** — `getQData` carries `approvalToken`; reads scope from contenteditable `innerHTML`.
- **go** — contact-email confirmation prompt (`#modal-email-contact-sync`).
- **gp** — (superseded by gq) first cut of notify-list auto-prune, `notifyRecipients` only.
- **gq** — notify-list hygiene: reconcile `notifyRecipients` + vehicle/absence/urgent-WO alert lists against the team roster on every pull and push; `refreshRemovedTeamContacts`, `pruneNotifyRecipients`, `_normPhone`, `_pushSettingsToCloud` in `auth.js`.

Server-side: `preserve_approval_token` trigger, `guard_quote_approval_fields`, `notify_quote_approval_change` / `notify-quote-approval` edge function, and the `portal_anon_grant_get_my_role_20261004` grant.
