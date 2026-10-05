# The Wine Cellar - Premium Quality Analysis

A full-stack Machine Learning web application predicting red wine quality based on physicochemical tests. Recently redesigned into a luxury, editorial-style experience featuring smooth GSAP animations and premium data visualizations.

| Layer     | Technology                                            |
|-----------|-------------------------------------------------------|
| Frontend  | HTML, CSS, JavaScript, GSAP (Animations), Chart.js    |
| Backend   | Python, Flask (REST API)                              |
| ML        | scikit-learn RandomForestClassifier, pandas, NumPy    |
| Database  | SQLite (file `backend/wine_quality.db`, auto-created) |
| Dataset   | Red Wine Quality (1599 samples, 11 features)          |

## Features

- **Taste Lab (Prediction)**: Adjust chemical property sliders (Acidity, Sugar, pH, etc.) and receive real-time Random Forest predictions. The results are beautifully visualized with a dynamic crystal wine glass SVG that fills with a deep ruby gradient based on the predicted score out of 10.
- **My Cellar**: A curated history of your saved wine predictions, allowing you to track and delete past experiments.
- **Explore (Dashboard)**: Detailed analytics on the Random Forest model, including Gini and Permutation feature importance charts, model accuracy, F1 score, and the underlying correlation matrix of the wine dataset.
- **GSAP Animations**: A custom 3-layer parallax off-canvas navigation menu and smooth page transitions for a premium user experience.

## Project Structure

```
wine-quality-project/
├── requirements.txt
├── README.md
├── backend/
│   ├── app.py            # Flask app + API routes (run this file)
│   ├── config.py         # paths, feature list, settings
│   ├── database.py       # SQLite tables + queries
│   ├── ml_service.py     # training, feature importance, prediction
│   ├── data/winequality-red.csv
│   └── models/           # trained model saved here automatically
└── frontend/
    ├── index.html        # Main luxury UI
    ├── style.css         # Custom premium CSS variables and styling
    ├── app.js            # GSAP animations and core UI logic
    └── js/               # Taste Lab, Explorer, and Cellar module scripts
```

## How to Run Locally

1. Install Python 3.9+ and VS Code with the Python extension.
2. Open the `wine-quality-project` folder in VS Code.
3. Open the terminal (`Ctrl + ~`).
4. Create a virtual environment:
   - Windows: `python -m venv venv`
   - macOS/Linux: `python3 -m venv venv`
5. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - macOS/Linux: `source venv/bin/activate`
6. Install backend dependencies: 
   ```bash
   pip install -r requirements.txt
   ```
7. Start the Flask application:
   ```bash
   cd backend
   python app.py
   ```
8. Open **http://127.0.0.1:5050** in your browser.

*Note: The first startup takes ~10 seconds as it automatically initializes the SQLite database, loads the dataset, and trains the Random Forest model.*

## API Endpoints

| Method | URL                      | Purpose                         |
|--------|--------------------------|---------------------------------|
| GET    | /api/health              | server check                    |
| GET    | /api/features            | feature min/max/mean            |
| GET    | /api/dataset/summary     | dataset stats                   |
| GET    | /api/dataset/samples     | paginated records               |
| GET    | /api/model               | latest metrics + importances    |
| POST   | /api/model/train         | retrain the model               |
| POST   | /api/predict             | predict + save                  |
| GET    | /api/predictions         | prediction history              |
| DELETE | /api/predictions/<id>    | delete one prediction           |
| DELETE | /api/predictions         | clear history                   |
| GET    | /api/correlation         | correlation matrix              |

## Troubleshooting

- **ModuleNotFoundError**: Ensure your virtual environment is active before running `pip install -r requirements.txt`.
- **Port already in use**: Change the `PORT` variable in `backend/config.py`.
- **Animations/Charts not loading**: GSAP and Chart.js are loaded via CDN, so an active internet connection is required.
- **Factory Reset**: Stop the server, delete `backend/wine_quality.db` and the contents of `backend/models/`, then restart.
