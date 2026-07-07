/*
 * quickstart.js — first-run guided tour / quick-start guide.
 * Auto-shows on first launch, walks through the app step by step, is skippable
 * at any time, and offers a "Don't show on startup" checkbox. Reopen anytime
 * from Help -> Quick Start Guide. Fully self-contained + offline (no CDN).
 */
(function () {
    'use strict';

    var LS_KEY = 'lrd_quickstart_disabled'; // '1' = don't auto-show on launch

    // Tour steps. `target` is a CSS selector to spotlight (omit for a centered
    // welcome card). `place` positions the callout: right | left | top | bottom.
    var STEPS = [
        {
            title: 'Welcome to LED Raster Designer',
            body: 'Design LED walls, plan data &amp; power, and export production maps for your processor. Here’s a quick tour — you can skip it any time.',
            center: true
        },
        {
            target: '#left-sidebar',
            title: 'Set up your wall',
            body: 'Enter one cabinet’s pixel size (e.g. 128 &times; 128), then how many panels wide and tall your wall is under <b>Columns</b> and <b>Rows</b>.',
            place: 'right'
        },
        {
            target: 'canvas',
            title: 'Your wall',
            body: 'Your wall renders here on the <b>Pixel Map</b> — each square is one cabinet. Scroll to zoom, <b>Space</b>+drag to pan, and <b>Fit</b> to recenter.',
            place: 'top'
        },
        {
            target: '#view-tabs',
            title: 'Five views',
            body: 'Switch between <b>Pixel Map</b>, <b>Cabinet ID</b>, <b>Show Look</b> (real-world stage layout), <b>Data</b> (signal &amp; ports), and <b>Power</b> (circuits).',
            place: 'bottom'
        },
        {
            target: '#right-sidebar',
            title: 'Screens &amp; canvases',
            body: 'Manage your screens here. Add more with <b>+ Add</b>, or add another canvas (one per processor or stage) with <b>+ Add Canvas</b>.',
            place: 'left'
        },
        {
            target: '#btn-export',
            title: 'Export',
            body: 'When it looks right, click <b>Export</b> to save production maps — PNG, PSD, or Resolume XML — for your processor.',
            place: 'bottom'
        },
        {
            target: '[data-menu="help"]',
            title: 'You’re all set!',
            body: 'Reopen this guide any time from <b>Help → Quick Start Guide</b>. Happy designing.',
            place: 'bottom'
        }
    ];

    var idx = 0;
    var els = null; // {catch, spot, callout}

    function injectStyles() {
        if (document.getElementById('qs-styles')) return;
        var css = ''
            + '#qs-catch{position:fixed;inset:0;z-index:2000000;}'
            + '#qs-spot{position:fixed;z-index:2000001;border-radius:8px;pointer-events:none;'
            + 'box-shadow:0 0 0 3px #e22330,0 0 0 9999px rgba(10,10,12,.66);transition:all .22s cubic-bezier(.4,0,.2,1);}'
            + '#qs-callout{position:fixed;z-index:2000002;width:330px;max-width:calc(100vw - 32px);background:#2e2e2e;'
            + 'color:#f0f0f0;border:1px solid #3a3a3a;border-top:3px solid #e22330;border-radius:12px;'
            + 'box-shadow:0 14px 44px rgba(0,0,0,.55);font-family:-apple-system,"Segoe UI",system-ui,sans-serif;'
            + 'padding:16px 18px 13px;transition:all .22s cubic-bezier(.4,0,.2,1);}'
            + '#qs-callout h3{margin:0 0 7px;font-size:16px;font-weight:700;color:#fff;}'
            + '#qs-callout p{margin:0;font-size:13.5px;line-height:1.45;color:#d6d6d6;}'
            + '#qs-callout .qs-prog{margin:13px 0 11px;font-size:11px;color:#9a9a9a;letter-spacing:.02em;}'
            + '#qs-callout .qs-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}'
            + '#qs-callout .qs-chk{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#b6b6b6;cursor:pointer;user-select:none;}'
            + '#qs-callout .qs-chk input{width:14px;height:14px;accent-color:#e22330;cursor:pointer;}'
            + '#qs-callout .qs-btns{display:flex;gap:8px;}'
            + '#qs-callout button{font:600 12.5px -apple-system,"Segoe UI",sans-serif;border-radius:7px;padding:7px 13px;cursor:pointer;border:1px solid #4a4a4a;}'
            + '#qs-callout .qs-skip{background:transparent;color:#9a9a9a;border-color:transparent;padding:7px 6px;}'
            + '#qs-callout .qs-skip:hover{color:#e0e0e0;}'
            + '#qs-callout .qs-back{background:#3c3c3c;color:#e0e0e0;}'
            + '#qs-callout .qs-next{background:#e22330;color:#fff;border-color:#8f1218;}'
            + '#qs-callout .qs-next:hover{background:#ef3340;}'
            + '#qs-callout .qs-arrow{position:absolute;width:14px;height:14px;background:#2e2e2e;border:1px solid #3a3a3a;transform:rotate(45deg);}';
        var s = document.createElement('style');
        s.id = 'qs-styles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function build() {
        injectStyles();
        var c = document.createElement('div'); c.id = 'qs-catch';
        var spot = document.createElement('div'); spot.id = 'qs-spot';
        var call = document.createElement('div'); call.id = 'qs-callout';
        document.body.appendChild(c);
        document.body.appendChild(spot);
        document.body.appendChild(call);
        // clicking the dim backdrop does nothing (prevents accidental app edits)
        c.addEventListener('click', function (e) { e.stopPropagation(); });
        els = { catch: c, spot: spot, callout: call };
        window.addEventListener('resize', reposition);
    }

    function disabled() { try { return localStorage.getItem(LS_KEY) === '1'; } catch (e) { return false; } }
    function setDisabled(v) { try { v ? localStorage.setItem(LS_KEY, '1') : localStorage.removeItem(LS_KEY); } catch (e) {} }

    function targetRect(step) {
        if (!step.target) return null;
        var el = document.querySelector(step.target);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return r;
    }

    function place(step) {
        var call = els.callout, spot = els.spot;
        var r = targetRect(step);
        // spotlight
        if (r) {
            var pad = 6;
            spot.style.display = 'block';
            spot.style.left = (r.left - pad) + 'px';
            spot.style.top = (r.top - pad) + 'px';
            spot.style.width = (r.width + pad * 2) + 'px';
            spot.style.height = (r.height + pad * 2) + 'px';
        } else {
            // no target: dim everything, no visible hole
            spot.style.display = 'block';
            spot.style.left = '50%'; spot.style.top = '50%';
            spot.style.width = '0px'; spot.style.height = '0px';
        }
        // callout position
        var cw = call.offsetWidth || 330, ch = call.offsetHeight || 160;
        var gap = 18, vw = window.innerWidth, vh = window.innerHeight;
        var x, y;
        var arrow = call.querySelector('.qs-arrow');
        if (arrow) arrow.style.display = 'none';
        if (!r || step.center) {
            x = (vw - cw) / 2; y = (vh - ch) / 2;
        } else {
            var p = step.place || 'bottom';
            if (p === 'right') { x = r.right + gap; y = r.top; }
            else if (p === 'left') { x = r.left - cw - gap; y = r.top; }
            else if (p === 'top') { x = r.left + r.width / 2 - cw / 2; y = r.top - ch - gap; }
            else { x = r.left + r.width / 2 - cw / 2; y = r.bottom + gap; }
            // clamp on-screen
            x = Math.max(12, Math.min(x, vw - cw - 12));
            y = Math.max(12, Math.min(y, vh - ch - 12));
            // arrow
            if (arrow) {
                arrow.style.display = 'block';
                if (p === 'right') { arrow.style.left = '-8px'; arrow.style.top = Math.max(14, Math.min(r.top + r.height / 2 - y - 7, ch - 28)) + 'px'; arrow.style.borderRight = 'none'; arrow.style.borderBottom = 'none'; }
                else if (p === 'left') { arrow.style.left = (cw - 7) + 'px'; arrow.style.top = Math.max(14, Math.min(r.top + r.height / 2 - y - 7, ch - 28)) + 'px'; arrow.style.borderLeft = 'none'; arrow.style.borderTop = 'none'; }
                else if (p === 'top') { arrow.style.top = (ch - 7) + 'px'; arrow.style.left = Math.max(14, Math.min(r.left + r.width / 2 - x - 7, cw - 28)) + 'px'; arrow.style.borderLeft = 'none'; arrow.style.borderTop = 'none'; }
                else { arrow.style.top = '-8px'; arrow.style.left = Math.max(14, Math.min(r.left + r.width / 2 - x - 7, cw - 28)) + 'px'; arrow.style.borderRight = 'none'; arrow.style.borderBottom = 'none'; }
            }
        }
        call.style.left = x + 'px';
        call.style.top = y + 'px';
    }

    function reposition() { if (els && els.callout.style.display !== 'none') place(STEPS[idx]); }

    function render() {
        var step = STEPS[idx];
        var last = idx === STEPS.length - 1;
        els.callout.innerHTML =
            '<div class="qs-arrow"></div>'
            + '<h3>' + step.title + '</h3>'
            + '<p>' + step.body + '</p>'
            + '<div class="qs-prog">Step ' + (idx + 1) + ' of ' + STEPS.length + '</div>'
            + '<div class="qs-row">'
            + '  <label class="qs-chk"><input type="checkbox" id="qs-nolaunch"' + (disabled() ? ' checked' : '') + '> Don’t show on startup</label>'
            + '  <div class="qs-btns">'
            + '    <button class="qs-skip" id="qs-skip">Skip</button>'
            + (idx > 0 ? '    <button class="qs-back" id="qs-back">Back</button>' : '')
            + '    <button class="qs-next" id="qs-next">' + (last ? 'Get started' : 'Next') + '</button>'
            + '  </div>'
            + '</div>';
        els.callout.querySelector('#qs-skip').onclick = end;
        els.callout.querySelector('#qs-next').onclick = function () { last ? end() : go(idx + 1); };
        var back = els.callout.querySelector('#qs-back'); if (back) back.onclick = function () { go(idx - 1); };
        els.callout.querySelector('#qs-nolaunch').onchange = function () { setDisabled(this.checked); };
        place(step);
    }

    function go(i) {
        if (i < 0 || i >= STEPS.length) return;
        idx = i;
        render();
    }

    function show() {
        if (!els) build();
        els.catch.style.display = 'block';
        els.spot.style.display = 'block';
        els.callout.style.display = 'block';
        idx = 0;
        render();
    }

    function end() {
        if (!els) return;
        els.catch.style.display = 'none';
        els.spot.style.display = 'none';
        els.callout.style.display = 'none';
    }

    window.QuickStart = { start: show, end: end };

    // Auto-show on first launch (once the app UI has rendered), unless disabled.
    function maybeAutoShow() {
        if (disabled()) return;
        // wait for the toolbar/sidebars to exist so targets resolve
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            if (document.querySelector('#view-tabs') && document.querySelector('#right-sidebar')) {
                clearInterval(t);
                setTimeout(show, 400);
            } else if (tries > 40) {
                clearInterval(t);
            }
        }, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeAutoShow);
    } else {
        maybeAutoShow();
    }
})();
