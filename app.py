import os
import json
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

DATA_FILE = os.environ.get("DATA_FILE", "tasks.json")

def ensure_data_dir():
    directory = os.path.dirname(DATA_FILE)
    if directory:
        os.makedirs(directory, exist_ok=True)

def load_tasks():
    ensure_data_dir()
    if not os.path.exists(DATA_FILE):
        return {"tasks": []}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_tasks(data):
    ensure_data_dir()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    return jsonify(load_tasks())


@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = load_tasks()
    task = request.json
    data["tasks"].append(task)
    save_tasks(data)
    return jsonify({"status": "success"})


@app.route("/api/tasks/<int:index>", methods=["PUT"])
def update_task(index):
    data = load_tasks()
    data["tasks"][index] = request.json
    save_tasks(data)
    return jsonify({"status": "updated"})


@app.route("/api/tasks/<int:index>", methods=["DELETE"])
def delete_task(index):
    data = load_tasks()
    data["tasks"].pop(index)
    save_tasks(data)
    return jsonify({"status": "deleted"})


if __name__ == "__main__":
    app.run(debug=True)