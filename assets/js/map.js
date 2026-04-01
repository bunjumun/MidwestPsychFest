/* ============================================
   MIDWEST PSYCH FEST — Map Page JS
   v3: editable KML zones, image + link popups
   ============================================ */

// ── Config ────────────────────────────────────
const MARKERS_KEY   = 'mpf_markers';
const KML_KEY       = 'mpf_kml';
const KML_ZONES_KEY = 'mpf_kml_zones';
const DEFAULT_MARKERS_URL = 'data/markers.json';
const DEFAULT_KML_URL     = 'data/venue.kml';

const TILE_URL  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

const DEFAULT_CENTER = [39.945, -82.995];
const DEFAULT_ZOOM   = 17;

// ── State ─────────────────────────────────────
let map             = null;
let markerLayer     = null;
let kmlLayerGroup   = null;
let markers         = [];
let kmlZones        = [];   // editable zone objects
let leafletMarkers  = {};
let kmlLeafletLayers = {};  // zoneId → leaflet layer
let selectedMarkerId = null;
let selectedZoneId   = null;
let isAddingMarker  = false;
let pendingLatLng   = null;
let adminOpen       = false;

// ── Marker Metadata ───────────────────────────
const MARKER_META = {
  stage:       { emoji: '🎸', color: 'var(--color-stage)',      label: 'Stage'      },
  bar:         { emoji: '🍺', color: 'var(--color-bar)',        label: 'Bar'        },
  vendor:      { emoji: '🛍', color: 'var(--color-vendor)',     label: 'Vendor'     },
  parking:     { emoji: '🅿',  color: 'var(--color-parking)',   label: 'Parking'    },
  camping:     { emoji: '⛺', color: 'var(--color-camping)',    label: 'Camping'    },
  entrance:    { emoji: '🚪', color: 'var(--color-entrance)',   label: 'Entrance'   },
  'off-limits':{ emoji: '⛔', color: 'var(--color-off-limits)', label: 'Off Limits' },
};

const KML_ZONE_COLORS = {
  stage: '#ff3cac', barn: '#ff3cac',
  camping: '#4ade80', tent: '#4ade80',
  vendor: '#fbbf24', food: '#fb923c', market: '#fbbf24',
  parking: '#60a5fa', lot: '#60a5fa',
  entrance: '#34d399', gate: '#34d399',
  bar: '#a78bfa', beer: '#a78bfa',
  limits: '#f87171', restricted: '#f87171',
};

function getZoneColor(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, color] of Object.entries(KML_ZONE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return '#b24bff';
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadAndRenderKML();
  await loadMarkers();
  renderMarkers();
  bindNav();
  bindAdmin();
  updateKmlStatus();
});

// ── Map Init ──────────────────────────────────
function initMap() {
  map = L.map('venue-map', {
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTR,
    maxZoom: 21,
    maxNativeZoom: 19,
  }).addTo(map);

  markerLayer   = L.layerGroup().addTo(map);
  kmlLayerGroup = L.layerGroup().addTo(map);

  map.on('click', onMapClick);
}

// ── KML: Load & Parse ────────────────────────
async function loadAndRenderKML() {
  // Try stored zone objects first (already parsed + edited)
  const storedZones = localStorage.getItem(KML_ZONES_KEY);
  if (storedZones) {
    try {
      kmlZones = JSON.parse(storedZones);
      renderZones();
      return;
    } catch(e) {}
  }

  // Fall back to raw KML string → parse fresh
  let kmlStr = localStorage.getItem(KML_KEY);
  if (!kmlStr) {
    try {
      const r = await fetch(DEFAULT_KML_URL);
      if (r.ok) kmlStr = await r.text();
    } catch(e) {}
  }
  if (kmlStr) importKmlString(kmlStr, false);
}

