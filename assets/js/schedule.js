/* ============================================
   MIDWEST PSYCH FEST — Schedule Page JS
   v2: unified format, stage registry, admin auth
   ============================================ */

const SCHEDULE_KEY  = 'mpf_schedule';
const INFO_KEY      = 'mpf_info';
const DEFAULT_SCHEDULE_URL = 'data/schedule.json';

let schedule    = [];
let dayMap      = {};   // { 1: "Friday, May 8", 2: "Saturday, May 9" }
let activeDay   = null; // day string e.g. "Friday, May 8" or 'all'
let activeStage = 'all'; // stage_id or 'all'
let adminOpen   = false;
let editingSetId = null;

// ── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  dayMap = await buildDayMap();
  await loadStages();
  await loadSchedule();
  hydrateDayButtons();
  buildStageFilters();
  renderSchedule();
  bindDayToggle();
  bindStageFilters();
  bindAdmin();
  bindNav();
});

// ── Day Map (from info.json / localStorage) ───
async function buildDayMap() {
  let info = {};
  try {
    const ls = localStorage.getItem(INFO_KEY);
    if (ls) info = JSON.parse(ls);
  } catch(e) {}
  if (!info.day1) {
    try {
      const r = await fetch('data/info.json');
      if (r.ok) info = await r.json();
    } catch(e) {}
  }
  return {
    1: isoToDayLabel(info.day1) || 'Friday, May 8',
    2: isoToDayLabel(info.day2) || 'Saturday, May 9',
  };
}

// Hydrate day toggle buttons with real date labels
function hydrateDayButtons() {
  const btn1 = document.querySelector('.day-btn[data-day="1"]');
  const btn2 = document.querySelector('.day-btn[data-day="2"]');
  if (btn1) btn1.textContent = dayMap[1];
  if (btn2) btn2.textContent = dayMap[2];

  // Set default active day to the first day string
  activeDay = dayMap[1];
}

// ── Data ─────────────────────────────────────
async function loadSchedule() {
  let raw = [];
  const saved = localStorage.getItem(SCHEDULE_KEY);
  if (saved) {
    try { raw = JSON.parse(saved); } catch(e) {}
  }
  if (!raw.length) {
    try {
      const res = await fetch(DEFAULT_SCHEDULE_URL);
      if (res.ok) raw = await res.json();
    } catch(e) {}
  }
  // Normalize every entry to v2 (handles old v1 format transparently)
  schedule = raw.map(e => normalizeEntry(e, dayMap));
}

function saveSchedule() {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  // Notify other open tabs (e.g. email tool) that schedule changed
  window.dispatchEvent(new StorageEvent('storage', { key: SCHEDULE_KEY }));
}

// ── Import — MPF Band Tool format ─────────────
function importMpfSchedule(parsed) {
  // Extract and save stage registry
  if (Array.isArray(parsed.stages) && parsed.stages.length) {
    saveStages(parsed.stages);
  }
  // Normalize schedule entries
  const entries = Array.isArray(parsed.schedule) ? parsed.schedule : [];
  schedule = entries.map(e => normalizeEntry(e, dayMap));
  // Assign IDs if missing
  schedule.forEach((s, i) => { if (!s.id) s.id = 's' + Date.now() + i; });
  saveSchedule();
  buildStageFilters();
  renderSchedule();
  renderStageEditor();
}

// ── Filters ───────────────────────────────────
function getUniqueStageIds() {
  return [...new Set(schedule.map(s => s.stage_id))].sort();
}

function buildStageFilters() {
  const container = document.querySelector('.stage-filters');
  if (!container) return;
  container.querySelectorAll('[data-stage-id]').forEach(b => b.remove());
  getUniqueStageIds().forEach(sid => {
    const btn = document.createElement('button');
    btn.className         = 'stage-btn';
    btn.dataset.stageId   = sid;
    btn.textContent       = getStageLabel(sid);
    container.appendChild(btn);
    btn.addEventListener('click', () => {
      activeStage = sid;
      updateStageButtons();
      renderSchedule();
    });
  });
}

function updateStageButtons() {
  document.querySelectorAll('.stage-btn').forEach(b => {
    const isAll   = b.dataset.stage === 'all';
    const matchId = b.dataset.stageId === activeStage;
    b.classList.toggle('active', isAll ? activeStage === 'all' : matchId);
  });
}

