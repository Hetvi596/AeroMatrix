"""End-to-end smoke test of the ML pipeline on SYNTHETIC fixtures (generated in a
temp dir, never saved to the repo). Verifies wiring only — not model quality.

Run from the project root:  python -m pytest backend/tests -q
"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest


def _write_fixtures(tmp_path):
    rng = np.random.default_rng(0)
    hours = pd.date_range("2024-01-01", periods=24 * 60, freq="h")
    stations = {"SYNTH A": (18.60, 73.84, 80), "SYNTH B": (18.52, 73.86, 60), "SYNTH C": (18.47, 73.90, 45)}
    aq_files = []
    for name, (lat, lon, level) in stations.items():
        diurnal = 1 + 0.35 * np.sin((hours.hour - 3) / 24 * 2 * np.pi)
        noise = np.zeros(len(hours))
        for i in range(1, len(hours)):
            noise[i] = 0.8 * noise[i - 1] + rng.normal(0, 5)
        pm25 = np.clip(level * diurnal + noise, 1, None)
        # CPCB-style export: preamble + DD-MM-YYYY timestamps + 'None' gaps
        lines = ["Central Control Room for Air Quality Management", f"Station,{name}", "", "From Date,To Date,PM2.5 (ug/m3),PM10 (ug/m3)"]
        for t, v in zip(hours, pm25):
            val = "None" if rng.random() < 0.02 else f"{v:.1f}"
            lines.append(f"{t:%d-%m-%Y %H:%M},{t + pd.Timedelta(hours=1):%d-%m-%Y %H:%M},{val},{v * 1.7:.1f}")
        f = tmp_path / f"{name.replace(' ', '_')}.csv"
        f.write_text("\n".join(lines))
        aq_files.append(str(f))
    pd.DataFrame([{"station": k, "latitude": v[0], "longitude": v[1]} for k, v in stations.items()]).to_csv(tmp_path / "stations.csv", index=False)
    era5 = pd.DataFrame({
        "valid_time": hours - pd.Timedelta(hours=5, minutes=30),
        "t2m": 300 + 5 * np.sin(hours.hour / 24 * 2 * np.pi),
        "d2m": 290.0,
        "u10": rng.normal(1, 1, len(hours)),
        "v10": rng.normal(0, 1, len(hours)),
        "sp": 100900.0,
        "tp": 0.0,
    })
    era5.to_csv(tmp_path / "era5.csv", index=False)
    return aq_files


def test_train_and_serve(tmp_path, monkeypatch):
    from backend.ml import train
    from backend.preprocessing.cpcb import load_cpcb

    aq_files = _write_fixtures(tmp_path)
    aq = load_cpcb(aq_files)
    assert set(aq["station"]) == {"SYNTH A", "SYNTH B", "SYNTH C"}
    assert aq["pm25"].notna().mean() > 0.95

    out = tmp_path / "model"
    meta = train.main([
        "--aq", *aq_files,
        "--stations", str(tmp_path / "stations.csv"),
        "--era5", str(tmp_path / "era5.csv"),
        "--horizon", "24",
        "--out", str(out),
    ])
    assert meta["chosen_model"] in meta["results"]
    assert "persistence" in meta["results"]
    assert meta["weather"] is True
    for f in ("model.joblib", "metadata.json", "latest_features.csv"):
        assert (out / f).exists()
    assert json.loads((out / "metadata.json").read_text())["status"] == "MODEL_PREDICTION"

    # API serves the trained model
    from fastapi.testclient import TestClient
    import backend.api.main as api

    monkeypatch.setattr(api, "MODEL_DIR", out)
    api._load.cache_clear()
    client = TestClient(api.app)
    health = client.get("/health").json()
    assert health["model_loaded"] is True
    assert health["model"]["station_locations"]["SYNTH A"] == [73.84, 18.60]
    r = client.get("/forecast", params={"station": "SYNTH A"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "MODEL_PREDICTION" and np.isfinite(body["value"])
    assert client.get("/forecast", params={"station": "nope"}).status_code == 404


def test_api_without_model_returns_501(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import backend.api.main as api

    monkeypatch.setattr(api, "MODEL_DIR", tmp_path / "missing")
    api._load.cache_clear()
    client = TestClient(api.app)
    assert client.get("/forecast", params={"station": "x"}).status_code == 501
    assert client.get("/health").json()["model_loaded"] is False
