# Feature spec — Selectable tagged accessories at checkout (Tools)

_Drafted 2026-10-07 from Joe's requirement. Target build: next session (Joe: "build the option into the tools in the next day or so"). Not started._

## The need (in Joe's words)

Tool "groupings" are really a **packing checklist / memory-jogger** — they prompt a tech ("do you need this?") so the guy who doesn't know the job doesn't forget the one thing he needed. Today optional parts can carry a photo and you tick which travel, but they're only recorded as "went with the parent" — they are NOT tracked as their own asset and can't go out alone.

Some of these go-with items are expensive (a $135 long drill bit, a $120 launch cable) and need real tracking. And the same accessory often isn't tied to one parent — a long bit might go with any drill, or a tech brings his own drill and just needs the bit.

**Ask:** let an optional checklist item BE a real, tagged tool that shows up as a selectable add-on when checking out a parent. Ticking it checks out *that specific tagged asset* under the same person/job, so you always know where it is — whether it went with a drill, a different drill, or by itself.

## What exists today (grounding)

- `tools` = the checkoutable unit (asset tag, photo, custody). `tool_checkouts` per-row (post-`id` cutover).
- `tool_linked_groups` = parts under ONE parent tool. Already has `asset_tag`, `photo_url`, and a `tracking_mode` enum incl. **`independent_optional`** (currently collapsed to "optional" in the app UI). A linked group is NOT independently checkoutable — `groupsIncluded` on a checkout just records which optional parts rode along with the parent.
- Checkout modal already renders optional linked groups as `cog-<id>` checkboxes ("which pieces travel"), and the transfer modal has `trg-<id>` travel/stay checkboxes. So "select which optional items go" UI already exists — it just isn't backed by independent asset custody.

## Proposed model

Introduce **accessory links**: an optional add-on that points to a real tool.

- A checklist item under a parent can be one of two kinds:
  1. **Reminder-only** (cheap): a linked group as today, no asset tag — pure "do you need this?" prompt. Unchanged.
  2. **Tracked accessory**: the checklist item references a standalone `tools` row (by tag / id). Expensive/shareable items (drill bits, launch cables).
- At checkout of the parent, the tech sees the checklist with photos and ticks what they're taking. For each ticked **tracked accessory**, create its OWN `tool_checkouts` record (same holder, job, date; `checkout_type` office_checkout), linked back to the parent checkout (e.g. `parent_checkout_id` or a `bundled_with` ref). Reminder-only items behave as today (ride in `groupsIncluded`).
- Return/transfer: a bundled accessory can come back with the parent (one action returns the set) OR be returned/kept on its own — because it has its own custody row. Same `CheckoutsDB` per-row guarantees apply.
- A tracked accessory can be checked out directly on its own (it's just a tool) — no parent needed.

## Data / schema sketch (additive, per the proven playbook)

- New table `tool_accessories` (or reuse/extend `tool_linked_groups` with an `accessory_tool_id uuid` column): maps `parent_tool_id` → `accessory_tool_id`, with `default_required boolean`, `sort_order`. A many-to-one-parent today; could go many-to-many later (one bit offered under several drills) via rows per (parent, accessory).
- `tool_checkouts`: add `bundled_parent_checkout_id uuid null` (which parent checkout this accessory went out with), so the set can be shown/returned together. Nullable → an accessory checked out alone just has it null.
- RLS: same model as the other tool tables (restrictive `active_users_only` + permissive active-user read/insert/update, no DELETE). DDL handed to Joe (MCP DDL is classifier-blocked).

## UI

- Tool editor: an "Accessories / checklist" section where you add reminder-only items (as now) OR attach an existing tool as a tracked accessory (search by tag/name), set default required/optional.
- Checkout modal: show the checklist with photos; tracked accessories render with their tag + current availability; ticking one bundles its checkout. Many-to-many later = a shared accessory can appear under multiple drills.
- Dashboard/"who has it": a bundled accessory shows its own holder; the parent view can show "+ 2 accessories out with this".

## Build order (same as every per-row cutover)

1. Additive SQL (table/columns + RLS) → Joe runs it.
2. Data layer in `CheckoutsDB` / a small `AccessoriesDB`, flag-gated, resolve tools via `getTools()` (not `window.DB`).
3. Self-test section: bundle an accessory at checkout → both parent + accessory get their own custody rows; return accessory alone; accessory checkout alone; two-writer safety.
4. Wire tool editor + checkout modal behind the flag; prove live; cut over with `?...=0` revert.

## Worksheet already feeds this

`TCSS-Tools-Inventory-Worksheet.xlsx` (2026-10-07) captures the needed mapping now:
- Tracked accessories are entered as their own **Tools** rows (own tag).
- The **Checklist (Groupings)** tab lists each item under a parent tool's tag, Required/Optional, with an **"Also a tracked tool? (its asset tag)"** column that references the standalone tool.
So when this feature is built, the import has parent → accessory links + required/optional already defined. No re-entry.

## Open questions for Joe (confirm at build time)

- Many-to-many from day one (one accessory offered under several parents), or start one-parent and expand? (Worksheet already allows listing the same item under multiple parents via multiple rows.)
- When a bundled accessory is returned, default to returning it with the parent, or always its own action?
- Should an accessory going out alone still decrement/flag anything, or just normal checkout?
