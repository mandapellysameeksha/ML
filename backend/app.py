"""Flask application: REST API + serves the frontend."""
import math
import numpy as np
from flask import Flask, jsonify, request, send_from_directory, Response

import database as db
import ml_service as ml
from config import (FEATURE_LABELS, FEATURE_NAMES, FEATURE_UNITS, FRONTEND_DIR,
                    HOST, PORT)

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")


# ------------------------------------------------------------------ helpers
def error(message, status=400):
    return jsonify({"error": message}), status


def feature_stats():
    df = db.load_samples_df()
    stats = []
    corr = df.corr(numeric_only=True)["quality"]
    for name in FEATURE_NAMES:
        col = df[name]
        stats.append({
            "name": name,
            "label": FEATURE_LABELS[name],
            "unit": FEATURE_UNITS[name],
            "min": float(col.min()),
            "max": float(col.max()),
            "mean": float(col.mean()),
            "std": float(col.std()),
            "median": float(col.median()),
            "corr_with_quality": float(corr[name]),
        })
    return df, stats


# ------------------------------------------------------------------- pages
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


# --------------------------------------------------------------------- API
@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/features")
def features():
    _, stats = feature_stats()
    return jsonify(stats)


@app.route("/api/dataset/summary")
def dataset_summary():
    df, stats = feature_stats()
    dist = df["quality"].value_counts().sort_index()
    return jsonify({
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "quality_distribution": {str(int(k)): int(v) for k, v in dist.items()},
        "mean_quality": float(df["quality"].mean()),
        "features": stats,
    })


@app.route("/api/dataset/samples")
def dataset_samples():
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 15))))
    except ValueError:
        return error("page and per_page must be integers")
    total, rows = db.get_samples_page(page, per_page)
    return jsonify({
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, math.ceil(total / per_page)),
        "rows": rows,
    })


@app.route("/api/model")
def model_info():
    run = db.get_latest_run()
    if run is None:
        run = ml.train_model()
    run["history"] = db.list_runs()
    return jsonify(run)


@app.route("/api/model/train", methods=["POST"])
def model_train():
    data = request.get_json(silent=True) or {}
    try:
        trees = int(data.get("n_estimators", 300))
        test_fraction = float(data.get("test_fraction", 0.2))
        include_user_wines = bool(data.get("include_user_wines", False))
    except (TypeError, ValueError):
        return error("n_estimators must be an integer and test_fraction a number")
    if not 10 <= trees <= 1000:
        return error("n_estimators must be between 10 and 1000")
    if not 0.1 <= test_fraction <= 0.4:
        return error("test_fraction must be between 0.1 and 0.4")
    run = ml.train_model(trees, test_fraction, include_user_wines)
    run["history"] = db.list_runs()
    return jsonify(run)


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Send a JSON object with the 11 wine features")

    _, stats = feature_stats()
    ranges = {s["name"]: s for s in stats}
    values, warnings = {}, []
    for name in FEATURE_NAMES:
        if name not in data or data[name] in ("", None):
            return error(f"Missing value for '{FEATURE_LABELS[name]}'")
        try:
            v = float(data[name])
        except (TypeError, ValueError):
            return error(f"'{FEATURE_LABELS[name]}' must be a number")
        if not math.isfinite(v) or v < 0:
            return error(f"'{FEATURE_LABELS[name]}' must be a non-negative number")
        if v > ranges[name]["max"] * 5:
            return error(f"'{FEATURE_LABELS[name]}' is unrealistically large")
        if v < ranges[name]["min"] or v > ranges[name]["max"]:
            warnings.append(
                f"{FEATURE_LABELS[name]} is outside the training range "
                f"({ranges[name]['min']:g} - {ranges[name]['max']:g})"
            )
        values[name] = v

    result = ml.predict(values)
    pred_id = db.save_prediction(
        values, result["predicted_quality"], result["category"],
        result["confidence"], result["probabilities"], result["run_id"],
    )
    result["id"] = pred_id
    result["warnings"] = warnings
    return jsonify(result), 201

@app.route("/api/suggest", methods=["POST"])
def suggest():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Send a JSON object with the 11 wine features")

    _, stats = feature_stats()
    ranges = {s["name"]: s for s in stats}
    values = {}
    for name in FEATURE_NAMES:
        if name not in data or data[name] in ("", None):
            return error(f"Missing value for '{FEATURE_LABELS[name]}'")
        values[name] = float(data[name])

    suggestions = ml.suggest_improvements(values, stats)
    return jsonify(suggestions)


@app.route("/api/predictions")
def predictions():
    return jsonify(db.list_predictions())


@app.route("/api/predictions/<int:pred_id>", methods=["DELETE"])
def delete_prediction(pred_id):
    if not db.delete_prediction(pred_id):
        return error("Prediction not found", 404)
    return jsonify({"deleted": pred_id})


@app.route("/api/predictions", methods=["DELETE"])
def clear_predictions():
    db.clear_predictions()
    return jsonify({"cleared": True})


@app.route("/api/cellar", methods=["GET"])
def get_cellar():
    return jsonify(db.list_cellar_wines())


@app.route("/api/cellar", methods=["POST"])
def add_cellar_wine():
    data = request.get_json(silent=True) or {}
    wine_id = db.save_cellar_wine(data)
    return jsonify({"id": wine_id}), 201


@app.route("/api/cellar/<int:wine_id>", methods=["PUT"])
def update_cellar_wine(wine_id):
    data = request.get_json(silent=True) or {}
    if not db.update_cellar_wine(wine_id, data):
        return error("Wine not found", 404)
    return jsonify({"updated": wine_id})


@app.route("/api/cellar/<int:wine_id>", methods=["DELETE"])
def delete_cellar_wine(wine_id):
    if not db.delete_cellar_wine(wine_id):
        return error("Wine not found", 404)
    return jsonify({"deleted": wine_id})


@app.route("/api/cellar/export", methods=["GET"])
def export_cellar():
    csv_data = db.export_cellar_csv()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=my_cellar.csv"}
    )


@app.route("/api/correlation")
def correlation():
    df = db.load_samples_df()
    corr = df.corr(numeric_only=True)
    cols = list(corr.columns)
    matrix = [[None if np.isnan(v) else round(float(v), 3) for v in corr[c]] for c in cols]
    labels = [FEATURE_LABELS.get(c, "Quality") for c in cols]
    return jsonify({"labels": labels, "matrix": matrix})


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return error("Endpoint not found", 404)
    return "404 - Page not found", 404


@app.errorhandler(500)
def server_error(e):
    return error("Internal server error - check the terminal for details", 500)


def bootstrap():
    db.init_db()
    ml.ensure_model()


if __name__ == "__main__":
    bootstrap()
    print(f"\n  Wine Quality app running at  http://{HOST}:{PORT}\n")
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)
