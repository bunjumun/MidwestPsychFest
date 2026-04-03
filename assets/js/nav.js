/* ============================================
   MPF Global Nav — Dropdown Toggle
   ============================================ */

(function () {
  'use strict';

  // Hamburger toggle (mobile — shows/hides the whole nav-links list)
  var toggle = document.getElementById('navToggle');
  var links  = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
  }

  // Dropdown group toggling
  // Each .nav-dropdown-trigger toggles .open on its sibling .nav-dropdown-menu
  var triggers = document.querySelectorAll('.nav-dropdown-trigger');
  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = trigger.nextElementSibling;
      var isOpen = menu && menu.classList.contains('open');

      // Close all open menus first
      document.querySelectorAll('.nav-dropdown-menu.open').forEach(function (m) {
        m.classList.remove('open');
        var t = m.previousElementSibling;
        if (t) t.setAttribute('aria-expanded', 'false');
      });

      // If it was closed, open this one
      if (!isOpen && menu) {
        menu.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      } else {
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', function () {
    document.querySelectorAll('.nav-dropdown-menu.open').forEach(function (m) {
      m.classList.remove('open');
      var t = m.previousElementSibling;
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  });

  // Prevent clicks inside a dropdown menu from closing it
  document.querySelectorAll('.nav-dropdown-menu').forEach(function (menu) {
    menu.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  });
}());
