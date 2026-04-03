/* ============================================
   MPF Global Nav — Hamburger Toggle
   Dropdowns are CSS hover/focus-within driven.
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
