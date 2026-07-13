// app-logs-recent: feature methods for LEDRasterApp (verbatim from the old
// monolithic app.js), attached to the prototype via the carrier class.
import { LEDRasterApp } from './app-core.js';
import { sendClientLog } from './helpers.js';

class _LogsRecent {
    // ── Logs Viewer (Help → Show Logs…) ──
    openLogsModal() {
        const modal = document.getElementById('logs-modal');
        if (!modal) return;
        modal.style.display = 'block';
        this._ensureLogsModalWired();
        this._logsUserScrolledUp = false;
        this.refreshLogs(true);
    }

    closeLogsModal() {
        const modal = document.getElementById('logs-modal');
        if (modal) modal.style.display = 'none';
        this._stopLogsAutoRefresh();
    }

    _ensureLogsModalWired() {
        if (this._logsModalWired) return;
        this._logsModalWired = true;
        const modal = document.getElementById('logs-modal');
        const closeBtn = document.getElementById('logs-close');
        const refreshBtn = document.getElementById('logs-refresh');
        const copyBtn = document.getElementById('logs-copy');
        const revealBtn = document.getElementById('logs-reveal');
        const clearBtn = document.getElementById('logs-clear');
        const linesSel = document.getElementById('logs-lines');
        const autoCb = document.getElementById('logs-autorefresh');
        const wrapCb = document.getElementById('logs-wrap');
        const sinceInput = document.getElementById('logs-since');
        const untilInput = document.getElementById('logs-until');
        const filterClearBtn = document.getElementById('logs-filter-clear');
        const pre = document.getElementById('logs-content');

        if (closeBtn) closeBtn.addEventListener('click', () => this.closeLogsModal());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshLogs(true));
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyLogs());
        if (revealBtn) revealBtn.addEventListener('click', () => this.revealLogsFolder());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearLogs());
        if (linesSel) linesSel.addEventListener('change', () => this.refreshLogs(true));
        if (autoCb) autoCb.addEventListener('change', () => {
            if (autoCb.checked) this._startLogsAutoRefresh();
            else this._stopLogsAutoRefresh();
        });
        if (wrapCb && pre) {
            wrapCb.addEventListener('change', () => {
                pre.style.whiteSpace = wrapCb.checked ? 'pre-wrap' : 'pre';
            });
        }
        // Filter inputs: re-render on input without re-fetching
        const applyFilter = () => this._rerenderLogsWithFilter();
        if (sinceInput) sinceInput.addEventListener('input', applyFilter);
        if (untilInput) untilInput.addEventListener('input', applyFilter);
        if (filterClearBtn) {
            filterClearBtn.addEventListener('click', () => {
                if (sinceInput) sinceInput.value = '';
                if (untilInput) untilInput.value = '';
                applyFilter();
            });
        }
        if (pre) {
            pre.addEventListener('scroll', () => {
                // If user scrolls away from the bottom, stop auto-scrolling on refresh
                const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 16;
                this._logsUserScrolledUp = !atBottom;
            });
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeLogsModal();
            });
        }
    }

    // Parse relative ("10 min ago", "2h ago", "30s", "1d ago") or absolute
    // timestamps ("YYYY-MM-DD HH:MM:SS" or any Date-parseable string) into an
    // epoch-ms number. Returns null for empty/unparseable input.
    parseLogFilterTime(input) {
        if (!input) return null;
        const trimmed = String(input).trim();
        if (!trimmed) return null;
        // Relative: "<n> <unit> ago" or just "<n><unit>" / "<n> <unit>"
        const relMatch = trimmed
            .toLowerCase()
            .replace(/\s+ago\s*$/, '')  // strip trailing "ago"
            .trim()
            .match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
        if (relMatch) {
            const n = parseFloat(relMatch[1]);
            const unit = relMatch[2];
            let ms;
            if (/^s(ec(ond)?s?)?$/.test(unit)) ms = n * 1000;
            else if (/^m(in(ute)?s?)?$/.test(unit)) ms = n * 60 * 1000;
            else if (/^h(r|rs|our|ours)?$/.test(unit)) ms = n * 60 * 60 * 1000;
            else if (/^d(ay|ays)?$/.test(unit)) ms = n * 24 * 60 * 60 * 1000;
            else return null;
            return Date.now() - ms;
        }
        // Absolute: try Date.parse. Accepts ISO, "YYYY-MM-DD HH:MM:SS",
        // "YYYY-MM-DDTHH:MM:SS", etc.
        // Log format "2026-04-22 13:20:48" is not strict ISO; convert space to T.
        const iso = trimmed.replace(' ', 'T');
        const parsed = Date.parse(iso);
        if (!isNaN(parsed)) return parsed;
        const parsed2 = Date.parse(trimmed);
        if (!isNaN(parsed2)) return parsed2;
        return null;
    }

    // Extract the log line's timestamp in epoch ms. Log lines are JSON with a
    // "timestamp": "YYYY-MM-DD HH:MM:SS" field. Returns null if not parseable.
    parseLogLineTime(line) {
        if (!line) return null;
        // Fast path: pull out the first "timestamp": "..." occurrence
        const m = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
        if (!m) return null;
        const iso = m[1].replace(' ', 'T');
        const parsed = Date.parse(iso);
        return isNaN(parsed) ? null : parsed;
    }

    _filterLogLines(lines) {
        const sinceInput = document.getElementById('logs-since');
        const untilInput = document.getElementById('logs-until');
        const sinceMs = this.parseLogFilterTime(sinceInput && sinceInput.value);
        const untilMs = this.parseLogFilterTime(untilInput && untilInput.value);
        const statusEl = document.getElementById('logs-filter-status');
        const hasSinceText = !!(sinceInput && sinceInput.value.trim());
        const hasUntilText = !!(untilInput && untilInput.value.trim());
        if (!hasSinceText && !hasUntilText) {
            if (statusEl) statusEl.textContent = '';
            return { lines, sinceMs: null, untilMs: null, valid: true };
        }
        // Validate: if user typed text but it didn't parse, highlight the issue
        const parts = [];
        if (hasSinceText && sinceMs === null) parts.push('Since: invalid');
        if (hasUntilText && untilMs === null) parts.push('Until: invalid');
        if (parts.length) {
            if (statusEl) { statusEl.textContent = parts.join(' · '); statusEl.style.color = '#f0ad4e'; }
            return { lines, sinceMs, untilMs, valid: false };
        }
        const filtered = lines.filter(line => {
            const t = this.parseLogLineTime(line);
            if (t === null) return false;  // drop lines without a timestamp
            if (sinceMs !== null && t < sinceMs) return false;
            if (untilMs !== null && t > untilMs) return false;
            return true;
        });
        if (statusEl) {
            statusEl.style.color = '#888';
            statusEl.textContent = `filtered to ${filtered.length} of ${lines.length}`;
        }
        return { lines: filtered, sinceMs, untilMs, valid: true };
    }

    _rerenderLogsWithFilter() {
        // Re-render last-fetched lines through the current filter (no re-fetch)
        if (!this._logsLastLines) return;
        const pre = document.getElementById('logs-content');
        if (!pre) return;
        const { lines } = this._filterLogLines(this._logsLastLines);
        pre.textContent = lines.join('\n');
        if (!this._logsUserScrolledUp) pre.scrollTop = pre.scrollHeight;
    }

    _startLogsAutoRefresh() {
        this._stopLogsAutoRefresh();
        this._logsAutoInterval = setInterval(() => this.refreshLogs(false), 2000);
    }

    _stopLogsAutoRefresh() {
        if (this._logsAutoInterval) {
            clearInterval(this._logsAutoInterval);
            this._logsAutoInterval = null;
        }
    }

    refreshLogs(force) {
        const linesSel = document.getElementById('logs-lines');
        const lines = linesSel ? parseInt(linesSel.value, 10) || 500 : 500;
        fetch(`/api/logs?lines=${lines}`)
            .then(r => r.json())
            .then(data => this._renderLogs(data, force))
            .catch(err => this._renderLogsError(err));
    }

    _renderLogs(data, force) {
        const pre = document.getElementById('logs-content');
        const meta = document.getElementById('logs-meta');
        if (!pre) return;
        const rawLines = Array.isArray(data.lines) ? data.lines : [];
        this._logsLastLines = rawLines;
        const { lines: visibleLines } = this._filterLogLines(rawLines);
        pre.textContent = visibleLines.join('\n');
        if (meta) {
            const sizeKB = (data.file_size_bytes || 0) / 1024;
            const sizeStr = sizeKB >= 1024
                ? `${(sizeKB / 1024).toFixed(1)} MB`
                : `${sizeKB.toFixed(1)} KB`;
            const archives = data.archive_count || 0;
            const archiveStr = archives > 0 ? ` · ${archives} archived` : '';
            meta.textContent = `${rawLines.length} lines loaded · ${sizeStr}${archiveStr}`;
        }
        // Auto-scroll to bottom unless the user scrolled up
        if (force || !this._logsUserScrolledUp) {
            pre.scrollTop = pre.scrollHeight;
            this._logsUserScrolledUp = false;
        }
    }

    _renderLogsError(err) {
        const pre = document.getElementById('logs-content');
        if (pre) pre.textContent = `Failed to load logs: ${err && err.message || err}`;
    }

    copyLogs() {
        const pre = document.getElementById('logs-content');
        if (!pre) return;
        const text = pre.textContent || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => this._flashCopyButton());
        } else {
            // Fallback: temporary textarea
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { /* ignore */ }
            document.body.removeChild(ta);
            this._flashCopyButton();
        }
    }

    _flashCopyButton() {
        const btn = document.getElementById('logs-copy');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = orig; }, 1200);
    }

    revealLogsFolder() {
        fetch('/api/logs/reveal', { method: 'POST' })
            .then(r => {
                if (!r.ok) return r.json().then(e => Promise.reject(e));
            })
            .catch(err => alert('Failed to open logs folder: ' + (err && err.error || 'unknown')));
    }

    clearLogs() {
        if (!confirm('Clear the current log file? Archived (rotated) logs will be preserved.')) return;
        fetch('/api/logs', { method: 'DELETE' })
            .then(r => {
                if (!r.ok) return r.json().then(e => Promise.reject(e));
                return r.json();
            })
            .then(() => this.refreshLogs(true))
            .catch(err => alert('Failed to clear logs: ' + (err && err.error || 'unknown')));
    }

    // ── Recent Files ──────────────────────────────────────────────

    getRecentFiles() {
        try {
            return JSON.parse(localStorage.getItem('ledRasterRecentFiles') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveRecentFiles(files) {
        localStorage.setItem('ledRasterRecentFiles', JSON.stringify(files));
    }

    addToRecentFiles(projectData) {
        if (!projectData || !projectData.name) return;
        const recent = this.getRecentFiles();
        // Remove existing entry with the same name
        const filtered = recent.filter(f => f.name !== projectData.name);
        // Add to front
        filtered.unshift({
            name: projectData.name,
            timestamp: Date.now(),
            layerCount: projectData.layers ? projectData.layers.length : 0,
            data: projectData
        });
        // Keep max 10
        // Keep max 20 recent files
        this.saveRecentFiles(filtered.slice(0, 20));
        this.updateRecentFilesMenu();
    }

    clearRecentFiles() {
        this.saveRecentFiles([]);
        this.updateRecentFilesMenu();
    }

    updateRecentFilesMenu() {
        const list = document.getElementById('recent-files-list');
        const divider = document.getElementById('recent-files-divider');
        if (!list) return;
        list.innerHTML = '';
        const recent = this.getRecentFiles();
        if (recent.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'recent-files-empty';
            empty.textContent = 'No recent files';
            list.appendChild(empty);
            if (divider) divider.style.display = 'none';
            return;
        }
        if (divider) divider.style.display = '';
        recent.forEach((file, idx) => {
            const item = document.createElement('div');
            item.className = 'menu-option';
            item.setAttribute('data-action', `recent-file-${idx}`);
            const date = new Date(file.timestamp);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            item.innerHTML = `<div class="recent-file-item"><span class="recent-file-name">${this.escapeHtml(file.name)}</span><span class="recent-file-date">${dateStr} &middot; ${file.layerCount || 0} layers</span></div>`;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                // Hide all menus
                document.querySelectorAll('.menu-dropdown').forEach(m => m.style.display = 'none');
                document.querySelectorAll('#menu-bar .menu-item').forEach(m => m.classList.remove('active'));
                this.loadRecentFile(idx);
            });
            list.appendChild(item);
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    loadRecentFile(idx) {
        const recent = this.getRecentFiles();
        if (idx < 0 || idx >= recent.length) return;
        const file = recent[idx];
        if (!file || !file.data) {
            alert('Recent file data is unavailable.');
            return;
        }
        try {
            this.resetApplicationState();
            this.project = file.data;
            if (this.project.layers) {
                this.project.layers.forEach(layer => {
                    this.applyMissingLayerDefaults(layer);
                    this.normalizeLoadedPowerFlowPattern(layer);
                });
            }
            // Sync renderer's pixel/show raster fields from the loaded file.
            // syncRasterFromProject handles view-aware raster + toolbar input.
            this.syncRasterFromProject();
            if (file.data.raster_width && file.data.raster_height) {
                this.saveRasterSize();
            }
            this.updateUI();
            if (this.project.layers && this.project.layers.length > 0) {
                this.selectLayer(this.project.layers[0]);
            }
            this.saveClientSideProperties();
            window.canvasRenderer.fitToView();

            fetch('/api/project', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.project)
            })
                .then(res => res.json())
                .then(data => {
                    if (!data || !Array.isArray(data.layers)) {
                        throw new Error('Invalid project data returned from server');
                    }
                    this.project = data;
                    this.dedupeProjectLayers('load_recent_file');
                    this.syncRasterFromProject();
                    if (this.project.layers) {
                        this.project.layers.forEach(layer => {
                            this.applyMissingLayerDefaults(layer);
                            this.normalizeLoadedPowerFlowPattern(layer);
                        });
                    }
                    this.updateUI();
                    if (this.project.layers && this.project.layers.length > 0) {
                        this.selectLayer(this.project.layers[0]);
                    }
                    this.saveClientSideProperties();
                    window.canvasRenderer.fitToView();
                    this.updateLayers(this.project.layers, false, 'Recent File Load Sync');
                    this.resetHistory('Initial State');
                    document.getElementById('status-message').textContent = 'Project loaded from recent files';
                    setTimeout(() => {
                        document.getElementById('status-message').textContent = 'Ready';
                    }, 2000);
                    // Slice 12: same migration toast path as loadProjectFromFile.
                    // Recent-file loads also go through PUT /api/project so the
                    // server emits _migration_notice when the cached payload
                    // lacked format_version: "0.8".
                    if (data && data._migration_notice) {
                        delete this.project._migration_notice;
                        sendClientLog('migration_notice_shown', {
                            name: this.project.name,
                            layers: this.project.layers ? this.project.layers.length : 0,
                            source: 'recent'
                        });
                        if (typeof this._toast === 'function') {
                            this._toast(
                                'Project upgraded to multi-canvas format (v0.8). Save to keep changes. Older app versions can no longer open this file.',
                                false,
                                10000
                            );
                        }
                    }
                })
                .catch(() => {
                    this.resetHistory('Initial State');
                    document.getElementById('status-message').textContent = 'Project loaded (server sync failed)';
                    setTimeout(() => {
                        document.getElementById('status-message').textContent = 'Ready';
                    }, 2000);
                });
            // Update timestamp so it moves to top of recent list
            this.addToRecentFiles(file.data);
        } catch (error) {
            alert('Error loading recent file: ' + error.message);
        }
    }

    // ── End Recent Files ─────────────────────────────────────────
}

for (const k of Object.getOwnPropertyNames(_LogsRecent.prototype)) {
    if (k !== 'constructor') {
        Object.defineProperty(LEDRasterApp.prototype, k,
            Object.getOwnPropertyDescriptor(_LogsRecent.prototype, k));
    }
}
