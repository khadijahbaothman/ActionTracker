import os
import json
import bleach
from markupsafe import escape
from flask import Flask, render_template, request, jsonify, abort, session
from secrets import token_urlsafe

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "CHANGE_ME_SECRET_KEY")

# ================= CONFIG =================
DATA_FILE = os.environ.get("DATA_FILE", "data/tasks.json")

# ================= SECURITY CONFIG =================
ALLOWED_TAGS = []
ALLOWED_ATTRS = {}

# Whitelist fields (DTO) - مهم جدًا لـ Checkmarx
ALLOWED_FIELDS = {"title", "startDate", "due", "owner", "status", "description", "link"}


# ================= FILE HELPERS =================
def ensure_data_dir():
    directory = os.path.dirname(DATA_FILE)
    if directory:
        os.makedirs(directory, exist_ok=True)


def load_tasks():
    ensure_data_dir()
    if not os.path.exists(DATA_FILE):
        return {"tasks": []}

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return {"tasks": []}
            if "tasks" not in data or not isinstance(data.get("tasks"), list):
                return {"tasks": []}
            return data
    except json.JSONDecodeError:
        return {"tasks": []}


def save_tasks(data):
    ensure_data_dir()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def validate_task(task):
    if not isinstance(task, dict):
        return False
    if not task.get("title"):
        return False
    if not isinstance(task.get("owner", []), list):
        return False
    return True


# ================= SANITIZATION / ENCODING =================
def encode_output(value):
    """
    Encode any string to be safe in HTML context.
    Checkmarx يحب escape() لأنها output encoding صريح.
    """
    if isinstance(value, str):
        return str(escape(value))
    return value


def clean_str(v: str) -> str:
    """
    1) remove HTML tags (bleach)
    2) output-encode (escape)
    """
    if v is None:
        return ""
    v = str(v)
    v = bleach.clean(v, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
    return encode_output(v)


def safe_task_dto(task: dict) -> dict:
    """
    Build a safe Task DTO with ONLY allowed fields (whitelist).
    This avoids dynamic key pass-through which Checkmarx flags.
    """
    dto = {
        "title": clean_str(task.get("title", "")),
        "startDate": clean_str(task.get("startDate", "")),
        "due": clean_str(task.get("due", "")),
        "status": clean_str(task.get("status", "")),
        "description": clean_str(task.get("description", "")),
        "link": clean_str(task.get("link", "")),
        "owner": []
    }

    owners = task.get("owner", [])
    if isinstance(owners, list):
        dto["owner"] = [clean_str(x) for x in owners if x is not None]
    else:
        dto["owner"] = []

    return dto


def sanitize_tasks_output(data):
    """
    Sanitize output before returning to client.
    Uses whitelist DTO to satisfy SAST engines.
    """
    tasks = data.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = []

    safe_list = []
    for t in tasks:
        if isinstance(t, dict):
            safe_list.append(safe_task_dto(t))

    return {"tasks": safe_list}


# ================= CSRF SIMPLE PROTECTION =================
def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = token_urlsafe(32)
    return session["csrf_token"]


def require_csrf():
    token = request.headers.get("X-CSRF-Token", "")
    if not token or token != session.get("csrf_token"):
        abort(403, description="CSRF token missing/invalid")


# ================= HEADERS =================
@app.after_request
def add_security_headers(response):
    # HSTS (only effective on HTTPS)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    # Clickjacking
    response.headers["X-Frame-Options"] = "DENY"

    # Basic hardening
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"

    # CSP (ممكن تحتاج تعديل لو عندك CDN)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )

    return response


# ================= ROUTES =================
@app.route("/")
def index():
    # نرسل CSRF token للفرونت
    return render_template("index.html", csrf_token=get_csrf_token())


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    data = load_tasks()
    safe_data = sanitize_tasks_output(data)
    return jsonify(safe_data)


@app.route("/api/tasks", methods=["POST"])
def add_task():
    require_csrf()

    data = load_tasks()
    task = request.get_json(silent=True)

    if not validate_task(task):
        return jsonify({"error": "Invalid task payload"}), 400

    # IMPORTANT: Save safe DTO only (prevents stored XSS in storage)
    safe_task = safe_task_dto(task)

    data["tasks"].append(safe_task)
    save_tasks(data)

    return jsonify({"status": "success"}), 201


@app.route("/api/tasks/<int:index>", methods=["PUT"])
def update_task(index):
    require_csrf()

    data = load_tasks()
    if index < 0 or index >= len(data["tasks"]):
        abort(404, description="Task not found")

    task = request.get_json(silent=True)
    if not validate_task(task):
        return jsonify({"error": "Invalid task payload"}), 400

    safe_task = safe_task_dto(task)

    data["tasks"][index] = safe_task
    save_tasks(data)

    return jsonify({"status": "updated"})


@app.route("/api/tasks/<int:index>", methods=["DELETE"])
def delete_task(index):
    require_csrf()

    data = load_tasks()
    if index < 0 or index >= len(data["tasks"]):
        abort(404, description="Task not found")

    data["tasks"].pop(index)
    save_tasks(data)

    return jsonify({"status": "deleted"})


# ================= MAIN =================
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )