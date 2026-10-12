# Session Security — App Lock, PIN / Biometric Unlock, Password Eye (builds ga–gc, 2026-10-01)

Per-site, owner-controlled auto-lock layered on top of the normal Supabase login, plus a
show/hide password eye. Built after Joe noticed the app stayed logged in after days away
(the 8h idle timer only runs while a tab is open, so a closed-for-days app isn't covered).

## What shipped
- **Password eye** on the login screen — masked by default, tap to reveal/hide; reusable
  `togglePwVisibility()` (also used on the PIN screens).
- **Settings → Roles → "🔒 App Lock & Auto Sign-Out"** card (owner-only): master on/off,
  quick-lock delay (15/30/60/240 min), full re-login window (1/7/14/30 days), biometric
  allowed. **Defaults OFF** (true opt-in per company). Stored on `DB.settings`
  (`secLockEnabled`, `secQuickLockMins`, `secIdleReloginDays`, `secAllowBiometric`) → synced
  via `company_settings.settings_json`. No migration.
- **Behavior when ON:** reopen within quick-lock window → straight in; past it (with a
  credential) → PIN/biometric lock screen; past the re-login window (or expired session) →
  full email+password login; the 8h open-tab idle timer drops to the lock screen instead of a
  hard logout. Locking NEVER clocks anyone out / touches time data.
- **PIN:** 4–12 digits, stored per-device only as a PBKDF2-SHA256 **salted hash** (150k iters)
  in localStorage — never raw, never sent to the server. **5 wrong tries** → clears the
  quick-unlock and drops to full login; escalating delay on tries 3–4.
- **Biometric:** Face ID / fingerprint via WebAuthn passkey when the device/browser supports
  it and the site allows it; silently falls back to PIN otherwise.
- **Set / change PIN — two ways for every user:** the automatic first-login prompt, AND a
  **🔒 Set / change PIN** item in every user's avatar menu (shown whenever App Lock is on, no
  Settings access needed). The menu item closed the gap where a non-owner who dismissed the
  first prompt had no self-serve way to set one.
- **Save confirmation:** settings Save buttons now flash green **"✓ Saved"** for ~1.8s
  (App Lock, Access Policy, Notifications) via `flashSavedBtn()` — Joe couldn't tell a save
  took from the toast alone.

## Files
`js/applock.js` (new — lock manager, PIN crypto, WebAuthn, lock + setup overlays),
`js/auth.js` (onAuthed hook, idle-timeout delegation, eye helper, avatar-menu PIN item),
`js/core.js` (`saveSecuritySettings`/`loadSecuritySettings`, `flashSavedBtn`, wired into
Access Policy + Notifications saves), `js/dispatch.js` (`loadSecuritySettings` on the Roles
tab), `index.html` (login eye, Security card, menu item, script include). Version `20260919gc`.

## Verification
- **Unit (sandbox):** lock-timing decision (10 cases), PIN hash/verify + salting + 5-try
  lockout (12 cases) — all pass.
- **Live (owner, driven in the running app):** gc loaded; Security card saves and **persists to
  the cloud** (confirmed in `company_settings`); `loadSecuritySettings` populates the form from
  saved values; Save button flips blue→green "✓ Saved"→reverts; avatar **Set / change PIN** item
  shows when App Lock is on, opens the PIN screen, offers biometric, saves nothing until chosen.
- **Field:** Joe tested set-PIN → lock → unlock on a real device — "appeared to work properly."
- Gotcha logged: a scripted Save click once wrote blank defaults over the live setting because it
  clicked before the form finished loading — an automation-timing artifact, NOT a real-user bug
  (opening the card by hand loads values correctly). Setting was restored to on/60/7/biometric.

## Notes / future
- Without a PIN set, quick-lock can't trigger (needs a credential); only the full re-login
  window + 8h idle apply. The first-login prompt and menu item both drive PIN creation.
- Current live config (TCSS): App Lock **ON**, 1-hour quick-lock, 7-day re-login, biometric
  allowed.
- Not yet in the user manual — add an end-user "App Lock & PIN" section on the next manual pass.
- Aligns with engineering-standards "Session / authentication policy": login vs. on-the-clock
  stay independent; lock is a screen gate only.