function bindDayToggle() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.day;
      activeDay = val === 'all' ? 'all' : (dayMap[parseInt(val)] || val);
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSchedule();
    });
  });
}

function bindStageFilters() {
  const allBtn = document.querySelector('[data-stage="all"]');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      activeStage = 'all';
      updateStageButtons();
      renderSchedule();
    });
  }
}

// ── Render ────────────────────────────────────
// Outdoor stage IDs that merge into one column in all-stages view
const OUTDOOR_STAGE_IDS = new Set(['outdoor-stage-a', 'outdoor-stage-b']);

function renderSchedule() {
  const grid = document.getElementById('scheduleGrid');
  if (!grid) return;

  let sets = schedule.filter(s => {
    if (activeDay !== 'all' && s.day !== activeDay) return false;
    if (activeStage !== 'all' && s.stage_id !== activeStage) return false;
    return true;
  });

  if (!sets.length) {
    grid.innerHTML = '<div class="schedule-empty">Check back soon — full lineup dropping shortly!</div>';
    return;
  }

  // Festival day: treat 00:00–05:59 as late-night (after midnight), not start of day
  const festSortKey = t => { const [h, m] = (t || '00:00').split(':').map(Number); return (h < 6 ? h + 24 : h) * 60 + (m || 0); };

  // Build column descriptors — in all-stages view, merge outdoor A+B into one column
  const columns = []; // [{sid, label, entries, showStageLabel}]

  if (activeStage === 'all') {
    const outdoorEntries = sets.filter(s => OUTDOOR_STAGE_IDS.has(s.stage_id));
    const otherGroups    = {};
    sets.filter(s => !OUTDOOR_STAGE_IDS.has(s.stage_id)).forEach(s => {
      if (!otherGroups[s.stage_id]) otherGroups[s.stage_id] = [];
      otherGroups[s.stage_id].push(s);
    });

    if (outdoorEntries.length) {
      outdoorEntries.sort((a, b) => festSortKey(a.set_time) - festSortKey(b.set_time));
      columns.push({ sid: 'outdoor-merged', label: 'Outdoor Stages', entries: outdoorEntries, showStageLabel: true });
    }
    Object.entries(otherGroups).forEach(([sid, entries]) => {
      entries.sort((a, b) => festSortKey(a.set_time) - festSortKey(b.set_time));
      columns.push({ sid, label: getStageLabel(sid), entries, showStageLabel: false });
    });
  } else {
    const grouped = {};
    sets.forEach(s => {
      if (!grouped[s.stage_id]) grouped[s.stage_id] = [];
      grouped[s.stage_id].push(s);
    });
    Object.entries(grouped).forEach(([sid, entries]) => {
      entries.sort((a, b) => festSortKey(a.set_time) - festSortKey(b.set_time));
      columns.push({ sid, label: getStageLabel(sid), entries, showStageLabel: false });
    });
  }

  grid.innerHTML = columns.map(col => `
    <div class="stage-column" data-stage-id="${escHtml(col.sid)}">
      <div class="stage-column-header">${escHtml(col.label)}</div>
      ${col.entries.map(s => renderSetCard(s, col.showStageLabel)).join('')}
    </div>
  `).join('');

  bindDragEvents();
}

