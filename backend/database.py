"""SQLite database layer (Python standard library only - no extra install)."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
import csv
from io import StringIO

import pandas as pd

from config import (CSV_COLUMN_MAP, DATA_PATH, DB_PATH, FEATURE_NAMES)

FEATURE_COLUMNS_SQL = ",\n    ".join(f"{name} REAL NOT NULL" for name in FEATURE_NAMES)

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS wine_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    {FEATURE_COLUMNS_SQL},
    quality INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS model_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    n_estimators INTEGER NOT NULL,
    test_fraction REAL NOT NULL,
    train_rows INTEGER NOT NULL,
    test_rows INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    precision_w REAL NOT NULL,
    recall_w REAL NOT NULL,
    f1_w REAL NOT NULL,
    cv_mean REAL NOT NULL,
    cv_std REAL NOT NULL,
    labels TEXT NOT NULL,
    confusion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_importances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES model_runs(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    gini REAL NOT NULL,
    permutation REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    {FEATURE_COLUMNS_SQL},
    predicted_quality INTEGER NOT NULL,
    category TEXT NOT NULL,
    confidence REAL NOT NULL,
    probabilities TEXT NOT NULL,
    run_id INTEGER
);

CREATE TABLE IF NOT EXISTS cellar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    vintage TEXT,
    notes TEXT,
    user_rating INTEGER,
    favourite INTEGER DEFAULT 0,
    {FEATURE_COLUMNS_SQL},
    predicted_quality INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    """Create tables and load the CSV dataset into the database on first run."""
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        count = conn.execute("SELECT COUNT(*) FROM wine_samples").fetchone()[0]
        if count == 0:
            seed_samples(conn)


def seed_samples(conn):
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found at {DATA_PATH}")
    # sep=None lets pandas auto-detect ',' or ';' delimiters
    df = pd.read_csv(DATA_PATH, sep=None, engine="python")
    df.columns = [c.strip().strip('"') for c in df.columns]
    df = df.rename(columns=CSV_COLUMN_MAP)
    cols = FEATURE_NAMES + ["quality"]
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")
    df = df[cols].dropna()
    placeholders = ",".join("?" for _ in cols)
    conn.executemany(
        f"INSERT INTO wine_samples ({','.join(cols)}) VALUES ({placeholders})",
        [tuple(float(v) if c != "quality" else int(v) for c, v in zip(cols, row))
         for row in df.itertuples(index=False, name=None)],
    )


def load_samples_df():
    with get_conn() as conn:
        cols = FEATURE_NAMES + ["quality"]
        rows = conn.execute(f"SELECT {','.join(cols)} FROM wine_samples").fetchall()
    return pd.DataFrame([dict(r) for r in rows], columns=cols)


def get_samples_page(page, per_page):
    offset = (page - 1) * per_page
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM wine_samples").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM wine_samples ORDER BY id LIMIT ? OFFSET ?",
            (per_page, offset),
        ).fetchall()
    return total, [dict(r) for r in rows]


# ---------------------------------------------------------------- model runs
def save_model_run(meta, importances):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO model_runs (created_at, n_estimators, test_fraction,
               train_rows, test_rows, accuracy, precision_w, recall_w, f1_w,
               cv_mean, cv_std, labels, confusion)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (now_iso(), meta["n_estimators"], meta["test_fraction"],
             meta["train_rows"], meta["test_rows"], meta["accuracy"],
             meta["precision_w"], meta["recall_w"], meta["f1_w"],
             meta["cv_mean"], meta["cv_std"],
             json.dumps(meta["labels"]), json.dumps(meta["confusion"])),
        )
        run_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO feature_importances (run_id, feature, gini, permutation) VALUES (?,?,?,?)",
            [(run_id, f, g, p) for f, g, p in importances],
        )
    return run_id


def get_latest_run():
    with get_conn() as conn:
        run = conn.execute("SELECT * FROM model_runs ORDER BY id DESC LIMIT 1").fetchone()
        if run is None:
            return None
        imps = conn.execute(
            "SELECT feature, gini, permutation FROM feature_importances WHERE run_id = ? ORDER BY gini DESC",
            (run["id"],),
        ).fetchall()
    run = dict(run)
    run["labels"] = json.loads(run["labels"])
    run["confusion"] = json.loads(run["confusion"])
    run["importances"] = [dict(i) for i in imps]
    return run


def list_runs(limit=10):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, created_at, n_estimators, accuracy, f1_w, cv_mean FROM model_runs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------- predictions
def save_prediction(inputs, predicted, category, confidence, probabilities, run_id):
    cols = FEATURE_NAMES
    with get_conn() as conn:
        cur = conn.execute(
            f"""INSERT INTO predictions (created_at, {','.join(cols)}, predicted_quality,
                category, confidence, probabilities, run_id)
                VALUES (?, {','.join('?' for _ in cols)}, ?, ?, ?, ?, ?)""",
            (now_iso(), *[inputs[c] for c in cols], predicted, category,
             confidence, json.dumps(probabilities), run_id),
        )
        return cur.lastrowid


def list_predictions(limit=100):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM predictions ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["probabilities"] = json.loads(d["probabilities"])
        out.append(d)
    return out


def delete_prediction(pred_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM predictions WHERE id = ?", (pred_id,))
        return cur.rowcount > 0


def clear_predictions():
    with get_conn() as conn:
        conn.execute("DELETE FROM predictions")


# --------------------------------------------------------------- cellar
def save_cellar_wine(data):
    cols = FEATURE_NAMES
    with get_conn() as conn:
        cur = conn.execute(
            f"""INSERT INTO cellar (created_at, name, vintage, notes, user_rating, favourite, predicted_quality, {','.join(cols)})
                VALUES (?, ?, ?, ?, ?, ?, ?, {','.join('?' for _ in cols)})""",
            (now_iso(), data.get("name", "Unnamed Wine"), data.get("vintage", ""), data.get("notes", ""),
             data.get("user_rating"), int(data.get("favourite", 0) or 0), data.get("predicted_quality", 5),
             *[data.get(c, 0) for c in cols]),
        )
        return cur.lastrowid


def list_cellar_wines():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM cellar ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def update_cellar_wine(wine_id, data):
    fields = ["name", "vintage", "notes", "user_rating", "favourite"]
    set_clause = ", ".join(f"{f} = ?" for f in fields)
    values = [data.get(f) for f in fields] + [wine_id]
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE cellar SET {set_clause} WHERE id = ?", values)
        return cur.rowcount > 0


def delete_cellar_wine(wine_id):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM cellar WHERE id = ?", (wine_id,))
        return cur.rowcount > 0


def get_user_rated_wines_df():
    with get_conn() as conn:
        cols = FEATURE_NAMES + ["user_rating"]
        rows = conn.execute(f"SELECT {','.join(cols)} FROM cellar WHERE user_rating IS NOT NULL AND user_rating >= 3 AND user_rating <= 8").fetchall()
    df = pd.DataFrame([dict(r) for r in rows], columns=cols)
    if not df.empty:
        df = df.rename(columns={"user_rating": "quality"})
    return df


def export_cellar_csv():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM cellar ORDER BY created_at DESC").fetchall()
    if not rows:
        return ""
    si = StringIO()
    cw = csv.writer(si)
    cw.writerow(rows[0].keys())
    for r in rows:
        cw.writerow(r)
    return si.getvalue()
