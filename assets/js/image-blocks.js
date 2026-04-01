/* ============================================
   MIDWEST PSYCH FEST — Image Blocks
   Manages page banners, background images,
   and named image slots across all pages.
   ============================================ */

const IMAGE_BLOCKS_KEY = 'mpf_image_blocks';
const BG_IMAGE_KEY     = 'mpf_bg_image';
const BG_OPACITY_KEY   = 'mpf_bg_opacity';

let imageBlocks = {};  // { slotId: { image, url, alt, caption } }

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadImageBlocks();
  applyBackground();
  renderAllBlocks();
  renderAllBanners();

  // Expose admin controls to whatever page's admin panel loads them
  window.imageBlocksAdmin = {
    openEditBlock,
    openEditBanner,
    openBgEditor,
    exportImageBlocks,
  };
});

// ── Storage ───────────────────────────────────
function loadImageBlocks() {
  try {
    const saved = localStorage.getItem(IMAGE_BLOCKS_KEY);
    if (saved) imageBlocks = JSON.parse(saved);
  } catch(e) { imageBlocks = {}; }
}

function saveImageBlocks() {
  localStorage.setItem(IMAGE_BLOCKS_KEY, JSON.stringify(imageBlocks));
}

// ── Background Image ──────────────────────────
function applyBackground() {
  const img     = localStorage.getItem(BG_IMAGE_KEY);
  const opacity = parseFloat(localStorage.getItem(BG_OPACITY_KEY) || '0.85');
  if (!img) return;

  document.body.classList.add('has-bg-image');
  document.body.style.backgroundImage = `url(${img})`;
  document.documentElement.style.setProperty('--bg-scrim', `rgba(13,0,16,${opacity})`);
}

function setBackground(imgUrl, opacity) {
  if (!imgUrl) {
    localStorage.removeItem(BG_IMAGE_KEY);
    document.body.classList.remove('has-bg-image');
    document.body.style.backgroundImage = '';
    return;
  }
  localStorage.setItem(BG_IMAGE_KEY, imgUrl);
  localStorage.setItem(BG_OPACITY_KEY, String(opacity ?? 0.85));
  applyBackground();
}

// ── Image Slots ───────────────────────────────
function renderAllBlocks() {
  document.querySelectorAll('.mpf-img-block[data-slot]').forEach(el => {
    const slot = el.dataset.slot;
    renderBlock(el, slot);

    // Admin: click empty slot or edit overlay triggers edit form
    el.addEventListener('click', e => {
      if (!document.body.classList.contains('admin-mode')) return;
      openEditBlock(slot, el);
    });
  });
}

function renderBlock(el, slot) {
  const data = imageBlocks[slot];
  if (!data?.image) {
    el.classList.remove('has-image');
    el.innerHTML = '';
    return;
  }
  el.classList.add('has-image');
  const img = `<img src="${escAttr(data.image)}" alt="${escAttr(data.alt || '')}" loading="lazy" />`;
  el.innerHTML = data.url
    ? `<a href="${escAttr(data.url)}" target="_blank" rel="noopener">${img}</a>`
    : img;
  if (data.caption) {
    const cap = document.createElement('div');
    cap.className = 'img-block-caption';
    cap.textContent = data.caption;
    el.appendChild(cap);
  }
}

// ── Page Banners ──────────────────────────────
function renderAllBanners() {
  document.querySelectorAll('.page-banner[data-slot]').forEach(el => {
    const slot = el.dataset.slot;
    renderBanner(el, slot);

    el.addEventListener('click', e => {
      if (!document.body.classList.contains('admin-mode')) return;
      openEditBanner(slot, el);
    });
  });
}

function renderBanner(el, slot) {
  const data = imageBlocks[slot];
  if (!data?.image) {
    el.classList.remove('has-image');
    el.innerHTML = '';
    return;
  }
  el.classList.add('has-image');
  const img = `<img src="${escAttr(data.image)}" alt="${escAttr(data.alt || '')}" loading="lazy" />`;
  el.innerHTML = data.url
    ? `<a href="${escAttr(data.url)}" target="_blank" rel="noopener">${img}</a>`
    : img;
}

// ── Admin: Edit Image Block ───────────────────
function openEditBlock(slot, targetEl) {
  showImageEditor({
    title:   'Edit Image Block',
    current: imageBlocks[slot] || {},
    onSave:  (data) => {
      if (data.image) {
        imageBlocks[slot] = data;
      } else {
        delete imageBlocks[slot];
      }
      saveImageBlocks();
      if (targetEl) renderBlock(targetEl, slot);
      else document.querySelectorAll(`.mpf-img-block[data-slot="${slot}"]`).forEach(el => renderBlock(el, slot));
    },
    onClear: () => {
      delete imageBlocks[slot];
      saveImageBlocks();
      if (targetEl) renderBlock(targetEl, slot);
    },
  });
}

function openEditBanner(slot, targetEl) {
  showImageEditor({
    title:   'Edit Page Banner',
    current: imageBlocks[slot] || {},
    onSave:  (data) => {
      if (data.image) {
        imageBlocks[slot] = data;
      } else {
        delete imageBlocks[slot];
      }
      saveImageBlocks();
      if (targetEl) renderBanner(targetEl, slot);
      else document.querySelectorAll(`.page-banner[data-slot="${slot}"]`).forEach(el => renderBanner(el, slot));
    },
    onClear: () => {
      delete imageBlocks[slot];
      saveImageBlocks();
      if (targetEl) renderBanner(targetEl, slot);
    },
  });
}