function renderSetCard(s, showStageLabel) {
  const nowPlaying = isNowPlaying(s);
  const isTBD      = s.status !== 'confirmed';
  const artistName = isTBD ? 'TBD' : escHtml(s.band);
  const hasBio     = !isTBD && s.bio;
  const hasPhoto   = !isTBD && s.image;
  const hasExpand  = hasBio || hasPhoto;

  return `
    <div class="set-card${nowPlaying ? ' now-playing' : ''}${isTBD ? ' tbd' : ''}" data-id="${escHtml(s.id)}">
      <div class="set-card-drag" title="Drag to reorder">⠿</div>
      <div class="set-card-actions">
        <button class="set-card-edit-btn"   onclick="openEditSet('${escHtml(s.id)}')">✏</button>
        <button class="set-card-delete-btn" onclick="deleteSet('${escHtml(s.id)}')">✕</button>
      </div>
      ${nowPlaying ? '<span class="now-playing-badge">▶ Now Playing</span>' : ''}
      ${activeDay === 'all' ? `<span class="day-badge" style="background:rgba(255,60,172,0.15);color:var(--color-primary);">${escHtml(s.day)}</span>` : ''}
      ${showStageLabel ? `<div class="set-stage-label">${escHtml(getStageLabel(s.stage_id, s.stage))}</div>` : ''}
      <div class="set-time">${escHtml(s.set_time_display || formatTime(s.set_time))}</div>
      <div class="set-artist">${artistName}</div>
      ${hasExpand ? `
        <button class="bio-toggle" onclick="toggleBio(this)">▼ More</button>
        <div class="set-bio">
          ${hasPhoto ? `<img src="${escHtml(s.image)}" class="set-bio-photo" alt="${escHtml(s.band)}" loading="lazy" />` : ''}
          ${hasBio ? escHtml(s.bio) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ── Bio expand / collapse ──────────────────────
function toggleBio(btn) {
  const card = btn.closest('.set-card');
  const expanded = card.classList.toggle('bio-expanded');
  btn.textContent = expanded ? '▲ Less' : '▼ More';
}

// ── Drag-to-reorder sets (admin mode only) ─────
let _dragSrcId = null;

function bindDragEvents() {
  if (!document.body.classList.contains('admin-mode')) return;

  document.querySelectorAll('.set-card[data-id]').forEach(card => {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', e => {
      _dragSrcId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.style.opacity = '';
      document.querySelectorAll('.set-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.set-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      if (card.dataset.id !== _dragSrcId) card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      const srcId = _dragSrcId;
      const tgtId = card.dataset.id;
      if (!srcId || srcId === tgtId) return;

      const srcEntry = schedule.find(s => s.id === srcId);
      const tgtEntry = schedule.find(s => s.id === tgtId);
      if (!srcEntry || !tgtEntry) return;
      // Only reorder within same stage column + day
      if (srcEntry.stage_id !== tgtEntry.stage_id || srcEntry.day !== tgtEntry.day) return;

      const srcIdx = schedule.indexOf(srcEntry);
      schedule.splice(srcIdx, 1);
      const tgtIdx = schedule.indexOf(tgtEntry);
      const rect = card.getBoundingClientRect();
      const insertAfter = e.clientY > rect.top + rect.height / 2;
      schedule.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, srcEntry);

      saveSchedule();
      renderSchedule();
    });
  });
}

function isNowPlaying(s) {
  if (!s.date || !s.set_time) return false;
  const now   = new Date();
  const start = new Date(`${s.date}T${s.set_time}:00`);
  // Assume ~60 min sets for "now playing" window
  const end   = new Date(start.getTime() + 60 * 60 * 1000);
  return now >= start && now <= end;
}

function formatTime(t) {
  if (!t) return '';
  return toDisplayTime(t);
}

// ── Admin ─────────────────────────────────────
function bindAdmin() {
  const gearBtn = document.getElementById('adminToggle');
  const panel   = document.getElementById('admin-panel');
  const closeBtn= document.getElementById('adminClose');
  if (!gearBtn || !panel) return;

  gearBtn.addEventListener('click', () => {
    if (adminOpen) {
      closeAdmin();
    } else {
      openAdminWithAuth(openAdmin);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeAdmin);
  }

  // Add Set
  const saveNewBtn = document.getElementById('saveNewSet');
  if (saveNewBtn) saveNewBtn.addEventListener('click', saveNewSet);

  // Edit Set
  const saveEditBtn   = document.getElementById('saveEditSet');
  const deleteEditBtn = document.getElementById('deleteSet');
  const cancelEditBtn = document.getElementById('cancelEditSet');
  if (saveEditBtn)   saveEditBtn.addEventListener('click',   saveEditSet);
  if (deleteEditBtn) deleteEditBtn.addEventListener('click', () => { if (editingSetId) deleteSet(editingSetId); });
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditSet);

  // Import
  const importFile = document.getElementById('importScheduleFile');
  if (importFile) {
    importFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          // Detect MPF band tool export
          if (data._meta?.source === 'MPF Band Emails Tool' || (data.stages && data.schedule)) {
            importMpfSchedule(data);
            alert(`MPF export imported: ${data.schedule?.length || 0} sets, ${data.stages?.length || 0} stages.`);
          } else if (Array.isArray(data)) {
            // Plain array — normalize and load
            schedule = data.map(e => normalizeEntry(e, dayMap));
            schedule.forEach((s, i) => { if (!s.id) s.id = 's' + Date.now() + i; });
            saveSchedule();
            buildStageFilters();
            renderSchedule();
            alert(`Imported ${schedule.length} sets.`);
          } else {
            throw new Error('Unrecognized format');
          }
        } catch(err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  // Export
  const exportBtn = document.getElementById('exportSchedule');
  if (exportBtn) exportBtn.addEventListener('click', () => downloadJSON(schedule, 'schedule.json'));

  // Reset
  const resetBtn = document.getElementById('resetSchedule');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Reset to default schedule.json? Local changes will be lost.')) return;
      localStorage.removeItem(SCHEDULE_KEY);
      await loadSchedule();
      buildStageFilters();
      renderSchedule();
    });
  }

  // Stage editor
  bindStageEditor();

  // Admin settings
  bindAdminSettings();
}

