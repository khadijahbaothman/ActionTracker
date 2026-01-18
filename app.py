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
            return json.load(f)
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

# --------- Input Sanitization (before saving) ----------
def sanitize_task(task):
    fields_to_clean = ["title", "description", "link"]

    for field in fields_to_clean:
        if field in task and isinstance(task[field], str):
            task[field] = bleach.clean(
                task[field],
                tags=ALLOWED_TAGS,
                attributes=ALLOWED_ATTRS,
                strip=True
            )
    return task

# --------- Output Encoding (before returning) ----------
def encode_output(value):
    """
    Encode any string to be safe in HTML context.
    Checkmarx يحب escape() لأنها output encoding صريح.
    """
    if isinstance(value, str):
        return str(escape(value))
    return value

def sanitize_tasks_output(data):
    cleaned = {"tasks": []}

    for task in data.get("tasks", []):
        clean_task = {}
        for key, value in task.items():
            if isinstance(value, str):
                # 1) clean
                v = bleach.clean(value, tags=[], attributes={}, strip=True)
                # 2) encode
                clean_task[key] = encode_output(v)

            elif isinstance(value, list):
                new_list = []
                for v in value:
                    if isinstance(v, str):
                        v2 = bleach.clean(v, tags=[], attributes={}, strip=True)
                        new_list.append(encode_output(v2))
                    else:
                        new_list.append(v)
                clean_task[key] = new_list

            else:
                clean_task[key] = value

        cleaned["tasks"].append(clean_task)

    return cleaned

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

    task = sanitize_task(task)
    data["tasks"].append(task)
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

    task = sanitize_task(task)
    data["tasks"][index] = task
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