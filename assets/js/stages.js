/* ============================================
   MIDWEST PSYCH FEST — Stages Registry
   + Entry Normalizer (v1 → v2)
   + Admin Auth (SHA-256 via Web Crypto)
   ============================================ */

// ── Stage Registry ────────────────────────────
const STAGES_KEY = 'mpf_stages';
let _stagesCache = null;

async function loadStages() {
  if (_stagesCache) return _stagesCache;
  try {
    const ls = localStorage.getItem(STAGES_KEY);
    if (ls) { _stagesCache = JSON.parse(ls); return _stagesCache; }
  } catch(e) {}
  try {
    const r = await fetch('data/stages.json');
    if (r.ok) { _stagesCache = await r.json(); return _stagesCache; }
  } catch(e) {}
  _stagesCache = {};
  return _stagesCache;
}

function getStageLabel(stage_id, fallback) {
  return (_stagesCache && _stagesCache[stage_id]) || fallback || stage_id || '';
}

// Accepts object {id: name} OR array [{id, name, ...}]
function saveStages(stagesInput) {
  let obj = stagesInput;
  if (Array.isArray(stagesInput)) {
    obj = {};
    stagesInput.forEach(s => { if (s.id) obj[s.id] = s.name || s.id; });
  }
  _stagesCache = obj;
  try { localStorage.setItem(STAGES_KEY, JSON.stringify(obj)); } catch(e) {}
}

function getAllStages() {
  return Object.assign({}, _stagesCache || {});
}