function openAdmin() {
  adminOpen = true;
  document.getElementById('admin-panel').classList.add('open');
  document.getElementById('adminToggle').classList.add('active');
  document.body.classList.add('admin-mode');
  renderStageEditor();
}

function closeAdmin() {
  adminOpen = false;
  document.getElementById('admin-panel').classList.remove('open');
  document.getElementById('adminToggle').classList.remove('active');
  document.body.classList.remove('admin-mode');
  closeEditSet();
}

// ── Stage Editor ──────────────────────────────
function bindStageEditor() {
  const saveBtn   = document.getElementById('saveStageNames');
  const exportBtn = document.getElementById('exportStages');
  if (saveBtn)   saveBtn.addEventListener('click',   saveStageNames);
  if (exportBtn) exportBtn.addEventListener('click', () => downloadJSON(getAllStages(), 'stages.json'));
}

function renderStageEditor() {
  const list = document.getElementById('stageEditorList');
  if (!list) return;
  const stages = getAllStages();
  const ids    = getUniqueStageIds();

  // Show all stages in registry + any from current schedule not yet in registry
  const allIds = [...new Set([...Object.keys(stages), ...ids])];

  if (!allIds.length) {
    list.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No stages loaded yet. Import a schedule first.</p>';
    return;
  }

  list.innerHTML = allIds.map(sid => `
    <div class="stage-editor-row">
      <span class="stage-editor-id">${escHtml(sid)}</span>
      <input type="text"
             class="stage-name-input"
             data-stage-id="${escHtml(sid)}"
             value="${escHtml(getStageLabel(sid, stages[sid] || sid))}"
             placeholder="Display name" />
    </div>
  `).join('');
}

function saveStageNames() {
  const inputs  = document.querySelectorAll('.stage-name-input');
  const updated = getAllStages();
  inputs.forEach(input => {
    const sid = input.dataset.stageId;
    const val = input.value.trim();
    if (sid && val) updated[sid] = val;
  });
  saveStages(updated);
  buildStageFilters();
  renderSchedule();
  // Flash save confirmation
  const btn = document.getElementById('saveStageNames');
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Saved'; setTimeout(() => btn.textContent = orig, 1500); }
}

// ── Add / Edit Sets ───────────────────────────
function populateStageSelect(selectId) {
  const sel    = document.getElementById(selectId);
  if (!sel) return;
  const stages = getAllStages();
  const ids    = [...new Set([...Object.keys(stages), ...getUniqueStageIds()])];
  sel.innerHTML = ids.map(sid =>
    `<option value="${escHtml(sid)}">${escHtml(getStageLabel(sid, sid))}</option>`
  ).join('');
}

