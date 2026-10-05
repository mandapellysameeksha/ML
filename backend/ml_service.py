"""Machine-learning layer: trains the Random Forest, computes feature
importance, and serves predictions."""
import threading

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, confusion_matrix,
                             precision_recall_fscore_support)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

import database as db
from config import (DEFAULT_TEST_SIZE, DEFAULT_TREES, FEATURE_NAMES,
                    MODEL_PATH, RANDOM_STATE)

_lock = threading.Lock()
_bundle = None  # cached {"model": ..., "run_id": ...}


def quality_category(q):
    if q <= 4:
        return "Poor"
    if q <= 6:
        return "Average"
    return "Good"


def train_model(n_estimators=DEFAULT_TREES, test_fraction=DEFAULT_TEST_SIZE, include_user_wines=False):
    """Train, evaluate, persist. Returns the saved run (dict)."""
    global _bundle
    df = db.load_samples_df()
    if df.empty:
        raise RuntimeError("No samples in database. Delete wine_quality.db and restart.")
    
    if include_user_wines:
        user_df = db.get_user_rated_wines_df()
        if not user_df.empty:
            df = pd.concat([df, user_df], ignore_index=True)

    X = df[FEATURE_NAMES]
    y = df["quality"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_fraction, random_state=RANDOM_STATE, stratify=y
    )

    def make_model():
        return RandomForestClassifier(
            n_estimators=n_estimators, random_state=RANDOM_STATE, n_jobs=1
        )

    model = make_model()
    model.fit(X_train, y_train)
    pred = model.predict(X_test)

    accuracy = accuracy_score(y_test, pred)
    prec, rec, f1, _ = precision_recall_fscore_support(
        y_test, pred, average="weighted", zero_division=0
    )
    labels = [int(c) for c in model.classes_]
    cm = confusion_matrix(y_test, pred, labels=labels)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(make_model(), X, y, cv=cv, scoring="accuracy", n_jobs=1)

    perm = permutation_importance(
        model, X_test, y_test, n_repeats=10, random_state=RANDOM_STATE, n_jobs=1
    )

    importances = [
        (name, float(g), float(p))
        for name, g, p in zip(FEATURE_NAMES, model.feature_importances_, perm.importances_mean)
    ]

    meta = {
        "n_estimators": int(n_estimators),
        "test_fraction": float(test_fraction),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "accuracy": float(accuracy),
        "precision_w": float(prec),
        "recall_w": float(rec),
        "f1_w": float(f1),
        "cv_mean": float(np.mean(cv_scores)),
        "cv_std": float(np.std(cv_scores)),
        "labels": labels,
        "confusion": cm.tolist(),
    }
    run_id = db.save_model_run(meta, importances)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "run_id": run_id}, MODEL_PATH)
    with _lock:
        _bundle = {"model": model, "run_id": run_id}
    return db.get_latest_run()


def _load_bundle():
    global _bundle
    with _lock:
        if _bundle is None and MODEL_PATH.exists():
            try:
                _bundle = joblib.load(MODEL_PATH)
            except Exception:
                _bundle = None
        return _bundle


def ensure_model():
    """Make sure a trained model + a DB record exist (called at startup)."""
    bundle = _load_bundle()
    if bundle is None or db.get_latest_run() is None:
        train_model()


def predict(values):
    """values: dict feature_name -> float. Returns a result dict."""
    bundle = _load_bundle()
    if bundle is None:
        train_model()
        bundle = _load_bundle()
    model = bundle["model"]
    row = pd.DataFrame([[values[f] for f in FEATURE_NAMES]], columns=FEATURE_NAMES)
    proba = model.predict_proba(row)[0]
    classes = [int(c) for c in model.classes_]
    best = int(np.argmax(proba))
    predicted = classes[best]
    expected = sum(c * p for c, p in zip(classes, proba))
    return {
        "predicted_quality": predicted,
        "expected_quality": float(expected),
        "category": quality_category(predicted),
        "confidence": float(proba[best]),
        "probabilities": {str(c): float(p) for c, p in zip(classes, proba)},
        "run_id": int(bundle["run_id"]),
    }

def suggest_improvements(values, feature_stats):
    """Finds top 3 feature nudges that improve quality probabilities."""
    bundle = _load_bundle()
    if bundle is None:
        return []
    model = bundle["model"]
    classes = [int(c) for c in model.classes_]
    
    def expected_quality(proba_arr):
        return sum(c * p for c, p in zip(classes, proba_arr))
        
    row = pd.DataFrame([[values[f] for f in FEATURE_NAMES]], columns=FEATURE_NAMES)
    base_proba = model.predict_proba(row)[0]
    base_eq = expected_quality(base_proba)
    
    suggestions = []
    ranges = {s["name"]: s for s in feature_stats}
    
    for f in FEATURE_NAMES:
        stats = ranges[f]
        best_diff = 0
        best_sugg = None
        
        for step_mult in [0.2, 0.5, 0.8, 1.2]:
            step = stats["std"] * step_mult
            if step == 0: continue
            
            for direction, label in [(1, "increasing"), (-1, "decreasing")]:
                new_val = values[f] + (step * direction)
                if new_val < stats["min"] or new_val > stats["max"]:
                    continue
                    
                test_row = row.copy()
                test_row[f] = new_val
                new_proba = model.predict_proba(test_row)[0]
                new_eq = expected_quality(new_proba)
                
                diff = new_eq - base_eq
                if diff > best_diff and diff > 0.05:
                    best_diff = diff
                    best_sugg = {
                        "feature": f,
                        "feature_label": stats["label"],
                        "direction": label,
                        "step_size": float(abs(new_val - values[f])),
                        "new_value": float(new_val),
                        "improvement": float(diff)
                    }
        
        if best_sugg:
            suggestions.append(best_sugg)
                
    suggestions.sort(key=lambda x: x["improvement"], reverse=True)
    
    final_suggestions = []
    seen = set()
    for s in suggestions:
        if s["feature"] not in seen:
            seen.add(s["feature"])
            final_suggestions.append(s)
                
    return final_suggestions