// ── Admin: Background Editor ──────────────────
function openBgEditor() {
  const current  = localStorage.getItem(BG_IMAGE_KEY) || '';
  const opacity  = parseFloat(localStorage.getItem(BG_OPACITY_KEY) || '0.85');
  const overlayId = 'mpf-bg-editor';
  removeOverlay(overlayId);

  const overlay = document.createElement('div');
  overlay.id        = overlayId;
  overlay.className = 'img-editor-overlay';
  overlay.innerHTML = `
    <div class="img-editor-box">
      <div class="img-editor-title">Background Image</div>
      <div class="form-group">
        <label>Image URL or paste a data URL</label>
        <input type="text" id="bgImgUrl" placeholder="https://... or data:image/..." value="${escAttr(current)}" />
      </div>
      <div class="form-group">
        <label>Dark overlay opacity: <span id="bgOpacityVal">${Math.round(opacity*100)}%</span></label>
        <input type="range" id="bgOpacity" min="40" max="97" step="1" value="${Math.round(opacity*100)}" />
        <p class="text-muted" style="font-size:0.72rem;margin-top:4px;">Higher = darker overlay, text more readable</p>
      </div>
      <div class="form-group">
        <label>— or upload a file —</label>
        <input type="file" id="bgImgFile" accept="image/*" />
      </div>
      <div class="flex gap-1 mt-2">
        <button class="btn btn-accent btn-sm" id="bgSaveBtn">Apply</button>
        <button class="btn btn-danger btn-sm" id="bgClearBtn">Remove Background</button>
        <button class="btn btn-ghost btn-sm" id="bgCancelBtn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#bgOpacity').addEventListener('input', e => {
    overlay.querySelector('#bgOpacityVal').textContent = e.target.value + '%';
  });

  overlay.querySelector('#bgImgFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { overlay.querySelector('#bgImgUrl').value = ev.target.result; };
    reader.readAsDataURL(file);
  });

  overlay.querySelector('#bgSaveBtn').addEventListener('click', () => {
    const url  = overlay.querySelector('#bgImgUrl').value.trim();
    const op   = parseInt(overlay.querySelector('#bgOpacity').value) / 100;
    setBackground(url || null, op);
    removeOverlay(overlayId);
  });

  overlay.querySelector('#bgClearBtn').addEventListener('click', () => {
    setBackground(null);
    removeOverlay(overlayId);
  });

  overlay.querySelector('#bgCancelBtn').addEventListener('click', () => removeOverlay(overlayId));
  overlay.addEventListener('click', e => { if (e.target === overlay) removeOverlay(overlayId); });
}

// ── Shared Image Editor Modal ─────────────────
function showImageEditor({ title, current, onSave, onClear }) {
  const overlayId = 'mpf-img-editor';
  removeOverlay(overlayId);

  const overlay = document.createElement('div');
  overlay.id        = overlayId;
  overlay.className = 'img-editor-overlay';
  overlay.innerHTML = `
    <div class="img-editor-box">
      <div class="img-editor-title">${escHtml(title)}</div>
      <div class="form-group">
        <label>Image URL</label>
        <input type="url" id="imgEditorUrl" placeholder="https://..." value="${escAttr(current.image || '')}" />
      </div>
      <div class="form-group">
        <label>— or upload a file —</label>
        <input type="file" id="imgEditorFile" accept="image/*" />
      </div>
      <div class="form-group">
        <label>Link URL <span class="text-muted" style="font-weight:400;">(optional — wraps image in a link)</span></label>
        <input type="url" id="imgEditorLink" placeholder="https://..." value="${escAttr(current.url || '')}" />
      </div>
      <div class="form-group">
        <label>Alt / Caption text <span class="text-muted" style="font-weight:400;">(optional)</span></label>
        <input type="text" id="imgEditorAlt" placeholder="Description..." value="${escAttr(current.alt || '')}" />
      </div>
      ${current.image ? `<img src="${escAttr(current.image)}" style="max-height:100px;border-radius:6px;margin-bottom:12px;object-fit:cover;width:100%;" />` : ''}
      <div class="flex gap-1 mt-2">
        <button class="btn btn-accent btn-sm" id="imgEditorSave">Save</button>
        ${current.image ? '<button class="btn btn-danger btn-sm" id="imgEditorClear">Remove Image</button>' : ''}
        <button class="btn btn-ghost btn-sm" id="imgEditorCancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#imgEditorFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { overlay.querySelector('#imgEditorUrl').value = ev.target.result; };
    reader.readAsDataURL(file);
  });

  overlay.querySelector('#imgEditorSave').addEventListener('click', () => {
    const imgUrl = overlay.querySelector('#imgEditorUrl').value.trim();
    const link   = overlay.querySelector('#imgEditorLink').value.trim();
    const alt    = overlay.querySelector('#imgEditorAlt').value.trim();
    onSave({ image: imgUrl, url: link, alt });
    removeOverlay(overlayId);
  });

  overlay.querySelector('#imgEditorClear')?.addEventListener('click', () => {
    onClear();
    removeOverlay(overlayId);
  });

  overlay.querySelector('#imgEditorCancel').addEventListener('click', () => removeOverlay(overlayId));
  overlay.addEventListener('click', e => { if (e.target === overlay) removeOverlay(overlayId); });
}

function removeOverlay(id) {
  document.getElementById(id)?.remove();
}

// ── Export ────────────────────────────────────
function exportImageBlocks() {
  const data = JSON.parse(localStorage.getItem(IMAGE_BLOCKS_KEY) || '{}');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'image-blocks.json'; a.click();
  URL.revokeObjectURL(url);
}

// ── Utils ─────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return escHtml(str); }
