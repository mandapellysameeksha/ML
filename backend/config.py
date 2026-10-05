"""Central configuration. All paths are resolved relative to this file,
so the project works no matter which folder you launch it from."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"

DATA_PATH = BASE_DIR / "data" / "winequality-red.csv"
DB_PATH = BASE_DIR / "wine_quality.db"
MODEL_PATH = BASE_DIR / "models" / "random_forest.joblib"

HOST = "127.0.0.1"
PORT = 5050

# The 11 physicochemical input features, in the order the model expects.
# (db_column, label shown in the UI, unit)
FEATURES = [
    ("fixed_acidity", "Fixed Acidity", "g/dm³"),
    ("volatile_acidity", "Volatile Acidity", "g/dm³"),
    ("citric_acid", "Citric Acid", "g/dm³"),
    ("residual_sugar", "Residual Sugar", "g/dm³"),
    ("chlorides", "Chlorides", "g/dm³"),
    ("free_sulfur_dioxide", "Free Sulfur Dioxide", "mg/dm³"),
    ("total_sulfur_dioxide", "Total Sulfur Dioxide", "mg/dm³"),
    ("density", "Density", "g/cm³"),
    ("ph", "pH", ""),
    ("sulphates", "Sulphates", "g/dm³"),
    ("alcohol", "Alcohol", "% vol"),
]
FEATURE_NAMES = [f[0] for f in FEATURES]
FEATURE_LABELS = {f[0]: f[1] for f in FEATURES}
FEATURE_UNITS = {f[0]: f[2] for f in FEATURES}

# Mapping from the CSV header names to our database column names.
CSV_COLUMN_MAP = {
    "fixed acidity": "fixed_acidity",
    "volatile acidity": "volatile_acidity",
    "citric acid": "citric_acid",
    "residual sugar": "residual_sugar",
    "chlorides": "chlorides",
    "free sulfur dioxide": "free_sulfur_dioxide",
    "total sulfur dioxide": "total_sulfur_dioxide",
    "density": "density",
    "pH": "ph",
    "sulphates": "sulphates",
    "alcohol": "alcohol",
    "quality": "quality",
}

# Random Forest defaults
DEFAULT_TREES = 300
DEFAULT_TEST_SIZE = 0.2
RANDOM_STATE = 42
