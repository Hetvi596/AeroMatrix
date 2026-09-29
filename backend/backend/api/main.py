"""ENR01 backend API.

Serves forecasts only when a model trained on REAL data exists in backend/models/pm25
(produced by `python -m backend.ml.train`). Without one, /forecast returns 501 —
the frontend then shows "model not trained" instead of fabricated numbers.

Run from the project root:  uvicorn backend.api.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

MODEL_DIR =Path(os.environ.get("ENR01_MODEL_DIR") or Path(__file__).resolve().parents[1] / "models" / "pm25")

app = FastAPI(title="ENR01 Urban Environmental Digital Twin API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def _load():
    if not (MODEL_DIR / "model.joblib").exists():
        return None
    import joblib
    import pandas as pd

    bundle = joblib.load(MODEL_DIR / "model.joblib")
    meta = json.loads((MODEL_DIR / "metadata.json").read_text())
    latest = pd.read_csv(MODEL_DIR / "latest_features.csv", parse_dates=["time"])
    return bundle, meta, latest


@app.get("/health")
def health():
    loaded = _load()
    return {
        "status": "ok",
        "model_loaded": loaded is not None,
        "model": None
        if loaded is None
        else {
            **{k: loaded[1][k] for k in ("chosen_model", "horizon_hours", "data_period", "trained_at", "stations", "target")},
            "station_locations": loaded[1].get("station_locations", {}),
        },
    }


@app.get("/model/metrics")
def model_metrics():
    loaded = _load()
    if loaded is None:
        raise HTTPException(501, "No trained model yet — run `python -m backend.ml.train` on real CPCB data.")
    meta = loaded[1]
    return {"chosen_model": meta["chosen_model"], "results": meta["results"], "split": meta["split"], "shap_group_importance": meta.get("shap_group_importance")}


@app.get("/forecast")
def forecast(station: str):
    """PM2.5 forecast `horizon_hours` ahead of the latest observation for a station."""
    loaded = _load()
    if loaded is None:
        raise HTTPException(501, "No trained model yet — awaiting CPCB + ERA5 training data.")
    bundle, meta, latest = loaded
    row = latest[latest["station"] == station]
    if row.empty:
        raise HTTPException(404, f"Unknown station '{station}'. Known: {bundle['stations']}")
    import pandas as pd

    X = row[bundle["features"]].fillna(pd.Series(bundle["fill"]))
    value = float(bundle["model"].predict(X)[0])
    issued = row["time"].iloc[0]
    valid = issued + pd.Timedelta(hours=meta["horizon_hours"])
    test = meta["results"][meta["chosen_model"]]["test"]
    return {
        "available": True,
        "status": "MODEL_PREDICTION",
        "pollutant": meta["target"],
        "station": station,
        "issued_at": str(issued),
        "valid_at": str(valid),
        "value": value,
        "model": {"id": meta["chosen_model"], "trainedOn": " → ".join(meta["data_period"]), "validation": {"rmse": test["rmse"], "mae": test["mae"], "r2": test["r2"]}},
    }


@app.get("/explain")
def explain():
    loaded = _load()
    if loaded is None or not loaded[1].get("shap_group_importance"):
        raise HTTPException(501, "SHAP explanations require a trained model and the `shap` package.")
    return {"available": True, "groups": loaded[1]["shap_group_importance"]}
