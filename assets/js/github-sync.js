/* ============================================
   MIDWEST PSYCH FEST — GitHub Sync
   GitHub Contents API for cross-device admin:
   - Read/write repo files via GitHub API
   - Password hash stored in data/admin-config.json
     so any device with the right password can log in
   ============================================ */

const GH_PAT_KEY  = 'mpf_github_pat';
const GH_API      = 'https://api.github.com';
const GH_BRANCH   = 'main';

// ── Repo config (read from body data-repo) ────
function ghRepo() {
  return document.body.dataset.repo || 'bunjumun/MidwestPsychFest';
}
function ghPat() { return localStorage.getItem(GH_PAT_KEY) || ''; }
function ghSetPat(tok) {
  if (tok) localStorage.setItem(GH_PAT_KEY, tok.trim());
  else localStorage.removeItem(GH_PAT_KEY);
}

function _ghHeaders(needWrite) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const pat = ghPat();
  if (pat) h.Authorization = `Bearer ${pat}`;
  else if (needWrite) throw new Error('No GitHub token configured. Add your PAT in Settings.');
  return h;
}

// ── Read a file from the repo ─────────────────
// Returns { text, sha } or throws.
async function ghGetFile(path) {
  const [owner, repo] = ghRepo().split('/');
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/contents/${path}?ref=${GH_BRANCH}&_=${Date.now()}`,
    { headers: _ghHeaders(false) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.message || `GitHub ${res.status} for ${path}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  // GitHub returns base64 content with embedded newlines
  const text = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return { text, sha: data.sha };
}

// ── Read a JSON file from the repo ───────────
async function ghGetJSON(path) {
  const { text, sha } = await ghGetFile(path);
  return { data: JSON.parse(text), sha };
}

// ── Write a file to the repo ─────────────────
// sha is required when updating an existing file.
async function ghPutFile(path, text, commitMsg, sha) {
  _ghHeaders(true); // throws if no PAT
  const [owner, repo] = ghRepo().split('/');
  // btoa requires latin1; use encodeURIComponent + unescape for UTF-8
  const encoded = btoa(unescape(encodeURIComponent(text)));
  const body = { message: commitMsg, content: encoded, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ..._ghHeaders(true), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub write failed (${res.status})`);
  }
  return res.json();
}

// ── Write a JSON data file to the repo ───────
async function ghPutJSON(path, obj, commitMsg) {
  // Get current SHA (required for updates)
  let sha;
  try { const f = await ghGetFile(path); sha = f.sha; } catch(e) { /* new file */ }
  return ghPutFile(path, JSON.stringify(obj, null, 2) + '\n', commitMsg, sha);
}

// ── Delete a file from the repo ──────────────
async function ghDeleteFile(path, sha, commitMsg) {
  _ghHeaders(true);
  const [owner, repo] = ghRepo().split('/');
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ..._ghHeaders(true), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: commitMsg, sha, branch: GH_BRANCH }),
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub delete failed (${res.status})`);
  }
  return res.status === 404 ? null : res.json();
}

// ── Trigger a manual deploy ───────────────────
async function ghTriggerDeploy(workflowId) {
  const [owner, repo] = ghRepo().split('/');
  const wf = workflowId || 'deploy.yml';
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/actions/workflows/${wf}/dispatches`, {
    method: 'POST',
    headers: { ..._ghHeaders(true), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: GH_BRANCH }),
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Dispatch failed (${res.status})`);
  }
}

