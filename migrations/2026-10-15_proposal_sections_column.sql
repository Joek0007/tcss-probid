-- Persist the Proposal Display Headings toggles (Executive / Assumptions / Exclusions /
-- Terms) per quote. They were saved only in the browser's local copy, so a cloud re-pull
-- (hard refresh) dropped them and they reverted to all-ON. Add a column so the sync layer
-- (auth.js: proposal_sections <-> q.proposalSections) can round-trip them.
-- Apply in the Supabase SQL editor (DDL via MCP is classifier-blocked).

alter table public.quotes add column if not exists proposal_sections jsonb;
