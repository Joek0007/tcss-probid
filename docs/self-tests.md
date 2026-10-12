# ProBid self-tests — run these to verify, don't re-test by hand

When you change a feature that has a self-test below, RUN the test and report its result
(e.g. "16/16 passed") before telling Joe it's done. This is part of the delivery gate —
it's how we stop shipping per-field regressions that Joe ends up catching.

How a new session knows a test exists: it's listed here (project docs persist across sessions)
and the test file is loaded in index.html. To run one, drive the live site in the browser and
call the function in the page console.

---

## qqSelfTest() — Quote: edit customer/contact → quote fields refresh

- **File:** `js/qq-selftest.js` (loaded by index.html; `window.qqSelfTest`).
- **Feature under test:** On a quote, the customer field dropdown has an **✏️ Edit** button per
  customer (`onCustomerInput` in js/worktracking.js → `editCustomerFromQuote` in js/quotes.js).
  Editing the customer or its contact and saving pushes the new values back onto the open quote
  via `refreshQuoteCustomerFields(custId)` (js/quotes.js). A contact, when selected, takes
  priority over customer values (name, title, phone, email, address) — same as `selectContact`.
- **What it asserts (16):** customer name / phone / email / street / city / state / zip / terms,
  and contact name / title / phone / email / street / city / state / zip.
- **How to run:** open a Quote in the app, then in the browser console: `qqSelfTest()`.
  Returns `{ passed, failed, total, failures[] }` and console.tables the detail. Expect **16/16**.
- **Safe:** zero footprint — it uses throwaway in-memory records, saves nothing to disk or cloud,
  and restores the quote's selection afterward. Re-runnable anytime.
- **Run it after any change to:** `js/quotes.js` (refreshQuoteCustomerFields, editCustomerFromQuote,
  saveCustomer, _saveInlineContact), `js/worktracking.js` (onCustomerInput, selectCustomer,
  selectContact), or the customer/contact modal in index.html.
- **Two bugs this guards against (both fixed 2026-10-11):**
  1. Inline contact save (`_saveInlineContact`) was local-only → must call `_pushContactToCloud(contact)`
     or the edit reverts on reload ("didn't save"). *(Not covered by the 16 DOM assertions — verify
     cloud persistence separately by reading the row back from Supabase after an edit.)*
  2. `refreshQuoteCustomerFields` only refreshed the contact **name** and left the customer phone in
     place → it must re-apply the selected contact on top so contact phone/email/title/address flow
     through. The 16 assertions cover this.

---

(Add future self-tests under their own heading as features get them.)