// ── Verify PAT is valid ───────────────────────
async function ghVerifyPat(pat) {
  const res = await fetch(`${GH_API}/user`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Token invalid or lacks permissions (${res.status})`);
  return res.json(); // { login, name, ... }
}

// ── Cross-device password config ──────────────
// Password hash lives at data/admin-config.json in the repo.
// Served publicly by GitHub Pages — any device can read it.
// Writing it requires a PAT with repo scope.
const ADMIN_CFG_PATH = 'data/admin-config.json';

async function ghFetchPasswordHash() {
  // Try the live site URL first (no PAT needed, no CORS issues)
  try {
    const res = await fetch('data/admin-config.json?_=' + Date.now());
    if (res.ok) {
      const cfg = await res.json();
      return cfg.pw_hash || null;
    }
  } catch(e) {}
  // Fallback: try GitHub raw URL
  try {
    const [owner, repo] = ghRepo().split('/');
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${GH_BRANCH}/${ADMIN_CFG_PATH}?_=${Date.now()}`
    );
    if (res.ok) {
      const cfg = await res.json();
      return cfg.pw_hash || null;
    }
  } catch(e) {}
  return null;
}

async function ghWritePasswordHash(hash, encryptedPat) {
  const cfg = { pw_hash: hash, _updated: new Date().toISOString() };
  if (encryptedPat) cfg.encrypted_pat = encryptedPat;
  return ghPutJSON(ADMIN_CFG_PATH, cfg, 'chore: update admin config');
}

// ── AES-GCM Encrypt / Decrypt (password-based) ─
async function _deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  // Use a fixed salt derived from the repo name — not secret, just prevents rainbow tables
  const salt = enc.encode('mpf-admin-' + ghRepo());
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithPassword(plaintext, password) {
  const key = await _deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Pack iv + ciphertext as base64
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decryptWithPassword(encrypted, password) {
  const key = await _deriveKey(password);
  const packed = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ── Encrypted PAT: read from admin-config.json ──
async function ghFetchEncryptedPat() {
  try {
    const res = await fetch('data/admin-config.json?_=' + Date.now());
    if (res.ok) {
      const cfg = await res.json();
      return cfg.encrypted_pat || null;
    }
  } catch(e) {}
  try {
    const [owner, repo] = ghRepo().split('/');
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${GH_BRANCH}/${ADMIN_CFG_PATH}?_=${Date.now()}`
    );
    if (res.ok) {
      const cfg = await res.json();
      return cfg.encrypted_pat || null;
    }
  } catch(e) {}
  return null;
}

// Decrypt PAT with admin password and load into system
async function ghUnlockPat(password) {
  const encrypted = await ghFetchEncryptedPat();
  if (!encrypted) throw new Error('No encrypted PAT found. Set one up in admin settings.');
  try {
    const pat = await decryptWithPassword(encrypted, password);
    ghSetPat(pat);
    return pat;
  } catch(e) {
    throw new Error('Wrong password — could not decrypt PAT.');
  }
}

// ── Cloud Draft ───────────────────────────────
// Saves transient editor state to data/draft-state.json on GitHub
// so edits survive across devices and browser clears without
// permanently committing to the live data files.
const DRAFT_PATH = 'data/draft-state.json';

async function ghSaveDraft(toolId, stateObj) {
  const draft = {
    toolId,
    savedAt: new Date().toISOString(),
    state: stateObj,
  };
  return ghPutJSON(DRAFT_PATH, draft, `draft: save ${toolId} in-progress edits`);
}

async function ghLoadDraft() {
  try {
    const { data } = await ghGetJSON(DRAFT_PATH);
    return data; // { toolId, savedAt, state }
  } catch(e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function ghDeleteDraft() {
  try {
    const { sha } = await ghGetFile(DRAFT_PATH);
    const [owner, repo] = ghRepo().split('/');
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${DRAFT_PATH}`, {
      method: 'DELETE',
      headers: { ..._ghHeaders(true), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'draft: clear draft after commit', sha, branch: GH_BRANCH }),
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Delete draft failed (${res.status})`);
    }
  } catch(e) {
    if (e.status !== 404) throw e;
  }
}

// ── PAT status check — call on admin init ─────
// Returns { valid: bool, login: string|null, error: string|null }
async function ghCheckPatStatus() {
  const pat = ghPat();
  if (!pat) return { valid: false, login: null, error: 'No PAT configured' };
  try {
    const user = await ghVerifyPat(pat);
    return { valid: true, login: user.login, error: null };
  } catch(e) {
    return { valid: false, login: null, error: e.message };
  }
}
