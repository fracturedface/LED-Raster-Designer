/* ──────────────────────────────────────────────────────────────────────
   LED Raster Designer — "Studio" theme enhancer (cosmetic only)
   1. Swappable accent: applies the saved accent on load and exposes an
      accent picker injected into the Preferences dialog. Persisted in
      localStorage. Drives the --ps-accent* CSS variables.
   2. Chunky sliders: turns native range inputs into labeled bars (colored
      fill + value bubble), non-destructively (the <input> keeps its id,
      value, and listeners).
   Remove this file + theme.css to fully revert.
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ---- accent presets ---- */
  var ACCENTS = {
    red:    { label: 'Red',    accent: '#e22330', hi: '#ef3340', deep: '#8f1218' },
    blue:   { label: 'Blue',   accent: '#2f7ad6', hi: '#3d8ae6', deep: '#194f8f' },
    green:  { label: 'Green',  accent: '#2c9d4f', hi: '#36b85e', deep: '#176030' },
    amber:  { label: 'Amber',  accent: '#c8841a', hi: '#e09a2a', deep: '#7a4d08' },
    purple: { label: 'Purple', accent: '#7d4ad6', hi: '#8f5ce6', deep: '#4a268f' },
    teal:   { label: 'Teal',   accent: '#178f84', hi: '#1fa99c', deep: '#0c5048' }
  };
  var KEY = 'lrd_theme_accent';

  function currentKey() {
    try { return (localStorage.getItem(KEY) && ACCENTS[localStorage.getItem(KEY)]) ? localStorage.getItem(KEY) : 'red'; }
    catch (e) { return 'red'; }
  }
  function applyAccent(k) {
    var a = ACCENTS[k] || ACCENTS.red;
    var s = document.documentElement.style;
    s.setProperty('--ps-accent', a.accent);
    s.setProperty('--ps-accent-hi', a.hi);
    s.setProperty('--ps-accent-deep', a.deep);
    document.documentElement.setAttribute('data-ps-accent', k);
  }
  function save(k) { try { localStorage.setItem(KEY, k); } catch (e) { /* ignore */ } }
  applyAccent(currentKey());

  /* ---- chunky labeled sliders ---- */
  function enhanceSlider(r) {
    if (r.dataset.psSlider) return;
    r.dataset.psSlider = '1';
    var min = parseFloat(r.min) || 0;
    var max = parseFloat(r.max);
    if (!isFinite(max) || max === min) max = min + 100;
    var wrap = document.createElement('span');
    wrap.className = 'ps-slider-wrap';
    if (r.parentNode) { r.parentNode.insertBefore(wrap, r); wrap.appendChild(r); }
    var bubble = document.createElement('span');
    bubble.className = 'ps-slider-val';
    wrap.appendChild(bubble);
    function paint() {
      var pct = ((parseFloat(r.value) - min) / (max - min)) * 100;
      pct = Math.max(0, Math.min(100, pct));
      r.style.background = 'linear-gradient(90deg, var(--ps-accent) ' + pct + '%, var(--ps-inset) ' + pct + '%)';
      bubble.textContent = (r.value != null ? r.value : '');
    }
    r.addEventListener('input', paint);
    r.addEventListener('change', paint);
    paint();
  }

  /* ---- accent picker injected into Preferences ---- */
  function injectAccentUI() {
    var modal = document.getElementById('preferences-modal');
    if (!modal || getComputedStyle(modal).display === 'none') return;
    var content = modal.querySelector('.modal-content') || modal;
    if (content.querySelector('#ps-accent-ui')) return;

    var box = document.createElement('div');
    box.id = 'ps-accent-ui';
    box.className = 'ps-appearance';
    var h = document.createElement('div');
    h.className = 'ps-appearance-h';
    h.textContent = 'Appearance';
    box.appendChild(h);
    var row = document.createElement('div');
    row.className = 'ps-accent-row';
    var lab = document.createElement('span');
    lab.className = 'ps-accent-label';
    lab.textContent = 'Accent color';
    row.appendChild(lab);
    Object.keys(ACCENTS).forEach(function (k) {
      var a = ACCENTS[k];
      var sw = document.createElement('div');
      sw.className = 'ps-accent-sw' + (k === currentKey() ? ' selected' : '');
      sw.style.background = 'linear-gradient(' + a.hi + ',' + a.accent + ')';
      sw.title = a.label;
      sw.setAttribute('role', 'button');
      sw.setAttribute('aria-label', 'Accent color ' + a.label);
      sw.addEventListener('click', function () {
        applyAccent(k); save(k);
        row.querySelectorAll('.ps-accent-sw').forEach(function (e) { e.classList.remove('selected'); });
        sw.classList.add('selected');
      });
      row.appendChild(sw);
    });
    box.appendChild(row);
    var grid = content.querySelector('.prefs-grid');
    if (grid && grid.parentNode) grid.parentNode.insertBefore(box, grid.nextSibling);
    else content.appendChild(box);
  }

  function scan() {
    var list = document.querySelectorAll('input[type="range"]:not([data-ps-slider])');
    for (var i = 0; i < list.length; i++) enhanceSlider(list[i]);
    injectAccentUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  try { new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true }); }
  catch (e) { /* ignore */ }
})();
