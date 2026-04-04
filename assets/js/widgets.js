/* ============================================
   MIDWEST PSYCH FEST — Widget Embed System
   Reads widget config from data/widgets.json
   (served by GitHub Pages) with localStorage
   fallback. Admin UI lives in admin.html.
   ============================================ */

const WIDGETS_KEY = 'mpf_widgets';
const WIDGETS_REMOTE_PATH = 'data/widgets.json';

// Detect current page name from filename (e.g. "index", "schedule", "map")
function _widgetPageName() {
  const path = window.location.pathname;
  const file = path.split('/').pop().replace(/\.html?$/, '') || 'index';
  return file === '' ? 'index' : file;
}

// Load widget config: try remote data/widgets.json first, fall back to localStorage
async function _loadWidgetConfig() {
  // Always check remote file first (cross-device source of truth)
  try {
    const res = await fetch(WIDGETS_REMOTE_PATH + '?_=' + Date.now());
    if (res.ok) {
      const remote = await res.json();
      // Merge into localStorage so offline/local tools still work
      try { localStorage.setItem(WIDGETS_KEY, JSON.stringify(remote)); } catch(e) {}
      return remote;
    }
  } catch(e) {}

  // Fallback: localStorage (for local dev or when remote isn't reachable)
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}

  return {};
}

// Apply the widget for the current page into #widget-slot
async function applyWidget(page) {
  const slot = document.getElementById('widget-slot');
  if (!slot) return;

  const widgets = await _loadWidgetConfig();
  const pageName = page || _widgetPageName();
  const w = widgets[pageName];

  if (!w || !w.code) {
    slot.style.display = 'none';
    return;
  }

  // Position the slot: above content, below content, or floating
  slot.className = 'widget-slot widget-slot--' + (w.position || 'below');
  slot.style.display = '';

  // Use createContextualFragment so <script> tags execute
  try {
    const frag = document.createRange().createContextualFragment(w.code);
    slot.innerHTML = '';
    slot.appendChild(frag);
  } catch(e) {
    slot.innerHTML = w.code;
  }
}

// Save widget config for a page (localStorage only — use Push to Site to publish)
function saveWidget(page, code, position) {
  let widgets = {};
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    if (raw) widgets = JSON.parse(raw);
  } catch(e) {}

  if (code && code.trim()) {
    widgets[page] = { code: code.trim(), position: position || 'below' };
  } else {
    delete widgets[page];
  }
  localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgets));
}

// Remove widget for a page
function clearWidget(page) {
  saveWidget(page, '', '');
}

// Get all configured widgets (from localStorage)
function getAllWidgets() {
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

// Auto-apply on load
document.addEventListener('DOMContentLoaded', () => applyWidget());
