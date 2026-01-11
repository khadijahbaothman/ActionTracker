import os
import json
import bleach
from flask import Flask, render_template, request, jsonify, abort

app = Flask(__name__)

# ================= CONFIG =================
DATA_FILE = os.environ.get("DATA_FILE", "data/tasks.json")

# ================= SECURITY =================
ALLOWED_TAGS = []
ALLOWED_ATTRS = {}

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

# ================= ROUTES =================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    return jsonify(load_tasks())


@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = load_tasks()
    task = request.get_json(silent=True)

    if not validate_task(task):
        return jsonify({"error": "Invalid task payload"}), 400

    task = sanitize_task(task)  # ✅ XSS protection
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

    task = sanitize_task(task)  # ✅ XSS protection
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