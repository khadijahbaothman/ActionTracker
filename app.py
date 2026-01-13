import os
import json
import bleach
from flask import Flask, render_template, request, jsonify, abort

app = Flask(__name__)

@app.after_request
def add_security_headers(response):
    # HSTS (يعتمد على HTTPS فقط)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # ✅ CSP قوي (مناسب لمعظم المشاريع)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "base-uri 'self'; "
        "object-src 'none'; "
        "frame-ancestors 'none'; "
        "form-action 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self'; "
        "font-src 'self' data:; "
        "upgrade-insecure-requests"
    )

    # إضافات حماية ممتازة
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    return response

# ================= CONFIG =================
DATA_FILE = os.environ.get("DATA_FILE", "data/tasks.json")

# ================= SECURITY =================
ALLOWED_TAGS = []
ALLOWED_ATTRS = {}

# ✅ Only allow these keys to be returned to frontend (Allowlist Schema)
TASK_ALLOWED_KEYS = {"title", "description", "link", "startDate", "due", "status", "owner"}

def clean_str(value: str) -> str:
    return bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        strip=True
    )

def sanitize_task(task: dict) -> dict:
    """Sanitize + keep only allowed keys (prevents stored XSS + unexpected fields)."""
    if not isinstance(task, dict):
        return {}

    clean_task = {}

    for key in TASK_ALLOWED_KEYS:
        if key not in task:
            continue

        value = task.get(key)

        if isinstance(value, str):
            clean_task[key] = clean_str(value)

        elif isinstance(value, list):
            # only allow list of strings for owner
            clean_task[key] = [
                clean_str(v) for v in value if isinstance(v, str)
            ]

        else:
            # allow non-string types only for known keys (but in our schema mostly strings/lists)
            clean_task[key] = value

    # Ensure owner is always list (frontend expects array)
    if "owner" not in clean_task or not isinstance(clean_task["owner"], list):
        clean_task["owner"] = []

    return clean_task

def sanitize_tasks_output(data: dict) -> dict:
    """Sanitize entire payload before returning in API response."""
    cleaned = {"tasks": []}

    tasks = data.get("tasks", [])
    if not isinstance(tasks, list):
        return cleaned

    for t in tasks:
        cleaned["tasks"].append(sanitize_task(t))

    return cleaned

# ================= HELPERS =================
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
            return data
    except (json.JSONDecodeError, OSError):
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

# ================= ROUTES =================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    data = load_tasks()

    # ✅ sanitize output with strict schema allowlist
    safe_data = sanitize_tasks_output(data)

    return jsonify(safe_data)

@app.route("/api/tasks", methods=["POST"])
def add_task():
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
        debug=os.environ.get("FLASK_DEBUG") == "1"
    )