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
echo "✅ all tests passed"