// ── Format Helpers ────────────────────────────
function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toDisplayTime(t24) {
  if (!t24) return '';
  const [h, m] = t24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

// "2026-05-08" → "Friday, May 8"
function isoToDayLabel(isoStr) {
  if (!isoStr) return '';
  const d   = new Date(isoStr + 'T12:00');
  const wkd = d.toLocaleDateString('en-US', { weekday: 'long' });
  const mon = d.toLocaleDateString('en-US', { month:   'long' });
  return `${wkd}, ${mon} ${d.getDate()}`;
}

// ── Entry Normalizer (v1 → v2) ────────────────
// Converts old internal format OR mpf_schedule.json entries to unified v2.
// dayMap: { 1: "Friday, May 8", 2: "Saturday, May 9" }
function normalizeEntry(raw, dayMap) {
  dayMap = dayMap || {};

  const band     = raw.band     || raw.artist || '';
  const stage    = raw.stage    || '';
  const stage_id = raw.stage_id || slugify(stage) || 'unknown-stage';

  // v1 uses integer day; v2 and mpf_schedule use string "Friday, May 8"
  let day  = raw.day;
  const date = raw.date || '';
  if (typeof day === 'number') {
    day = dayMap[day] || (day === 1 ? 'Day 1' : 'Day 2');
  }

  const set_time         = raw.set_time || raw.start || '';
  const set_time_display = raw.set_time_display || toDisplayTime(set_time);

  return {
    id:                 raw.id || ('s' + Date.now() + Math.random().toString(36).slice(2, 6)),
    band,
    stage_id,
    stage,
    day,
    date,
    set_time,
    set_time_display,
    status:             raw.status || 'confirmed',
    bio:                raw.bio    || '',
    image:              raw.image  || '',
    social:             raw.social || {},
    // Admin-only fields — never rendered publicly
    _email:             raw.email  || raw._email  || '',
    _arrive_by:         raw.arrive_by         || raw._arrive_by         || '',
    _arrive_by_display: raw.arrive_by_display || raw._arrive_by_display || toDisplayTime(raw.arrive_by || ''),
  };
}

// ── Admin Auth (SHA-256 via Web Crypto API) ───
const AUTH_PW_KEY    = 'mpf_admin_pw';      // stored SHA-256 hash
const AUTH_EMAIL_KEY = 'mpf_admin_email';   // recovery email (plaintext)
const AUTH_SESSION   = 'mpf_admin_unlocked'; // sessionStorage flag

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAdminPasswordSet()     { return !!localStorage.getItem(AUTH_PW_KEY); }
function isAdminSessionUnlocked() { return sessionStorage.getItem(AUTH_SESSION) === '1'; }
function lockAdminSession()       { sessionStorage.removeItem(AUTH_SESSION); }

async function verifyAdminPassword(input) {
  const stored = localStorage.getItem(AUTH_PW_KEY);
  if (!stored) return true;
  return (await sha256(input)) === stored;
}

async function setAdminPassword(newPw, email) {
  const hashed = await sha256(newPw);
  localStorage.setItem(AUTH_PW_KEY, hashed);
  if (email) localStorage.setItem(AUTH_EMAIL_KEY, email);
  sessionStorage.setItem(AUTH_SESSION, '1');
}

function clearAdminPassword() {
  localStorage.removeItem(AUTH_PW_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
  sessionStorage.removeItem(AUTH_SESSION);
}

function getAdminRecoveryEmail() {
  return localStorage.getItem(AUTH_EMAIL_KEY) || '';
}

function exportAdminConfig() {
  const cfg = {
    _note: 'MPF admin config — import via flash.html to restore credentials',
    mpf_admin_pw:    localStorage.getItem(AUTH_PW_KEY)    || '',
    mpf_admin_email: localStorage.getItem(AUTH_EMAIL_KEY) || '',
  };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'admin-config.json'; a.click();
  URL.revokeObjectURL(url);
}

// ── Auth Modal — Lock Screen ───────────────────
function showAuthModal(onSuccess) {
  document.getElementById('adminAuthOverlay')?.remove();

  const email       = getAdminRecoveryEmail();
  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, '*') + c)
    : '';

  const overlay = document.createElement('div');
  overlay.id        = 'adminAuthOverlay';
  overlay.className = 'admin-auth-overlay';
  overlay.innerHTML = `
    <div class="admin-auth-box" id="adminAuthBox">
      <div class="admin-auth-icon">⚙</div>
      <h2>Admin Access</h2>
      <p class="admin-auth-sub">Enter your password to unlock admin mode.</p>
      <div class="form-group" style="margin-top:20px;">
        <label>Password</label>
        <input type="password" id="adminAuthInput" placeholder="Enter password" autocomplete="current-password" />
      </div>
      <div id="adminAuthError" class="admin-auth-error" style="display:none;"></div>
      <button class="btn btn-primary w-full mt-2" id="adminAuthSubmit">Unlock</button>
      <div class="admin-auth-recovery">
        ${maskedEmail ? `<span>Recovery email: <strong>${maskedEmail}</strong></span>` : ''}
        <button class="admin-auth-reset-btn" id="adminAuthReset">Reset admin access</button>
      </div>
      <p class="admin-auth-note">⚠ Local deterrent only — not server-enforced.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  let attempts = 0;
  const input  = document.getElementById('adminAuthInput');
  const errEl  = document.getElementById('adminAuthError');
  const box    = document.getElementById('adminAuthBox');
  input.focus();

  async function tryUnlock() {
    const pw = input.value;
    if (!pw) return;
    const ok = await verifyAdminPassword(pw);
    if (ok) {
      sessionStorage.setItem(AUTH_SESSION, '1');
      overlay.remove();
      onSuccess();
    } else {
      attempts++;
      errEl.textContent  = `Incorrect password.${attempts >= 3 ? ' Too many attempts — wait 10s.' : ''}`;
      errEl.style.display = 'block';
      box.classList.add('admin-auth-shake');
      setTimeout(() => box.classList.remove('admin-auth-shake'), 500);
      input.value = '';
      if (attempts >= 3) {
        const btn = document.getElementById('adminAuthSubmit');
        btn.disabled = input.disabled = true;
        setTimeout(() => {
          btn.disabled = input.disabled = false;
          attempts = 0;
          errEl.style.display = 'none';
          input.focus();
        }, 10000);
      }
    }
  }

  document.getElementById('adminAuthSubmit').addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

  document.getElementById('adminAuthReset').addEventListener('click', () => {
    if (!confirm('This will clear all admin credentials. You will need to set a new password. Continue?')) return;
    clearAdminPassword();
    overlay.remove();
    onSuccess();
  });
}

// ── Set Password Modal — First Time ───────────
function showSetPasswordModal(onSuccess) {
  document.getElementById('adminSetPwOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'adminSetPwOverlay';
  overlay.className = 'admin-auth-overlay';
  overlay.innerHTML = `
    <div class="admin-auth-box">
      <div class="admin-auth-icon">⚙</div>
      <h2>Secure Admin Mode</h2>
      <p class="admin-auth-sub">Set a password to protect admin tools. You can skip for now, but this is recommended before going live.</p>
      <div class="form-group" style="margin-top:20px;">
        <label>New Password</label>
        <input type="password" id="setPwInput" placeholder="Choose a password" />
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" id="setPwConfirm" placeholder="Confirm password" />
      </div>
      <div class="form-group">
        <label>Recovery Email</label>
        <input type="email" id="setPwEmail" placeholder="your@email.com" />
      </div>
      <div id="setPwError" class="admin-auth-error" style="display:none;"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" id="setPwSubmit">Set Password</button>
        <button class="btn btn-ghost" id="setPwSkip">Skip for now</button>
      </div>
      <p class="admin-auth-note">Password is stored as a one-way hash in browser storage. Use "Export Admin Config" inside the admin panel to back it up.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const errEl = document.getElementById('setPwError');

  document.getElementById('setPwSubmit').addEventListener('click', async () => {
    const pw1   = document.getElementById('setPwInput').value;
    const pw2   = document.getElementById('setPwConfirm').value;
    const email = document.getElementById('setPwEmail').value.trim();
    if (!pw1)        { errEl.textContent = 'Please enter a password.';    errEl.style.display = 'block'; return; }
    if (pw1 !== pw2) { errEl.textContent = 'Passwords do not match.';     errEl.style.display = 'block'; return; }
    await setAdminPassword(pw1, email);
    overlay.remove();
    onSuccess();
  });

  document.getElementById('setPwSkip').addEventListener('click', () => {
    sessionStorage.setItem(AUTH_SESSION, '1');
    overlay.remove();
    onSuccess();
  });
}

// ── Main Auth Entry Point ─────────────────────
// Call this on gear icon click. onSuccess() opens the admin panel.
function openAdminWithAuth(onSuccess) {
  if (!isAdminPasswordSet()) {
    showSetPasswordModal(onSuccess);
  } else if (isAdminSessionUnlocked()) {
    onSuccess();
  } else {
    showAuthModal(onSuccess);
  }
}
