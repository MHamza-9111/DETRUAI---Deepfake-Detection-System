"""
Deepfake Detector — Flask Backend v4.2
Routes:
  GET  /              → serve index.html
  GET  /login         → serve login.html
  POST /auth/register → create account
  POST /auth/login    → authenticate
  POST /auth/logout   → clear session
  GET  /auth/check    → check session status
  POST /auth/forgot-password  → generate reset token
  POST /auth/reset-password   → reset password with token
  POST /analyze       → analyze uploaded image or video
  GET  /stats         → return session statistics
  GET  /user/history  → get this user's saved scan history
  POST /user/history  → save a scan entry to user's history
  DELETE /user/history → clear user's history
  GET  /health        → health check
"""

from dotenv import load_dotenv
load_dotenv()
import os
import uuid
import time
import json
import secrets
import hashlib
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS

# ── Optional Flask-Mail for real email sending ────────────────────────────────
try:
    from flask_mail import Mail, Message as MailMessage
    _MAIL_AVAILABLE = True
except ImportError:
    _MAIL_AVAILABLE = False

# ── bcrypt (preferred) with sha256 fallback ──────────────────────────────────
try:
    import bcrypt as _bcrypt
    _USE_BCRYPT = True
except ImportError:
    _USE_BCRYPT = False

def _hash_password(password: str) -> str:
    if _USE_BCRYPT:
        return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()
    # Fallback: salted sha256 (still better than plain sha256)
    salt = secrets.token_hex(16)
    hsh  = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"sha256${salt}${hsh}"

def _check_password(password: str, stored: str) -> bool:
    if _USE_BCRYPT and not stored.startswith('sha256$'):
        try:
            return _bcrypt.checkpw(password.encode(), stored.encode())
        except Exception:
            return False
    # sha256 fallback
    try:
        _, salt, hsh = stored.split('$')
        return hashlib.sha256((salt + password).encode()).hexdigest() == hsh
    except Exception:
        # Legacy plain sha256 (old accounts) — accept but will be re-hashed on next login
        return hashlib.sha256(password.encode()).hexdigest() == stored

from detector import analyze_image, analyze_video

app = Flask(__name__, static_folder='static', template_folder='templates')

# ── Secret key: use env var; warn if missing ──────────────────────────────────
_secret = os.environ.get('SECRET_KEY')
if not _secret:
    _secret = secrets.token_hex(32)
    print("[WARN] SECRET_KEY not set — sessions will not survive restarts. "
          "Set SECRET_KEY in your environment/Hugging Face secrets.")
app.secret_key = _secret

# ── Session config ────────────────────────────────────────────────────────────
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# ── Upload size limit (50 MB) ─────────────────────────────────────────────────
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

CORS(app, supports_credentials=True)

# ── Flask-Mail config (set env vars to enable real email) ────────────────────
app.config['MAIL_SERVER']   = os.environ.get('MAIL_SERVER',   'smtp.gmail.com')
app.config['MAIL_PORT']     = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS']  = os.environ.get('MAIL_USE_TLS',  'true').lower() == 'true'
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', os.environ.get('MAIL_USERNAME', ''))
mail = Mail(app) if _MAIL_AVAILABLE else None