// Called when user uploads a new KML file
function importKmlString(kmlStr, saveRaw = true) {
  if (saveRaw) localStorage.setItem(KML_KEY, kmlStr);

  const features = parseKML(kmlStr);
  const existingById = {};
  kmlZones.forEach(z => { existingById[z.id] = z; });

  // Merge: preserve edited names/desc/image/url for matching zones
  const existingByName = {};
  kmlZones.forEach(z => { existingByName[z.name.toLowerCase()] = z; });

  kmlZones = features.map((f, i) => {
    const matched = existingByName[f.name.toLowerCase()];
    return {
      id:        matched?.id || ('zone-' + Date.now() + '-' + i),
      name:      matched?.name || f.name,
      desc:      matched?.desc ?? f.desc,
      image:     matched?.image || '',
      url:       matched?.url || '',
      url_label: matched?.url_label || '',
      type:      f.type,
      coords:    f.coords || null,
      lat:       f.lat ?? null,
      lng:       f.lng ?? null,
    };
  });

  saveKmlZones();
  renderZones();
  renderZoneList();
}

function saveKmlZones() {
  localStorage.setItem(KML_ZONES_KEY, JSON.stringify(kmlZones));
}

// ── KML: Parse ────────────────────────────────
function parseKML(kmlStr) {
  const parser   = new DOMParser();
  const doc      = parser.parseFromString(kmlStr, 'text/xml');
  const features = [];

  doc.querySelectorAll('Placemark').forEach(pm => {
    const name = pm.querySelector('name')?.textContent?.trim() || 'Area';
    const desc = stripHtml(pm.querySelector('description')?.textContent?.trim() || '');

    pm.querySelectorAll('Polygon').forEach(poly => {
      const coordEl = poly.querySelector('outerBoundaryIs LinearRing coordinates')
                   || poly.querySelector('LinearRing coordinates')
                   || poly.querySelector('coordinates');
      if (coordEl) {
        const coords = parseKMLCoords(coordEl.textContent);
        if (coords.length >= 3) features.push({ type: 'polygon', name, desc, coords });
      }
    });

    pm.querySelectorAll('LineString').forEach(ls => {
      const coordEl = ls.querySelector('coordinates');
      if (coordEl) {
        const coords = parseKMLCoords(coordEl.textContent);
        if (coords.length >= 2) features.push({ type: 'line', name, desc, coords });
      }
    });

    pm.querySelectorAll('Point').forEach(pt => {
      const coordEl = pt.querySelector('coordinates');
      if (coordEl) {
        const parts = coordEl.textContent.trim().split(',').map(Number);
        const lng = parts[0], lat = parts[1];
        if (!isNaN(lat) && !isNaN(lng)) features.push({ type: 'point', name, desc, lat, lng });
      }
    });
  });

  return features;
}

function parseKMLCoords(text) {
  return text.trim().split(/\s+/).map(pair => {
    const parts = pair.split(',').map(Number);
    const lng = parts[0], lat = parts[1];
    return (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      ? [lat, lng] : null;
  }).filter(Boolean);
}

function stripHtml(str) { return str.replace(/<[^>]*>/g, '').trim(); }

// ── KML: Render Zones ─────────────────────────
function renderZones() {
  kmlLayerGroup.clearLayers();
  kmlLeafletLayers = {};
  const allCoords = [];

  kmlZones.forEach(z => {
    const color = getZoneColor(z.name);
    let layer = null;

    if (z.type === 'polygon' && z.coords?.length >= 3) {
      layer = L.polygon(z.coords, {
        color, weight: 2.5, opacity: 0.9,
        fillColor: color, fillOpacity: 0.08,
      });
      allCoords.push(...z.coords);
    } else if (z.type === 'line' && z.coords?.length >= 2) {
      layer = L.polyline(z.coords, { color, weight: 3, opacity: 0.85 });
      allCoords.push(...z.coords);
    } else if (z.type === 'point' && z.lat != null) {
      layer = L.circleMarker([z.lat, z.lng], {
        radius: 8, color, fillColor: color, fillOpacity: 0.85, weight: 2,
      });
      allCoords.push([z.lat, z.lng]);
    }

    if (!layer) return;

    // Hover effect for polygons
    if (z.type === 'polygon') {
      layer.on('mouseover', function() { this.setStyle({ fillOpacity: 0.22, weight: 3.5 }); });
      layer.on('mouseout',  function() { this.setStyle({ fillOpacity: 0.08, weight: 2.5 }); });
    }

    layer.bindPopup(() => buildZonePopup(z), { className: 'mpf-popup', maxWidth: 300 });

    // In admin mode: click zone → open edit form
    layer.on('click', () => { if (adminOpen) { openEditZone(z.id); } });

    kmlLayerGroup.addLayer(layer);
    kmlLeafletLayers[z.id] = layer;
  });

  // Fit viewport to KML data every time zones are loaded
  if (allCoords.length) {
    try {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40], maxZoom: 19 });
    } catch(e) {}
  }
}

