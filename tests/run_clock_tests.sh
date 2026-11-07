#!/usr/bin/env bash
# Run every clock test before shipping ANY clock/time-tracking change.
set -e
cd "$(dirname "$0")/.."
echo "── reconstruction unit suite ──";      node test_clock_restore.js
echo "── full-day lifecycle (refresh@each) ──"; node clock_lifecycle_e2e.js
echo "── live-handler harness (real handlers + fake DB + round-trip) ──"; node tests/clock_handlers.test.js
echo "── jobs->WO integration (approval=1 WO/0 jobs, project link, repair) ──"; node tests/approval_integration.test.js
echo "── live dashboard status (latest-event wins over stale session cache) ──"; node tests/dash_live_status.test.js
echo "── WO field permissions (tech reads but can't change description/resolution) ──"; node tests/wo_perms.test.js
echo "── sync last-writer-wins merge (offline edits survive; no clobber of untouched) ──"; node tests/lww_merge.test.js
echo "── post-sync redraw (new rows show without a full reload; modal-safe) ──"; node tests/rerender_after_sync.test.js
echo "── changed-only push r32 (untouched records skipped; edits/new always push) ──"; node tests/changed_push_r32.test.js
echo "── sync convergence net (2 clients: stale session never clobbers; edits+offline survive) ──"; node tests/sync_convergence.test.js
echo "── quote extras round-trip (equipment/per-diem/svc/discount-type/exec/dates survive sync) ──"; node tests/quote_extras_roundtrip.test.js
echo "── quote lifecycle 2-device (create/edit/delete/offline converge; no clobber; no resurrect) ──"; node tests/quote_lifecycle.test.js
echo "── version gate (stale build is blocked from writing shared data; only strictly-newer blocks) ──"; node tests/version_gate.test.js
echo "── version-gate chokepoint (ALL writes app-wide suppressed on stale build; reads always pass) ──"; node tests/version_gate_chokepoint.test.js
echo "── WO lifecycle 2-device (offline edit survives pull; stale tab no-clobber; reload gate; hash trap) ──"; node tests/wo_lifecycle.test.js
echo "── invoice lifecycle 2-device (offline edit survives; cross-device no-revert; stale no-clobber; reload gate) ──"; node tests/invoice_lifecycle.test.js
echo "── field-tech WO visibility (techs load their assigned work orders; office pull stays gated) ──"; node tests/tech_wo_load.test.js
echo "── WO expense preserve (a just-added expense is not dropped by the full-replace pull) ──"; node tests/wo_expense_preserve.test.js
echo "── WO children + payments preserve (just-added parts/labor/checklist/payments not dropped by full-replace pull) ──"; node tests/wo_children_preserve.test.js
echo "── post-sync redraw covers WO + field + dash (new tag/status appears without a manual reload) ──"; node tests/rerender_pages.test.js
echo "── clock-is-timesheet Phase 1 (clock-in opens the day line; excluded from payroll; zero movement; edit-safe) ──"; node tests/clock_timesheet_line.test.js
echo "── clock paid-hours math (base/office paid; lunch subtracted; break not double-counted; Lisa 7h28m) ──"; node tests/clock_paid_hours.test.js
echo "── clock-punch visibility (My Hours + office show the day's in/out/break/lunch punches) ──"; node tests/punch_timeline.test.js
echo "── work notes (tech owns own-day note; office edits any; every change audited; r48 no auto-lock) ──"; node tests/work_note.test.js
echo "── day lock (soft lock=time.correct; processed=sealed; reopen needs payroll.unlock; all audited) ──"; node tests/day_lock.test.js
echo "── clock day split (overnight splits at midnight; forgot-clock-out capped at 24h+flagged; sums exact) ──"; node tests/clock_day_split.test.js
echo "── WO status workflow (field=mobile statuses; closed=locked; auto NEW→In-Progress only from NEW) ──"; node tests/wo_status_workflow.test.js
echo "── WS-1 status gate (every ghost literal → a configured id; unknown untouched; setWOStatus audits+pushes) ──"; node tests/wo_status_gate.test.js
echo "── WS-2 env storage isolation (prod keeps tcssv8; staging gets its own store; prod key always wins) ──"; node tests/env_storage_isolation.test.js
echo "── WS-3a child changed-only (pulled===local hash; unchanged skip; edit pushes; payroll too) ──"; node tests/wo_children_changedpush.test.js
echo "── WS-3b WO-child windowing (pulls bounded; on-demand loader seeds snapshot; no re-push churn) ──"; node tests/wo_child_windowing.test.js
echo "── #6 field job label (tech clock list + pickers lead with WO# · description; no bare numbers, no dup) ──"; node tests/field_job_label.test.js
echo "── #5 tech dashboard hand-off hide (a handed-off WO drops off Today's Schedule like it drops off the WO list; owner-toggle respected) ──"; node tests/dash_handoff_hide.test.js
echo "── #4 WO tech filter gate (field logins never offer office-only statuses — chips + dropdown; owner unaffected) ──"; node tests/wo_tech_filter_gate.test.js
echo "── #3 dispatch reschedule-follow (a job rescheduled to another day no longer vanishes; board follows it; drag-state reset) ──"; node tests/dispatch_reschedule_follow.test.js
echo "── #2 clock destination picker (office↔WO two-way; per-destination segments on the workDay; itemized per-leg rows; payroll-excluded; mid-office restore) ──"; node tests/clock_destination_picker.test.js
echo "── ★ HARDENING PROOF SUITE: red-then-green reproductions of every hardened failure (clobber/leak/payroll/status/windowing/segments) ──"; node tests/hardening_proof.test.js
echo "── ★ PILOT SMOKE: office↔field WO lifecycle end-to-end (create→assign→tech-sees→clock-in auto-status→field→office pricing/invoicing→closed locks+drops; two-device convergence at every hand-off) ──"; node tests/wo_lifecycle_smoke.test.js
echo "── r85 deploy-smoothness (SW install precache parses+caches the app JS, crash-proof; boot splash wired, no white flash) ──"; node tests/sw_precache_boot.test.js
echo "── r86 approval-token persistence (portal link always resolves; Q-2071 404 red-then-green; stable/idempotent; offline-safe) ──"; node tests/approval_token_persist.test.js
echo "── Phase 1 portal e-signature (quote-first write; token-gated signature record w/ PNG+consent+total-at-time; expiry blocks; change-request audited) ──"; node tests/portal_signature.test.js
echo "── r87 proposal approval link (click-tracking off so the Approve link isn't rewritten through a dead tracking domain) ──"; node tests/proposal_email_link.test.js
echo "── r88 office signed-approval view (Quote Details shows the customer's signature + audit; scoped to the quote; empty-safe; typed vs drawn) ──"; node tests/office_signed_view.test.js
echo "── r89 durable notifications (fragile local approval bell retired; approvals now post to the cross-device wt_notifications feed via DB trigger) ──"; node tests/durable_notifications.test.js
echo "── r91 Needs Action queue (signed-but-unconverted + change requests surface on the office dashboard; drops off once a WO exists) ──"; node tests/needs_action_queue.test.js
echo "── r92 claim round-trip (Needs Action 'Claim' rides quote_extras; survives sync; unclaimed stays null) ──"; node tests/claim_roundtrip.test.js
echo "── r93 escalation settings (owner-configurable; fail-safe/opt-out on·24h·48h; keys ride settings_json the pg_cron job reads) ──"; node tests/escalation_settings.test.js
echo "── r94 WO status-save + chips (Dawn: detail dropdown auto-saves like the list badge; quote-in-id chip filters; hand-off hidden from tech chips but still settable) ──"; node tests/wo_status_save_and_chips.test.js
echo "── r95 legacy proposal-terms cleanup (old qq-tc/s-tc/assumptions/exclusions/T&C-by-job-type editors removed; builder intact; stored tc not blanked) ──"; node tests/terms_cleanup.test.js
echo "── r96 Proposal Terms drag-reorder (▲▼ → click-drag handle, mouse+touch; same-card constrained; dead 'edit wording' link/hint removed, Exec Summary link kept) ──"; node tests/qt_drag_reorder.test.js
echo "── r97 quote-list action buttons (tiny icon squares → readable labeled buttons; same handlers; row wraps) ──"; node tests/quote_list_actions.test.js
echo "✅ all tests passed"
