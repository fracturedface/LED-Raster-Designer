/* ──────────────────────────────────────────────────────────────────────
   LRD Color Picker — a replica of the macOS Color popover for Windows.

   On macOS the native <input type="color"> already opens the real Apple
   picker, so we leave it alone. On Windows the native control opens the
   (very different) OS picker, so we intercept it and show this replica.

   Phase 1: the compact swatch popover (vivid row, gray row, spectrum grid)
   plus a "Show Colors…" button. The full tabbed Colors window (wheel,
   slider modes, palettes, image, pencils) is built in later phases.

   Dev/testing on macOS: append ?colorpicker=force to the URL, or run
   LRDColorPicker.forceEnable() in the console, to exercise it here.
   ────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    function isEnabled() {
        if (/[?&]colorpicker=force/.test(location.search)) return true;
        try { if (localStorage.getItem('lrd_force_color_picker') === '1') return true; } catch (e) { /* ignore */ }
        return String(window.LRD_PLATFORM || '').toLowerCase() === 'win32';
    }

    // ── Color helpers ──────────────────────────────────────────────────
    function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

    function toHex(r, g, b) {
        const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
        return ('#' + h(r) + h(g) + h(b)).toUpperCase();
    }

    function normalizeHex(str) {
        if (!str) return null;
        let s = String(str).trim().replace(/^#/, '');
        if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
        return ('#' + s).toUpperCase();
    }

    // HSL → hex, used to generate the swatch grid.
    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return toHex(255 * f(0), 255 * f(8), 255 * f(4));
    }

    // ── Palettes ───────────────────────────────────────────────────────
    // Top vivid row — the saturated "Apple" basics.
    const VIVID = [
        '#FF2D2D', '#FF9500', '#FFF500', '#4CD916', '#00E5E0', '#0A60FF',
        '#9B30FF', '#C42BD6', '#AA7942', '#FFFFFF', '#919191', '#000000'
    ];

    // Gray ramp (first cell is the decorative "none" slash, still selectable).
    const GRAYS = (function () {
        const out = ['none'];
        for (let i = 1; i < 12; i++) {
            const l = Math.round(100 - (i - 1) * (100 / 10));
            out.push(hslToHex(0, 0, clamp(l, 0, 100)));
        }
        return out;
    })();

    // The big spectrum matrix: 12 hue columns × 10 lightness rows.
    const GRID_COLS = 12, GRID_ROWS = 10;
    const GRID = (function () {
        const cells = [];
        for (let r = 0; r < GRID_ROWS; r++) {
            const l = 44 + r * ((94 - 44) / (GRID_ROWS - 1)); // deep → pale top→bottom
            for (let c = 0; c < GRID_COLS; c++) {
                const h = (185 + c * (360 / GRID_COLS)) % 360;   // start ~teal, wrap
                cells.push(hslToHex(h, 85, l));
            }
        }
        return cells;
    })();

    // ── The picker (single shared instance) ────────────────────────────
    const ColorPicker = {
        el: null,
        target: null,        // the <input type=color> currently being edited
        _wired: false,

        ensureBuilt() {
            if (this.el) return;
            const pop = document.createElement('div');
            pop.className = 'lrd-cp-popover';
            pop.setAttribute('hidden', '');

            const rowVivid = this._buildRow(VIVID);
            const rowGray = this._buildRow(GRAYS, true);
            const divider = document.createElement('div');
            divider.className = 'lrd-cp-divider';
            const grid = this._buildGrid();

            // Inline hex entry (revealed by "Show Colors…" for now)
            const hexRow = document.createElement('div');
            hexRow.className = 'lrd-cp-hexrow';
            hexRow.setAttribute('hidden', '');
            const prev = document.createElement('div');
            prev.className = 'lrd-cp-hex-preview';
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.className = 'lrd-cp-hex-input';
            hexInput.spellcheck = false;
            hexInput.maxLength = 7;
            hexInput.placeholder = '#RRGGBB';
            hexRow.appendChild(prev);
            hexRow.appendChild(hexInput);

            const showBtn = document.createElement('button');
            showBtn.type = 'button';
            showBtn.className = 'lrd-cp-show';
            showBtn.textContent = 'Show Colors…';

            pop.appendChild(rowVivid);
            pop.appendChild(rowGray);
            pop.appendChild(divider);
            pop.appendChild(grid);
            pop.appendChild(hexRow);
            pop.appendChild(showBtn);
            document.body.appendChild(pop);

            this.el = pop;
            this._hexRow = hexRow;
            this._hexInput = hexInput;
            this._hexPreview = prev;

            // Reveal / focus the inline hex field (placeholder for the full window)
            showBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const hidden = hexRow.hasAttribute('hidden');
                if (hidden) {
                    hexRow.removeAttribute('hidden');
                    hexInput.value = this.target ? (this.target.value || '').toUpperCase() : '';
                    prev.style.background = hexInput.value || '#000';
                    hexInput.focus(); hexInput.select();
                } else {
                    hexRow.setAttribute('hidden', '');
                }
            });
            hexInput.addEventListener('input', () => {
                const norm = normalizeHex(hexInput.value);
                if (norm) prev.style.background = norm;
            });
            hexInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const norm = normalizeHex(hexInput.value);
                    if (norm) { this.commit(norm); this.close(); }
                    e.preventDefault();
                } else if (e.key === 'Escape') {
                    this.close(); e.preventDefault();
                }
            });

            // Clicks inside the popover shouldn't bubble to the outside-close handler.
            pop.addEventListener('mousedown', (e) => e.stopPropagation());
        },

        _buildRow(colors, isGray) {
            const row = document.createElement('div');
            row.className = 'lrd-cp-row' + (isGray ? ' lrd-cp-gray-row' : '');
            colors.forEach((hex) => {
                const cell = document.createElement('div');
                cell.className = 'lrd-cp-cell';
                if (hex === 'none') {
                    cell.classList.add('lrd-cp-none');
                    cell.dataset.color = '#FFFFFF';
                    cell.title = 'White';
                } else {
                    cell.style.background = hex;
                    cell.dataset.color = hex;
                    cell.title = hex;
                }
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.commit(cell.dataset.color);
                    this.close();
                });
                row.appendChild(cell);
            });
            return row;
        },

        _buildGrid() {
            const grid = document.createElement('div');
            grid.className = 'lrd-cp-grid';
            GRID.forEach((hex) => {
                const cell = document.createElement('div');
                cell.className = 'lrd-cp-gcell';
                cell.style.background = hex;
                cell.dataset.color = hex;
                cell.title = hex;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.commit(hex);
                    this.close();
                });
                grid.appendChild(cell);
            });
            return grid;
        },

        // Push the chosen color into the target input and fire the events the
        // app's existing handlers listen for.
        commit(hex) {
            const norm = normalizeHex(hex) || '#000000';
            if (!this.target) return;
            this.target.value = norm.toLowerCase();
            this.target.dispatchEvent(new Event('input', { bubbles: true }));
            this.target.dispatchEvent(new Event('change', { bubbles: true }));
        },

        openFor(input) {
            this.ensureBuilt();
            this.target = input;
            this._hexRow.setAttribute('hidden', '');
            // Highlight the currently-matching swatch, if any.
            const cur = normalizeHex(input.value);
            this.el.querySelectorAll('.lrd-cp-selected').forEach(n => n.classList.remove('lrd-cp-selected'));
            if (cur) {
                this.el.querySelectorAll('[data-color]').forEach((n) => {
                    if ((n.dataset.color || '').toUpperCase() === cur) n.classList.add('lrd-cp-selected');
                });
            }
            this.el.removeAttribute('hidden');
            this._position(input);
        },

        _position(input) {
            const r = input.getBoundingClientRect();
            const pop = this.el;
            const pw = pop.offsetWidth || 234;
            const ph = pop.offsetHeight || 320;
            const margin = 6;
            let left = r.left;
            let top = r.bottom + margin;
            if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
            if (left < 8) left = 8;
            if (top + ph > window.innerHeight - 8) top = r.top - ph - margin; // flip above
            if (top < 8) top = 8;
            pop.style.left = Math.round(left) + 'px';
            pop.style.top = Math.round(top) + 'px';
        },

        close() {
            if (this.el) this.el.setAttribute('hidden', '');
            this.target = null;
        },

        isOpen() { return this.el && !this.el.hasAttribute('hidden'); },

        wire() {
            if (this._wired) return;
            this._wired = true;
            // Intercept clicks on any color input (delegated → covers dynamic ones).
            document.addEventListener('click', (e) => {
                if (!isEnabled()) return;
                const t = e.target;
                if (t && t.matches && t.matches('input[type="color"]')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openFor(t);
                }
            }, true);
            // Close on outside click / Escape / scroll / resize.
            document.addEventListener('mousedown', () => { if (this.isOpen()) this.close(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
            window.addEventListener('resize', () => this.close());
            window.addEventListener('scroll', () => { if (this.isOpen()) this.close(); }, true);
        }
    };

    // Public handle (also used for forcing it on during dev).
    window.LRDColorPicker = {
        instance: ColorPicker,
        isEnabled,
        forceEnable() { try { localStorage.setItem('lrd_force_color_picker', '1'); } catch (e) { /* ignore */ } ColorPicker.wire(); },
        forceDisable() { try { localStorage.removeItem('lrd_force_color_picker'); } catch (e) { /* ignore */ } }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ColorPicker.wire());
    } else {
        ColorPicker.wire();
    }
})();
