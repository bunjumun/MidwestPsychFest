/* ============================================
   MPF Global Nav — Hamburger Toggle + Dynamic Pages
   Dropdowns are CSS hover/focus-within driven.
   Custom pages (navSection:'festival') are injected
   from data/pages.json at runtime so all pages pick
   them up without manual HTML edits.
   ============================================ */
(function () {
  'use strict';
  var toggle = document.getElementById('navToggle');
  var links  = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
  }
  // Close mobile nav when a link is clicked
  document.addEventListener('click', function (e) {
    if (links && links.classList.contains('open') &&
        !links.contains(e.target) && e.target !== toggle) {
      links.classList.remove('open');
    }
  });
}());

// Inject custom pages (added via admin page creator) into the Festival dropdown
(async function injectCustomPages() {
  try {
    const res = await fetch('data/pages.json?_=' + Date.now());
    if (!res.ok) return;
    const pages = await res.json();
    const customPages = pages.filter(function(p) { return p.navSection === 'festival'; });
    if (!customPages.length) return;
    // First .menu-dropdown inside #navLinks is the Festival dropdown
    var festivalDropdown = document.querySelector('#navLinks .menu-dropdown');
    if (!festivalDropdown) return;
    // Collect hrefs already in the dropdown so we don't duplicate hardcoded items
    var existing = new Set(Array.from(festivalDropdown.querySelectorAll('a')).map(function(a) { return a.getAttribute('href'); }));
    customPages.forEach(function(p) {
      if (!existing.has(p.url)) {
        var li = document.createElement('li');
        var a  = document.createElement('a');
        a.href        = p.url;
        a.textContent = p.label;
        li.appendChild(a);
        festivalDropdown.appendChild(li);
      }
    });
  } catch(e) {}
}());
