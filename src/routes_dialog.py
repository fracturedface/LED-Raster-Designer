"""
Native OS file-dialog + disk-write routes.

Self-contained except for log_event (imported from app). Lets the browser GUI
trigger a real OS save/pick dialog and stream export blobs straight to disk,
bypassing the browser download flow.
"""
import os
import platform
import subprocess
import base64

from flask import Blueprint, request, jsonify

from app import log_event

dialog_bp = Blueprint('dialog', __name__)

# These endpoints open dialogs on, and write files to, the HOST machine.
# They exist for the GUI running on the host itself; a remote client's saves
# belong on the remote machine (the client falls back to browser downloads).
# Enforce that server-side too: anything not from loopback gets a 403 — an
# unauthenticated LAN peer must not be able to write arbitrary host files.
_LOOPBACK = ('127.0.0.1', '::1')


@dialog_bp.before_request
def _local_only():
    addr = request.remote_addr or ''
    if addr not in _LOOPBACK:
        log_event('native_dialog_rejected_remote', {
            'remote_addr': addr, 'path': request.path})
        return jsonify({'ok': False,
                        'error': 'Native dialogs are only available on the host machine.'}), 403


def decode_base64_bytes(data_url):
    if ',' in data_url:
        data_url = data_url.split(',', 1)[1]
    return base64.b64decode(data_url)


def _run_dialog_command(cmd):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        value = (result.stdout or '').strip()
        return value or None
    except Exception:
        return None


def _native_choose_save_file(suggested_name):
    system = platform.system()
    if system == 'Darwin':
        script = f'POSIX path of (choose file name with prompt "Save File" default name "{suggested_name}")'
        return _run_dialog_command(['osascript', '-e', script])
    if system == 'Windows':
        script = (
            'Add-Type -AssemblyName System.Windows.Forms;'
            '$d=New-Object System.Windows.Forms.SaveFileDialog;'
            f'$d.FileName="{suggested_name}";'
            'if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.FileName}'
        )
        return _run_dialog_command(['powershell', '-NoProfile', '-Command', script])
    # Linux fallback (if zenity is installed)
    return _run_dialog_command(['zenity', '--file-selection', '--save', '--confirm-overwrite', f'--filename={suggested_name}'])


def _native_choose_directory():
    system = platform.system()
    if system == 'Darwin':
        script = 'POSIX path of (choose folder with prompt "Select Export Folder")'
        return _run_dialog_command(['osascript', '-e', script])
    if system == 'Windows':
        script = (
            'Add-Type -AssemblyName System.Windows.Forms;'
            '$d=New-Object System.Windows.Forms.FolderBrowserDialog;'
            'if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){Write-Output $d.SelectedPath}'
        )
        return _run_dialog_command(['powershell', '-NoProfile', '-Command', script])
    return _run_dialog_command(['zenity', '--file-selection', '--directory'])


@dialog_bp.route('/api/native-dialog/save-file', methods=['POST'])
def native_dialog_save_file():
    data = request.get_json() or {}
    suggested_name = data.get('suggested_name', 'output.bin')
    try:
        log_event('native_dialog_save_file_start', {'suggested_name': suggested_name})
        file_path = _native_choose_save_file(suggested_name)
        if not file_path:
            log_event('native_dialog_save_file_cancelled', {'suggested_name': suggested_name})
            return jsonify({'ok': False, 'cancelled': True})
        log_event('native_dialog_save_file', {'path': file_path})
        return jsonify({'ok': True, 'path': file_path})
    except Exception as e:
        log_event('native_dialog_save_file_error', {'error': str(e)})
        return jsonify({'ok': False, 'error': str(e)}), 500


@dialog_bp.route('/api/native-dialog/select-directory', methods=['POST'])
def native_dialog_select_directory():
    try:
        log_event('native_dialog_select_directory_start', {})
        directory = _native_choose_directory()
        if not directory:
            log_event('native_dialog_select_directory_cancelled', {})
            return jsonify({'ok': False, 'cancelled': True})
        log_event('native_dialog_select_directory', {'directory': directory})
        return jsonify({'ok': True, 'path': directory})
    except Exception as e:
        log_event('native_dialog_select_directory_error', {'error': str(e)})
        return jsonify({'ok': False, 'error': str(e)}), 500


@dialog_bp.route('/api/native-dialog/write-file', methods=['POST'])
def native_dialog_write_file():
    """Write blob bytes to a chosen path on disk.

    Accepts EITHER:
      - JSON body with {path, data_url} where data_url is a base64 data URI
        (legacy v0.8.6 path; works for small blobs but blows up JSON.stringify
        on the client when the blob exceeds ~25 MB).
      - multipart/form-data with `path` field and `file` field (v0.8.7+).
        This skips the JSON string allocation and is the only path large PSD
        exports survive, the client streams the raw blob to the server.
    """
    file_path = None
    content = None
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        file_path = request.form.get('path')
        f = request.files.get('file')
        if f is not None:
            content = f.read()
    else:
        data = request.get_json(silent=True) or {}
        file_path = data.get('path')
        data_url = data.get('data_url')
        if data_url:
            try:
                content = decode_base64_bytes(data_url)
            except Exception as e:
                log_event('native_dialog_write_file_decode_error', {'error': str(e)})
                content = None
    if not file_path or content is None:
        log_event('native_dialog_write_file_invalid', {'has_path': bool(file_path), 'has_data': content is not None})
        return jsonify({'ok': False, 'error': 'path and file/data_url are required'}), 400
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'wb') as f:
            f.write(content)
        exists = os.path.exists(file_path)
        size = os.path.getsize(file_path) if exists else 0
        log_event('native_dialog_write_file', {'path': file_path, 'bytes': len(content), 'exists': exists, 'size': size})
        return jsonify({'ok': True})
    except Exception as e:
        log_event('native_dialog_write_file_error', {'path': file_path, 'error': str(e)})
        return jsonify({'ok': False, 'error': str(e)}), 500


@dialog_bp.route('/api/native-dialog/write-multiple', methods=['POST'])
def native_dialog_write_multiple():
    data = request.get_json() or {}
    directory = data.get('directory')
    files = data.get('files', [])
    if not directory or not isinstance(files, list):
        return jsonify({'ok': False, 'error': 'directory and files are required'}), 400
    try:
        os.makedirs(directory, exist_ok=True)
        written = 0
        for item in files:
            filename = item.get('filename')
            data_url = item.get('data_url')
            if not filename or not data_url:
                continue
            safe_name = os.path.basename(filename)
            file_path = os.path.join(directory, safe_name)
            content = decode_base64_bytes(data_url)
            with open(file_path, 'wb') as f:
                f.write(content)
            written += 1
        log_event('native_dialog_write_multiple', {'directory': directory, 'requested': len(files), 'written': written})
        return jsonify({'ok': True, 'written': written})
    except Exception as e:
        log_event('native_dialog_write_multiple_error', {'directory': directory, 'error': str(e)})
        return jsonify({'ok': False, 'error': str(e)}), 500
