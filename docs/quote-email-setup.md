# Quote Proposal Email & Response Alerts — Setup & Reference

**Status:** Proposal email LIVE and verified end-to-end (2026-09-23). Response Alerts
(SMS + multi-recipient) built and deployed 2026-09-23 — pending Joe's live test.

## 1. Proposal email (send from the app)
Clicking **Email to Customer** on a quote opens a **Review & Send** dialog:
- Live HTML preview, editable **To** (multi, comma-separated) + **CC**, editable subject
- **From** = the logged-in user's @tcss.com address; nothing sends until **Send Proposal**

Sends via **Mailgun** (domain `tcss.com`), From = user's @tcss.com, Reply-To = same, with
the proposal **PDF attached** and branded HTML body. Quote marked **Sent** only on success.
Shipped delta **el**. Code: `js/quotes.js` (`buildEmailBodyHTML`, `openEmailQuoteModal`,
`sendQuoteConfirmed`, `fireEmailQuote`), modal `#modal-email-quote`, logo `assets/email-logo.png`.

## 2. Proposal Response Alerts (when a client acts on the approval link)
When a customer **approves** or **requests changes** on the portal (`portal.html?token=`),
a DB trigger (`trg_notify_quote_approval` → `notify_quote_approval_change()`) calls the
**`notify-quote-approval` edge function** (v3), which sends **email (Mailgun) and/or SMS
(ClickSend)** to the configured people. Keys stay server-side; nothing sensitive is in the
public portal.

Configured in **Settings → Notifications → "Proposal Response Alerts"** card:
- Notify on approval / on change requests (toggles)
- Notify the quoter (on/off) + Email / Text channels — quoter email from auth, cell from
  `profiles.phone` (by `quotes.created_by`)
- **People to notify** list — Add from Team (name/email/cell auto-filled) or add manually,
  each with its own **Email** and **Text** checkboxes

Settings persisted in `settings_json`: `notifyApprovalOn`, `notifyChangesOn`,
`notifyQuoterOn` (+ `notifyRep` alias), `notifyQuoterEmail`, `notifyQuoterSms`,
`notifyRecipients: [{name,email,phone,sendEmail,sendSms}]`. Legacy single `notifyEmail`
auto-migrates into the list. Shipped delta **em**; edge function deployed (v3).

To text the quoter, their **cell must be on their profile** (`profiles.phone`); otherwise
add them to the People list with a cell. SMS uses ClickSend (per-text cost).

## 3. DNS records (tcss.com) — for Mailgun deliverability
DNS is hosted at **SiteGround** (ns1/ns2.siteground.net); registrar Domains Priced Right;
mailboxes Microsoft 365. Edit in **SiteGround → Site Tools → Domain → DNS Zone Editor**.
- **SPF (edited):** `v=spf1 include:spf.protection.outlook.com include:mailgun.org -all`
- **DKIM (added TXT):** name `mailo._domainkey.tcss.com`, value `k=rsa; p=…` (from Mailgun)
Both verified live. **Do NOT** add Mailgun's Receiving MX (mxa/mxb) — inbound is Microsoft
365. Keep the M365 `selector1/2._domainkey` records. Tracking CNAME `email.tcss.com` optional.

## 4. Multi-tenancy note
Mailgun + ClickSend + From target tcss.com. For other companies, each tenant needs its own
verified sending domain + SPF/DKIM and its own mgKey/mgFrom/mgDomain/csUser/csKey/csFrom.
