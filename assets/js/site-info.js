/* ============================================
   MIDWEST PSYCH FEST — Site Info hydration
   Source of truth: data/info.json
   Override layer:  localStorage mpf_info
   ============================================ */

(async function () {
  // 1. Load base info from data/info.json
  let base = {};
  try {
    const res = await fetch('data/info.json');
    if (res.ok) base = await res.json();
  } catch(e) {}

  // 2. Merge localStorage override on top
  let info = Object.assign({}, base);
  try {
    const saved = localStorage.getItem('mpf_info');
    if (saved) Object.assign(info, JSON.parse(saved));
  } catch(e) {}

  if (!Object.keys(info).length) return;

  // ── Hydrate DOM ──────────────────────────────

  function setText(sel, val) {
    if (!val) return;
    document.querySelectorAll(sel).forEach(el => { el.textContent = val; });
  }
  function setHref(sel, val) {
    if (!val) return;
    document.querySelectorAll(sel).forEach(el => { el.href = val; });
  }

  // Festival name in nav
  document.querySelectorAll('[data-info="name-nav"]').forEach(el => {
    const parts = (info.name || '').split(' ');
    if (parts.length >= 2) {
      el.innerHTML = parts[0] + ' <span>' + parts.slice(1).join(' ') + '</span>';
    } else {
      el.textContent = info.name || '';
    }
  });

  setText('[data-info="name"]', info.name);

  // Dates
  if (info.day1 && info.day2) {
    setText('[data-info="dates-short"]', shortRange(info.day1, info.day2));
    setText('[data-info="day1-label"]', 'Day 1 — ' + shortDate(info.day1));
    setText('[data-info="day2-label"]', 'Day 2 — ' + shortDate(info.day2));
  }

  setText('[data-info="location"]', info.location);
  setText('[data-info="venue"]',    info.venue);
  setText('[data-info="tagline"]',  info.tagline);

  if (info.address) {
    setText('[data-info="address"]', info.address);
    setHref('[data-info="address-link"]', 'https://maps.google.com/?q=' + encodeURIComponent(info.address));
  }

  setHref('[data-info="instagram"]', info.instagram);
  setHref('[data-info="facebook"]',  info.facebook);
  if (!info.instagram) document.querySelectorAll('[data-info="instagram"]').forEach(el => el.style.display = 'none');
  if (!info.facebook)  document.querySelectorAll('[data-info="facebook"]').forEach(el => el.style.display = 'none');

  // Ticket button — floating + any data-info="tickets" links
  const ticketBtn = document.getElementById('ticketBtn');
  if (info.tickets) {
    setHref('[data-info="tickets"]', info.tickets);
    if (ticketBtn) {
      ticketBtn.href = info.tickets;
      ticketBtn.style.display = '';
      // Periodic jiggle every 6 seconds
      function jiggleTicket() {
        ticketBtn.classList.remove('jiggle');
        void ticketBtn.offsetWidth; // force reflow to restart animation
        ticketBtn.classList.add('jiggle');
      }
      setTimeout(jiggleTicket, 2500);           // first jiggle after 2.5s
      setInterval(jiggleTicket, 6000);           // then every 6s
    }
  } else {
    document.querySelectorAll('[data-info="tickets"]').forEach(el => el.style.display = 'none');
    if (ticketBtn) ticketBtn.style.display = 'none';
  }

  // Page <title>
  if (info.name) {
    const t = document.title;
    if (t.includes('—')) document.title = t.split('—')[0].trim() + ' — ' + info.name;
  }

  // Logo image (overrides text nav)
  const logoDataUrl = localStorage.getItem('mpf_logo');
  if (logoDataUrl) {
    document.querySelectorAll('[data-info="logo-img"]').forEach(el => {
      el.src = logoDataUrl; el.style.display = 'block';
    });
    document.querySelectorAll('[data-info="logo-text"]').forEach(el => el.style.display = 'none');
  }

  // ── Helpers ──────────────────────────────────
  function shortRange(d1, d2) {
    const a = new Date(d1 + 'T12:00'), b = new Date(d2 + 'T12:00');
    const mo = a.toLocaleDateString('en-US', { month: 'short' });
    return `${mo} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`;
  }
  function shortDate(str) {
    const d = new Date(str + 'T12:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
})();