function saveNewSet() {
  const band  = document.getElementById('newArtist')?.value.trim();
  const sid   = document.getElementById('newStage')?.value;
  const dayN  = parseInt(document.getElementById('newDay')?.value);
  const time  = document.getElementById('newStart')?.value;
  const bio   = document.getElementById('newBio')?.value.trim();

  if (!band) { alert('Please enter an artist name.'); return; }
  if (!time)  { alert('Please enter a start time.'); return; }

  const entry = normalizeEntry({
    id:       's' + Date.now(),
    band,
    stage_id: sid,
    stage:    getStageLabel(sid, sid),
    day:      dayMap[dayN] || dayMap[1],
    date:     dayN === 2 ? (getInfoDate(2)) : (getInfoDate(1)),
    set_time: time,
    status:   'confirmed',
    bio,
  }, dayMap);

  schedule.push(entry);
  saveSchedule();
  buildStageFilters();
  renderSchedule();

  document.getElementById('newArtist').value = '';
  document.getElementById('newStart').value  = '';
  if (document.getElementById('newBio')) document.getElementById('newBio').value = '';
}

function openEditSet(id) {
  const s = schedule.find(s => s.id === id);
  if (!s) return;
  editingSetId = id;

  document.getElementById('editSetId').value    = id;
  document.getElementById('editArtist').value   = s.band;
  document.getElementById('editStart').value    = s.set_time;
  document.getElementById('editBio').value      = s.bio || '';

  // Populate stage select and pick current
  populateStageSelect('editStage');
  const editStageSel = document.getElementById('editStage');
  if (editStageSel) editStageSel.value = s.stage_id;

  // Pick current day
  const editDaySel = document.getElementById('editDay');
  if (editDaySel) {
    Array.from(editDaySel.options).forEach(opt => {
      opt.selected = (dayMap[parseInt(opt.value)] === s.day);
    });
  }

  document.getElementById('editSetSection').style.display = 'block';

  if (!adminOpen) openAdmin();
  document.getElementById('editSetSection').scrollIntoView({ behavior: 'smooth' });
}
window.openEditSet = openEditSet;

function saveEditSet() {
  const s = schedule.find(s => s.id === editingSetId);
  if (!s) return;

  const sid  = document.getElementById('editStage')?.value;
  const dayN = parseInt(document.getElementById('editDay')?.value);

  s.band             = document.getElementById('editArtist')?.value.trim();
  s.stage_id         = sid;
  s.stage            = getStageLabel(sid, sid);
  s.day              = dayMap[dayN] || s.day;
  s.set_time         = document.getElementById('editStart')?.value;
  s.set_time_display = toDisplayTime(s.set_time);
  s.bio              = document.getElementById('editBio')?.value.trim();

  saveSchedule();
  buildStageFilters();
  renderSchedule();
  closeEditSet();
}

function deleteSet(id) {
  if (!confirm('Delete this set?')) return;
  schedule = schedule.filter(s => s.id !== id);
  saveSchedule();
  buildStageFilters();
  renderSchedule();
  closeEditSet();
}
window.deleteSet = deleteSet;

function closeEditSet() {
  editingSetId = null;
  const sec = document.getElementById('editSetSection');
  if (sec) sec.style.display = 'none';
}

// ── Admin Settings ────────────────────────────
function bindAdminSettings() {
  document.getElementById('changePwBtn')?.addEventListener('click', () => {
    lockAdminSession();
    showSetPasswordModal(() => { openAdmin(); });
  });

  document.getElementById('exportAdminConfigBtn')?.addEventListener('click', exportAdminConfig);

  document.getElementById('openSetupBtn')?.addEventListener('click', () => {
    window.open('setup.html', '_blank');
  });

  // Image blocks admin
  document.getElementById('editScheduleBannerBtn')?.addEventListener('click', () => {
    const el = document.querySelector('.page-banner[data-slot="schedule-banner"]');
    window.imageBlocksAdmin?.openEditBanner('schedule-banner', el);
  });
  document.getElementById('editScheduleBgBtn')?.addEventListener('click', () => {
    window.imageBlocksAdmin?.openBgEditor();
  });
  document.getElementById('exportImgBlocksScheduleBtn')?.addEventListener('click', () => {
    window.imageBlocksAdmin?.exportImageBlocks();
  });
}

// ── Nav ───────────────────────────────────────
function bindNav() {
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (toggle) toggle.addEventListener('click', () => links.classList.toggle('open'));
}

// ── Helpers ───────────────────────────────────
function getInfoDate(dayNum) {
  let info = {};
  try { const ls = localStorage.getItem(INFO_KEY); if (ls) info = JSON.parse(ls); } catch(e) {}
  return dayNum === 1 ? (info.day1 || '2026-05-08') : (info.day2 || '2026-05-09');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