// ── Zone Popups ───────────────────────────────
function buildZonePopup(z) {
  const color = getZoneColor(z.name);
  const div   = document.createElement('div');
  div.className = 'map-popup';
  div.innerHTML = `
    ${z.image ? `<img src="${escAttr(z.image)}" class="map-popup-img" alt="${escHtml(z.name)}" onerror="this.style.display='none'" />` : ''}
    <div class="map-popup-title" style="margin-bottom:4px;">${escHtml(z.name)}</div>
    ${z.desc  ? `<div class="map-popup-desc">${escHtml(z.desc)}</div>` : ''}
    <div class="map-popup-type" style="color:${color};margin-top:6px;">Venue Zone</div>
    ${z.url   ? `<a href="${escAttr(z.url)}" target="_blank" rel="noopener" class="map-popup-link">${escHtml(z.url_label || 'More Info')} →</a>` : ''}
    <div class="map-popup-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEditZone('${escHtml(z.id)}')">✏ Edit Zone</button>
    </div>
  `;
  return div;
}

// ── Zone Admin: List ──────────────────────────
function renderZoneList() {
  const section = document.getElementById('zoneListSection');
  const list    = document.getElementById('zoneList');
  const count   = document.getElementById('zoneCount');
  if (!section || !list) return;

  if (!kmlZones.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  if (count) count.textContent = `(${kmlZones.length})`;

  list.innerHTML = kmlZones.map(z => `
    <div class="zone-list-row" id="zone-row-${escHtml(z.id)}">
      <div class="zone-list-dot" style="background:${getZoneColor(z.name)}"></div>
      <span class="zone-list-name" title="${escHtml(z.name)}">${escHtml(z.name)}</span>
      <button class="zone-list-btn" onclick="panToZone('${escHtml(z.id)}')" title="Pan to zone">📍</button>
      <button class="zone-list-btn" onclick="openEditZone('${escHtml(z.id)}')" title="Edit zone">✏</button>
      <button class="zone-list-btn zone-list-btn--delete" onclick="deleteZone('${escHtml(z.id)}')" title="Delete zone">✕</button>
    </div>
  `).join('');
}

function panToZone(id) {
  const layer = kmlLeafletLayers[id];
  if (!layer) return;
  try {
    if (layer.getBounds) map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
    else if (layer.getLatLng) map.setView(layer.getLatLng(), 19);
  } catch(e) {}
  layer.openPopup();
}
window.panToZone = panToZone;

// ── Zone Admin: Edit / Delete ─────────────────
function openEditZone(id) {
  const z = kmlZones.find(z => z.id === id);
  if (!z) return;
  selectedZoneId = id;

  document.getElementById('editZoneId').value       = id;
  document.getElementById('editZoneName').value     = z.name;
  document.getElementById('editZoneDesc').value     = z.desc || '';
  document.getElementById('editZoneImage').value    = z.image || '';
  document.getElementById('editZoneUrl').value      = z.url || '';
  document.getElementById('editZoneUrlLabel').value = z.url_label || '';

  // Reset scale slider
  const scaleEl = document.getElementById('editZoneScale');
  if (scaleEl) { scaleEl.value = 1; document.getElementById('editZoneScaleVal').textContent = '1.00×'; }
  // Hide scale group for point zones
  const scaleGroup = document.getElementById('editZoneScaleGroup');
  if (scaleGroup) scaleGroup.style.display = (z.type === 'point') ? 'none' : 'block';

  const sec = document.getElementById('editZoneSection');
  sec.style.display = 'block';

  // Highlight active row
  document.querySelectorAll('.zone-list-row').forEach(r => r.classList.remove('active'));
  document.getElementById('zone-row-' + id)?.classList.add('active');

  if (!adminOpen) {
    openAdminWithAuth(() => { openAdminPanel(); sec.scrollIntoView({ behavior: 'smooth' }); });
    return;
  }
  sec.scrollIntoView({ behavior: 'smooth' });
}
window.openEditZone = openEditZone;

function saveEditZone() {
  const z = kmlZones.find(z => z.id === selectedZoneId);
  if (!z) return;

  z.name      = document.getElementById('editZoneName')?.value.trim()     || z.name;
  z.desc      = document.getElementById('editZoneDesc')?.value.trim()     || '';
  z.image     = document.getElementById('editZoneImage')?.value.trim()    || '';
  z.url       = document.getElementById('editZoneUrl')?.value.trim()      || '';
  z.url_label = document.getElementById('editZoneUrlLabel')?.value.trim() || '';

  saveKmlZones();
  renderZones();
  renderZoneList();
  closeEditZone();
}

function deleteZone(id) {
  if (!confirm('Remove this zone from the map?')) return;
  kmlZones = kmlZones.filter(z => z.id !== id);
  saveKmlZones();
  renderZones();
  renderZoneList();
  closeEditZone();
  map.closePopup();
}
window.deleteZone = deleteZone;

function closeEditZone() {
  selectedZoneId = null;
  document.getElementById('editZoneSection').style.display = 'none';
  document.querySelectorAll('.zone-list-row').forEach(r => r.classList.remove('active'));
}

// ── Zone Scale Helpers ─────────────────────────
function zoneCentroid(coords) {
  const n = coords.length;
  const lat = coords.reduce((s, c) => s + c[0], 0) / n;
  const lng = coords.reduce((s, c) => s + c[1], 0) / n;
  return [lat, lng];
}

function scaleZoneCoords(coords, factor) {
  const [clat, clng] = zoneCentroid(coords);
  return coords.map(([lat, lng]) => [
    clat + (lat - clat) * factor,
    clng + (lng - clng) * factor,
  ]);
}

// Preview scale on the live layer without saving
function previewZoneScale(id, factor) {
  const z = kmlZones.find(z => z.id === id);
  if (!z || !z.coords) return;
  const layer = kmlLeafletLayers[id];
  if (!layer) return;
  const scaled = scaleZoneCoords(z.coords, factor);
  if (z.type === 'polygon' && layer.setLatLngs) layer.setLatLngs(scaled);
  if (z.type === 'line'    && layer.setLatLngs) layer.setLatLngs(scaled);
}

// Commit scaled coords to the zone object + save
function applyZoneScale(id, factor) {
  const z = kmlZones.find(z => z.id === id);
  if (!z || !z.coords) return;
  z.coords = scaleZoneCoords(z.coords, factor);
  saveKmlZones();
  renderZones();
  // Reset slider to 1 after applying
  const scaleEl = document.getElementById('editZoneScale');
  if (scaleEl) { scaleEl.value = 1; document.getElementById('editZoneScaleVal').textContent = '1.00×'; }
}

// ── Markers: Load & Save ──────────────────────
async function loadMarkers() {
  const saved = localStorage.getItem(MARKERS_KEY);
  if (saved) { try { markers = JSON.parse(saved); return; } catch(e) {} }
  try {
    const r = await fetch(DEFAULT_MARKERS_URL);
    if (r.ok) { markers = await r.json(); return; }
  } catch(e) {}
  markers = [];
}

function saveMarkers() {
  localStorage.setItem(MARKERS_KEY, JSON.stringify(markers));
}

// ── Markers: Render ───────────────────────────
function renderMarkers() {
  markerLayer.clearLayers();
  leafletMarkers = {};
  markers.forEach(m => {
    if (!isTypeVisible(m.type)) return;
    if (m.lat == null || m.lng == null) return;
    const lm = createLeafletMarker(m);
    markerLayer.addLayer(lm);
    leafletMarkers[m.id] = lm;
  });
  renderLegend();
  refitAllBounds();
}

function refitAllBounds() {
  const bounds = L.latLngBounds([]);
  kmlLayerGroup.eachLayer(l => {
    if (l.getBounds) bounds.extend(l.getBounds());
    else if (l.getLatLng) bounds.extend(l.getLatLng());
  });
  markerLayer.eachLayer(l => { if (l.getLatLng) bounds.extend(l.getLatLng()); });
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
}

function createLeafletMarker(m) {
  const meta = MARKER_META[m.type] || MARKER_META['stage'];
  const icon = L.divIcon({
    html: `<div class="map-marker-icon marker-${m.type}" title="${escHtml(m.label)}">
             <div class="marker-inner">${meta.emoji}</div>
           </div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });

  const marker = L.marker([m.lat, m.lng], { icon, interactive: true });
  marker.bindPopup(() => buildMarkerPopup(m), { className: 'mpf-popup', maxWidth: 300 });
  marker.on('click', () => { if (adminOpen) openEditMarker(m.id); });
  return marker;
}

// ── Marker Popups ─────────────────────────────
function buildMarkerPopup(m) {
  const meta = MARKER_META[m.type] || MARKER_META['stage'];
  const div  = document.createElement('div');
  div.className = 'map-popup';
  div.innerHTML = `
    ${m.image ? `<img src="${escAttr(m.image)}" class="map-popup-img" alt="${escHtml(m.label)}" onerror="this.style.display='none'" />` : ''}
    <div class="map-popup-header">
      <div class="map-popup-icon" style="background:${meta.color}20;border:1px solid ${meta.color}40;">${meta.emoji}</div>
      <div>
        <div class="map-popup-title">${escHtml(m.label)}</div>
        <div class="map-popup-type" style="color:${meta.color}">${meta.label}</div>
      </div>
    </div>
    ${m.description ? `<div class="map-popup-desc">${escHtml(m.description)}</div>` : ''}
    ${m.url ? `<a href="${escAttr(m.url)}" target="_blank" rel="noopener" class="map-popup-link">${escHtml(m.url_label || 'More Info')} →</a>` : ''}
    <div class="map-popup-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEditMarker('${escHtml(m.id)}')">✏ Edit</button>
      <button class="btn btn-danger btn-sm" onclick="deleteMarker('${escHtml(m.id)}')">✕ Delete</button>
    </div>
  `;
  return div;
}

// ── Marker Admin: Add ─────────────────────────
function saveNewMarker() {
  const label = document.getElementById('newMarkerLabel')?.value.trim();
  const type  = document.getElementById('newMarkerType')?.value;
  const desc  = document.getElementById('newMarkerDesc')?.value.trim();
  const image = document.getElementById('newMarkerImage')?.value.trim();
  const url   = document.getElementById('newMarkerUrl')?.value.trim();
  const urlLb = document.getElementById('newMarkerUrlLabel')?.value.trim();

  if (!label)        { alert('Please enter a label.'); return; }
  if (!pendingLatLng){ alert('Click the map to place the marker first.'); return; }

  const m = {
    id: 'marker-' + Date.now(),
    type, label,
    lat: parseFloat(pendingLatLng.lat.toFixed(6)),
    lng: parseFloat(pendingLatLng.lng.toFixed(6)),
    description: desc,
    image:       image,
    url:         url,
    url_label:   urlLb,
    details: '',
  };

  markers.push(m);
  saveMarkers();
  if (map._previewMarker) { map.removeLayer(map._previewMarker); map._previewMarker = null; }
  cancelAddMarker();
  renderMarkers();
}

// ── Marker Admin: Edit / Delete ───────────────
function openEditMarker(id) {
  const m = markers.find(m => m.id === id);
  if (!m) return;
  selectedMarkerId = id;

  document.getElementById('editMarkerId').value        = id;
  document.getElementById('editMarkerLabel').value     = m.label;
  document.getElementById('editMarkerType').value      = m.type;
  document.getElementById('editMarkerDesc').value      = m.description || '';
  document.getElementById('editMarkerImage').value     = m.image     || '';
  document.getElementById('editMarkerUrl').value       = m.url       || '';
  document.getElementById('editMarkerUrlLabel').value  = m.url_label || '';

  const sec = document.getElementById('editMarkerSection');
  sec.style.display = 'block';

  if (!adminOpen) {
    openAdminWithAuth(() => {
      openAdminPanel();
      sec.scrollIntoView({ behavior: 'smooth' });
    });
    return;
  }
  sec.scrollIntoView({ behavior: 'smooth' });
}
window.openEditMarker = openEditMarker;

function saveEditMarker() {
  const m = markers.find(m => m.id === selectedMarkerId);
  if (!m) return;
  m.label       = document.getElementById('editMarkerLabel')?.value.trim();
  m.type        = document.getElementById('editMarkerType')?.value;
  m.description = document.getElementById('editMarkerDesc')?.value.trim();
  m.image       = document.getElementById('editMarkerImage')?.value.trim();
  m.url         = document.getElementById('editMarkerUrl')?.value.trim();
  m.url_label   = document.getElementById('editMarkerUrlLabel')?.value.trim();
  saveMarkers();
  renderMarkers();
  document.getElementById('editMarkerSection').style.display = 'none';
  selectedMarkerId = null;
}

function deleteMarker(id) {
  if (!confirm('Delete this marker?')) return;
  markers = markers.filter(m => m.id !== id);
  saveMarkers();
  renderMarkers();
  document.getElementById('editMarkerSection').style.display = 'none';
  selectedMarkerId = null;
  map.closePopup();
}
window.deleteMarker = deleteMarker;

// ── Map Click ─────────────────────────────────
function onMapClick(e) {
  if (!isAddingMarker) return;
  pendingLatLng = e.latlng;
  const latEl = document.getElementById('newMarkerLat');
  const lngEl = document.getElementById('newMarkerLng');
  if (latEl) latEl.value = e.latlng.lat.toFixed(6);
  if (lngEl) lngEl.value = e.latlng.lng.toFixed(6);

  if (map._previewMarker) map.removeLayer(map._previewMarker);
  map._previewMarker = L.circleMarker(e.latlng, {
    radius: 12, color: '#ff3cac', fillColor: '#ff3cac', fillOpacity: 0.6, weight: 2,
  }).addTo(map);
}

// ── Legend / Filter ───────────────────────────
const hiddenTypes = new Set();
function isTypeVisible(type) { return !hiddenTypes.has(type); }

function renderLegend() {
  const legend = document.getElementById('mapLegend');
  if (!legend) return;

  // Collect unique types present in current markers
  const types = [...new Set(markers.map(m => m.type).filter(Boolean))];
  legend.innerHTML = '';

  types.forEach(type => {
    const meta = MARKER_META[type] || { color: '#aaa', label: type };
    const item = document.createElement('div');
    item.className = 'legend-item' + (hiddenTypes.has(type) ? '' : ' active');
    item.dataset.type = type;
    item.innerHTML = `<div class="legend-dot" style="background:${meta.color}"></div> ${meta.label}`;
    item.addEventListener('click', () => {
      if (hiddenTypes.has(type)) { hiddenTypes.delete(type); item.classList.add('active'); }
      else { hiddenTypes.add(type); item.classList.remove('active'); }
      renderMarkers();
    });
    legend.appendChild(item);
  });
}

// ── Admin Panel ───────────────────────────────
function bindAdmin() {
  const toggle   = document.getElementById('adminToggle');
  const closeBtn = document.getElementById('adminClose');

  toggle.addEventListener('click', () => {
    adminOpen ? closeAdminPanel() : openAdminWithAuth(openAdminPanel);
  });
  closeBtn.addEventListener('click', closeAdminPanel);

  // Admin settings
  document.getElementById('mapChangePwBtn')?.addEventListener('click', () => {
    lockAdminSession(); showSetPasswordModal(openAdminPanel);
  });
  document.getElementById('mapExportAdminConfigBtn')?.addEventListener('click', exportAdminConfig);
  document.getElementById('mapOpenSetupBtn')?.addEventListener('click', () => window.open('setup.html', '_blank'));

  // Image blocks admin
  document.getElementById('editMapBannerBtn')?.addEventListener('click', () => {
    const el = document.querySelector('.page-banner[data-slot="map-banner"]');
    window.imageBlocksAdmin?.openEditBanner('map-banner', el);
  });
  document.getElementById('editMapBgBtn')?.addEventListener('click', () => {
    window.imageBlocksAdmin?.openBgEditor();
  });
  document.getElementById('exportImgBlocksMapBtn')?.addEventListener('click', () => {
    window.imageBlocksAdmin?.exportImageBlocks();
  });

  // Add marker
  document.getElementById('startAddMarker').addEventListener('click', () => {
    isAddingMarker = true; pendingLatLng = null;
    document.getElementById('addMarkerForm').classList.remove('hidden');
    document.getElementById('startAddMarker').classList.add('hidden');
    document.getElementById('mapPageWrap').classList.add('map-adding-marker');
  });
  document.getElementById('cancelAddMarker').addEventListener('click', cancelAddMarker);
  document.getElementById('saveNewMarker').addEventListener('click', saveNewMarker);

  // Edit marker
  document.getElementById('saveEditMarker').addEventListener('click', saveEditMarker);
  document.getElementById('deleteMarker').addEventListener('click', () => {
    if (selectedMarkerId) deleteMarker(selectedMarkerId);
  });
  document.getElementById('cancelEditMarker').addEventListener('click', () => {
    document.getElementById('editMarkerSection').style.display = 'none';
    selectedMarkerId = null;
  });

  // Edit zone
  document.getElementById('saveEditZone').addEventListener('click', saveEditZone);
  document.getElementById('deleteZone').addEventListener('click', () => {
    if (selectedZoneId) deleteZone(selectedZoneId);
  });

  // Zone scale slider
  const scaleSlider = document.getElementById('editZoneScale');
  const scaleVal    = document.getElementById('editZoneScaleVal');
  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      const f = parseFloat(scaleSlider.value);
      scaleVal.textContent = f.toFixed(2) + '×';
      if (selectedZoneId) previewZoneScale(selectedZoneId, f);
    });
    document.getElementById('applyZoneScale')?.addEventListener('click', () => {
      if (!selectedZoneId) return;
      const f = parseFloat(scaleSlider.value);
      applyZoneScale(selectedZoneId, f);
    });
    document.getElementById('resetZoneScale')?.addEventListener('click', () => {
      scaleSlider.value = 1;
      scaleVal.textContent = '1.00×';
      if (selectedZoneId) previewZoneScale(selectedZoneId, 1);
    });
  }
  document.getElementById('cancelEditZone').addEventListener('click', closeEditZone);

  // KML upload
  document.getElementById('kmlUpload')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      importKmlString(ev.target.result, true);
      updateKmlStatus(file.name);
      renderZoneList();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('clearKml')?.addEventListener('click', () => {
    if (!confirm('Remove all KML zones from the map?')) return;
    localStorage.removeItem(KML_KEY);
    localStorage.removeItem(KML_ZONES_KEY);
    localStorage.removeItem('mpf_map_fitted');
    kmlZones = [];
    kmlLayerGroup.clearLayers();
    kmlLeafletLayers = {};
    renderZoneList();
    closeEditZone();
    map.closePopup();
    updateKmlStatus(null);
  });

  document.getElementById('downloadKml')?.addEventListener('click', () => {
    const kml = localStorage.getItem(KML_KEY);
    if (!kml) { alert('No original KML stored.'); return; }
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'venue.kml'; a.click();
    URL.revokeObjectURL(url);
  });

  // Markers import / export / reset
  document.getElementById('importMarkersFile')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('Expected array');
        markers = data; saveMarkers(); renderMarkers();
        alert(`Imported ${data.length} markers.`);
      } catch(err) { alert('Import failed: ' + err.message); }
    };
    reader.readAsText(file); e.target.value = '';
  });

  document.getElementById('exportMarkers')?.addEventListener('click', () => downloadJSON(markers, 'markers.json'));

  document.getElementById('resetMarkers')?.addEventListener('click', async () => {
    if (!confirm('Reset to default markers.json?')) return;
    localStorage.removeItem(MARKERS_KEY);
    await loadMarkers(); renderMarkers();
  });
}

function openAdminPanel() {
  adminOpen = true;
  document.getElementById('admin-panel').classList.add('open');
  document.getElementById('adminToggle').classList.add('active');
  document.body.classList.add('admin-mode');
  renderZoneList();
  setTimeout(() => map && map.invalidateSize({ animate: false }), 320);
}

function closeAdminPanel() {
  adminOpen = false;
  document.getElementById('admin-panel').classList.remove('open');
  document.getElementById('adminToggle').classList.remove('active');
  document.body.classList.remove('admin-mode');
  cancelAddMarker();
  closeEditZone();
  setTimeout(() => map && map.invalidateSize({ animate: false }), 320);
}

function cancelAddMarker() {
  isAddingMarker = false; pendingLatLng = null;
  document.getElementById('addMarkerForm')?.classList.add('hidden');
  document.getElementById('startAddMarker')?.classList.remove('hidden');
  document.getElementById('mapPageWrap')?.classList.remove('map-adding-marker');
  ['newMarkerLabel','newMarkerDesc','newMarkerImage','newMarkerUrl','newMarkerUrlLabel','newMarkerLat','newMarkerLng']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (map._previewMarker) { map.removeLayer(map._previewMarker); map._previewMarker = null; }
}

// ── KML Status UI ─────────────────────────────
function updateKmlStatus(filename) {
  const el = document.getElementById('kmlFileName');
  if (!el) return;
  if (filename === null) {
    el.textContent = 'No KML loaded'; el.style.color = '';
  } else if (filename) {
    el.textContent = `✓ ${filename} — ${kmlZones.length} zones loaded`;
    el.style.color = 'var(--color-accent)';
  } else {
    const stored = localStorage.getItem(KML_ZONES_KEY);
    if (stored) {
      try {
        const n = JSON.parse(stored).length;
        el.textContent = `✓ ${n} zones loaded`; el.style.color = 'var(--color-accent)';
      } catch(e) { el.textContent = 'KML stored'; }
    } else { el.textContent = 'No KML loaded'; el.style.color = ''; }
  }
}

// ── Nav ───────────────────────────────────────
function bindNav() {
  const t = document.getElementById('navToggle');
  const l = document.getElementById('navLinks');
  if (t) t.addEventListener('click', () => l.classList.toggle('open'));
}


// ── Utils ─────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) { return escHtml(str); }

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
