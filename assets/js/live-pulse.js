/**
 * live-pulse.js — Midwest Psych Fest Live Pulse System
 * Handles: alerts banner, now-playing widget, next-up ticker
 * Fully self-contained, no imports required.
 */

(function () {
  'use strict';

  // ── Inject ticker + widget CSS ────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes mpf-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }',
    '.mpf-ticker-track { animation: mpf-ticker-scroll 30s linear infinite; white-space: nowrap; display: inline-block; }',
    '.mpf-ticker-wrap { overflow: hidden; background: rgba(255,60,172,0.12); border-top: 1px solid rgba(255,60,172,0.3); border-bottom: 1px solid rgba(255,60,172,0.3); padding: 8px 0; }',
    '.mpf-ticker-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em; color: #ff3cac; padding: 0 16px; flex-shrink: 0; }',
    '.mpf-ticker { display: flex; align-items: center; }',
    /* Alert banner */
    '#mpf-alert-banner { position: relative; width: 100%; box-sizing: border-box; padding: 10px 48px 10px 20px; font-size: 0.92rem; font-family: inherit; line-height: 1.4; z-index: 1000; }',
    '.mpf-alert-info { background: rgba(79,255,176,0.15); border-bottom: 1px solid rgba(79,255,176,0.4); color: #4fffb0; }',
    '.mpf-alert-warning { background: rgba(249,200,14,0.18); border-bottom: 1px solid rgba(249,200,14,0.5); color: #f9c80e; }',
    '.mpf-alert-success { background: rgba(255,60,172,0.15); border-bottom: 1px solid rgba(255,60,172,0.4); color: #ff3cac; }',
    '#mpf-alert-banner .mpf-alert-dismiss { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.1rem; line-height: 1; color: inherit; opacity: 0.7; padding: 4px 6px; }',
    '#mpf-alert-banner .mpf-alert-dismiss:hover { opacity: 1; }',
    /* Now playing widget */
    '.now-playing-widget { max-width: 900px; margin: 0 auto; padding: 24px; background: rgba(255,60,172,0.08); border: 1px solid rgba(255,60,172,0.3); border-radius: 12px; }',
    '.npw-label { font-family: "Abril Fatface", serif; color: #ff3cac; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 12px; }',
    '.npw-acts { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; }',
    '.npw-act { text-align: center; min-width: 120px; }',
    '.npw-band { font-family: "Abril Fatface", serif; color: #fff; font-size: 1.1rem; }',
    '.npw-stage { font-size: 0.75rem; color: rgba(255,255,255,0.6); }',
    '.npw-img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid #ff3cac; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; }'
  ].join('\n');
  document.head.appendChild(style);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function cacheBust(url) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
  }

  function parseLocalTime(dateStr, timeStr) {
    // dateStr: "2026-05-08", timeStr: "17:00"
    var parts = (dateStr + ' ' + timeStr).split(/[\s:-]/);
    return new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
      parseInt(parts[3], 10),
      parseInt(parts[4], 10),
      0
    );
  }

  function formatTime(dateStr, timeStr) {
    try {
      var d = parseLocalTime(dateStr, timeStr);
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ampm;
    } catch (e) {
      return timeStr;
    }
  }

  // Shared promise so we only fetch schedule.json once
  var schedulePromise = null;
  function getSchedule() {
    if (!schedulePromise) {
      schedulePromise = fetch(cacheBust('data/schedule.json'))
        .then(function (r) { return r.json(); })
        .catch(function () { return []; });
    }
    return schedulePromise;
  }

  // ── A) ALERTS BANNER ─────────────────────────────────────────────────────

  function loadAlerts() {
    var DISMISS_KEY = 'mpf-alert-dismissed';

    fetch(cacheBust('data/alerts.json'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.active || !data.message) return;

        // Check session dismissal
        var dismissed = sessionStorage.getItem(DISMISS_KEY);
        if (dismissed === data.updated + data.message) return;

        var type = ['info', 'warning', 'success'].indexOf(data.type) !== -1
          ? data.type : 'info';

        var banner = document.createElement('div');
        banner.id = 'mpf-alert-banner';
        banner.className = 'mpf-alert mpf-alert-' + type;

        var text = document.createTextNode(data.message);
        banner.appendChild(text);

        var dismiss = document.createElement('button');
        dismiss.className = 'mpf-alert-dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss alert');
        dismiss.textContent = '✕';
        dismiss.addEventListener('click', function () {
          sessionStorage.setItem(DISMISS_KEY, data.updated + data.message);
          banner.parentNode && banner.parentNode.removeChild(banner);
        });
        banner.appendChild(dismiss);

        // Insert after nav (or at top of body)
        var nav = document.querySelector('nav.site-nav');
        if (nav && nav.parentNode) {
          nav.parentNode.insertBefore(banner, nav.nextSibling);
        } else {
          document.body.insertBefore(banner, document.body.firstChild);
        }
      })
      .catch(function () { /* silent fail */ });
  }

  // ── B) NOW PLAYING WIDGET ─────────────────────────────────────────────────

  function nowPlaying() {
    var containers = document.querySelectorAll('#mpf-now-playing');
    if (!containers.length) return;

    getSchedule().then(function (schedule) {
      if (!Array.isArray(schedule) || !schedule.length) {
        containers.forEach(function (el) { el.style.display = 'none'; });
        return;
      }

      var now = new Date();

      var playing = schedule.filter(function (set) {
        if (!set.date || !set.set_time) return false;
        try {
          var start = parseLocalTime(set.date, set.set_time);
          var end = new Date(start.getTime() + 60 * 60 * 1000);
          return now >= start && now < end;
        } catch (e) {
          return false;
        }
      });

      if (!playing.length) {
        containers.forEach(function (el) { el.style.display = 'none'; });
        return;
      }

      var actsHtml = playing.map(function (set) {
        var band = set.band || set.artist || '';
        var stage = set.stage || set.stage_id || '';
        var imgHtml = set.image
          ? '<img class="npw-img" src="' + set.image + '" alt="' + band + '" />'
          : '';
        return (
          '<div class="npw-act">' +
            imgHtml +
            '<div class="npw-band">' + band + '</div>' +
            '<div class="npw-stage">' + stage + '</div>' +
          '</div>'
        );
      }).join('');

      var html = (
        '<div class="npw-label">NOW PLAYING</div>' +
        '<div class="npw-acts">' + actsHtml + '</div>'
      );

      containers.forEach(function (el) {
        el.innerHTML = html;
        el.style.display = '';
      });
    });
  }

  // Export so pages can call manually
  window.mpfNowPlaying = nowPlaying;

  // ── C) NEXT UP TICKER ─────────────────────────────────────────────────────

  function loadTicker() {
    var tracks = document.querySelectorAll('.mpf-ticker-track');
    var wraps = document.querySelectorAll('.mpf-ticker-wrap');
    if (!tracks.length) return;

    getSchedule().then(function (schedule) {
      if (!Array.isArray(schedule) || !schedule.length) {
        wraps.forEach(function (el) { el.style.display = 'none'; });
        return;
      }

      var now = new Date();

      var upcoming = schedule
        .filter(function (set) {
          if (!set.date || !set.set_time) return false;
          try {
            var start = parseLocalTime(set.date, set.set_time);
            return start > now;
          } catch (e) {
            return false;
          }
        })
        .sort(function (a, b) {
          return parseLocalTime(a.date, a.set_time) - parseLocalTime(b.date, b.set_time);
        })
        .slice(0, 6);

      if (!upcoming.length) {
        wraps.forEach(function (el) { el.style.display = 'none'; });
        return;
      }

      var segment = upcoming.map(function (set) {
        var band = set.band || set.artist || '';
        var stage = set.stage || set.stage_id || '';
        var time = formatTime(set.date, set.set_time);
        return '\u2605 ' + band + ' \u00b7 ' + stage + ' \u00b7 ' + time + '\u00a0\u00a0';
      }).join('');

      // Repeat 3x for seamless loop
      var text = segment + segment + segment;

      tracks.forEach(function (el) {
        el.textContent = text;
      });

      wraps.forEach(function (el) {
        el.style.display = '';
      });
    });
  }

  // ── Auto-run on DOMContentLoaded ─────────────────────────────────────────

  function init() {
    loadAlerts();
    nowPlaying();
    loadTicker();

    // Refresh alerts + now-playing every 60s
    setInterval(function () {
      // Reset schedule cache so next poll fetches fresh data
      schedulePromise = null;
      loadAlerts();
      nowPlaying();
      loadTicker();
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
