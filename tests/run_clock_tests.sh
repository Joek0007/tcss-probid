#!/usr/bin/env bash
# Run every clock test before shipping ANY clock/time-tracking change.
set -e
cd "$(dirname "$0")/.."
echo "── reconstruction unit suite ──";      node test_clock_restore.js
echo "── full-day lifecycle (refresh@each) ──"; node clock_lifecycle_e2e.js
echo "── live-handler harness (real handlers + fake DB + round-trip) ──"; node tests/clock_handlers.test.js
echo "── jobs->WO integration (approval=1 WO/0 jobs, project link, repair) ──"; node tests/approval_integration.test.js
echo "── live dashboard status (latest-event wins over stale session cache) ──"; node tests/dash_live_status.test.js
echo "✅ all tests passed"
