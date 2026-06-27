/* ──────────────────────────────────────────────────────────────────────
   LED Raster Designer — "Studio" theme enhancer
   Cosmetic only: turns native range inputs into the chunky labeled bars
   (colored fill + value bubble) from the standard image editors/desktop reference.
   Non-destructive — moves the existing <input> into a wrapper, preserving
   its value, listeners, and id. Safe to remove with the theme.
   ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  function enhance(r) {
    if (r.dataset.psSlider) return;
    r.dataset.psSlider = '1';
    var min = parseFloat(r.min) || 0;
    var max = parseFloat(r.max);
    if (!isFinite(max) || max === min) max = min + 100;

    var wrap = document.createElement('span');
    wrap.className = 'ps-slider-wrap';
    if (r.parentNode) {
      r.parentNode.insertBefore(wrap, r);
      wrap.appendChild(r);
    }
    var bubble = document.createElement('span');
    bubble.className = 'ps-slider-val';
    wrap.appendChild(bubble);

    function paint() {
      var pct = ((parseFloat(r.value) - min) / (max - min)) * 100;
      pct = Math.max(0, Math.min(100, pct));
      r.style.background =
        'linear-gradient(90deg, var(--ps-accent) ' + pct + '%, var(--ps-inset) ' + pct + '%)';
      bubble.textContent = (r.value != null ? r.value : '');
    }
    r.addEventListener('input', paint);
    r.addEventListener('change', paint);
    paint();
  }
  function scan() {
    var list = document.querySelectorAll('input[type="range"]:not([data-ps-slider])');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }
})();