def _send_reset_email(to_email: str, token: str, username: str) -> bool:
    """Send password reset email. Returns True on success."""
    if not mail or not app.config.get('MAIL_USERNAME'):
        return False
    try:
        reset_url = f"{os.environ.get('APP_URL', 'http://localhost:5000')}/login?reset_token={token}"
        body = (
            f"Hi {username},\n\nYou requested a password reset for your DetruAI account.\n\n"
            f"Reset link (valid 30 min):\n{reset_url}\n\n"
            f"Or paste this token on the login page:\n{token}\n\n"
            f"If you did not request this, ignore this email.\n\n— DetruAI Team"
        )
        html_body = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#f97316">DetruAI — Password Reset</h2>
          <p>Hi <strong>{username}</strong>,</p>
          <p>Click below to reset your password (valid for 30 minutes):</p>
          <a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
          <p style="color:#888;font-size:0.85em">Or use this token:<br>
          <code style="background:#f5f5f5;padding:8px 12px;border-radius:6px;display:inline-block;margin-top:8px;word-break:break-all">{token}</code></p>
          <p style="color:#aaa;font-size:0.8em">If you didn't request this, ignore this email.</p>
        </div>"""
        msg = MailMessage(
            subject="DetruAI — Password Reset",
            recipients=[to_email],
            body=body,
            html=html_body,
        )
        mail.send(msg)
        return True
    except Exception as e:
        print(f"[Mail error] {e}")
        return False

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

USERS_FILE  = os.path.join(os.path.dirname(__file__), 'users.json')
HISTORY_DIR = os.path.join(os.path.dirname(__file__), 'user_histories')
os.makedirs(HISTORY_DIR, exist_ok=True)

ALLOWED_IMAGE = {'jpg', 'jpeg', 'png', 'webp', 'bmp'}
ALLOWED_VIDEO = {'mp4', 'avi', 'mov', 'mkv', 'webm'}

# In-memory server-wide stats (resets on restart; per-user history persists)
session_stats = {
    'total_scans': 0,
    'fake_count':  0,
    'real_count':  0,
    'image_count': 0,
    'video_count': 0,
    'started':     time.strftime('%H:%M:%S'),
}


# ─── USER STORE ──────────────────────────────────────────────────────────────

def _load_users() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def _save_users(users: dict):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)


# ─── PER-USER HISTORY ────────────────────────────────────────────────────────

def _history_path(username: str) -> str:
    safe = username.replace('/', '_').replace('\\', '_')
    return os.path.join(HISTORY_DIR, f"{safe}.json")

def _load_history(username: str) -> list:
    path = _history_path(username)
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []

def _save_history(username: str, history: list):
    with open(_history_path(username), 'w') as f:
        json.dump(history, f, indent=2)


# ─── UTILS ───────────────────────────────────────────────────────────────────

def get_ext(filename):
    return filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

def _current_user():
    return session.get('username')


# ─── ERROR HANDLERS ──────────────────────────────────────────────────────────

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 50 MB.'}), 413


# ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

@app.route('/login')
def login_page():
    return send_from_directory('static', 'login.html')


@app.route('/auth/register', methods=['POST'])
def register():
    data     = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip().lower()
    email    = (data.get('email')    or '').strip().lower()
    password =  data.get('password') or ''

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required.'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400
    if '@' not in email:
        return jsonify({'error': 'Please enter a valid email.'}), 400

    users = _load_users()
    if username in users:
        return jsonify({'error': 'Username already taken.'}), 409
    for u in users.values():
        if u.get('email') == email:
            return jsonify({'error': 'Email already registered.'}), 409

    users[username] = {
        'username':      username,
        'email':         email,
        'password_hash': _hash_password(password),
        'created':       time.strftime('%Y-%m-%d %H:%M:%S'),
        'role':          'user',
        'reset_token':   None,
        'reset_expires': None,
    }
    _save_users(users)
    session.permanent = True
    session['username'] = username
    session['role']     = 'user'
    return jsonify({'username': username, 'email': email, 'role': 'user'}), 201


@app.route('/auth/login', methods=['POST'])
def login():
    data       = request.get_json(silent=True) or {}
    identifier = (data.get('username') or '').strip().lower()
    password   =  data.get('password') or ''

    if not identifier or not password:
        return jsonify({'error': 'Please fill in all fields.'}), 400

    users = _load_users()
    user  = users.get(identifier)
    if not user:
        for u in users.values():
            if u.get('email') == identifier:
                user = u
                break

    if not user or not _check_password(password, user['password_hash']):
        return jsonify({'error': 'Invalid username or password.'}), 401

    # Re-hash legacy plain-sha256 passwords on successful login
    if user['password_hash'].startswith('sha256$') is False and not _USE_BCRYPT:
        pass  # already in new format
    elif len(user['password_hash']) == 64 and '$' not in user['password_hash']:
        # old plain sha256 — upgrade
        user['password_hash'] = _hash_password(password)
        _save_users(users)

    session.permanent = True
    session['username'] = user['username']
    session['role']     = user.get('role', 'user')
    return jsonify({'username': user['username'], 'email': user['email'], 'role': user.get('role', 'user')}), 200


@app.route('/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True}), 200


@app.route('/auth/check', methods=['GET'])
def auth_check():
    if 'username' in session:
        users = _load_users()
        u     = users.get(session['username'], {})
        return jsonify({
            'authenticated': True,
            'username':      session['username'],
            'email':         u.get('email', ''),
            'role':          session.get('role', 'user'),
        }), 200
    return jsonify({'authenticated': False}), 200


# ─── PASSWORD RESET ──────────────────────────────────────────────────────────

@app.route('/auth/forgot-password', methods=['POST'])
def forgot_password():
    """
    Generates a reset token and stores it. In a real app you'd email it;
    here we return it directly (Hugging Face Spaces has no SMTP).
    The token is valid for 30 minutes.
    """
    data  = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'Email is required.'}), 400

    users = _load_users()
    user  = None
    uname = None
    for k, u in users.items():
        if u.get('email') == email:
            user  = u
            uname = k
            break

    # Always respond "success" to prevent email enumeration
    if not user:
        return jsonify({'message': 'If that email exists, a reset token has been generated.', 'token': None}), 200

    token   = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
    users[uname]['reset_token']   = token
    users[uname]['reset_expires'] = expires
    _save_users(users)

    # Try to send via email; fall back to showing token in response
    email_sent = _send_reset_email(email, token, uname)

    if email_sent:
        return jsonify({
            'message': f'Password reset link sent to {email}. Check your inbox (and spam folder).',
            'token':   None,
            'email_sent': True,
        }), 200
    else:
        # No email configured — return token directly (dev/Spaces fallback)
        return jsonify({
            'message': 'Reset token generated. Copy it below — valid for 30 minutes.',
            'token':   token,
            'email_sent': False,
            'note':    'Email sending is not configured. Copy this token to reset your password.',
        }), 200


@app.route('/auth/reset-password', methods=['POST'])
def reset_password():
    data         = request.get_json(silent=True) or {}
    token        = (data.get('token')        or '').strip()
    new_password =  data.get('new_password') or ''

    if not token or not new_password:
        return jsonify({'error': 'Token and new password are required.'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    users = _load_users()
    for uname, u in users.items():
        if u.get('reset_token') == token:
            expires = u.get('reset_expires')
            if expires and datetime.utcnow() > datetime.fromisoformat(expires):
                return jsonify({'error': 'Reset token has expired. Please request a new one.'}), 400
            users[uname]['password_hash'] = _hash_password(new_password)
            users[uname]['reset_token']   = None
            users[uname]['reset_expires'] = None
            _save_users(users)
            return jsonify({'message': 'Password reset successfully. You can now sign in.'}), 200

    return jsonify({'error': 'Invalid or expired reset token.'}), 400


# ─── PER-USER HISTORY API ────────────────────────────────────────────────────

@app.route('/user/history', methods=['GET'])
def get_user_history():
    username = _current_user()
    if not username:
        return jsonify({'error': 'Not authenticated'}), 401
    history = _load_history(username)
    return jsonify({'history': history}), 200


@app.route('/user/history', methods=['POST'])
def save_scan_to_history():
    username = _current_user()
    if not username:
        return jsonify({'error': 'Not authenticated'}), 401

    entry = request.get_json(silent=True) or {}
    if not entry:
        return jsonify({'error': 'No data'}), 400

    history = _load_history(username)
    entry['saved_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
    history.insert(0, entry)
    # Keep last 500 scans per user
    history = history[:500]
    _save_history(username, history)
    return jsonify({'ok': True, 'count': len(history)}), 200


@app.route('/user/history', methods=['DELETE'])
def clear_user_history():
    username = _current_user()
    if not username:
        return jsonify({'error': 'Not authenticated'}), 401
    _save_history(username, [])
    return jsonify({'ok': True}), 200


# ─── STATIC ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:path>')
def static_files(path):
    return send_from_directory('static', path)


# ─── ANALYSIS ────────────────────────────────────────────────────────────────

@app.route('/analyze', methods=['POST'])
def analyze():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'No file provided'}), 400

    ext = get_ext(file.filename)
    if ext not in ALLOWED_IMAGE | ALLOWED_VIDEO:
        return jsonify({'error': f'Unsupported format: .{ext}'}), 400

    model_mode = request.form.get('model', 'vit+clip+mtcnn')
    fname      = f"{uuid.uuid4()}.{ext}"
    fpath      = os.path.join(UPLOAD_FOLDER, fname)
    file.save(fpath)

    try:
        if ext in ALLOWED_IMAGE:
            result = analyze_image(fpath, model_mode=model_mode)
            session_stats['image_count'] += 1
        else:
            result = analyze_video(fpath, model_mode=model_mode)
            session_stats['video_count'] += 1

        session_stats['total_scans'] += 1
        if result.get('label') == 'FAKE':
            session_stats['fake_count'] += 1
        elif result.get('label') == 'REAL':
            session_stats['real_count'] += 1

        result['filename']   = file.filename
        result['model_used'] = model_mode
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

    finally:
        if os.path.exists(fpath):
            os.remove(fpath)


# ─── STATS ───────────────────────────────────────────────────────────────────

@app.route('/stats', methods=['GET'])
def stats():
    s     = session_stats.copy()
    total = s['total_scans']
    s['fake_rate'] = round((s['fake_count'] / total) * 100, 1) if total > 0 else 0
    return jsonify(s)


# ─── HEALTH ──────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '4.2', 'time': time.strftime('%H:%M:%S')}), 200


# ─── MAIN ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("\n" + "=" * 55)
    print("  DETRUAI FORENSICS — v4.2")
    print("  Deep Fake Detection Platform")
    print("  Open: http://localhost:5000")
    if not os.environ.get('SECRET_KEY'):
        print("  [!] Set SECRET_KEY env var for persistent sessions")
    print("=" * 55 + "\n")
    app.run(debug=False, host='0.0.0.0', port=7860)
