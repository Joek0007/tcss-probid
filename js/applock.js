/* ============================================================================
 * TCSS ProBid — App Lock / Session Security  (js/applock.js)
 *
 * Per-site, owner-controlled auto-lock on top of the normal Supabase login.
 * Two independent locks:
 *   - Full login (email+password) — the real auth. Unchanged.
 *   - App lock (PIN / biometric)  — a fast gate over a still-valid session.
 *
 * Behavior (only when the site Security setting is ON):
 *   - Reopen within the quick-lock window      -> straight in.
 *   - Reopen after quick-lock window (has PIN)  -> PIN / biometric lock screen.
 *   - Reopen after the idle-relogin window      -> full email+password login.
 *   - The 8h open-tab idle timer drops to the lock screen (not a hard logout).
 *
 * Settings live on DB.settings (synced via company_settings.settings_json):
 *   secLockEnabled (bool, default false)  secIdleReloginDays (int, default 7)
 *   secQuickLockMins (int, default 60)     secAllowBiometric (bool, default true)
 *
 * Per-device secrets live in localStorage, namespaced per user id. The PIN is
 * never stored raw and never sent to the server — only a PBKDF2 salted hash.
 * Locking NEVER clocks anyone out or touches time/payroll data.
 * ========================================================================== */
(function () {
  'use strict';

  var DAY_MS = 86400000;
  var DEFAULTS = { enabled: false, idleReloginDays: 7, quickLockMins: 60, allowBiometric: true };
  var PBKDF2_ITER = 150000;
  var MAX_PIN_TRIES = 5;

  /* ---------- config (per-site) ---------- */
  function cfg() {
    var s = (typeof DB === 'object' && DB && DB.settings) ? DB.settings : {};
    return {
      enabled:         s.secLockEnabled === true,
      idleReloginDays: _posNum(s.secIdleReloginDays, DEFAULTS.idleReloginDays),
      quickLockMins:   _posNum(s.secQuickLockMins, DEFAULTS.quickLockMins),
      allowBiometric:  s.secAllowBiometric !== false
    };
  }
  function _posNum(v, dflt) { v = Number(v); return (isFinite(v) && v > 0) ? v : dflt; }

  /* ---------- safe localStorage (Safari private mode throws) ---------- */
  function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function _lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function _uid() {
    try { return (typeof _currentUser === 'object' && _currentUser && _currentUser.id) ? String(_currentUser.id) : ''; }
    catch (e) { return ''; }
  }
  var K_ACTIVE = 'probid_lastActive';
  function _pinKey(uid)  { return 'probid_pin_' + (uid || _uid()); }
  function _failKey(uid) { return 'probid_pinfail_' + (uid || _uid()); }
  function _pkKey(uid)   { return 'probid_passkey_' + (uid || _uid()); }

  /* ---------- last-active tracking ---------- */
  var _lastWrite = 0;
  function markActive() {
    var now = Date.now();
    if (now - _lastWrite < 15000) return; // throttle writes
    _lastWrite = now;
    _lsSet(K_ACTIVE, String(now));
  }
  function getLastActive() { var v = Number(_lsGet(K_ACTIVE)); return isFinite(v) && v > 0 ? v : 0; }
  function clearLastActive() { _lsDel(K_ACTIVE); }

  /* ---------- the decision (PURE — unit tested) ----------
   * returns 'ok' | 'quicklock' | 'relogin'
   */
  function lockDecision(nowMs, lastActiveMs, conf, hasCred) {
    if (!conf || !conf.enabled) return 'ok';
    if (!lastActiveMs) return 'ok';                 // no record yet on this device
    var idle = nowMs - lastActiveMs;
    if (idle < 0) idle = 0;
    if (idle >= conf.idleReloginDays * DAY_MS) return 'relogin';
    if (hasCred && idle >= conf.quickLockMins * 60000) return 'quicklock';
    return 'ok';
  }

  /* ---------- base64 <-> ArrayBuffer ---------- */
  function _bufToB64(buf) {
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function _b64ToBuf(b64) {
    var bin = atob(b64), len = bin.length, out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  function _randSaltB64(n) {
    var a = new Uint8Array(n || 16);
    (crypto.getRandomValues ? crypto : window.crypto).getRandomValues(a);
    return _bufToB64(a.buffer);
  }

  /* ---------- PIN hashing (PBKDF2-SHA256) ---------- */
  function _subtle() { return (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null; }
  async function _derive(pin, saltB64, iter) {
    var sub = _subtle();
    var enc = new TextEncoder();
    var keyMat = await sub.importKey('raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits']);
    var bits = await sub.deriveBits({ name: 'PBKDF2', salt: _b64ToBuf(saltB64), iterations: iter, hash: 'SHA-256' }, keyMat, 256);
    return _bufToB64(bits);
  }
  function _timingSafeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }
  async function setPin(pin, uid) {
    uid = uid || _uid();
    var salt = _randSaltB64(16);
    var hash = await _derive(pin, salt, PBKDF2_ITER);
    _lsSet(_pinKey(uid), JSON.stringify({ v: 1, salt: salt, iter: PBKDF2_ITER, hash: hash }));
    _lsDel(_failKey(uid));
    return true;
  }
  function hasPin(uid) { return !!_lsGet(_pinKey(uid || _uid())); }
  function clearPin(uid) { uid = uid || _uid(); _lsDel(_pinKey(uid)); _lsDel(_failKey(uid)); }
  async function verifyPin(pin, uid) {
    uid = uid || _uid();
    var raw = _lsGet(_pinKey(uid));
    if (!raw) return { ok: false, reason: 'nopin' };
    var rec; try { rec = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'corrupt' }; }
    var got = await _derive(pin, rec.salt, rec.iter || PBKDF2_ITER);
    if (_timingSafeEq(got, rec.hash)) { _lsDel(_failKey(uid)); return { ok: true }; }
    var fails = (Number(_lsGet(_failKey(uid))) || 0) + 1;
    _lsSet(_failKey(uid), String(fails));
    return { ok: false, reason: 'mismatch', fails: fails, exhausted: fails >= MAX_PIN_TRIES };
  }
  function pinFails(uid) { return Number(_lsGet(_failKey(uid || _uid()))) || 0; }

  /* ---------- biometric / passkey (WebAuthn, best-effort) ---------- */
  function biometricSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function hasPasskey(uid) { return !!_lsGet(_pkKey(uid || _uid())); }
  async function registerPasskey(uid, label) {
    uid = uid || _uid();
    if (!biometricSupported()) throw new Error('unsupported');
    var challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
    var userId = new TextEncoder().encode(uid);
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: challenge,
      rp: { name: 'TCSS ProBid', id: location.hostname },
      user: { id: userId, name: (label || uid), displayName: (label || 'ProBid user') },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none'
    }});
    if (!cred || !cred.rawId) throw new Error('no-credential');
    _lsSet(_pkKey(uid), _bufToB64(cred.rawId));
    return true;
  }
  async function verifyPasskey(uid) {
    uid = uid || _uid();
    var idB64 = _lsGet(_pkKey(uid));
    if (!idB64 || !biometricSupported()) return false;
    var challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
    try {
      var assertion = await navigator.credentials.get({ publicKey: {
        challenge: challenge,
        allowCredentials: [{ type: 'public-key', id: _b64ToBuf(idB64) }],
        userVerification: 'required', timeout: 60000, rpId: location.hostname
      }});
      return !!assertion;
    } catch (e) { return false; }
  }
  function clearPasskey(uid) { _lsDel(_pkKey(uid || _uid())); }

  /* ---------- lock overlay UI ---------- */
  var _locked = false;
  function isLocked() { return _locked; }

  function _overlay() {
    var el = document.getElementById('applock-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'applock-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:linear-gradient(135deg,#0d1b2a,#1b3a5c);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif';
    el.innerHTML =
      '<div style="width:320px;max-width:90vw;background:#fff;border-radius:16px;padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center">' +
        '<div style="font-size:15px;font-weight:800;color:#0d1b2a;letter-spacing:.5px">TCSS ProBid</div>' +
        '<div id="applock-sub" style="font-size:12px;color:#78909c;margin:4px 0 18px">Locked — enter your PIN</div>' +
        '<div style="position:relative;margin-bottom:10px">' +
          '<input id="applock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="PIN" ' +
            'style="width:100%;padding:12px 44px 12px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:18px;text-align:center;letter-spacing:4px;box-sizing:border-box" ' +
            'onkeydown="if(event.key===\'Enter\')AppLock.submitPin()">' +
          '<button type="button" id="applock-pin-eye" aria-label="Show PIN" title="Show PIN" onclick="togglePwVisibility(\'applock-pin\', this)" ' +
            'style="position:absolute;top:50%;right:6px;transform:translateY(-50%);background:none;border:none;padding:6px;cursor:pointer;color:#90a4ae;line-height:0;display:flex"></button>' +
        '</div>' +
        '<div id="applock-err" style="display:none;color:#c62828;font-size:12px;margin-bottom:10px"></div>' +
        '<button onclick="AppLock.submitPin()" style="width:100%;padding:12px;background:#1565c0;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">Unlock</button>' +
        '<button id="applock-bio" onclick="AppLock.unlockBiometric()" style="display:none;width:100%;margin-top:10px;padding:11px;background:#fff;color:#1565c0;border:1.5px solid #1565c0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">Use Face ID / Fingerprint</button>' +
        '<div style="margin-top:16px"><a href="#" id="applock-fulllogin" onclick="AppLock.fallbackToLogin();return false" style="font-size:12px;color:#78909c;text-decoration:none">Sign in with password instead</a></div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }

  function _setErr(msg) {
    var e = document.getElementById('applock-err');
    if (e) { e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }
  }

  function showLock() {
    var ov = _overlay();
    _locked = true;
    ov.style.display = 'flex';
    _setErr('');
    var pin = document.getElementById('applock-pin'); if (pin) { pin.value = ''; pin.type = 'password'; }
    var eye = document.getElementById('applock-pin-eye'); if (eye) eye.innerHTML = (typeof EYE_SHOW_SVG !== 'undefined' ? EYE_SHOW_SVG : '');
    var sub = document.getElementById('applock-sub');
    var bio = document.getElementById('applock-bio');
    var canBio = cfg().allowBiometric && hasPasskey() && biometricSupported();
    if (bio) bio.style.display = canBio ? 'block' : 'none';
    if (!hasPin()) { if (sub) sub.textContent = 'Locked — unlock to continue'; }
    else if (sub) sub.textContent = 'Locked — enter your PIN';
    if (pin) setTimeout(function () { try { pin.focus(); } catch (e) {} }, 50);
    if (canBio) unlockBiometric(); // offer it immediately
  }

  function _hideLock() {
    _locked = false;
    var ov = document.getElementById('applock-overlay');
    if (ov) ov.style.display = 'none';
    markActive();
  }

  async function submitPin() {
    var el = document.getElementById('applock-pin');
    if (!el) return;
    var pin = el.value || '';
    if (!pin) { _setErr('Enter your PIN'); return; }
    var res = await verifyPin(pin);
    if (res.ok) { _setErr(''); _hideLock(); return; }
    if (res.reason === 'nopin') { fallbackToLogin(); return; }
    var left = MAX_PIN_TRIES - (res.fails || 0);
    if (res.exhausted) {
      _setErr('Too many attempts — signing in with password.');
      clearPin();
      setTimeout(fallbackToLogin, 900);
      return;
    }
    // escalating delay on the 3rd and 4th wrong try
    var delay = (res.fails >= 3) ? (res.fails - 2) * 1500 : 0;
    el.value = '';
    if (delay) {
      _setErr('Incorrect PIN. Please wait…');
      el.disabled = true;
      setTimeout(function () { el.disabled = false; _setErr('Incorrect PIN — ' + left + ' tries left'); try { el.focus(); } catch (e) {} }, delay);
    } else {
      _setErr('Incorrect PIN — ' + left + ' tries left');
      try { el.focus(); } catch (e) {}
    }
  }

  async function unlockBiometric() {
    var ok = false;
    try { ok = await verifyPasskey(); } catch (e) { ok = false; }
    if (ok) { _hideLock(); }
    else { _setErr('Biometric unlock unavailable — use your PIN'); }
  }

  function fallbackToLogin() {
    _hideLock();
    clearLastActive();
    try { if (typeof signOut === 'function') { signOut(); return; } } catch (e) {}
    try { _sb.auth.signOut(); } catch (e) {}
    location.reload();
  }

  /* ---------- evaluation hooks ---------- */
  function evaluate(reason) {
    var conf = cfg();
    if (!conf.enabled) return;
    if (!_uid()) return;                 // not logged in -> normal login screen handles it
    if (_locked) return;                 // already showing
    var hasCred = hasPin() || (conf.allowBiometric && hasPasskey());
    var d = lockDecision(Date.now(), getLastActive(), conf, hasCred);
    if (d === 'quicklock') showLock();
    else if (d === 'relogin') { clearLastActive(); try { if (typeof signOut === 'function') return signOut(); } catch (e) {} try { _sb.auth.signOut(); } catch (e) {} location.reload(); }
    // 'ok' -> nothing; refresh the stamp
    if (d === 'ok') markActive();
  }

  // Called by auth when a user becomes active/logged in this session.
  function onAuthed() {
    if (!cfg().enabled) return;
    // If this device has never recorded activity, treat now as the start.
    if (!getLastActive()) markActive();
    else evaluate('authed');
    maybeOfferPinSetup();
  }

  // Called by the 8h open-tab idle timer instead of a hard logout.
  function onIdleTimeout() {
    var conf = cfg();
    if (!conf.enabled) return false;     // caller falls back to signOut
    var hasCred = hasPin() || (conf.allowBiometric && hasPasskey());
    if (hasCred) { showLock(); return true; }
    return false;                        // no PIN -> caller does normal signOut
  }

  /* ---------- PIN setup prompt (after login, if enabled & none set) ---------- */
  function maybeOfferPinSetup() {
    try {
      if (!cfg().enabled) return;
      if (hasPin()) return;
      if (_lsGet('probid_pinsetup_skipped_' + _uid()) === '1') return;
      setTimeout(openPinSetup, 800);
    } catch (e) {}
  }

  function openPinSetup() {
    var ov = document.getElementById('applock-setup');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'applock-setup';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99998;display:none;align-items:center;justify-content:center;background:rgba(13,27,42,.6);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif';
      ov.innerHTML =
        '<div style="width:340px;max-width:92vw;background:#fff;border-radius:16px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.4)">' +
          '<div style="font-size:16px;font-weight:800;color:#0d1b2a;margin-bottom:6px">Set a quick-unlock PIN</div>' +
          '<div style="font-size:12px;color:#607d8b;margin-bottom:16px">So you can get back in fast after the app locks, without retyping your password. You can change it later in Settings.</div>' +
          '<div style="position:relative;margin-bottom:10px">' +
            '<input id="applock-newpin" type="password" inputmode="numeric" maxlength="12" placeholder="New PIN (4+ digits)" autocomplete="off" style="width:100%;padding:11px 44px 11px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:16px;text-align:center;letter-spacing:3px;box-sizing:border-box">' +
            '<button type="button" id="applock-newpin-eye" onclick="togglePwVisibility(\'applock-newpin\', this)" aria-label="Show PIN" style="position:absolute;top:50%;right:6px;transform:translateY(-50%);background:none;border:none;padding:6px;cursor:pointer;color:#90a4ae;line-height:0;display:flex"></button>' +
          '</div>' +
          '<input id="applock-newpin2" type="password" inputmode="numeric" maxlength="12" placeholder="Confirm PIN" autocomplete="off" style="width:100%;padding:11px 14px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:16px;text-align:center;letter-spacing:3px;box-sizing:border-box;margin-bottom:10px">' +
          '<div id="applock-setup-err" style="display:none;color:#c62828;font-size:12px;margin-bottom:10px"></div>' +
          '<button onclick="AppLock.savePinSetup()" style="width:100%;padding:12px;background:#1565c0;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">Save PIN</button>' +
          '<button id="applock-setup-bio" onclick="AppLock.enableBiometricFromSetup()" style="display:none;width:100%;margin-top:10px;padding:11px;background:#fff;color:#1565c0;border:1.5px solid #1565c0;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">Also enable Face ID / Fingerprint</button>' +
          '<div style="text-align:center;margin-top:14px"><a href="#" onclick="AppLock.skipPinSetup();return false" style="font-size:12px;color:#90a4ae;text-decoration:none">Not now</a></div>' +
        '</div>';
      document.body.appendChild(ov);
    }
    var eye = document.getElementById('applock-newpin-eye'); if (eye) eye.innerHTML = (typeof EYE_SHOW_SVG !== 'undefined' ? EYE_SHOW_SVG : '');
    var bioBtn = document.getElementById('applock-setup-bio');
    if (bioBtn) bioBtn.style.display = (cfg().allowBiometric && biometricSupported()) ? 'block' : 'none';
    ov.style.display = 'flex';
  }
  function _setupErr(m) { var e = document.getElementById('applock-setup-err'); if (e) { e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; } }
  async function savePinSetup() {
    var a = (document.getElementById('applock-newpin') || {}).value || '';
    var b = (document.getElementById('applock-newpin2') || {}).value || '';
    if (!/^\d{4,12}$/.test(a)) { _setupErr('PIN must be 4–12 digits'); return; }
    if (a !== b) { _setupErr('PINs do not match'); return; }
    await setPin(a);
    _setupErr('');
    var ov = document.getElementById('applock-setup'); if (ov) ov.style.display = 'none';
    if (typeof showToast === 'function') showToast('Quick-unlock PIN set ✓', 'success');
  }
  function skipPinSetup() {
    try { _lsSet('probid_pinsetup_skipped_' + _uid(), '1'); } catch (e) {}
    var ov = document.getElementById('applock-setup'); if (ov) ov.style.display = 'none';
  }
  async function enableBiometricFromSetup() {
    try {
      var name = (typeof _currentUser === 'object' && _currentUser && _currentUser.email) ? _currentUser.email : 'ProBid user';
      await registerPasskey(_uid(), name);
      if (typeof showToast === 'function') showToast('Biometric unlock enabled ✓', 'success');
      var b = document.getElementById('applock-setup-bio'); if (b) { b.textContent = 'Biometric enabled ✓'; b.disabled = true; b.style.opacity = .6; }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Could not enable biometric on this device', 'error');
    }
  }

  /* ---------- activity + lifecycle listeners ---------- */
  function _wire() {
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () { if (!_locked) markActive(); }, { passive: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') evaluate('visible'); else markActive();
    });
    window.addEventListener('pageshow', function () { evaluate('pageshow'); });
    window.addEventListener('focus', function () { evaluate('focus'); });
    window.addEventListener('pagehide', function () { markActive(); });
    window.addEventListener('beforeunload', function () { markActive(); });
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wire);
    else _wire();
  }

  /* ---------- public API ---------- */
  var API = {
    lockDecision: lockDecision, cfg: cfg,
    markActive: markActive, getLastActive: getLastActive, clearLastActive: clearLastActive,
    setPin: setPin, verifyPin: verifyPin, hasPin: hasPin, clearPin: clearPin, pinFails: pinFails,
    biometricSupported: biometricSupported, hasPasskey: hasPasskey,
    registerPasskey: registerPasskey, verifyPasskey: verifyPasskey, clearPasskey: clearPasskey,
    showLock: showLock, isLocked: isLocked, submitPin: submitPin, unlockBiometric: unlockBiometric,
    fallbackToLogin: fallbackToLogin, evaluate: evaluate, onAuthed: onAuthed, onIdleTimeout: onIdleTimeout,
    openPinSetup: openPinSetup, savePinSetup: savePinSetup, skipPinSetup: skipPinSetup,
    enableBiometricFromSetup: enableBiometricFromSetup, maybeOfferPinSetup: maybeOfferPinSetup,
    MAX_PIN_TRIES: MAX_PIN_TRIES, DEFAULTS: DEFAULTS
  };
  if (typeof window !== 'undefined') window.AppLock = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
