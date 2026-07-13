"""
Log routes: in-app log viewer, clear, reveal-in-file-manager, and the client
log ingest endpoint. Log paths + log_event come from app; the logging
infrastructure itself (rotation, startup setup) stays in app.
"""
import os
import sys
import subprocess

from flask import Blueprint, request, jsonify

from app import LOG_FILE_PATH, LOG_DIR_PATH, log_event

logs_bp = Blueprint('logs', __name__)


@logs_bp.route('/api/logs', methods=['GET'])
def get_logs():
    """Return last N lines of the current log file (most recent at bottom)."""
    try:
        lines_arg = int(request.args.get('lines', '500'))
    except ValueError:
        lines_arg = 500
    lines_arg = max(50, min(lines_arg, 20000))
    result_lines = []
    file_size = 0
    try:
        if os.path.isfile(LOG_FILE_PATH):
            file_size = os.path.getsize(LOG_FILE_PATH)
            tail_bytes = b''
            chunk_size = 0
            # Read up to 4 MB from the end (plenty for ~20k lines)
            max_chunk = 4 * 1024 * 1024
            try:
                with open(LOG_FILE_PATH, 'rb') as f:
                    f.seek(0, os.SEEK_END)
                    pos = f.tell()
                    chunk_size = min(pos, max_chunk)
                    f.seek(pos - chunk_size, os.SEEK_SET)
                    tail_bytes = f.read()
            except OSError:
                pass
            text = tail_bytes.decode('utf-8', errors='replace')
            # Drop a partial first line if we didn't read from byte 0
            if 0 < chunk_size < file_size and text:
                nl = text.find('\n')
                if nl != -1:
                    text = text[nl + 1:]
            all_lines = text.splitlines()
            result_lines = all_lines[-lines_arg:]
    except OSError:
        pass
    # Count archived log files in the same directory
    archive_count = 0
    try:
        for fname in os.listdir(LOG_DIR_PATH):
            if fname.startswith('led_raster_designer_') and fname.endswith('.log'):
                archive_count += 1
    except OSError:
        pass
    return jsonify({
        'lines': result_lines,
        'file_size_bytes': file_size,
        'file_path': LOG_FILE_PATH,
        'dir_path': LOG_DIR_PATH,
        'archive_count': archive_count,
        'returned_count': len(result_lines)
    })


@logs_bp.route('/api/logs', methods=['DELETE'])
def clear_logs():
    """Truncate the active log file. Archived (rotated) logs are preserved."""
    try:
        os.makedirs(LOG_DIR_PATH, exist_ok=True)
        with open(LOG_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write('')
    except OSError as e:
        return jsonify({'error': f'Failed to clear logs: {e}'}), 500
    log_event('clear_logs')
    return jsonify({'status': 'success'})


@logs_bp.route('/api/logs/reveal', methods=['POST'])
def reveal_logs_folder():
    """Open the logs directory in the OS file manager (Finder / Explorer / xdg-open)."""
    # Host-machine action: opening windows on the host must not be remotely
    # triggerable by an unauthenticated LAN peer.
    if (request.remote_addr or '') not in ('127.0.0.1', '::1'):
        return jsonify({'error': 'Only available on the host machine.'}), 403
    try:
        os.makedirs(LOG_DIR_PATH, exist_ok=True)
        if sys.platform == 'darwin':
            subprocess.Popen(['open', LOG_DIR_PATH])
        elif sys.platform == 'win32':
            os.startfile(LOG_DIR_PATH)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(['xdg-open', LOG_DIR_PATH])
    except Exception as e:
        return jsonify({'error': f'Failed to open logs folder: {e}'}), 500
    return jsonify({'status': 'success', 'path': LOG_DIR_PATH})


@logs_bp.route('/api/log', methods=['POST'])
def client_log():
    data = request.json or {}
    action = data.get('action', 'client_log')
    details = data.get('details', {})
    log_event(action, details, source='client')
    return jsonify({'status': 'ok'})
