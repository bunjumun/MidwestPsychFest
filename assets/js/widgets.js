/* ============================================
   MIDWEST PSYCH FEST — Widget Embed System
   Reads mpf_widgets from localStorage and
   injects embed code into #widget-slot on
   each page. Admin UI lives in admin.html.
   ============================================ */

const WIDGETS_KEY = 'mpf_widgets';

// Detect current page name from filename (e.g. "index", "schedule", "map")
function _widgetPageName() {
  const path = window.location.pathname;
  const file = path.split('/').pop().replace(/\.html?$/, '') || 'index';
  return file === '' ? 'index' : file;
}

// Apply the widget for the current page into #widget-slot
function applyWidget(page) {
  const slot = document.getElementById('widget-slot');
  if (!slot) return;

  let widgets = {};
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    if (raw) widgets = JSON.parse(raw);
  } catch(e) {}

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

// Save widget config for a page
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

// Get all configured widgets
function getAllWidgets() {
  try {
    const raw = localStorage.getItem(WIDGETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

// Auto-apply on load
document.addEventListener('DOMContentLoaded', () => applyWidget());
