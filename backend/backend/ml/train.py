"""Train & validate PM2.5 forecasting models on REAL data (CPCB + optional ERA5).

Model selection is by validation performance on a time-ordered hold-out — never
by assumption. The final test period is untouched until the best model is chosen.

Usage (from the project root):
    python -m backend.ml.train --aq data/raw/cpcb/*.csv --stations data/stations.csv \
        --era5 data/raw/era5_pune.nc --horizon 24 --out backend/models/pm25

Outputs in --out:
    model.joblib         best model (+ feature list)
    metadata.json        data period, split dates, metrics for every candidate, chosen model,
                         SHAP group importance (if `shap` is installed)
    latest_features.csv  last feature row per station (used by the API to serve forecasts)
"""

from __future__ import annotations

import argparse
import glob
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from backend.ml.features import build_features, feature_group
from backend.preprocessing.cpcb import load_cpcb, load_stations
from backend.preprocessing.era5 import load_era5


def metrics(y, p) -> dict:
    return {
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "mae": float(mean_absolute_error(y, p)),
        "r2": float(r2_score(y, p)),
        "n": int(len(y)),
    }


def candidates(seed: int) -> dict:
    models = {
        "random_forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=3, n_jobs=-1, random_state=seed),
    }
    try:
        from xgboost import XGBRegressor

        models["xgboost"] = XGBRegressor(n_estimators=600, learning_rate=0.05, max_depth=6, subsample=0.8, colsample_bytree=0.8, random_state=seed)
    except ImportError:
        pass
    try:
        from lightgbm import LGBMRegressor

        models["lightgbm"] = LGBMRegressor(n_estimators=800, learning_rate=0.03, num_leaves=63, subsample=0.8, colsample_bytree=0.8, random_state=seed, verbose=-1)
    except ImportError:
        pass
    return models


def time_split(df: pd.DataFrame, test_frac: float, val_frac: float):
    times = np.sort(df["y_time"].unique())
    test_start = times[int(len(times) * (1 - test_frac))]
    trainval = df[df["y_time"] < test_start]
    tv_times = np.sort(trainval["y_time"].unique())
    val_start = tv_times[int(len(tv_times) * (1 - val_frac))]
    return trainval[trainval["y_time"] < val_start], trainval[trainval["y_time"] >= val_start], df[df["y_time"] >= test_start], val_start, test_start


def shap_groups(model, X: pd.DataFrame) -> dict | None:
    try:
        import shap
    except ImportError:
        return None
    sample = X.sample(min(2000, len(X)), random_state=0)
    values = shap.TreeExplainer(model).shap_values(sample)
    imp = np.abs(values).mean(axis=0)
    groups: dict[str, float] = {}
    for f, v in zip(X.columns, imp):
        groups[feature_group(f)] = groups.get(feature_group(f), 0.0) + float(v)
    total = sum(groups.values()) or 1
    return {k: v / total for k, v in sorted(groups.items(), key=lambda kv: -kv[1])}


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aq", nargs="+", required=True, help="CPCB CSV files or globs")
    ap.add_argument("--stations", help="stations.csv (station, latitude, longitude) — needed for ERA5")
    ap.add_argument("--era5", help="ERA5 NetCDF or CSV point extract")
    ap.add_argument("--target", default="pm25")
    ap.add_argument("--horizon", type=int, default=24, help="hours ahead")
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--out", default="backend/models/pm25")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    files = sorted({f for pattern in args.aq for f in glob.glob(pattern)})
    if not files:
        raise SystemExit("No AQ files matched --aq")
    aq = load_cpcb(files)
    weather = None
    stations = load_stations(args.stations) if args.stations else None
    if args.era5:
        if stations is None:
            raise SystemExit("--era5 requires --stations for coordinates")
        weather = load_era5(args.era5, stations)

    df, features = build_features(aq, weather, args.target, args.horizon)
    data = df.dropna(subset=["y", "lag_1"])
    train, val, test, val_start, test_start = time_split(data, args.test_frac, args.val_frac)
    print(f"rows: train={len(train)} val={len(val)} test={len(test)} | features={len(features)}")

    results: dict[str, dict] = {}
    # Baseline: persistence (value now = value in `horizon` hours).
    results["persistence"] = {"val": metrics(val["y"], val["lag_1"]), "test": metrics(test["y"], test["lag_1"])}

    fitted = {}
    for name, model in candidates(args.seed).items():
        # Tree models in sklearn cannot take NaN in older versions → simple median fill from train only.
        fill = train[features].median()
        model.fit(train[features].fillna(fill), train["y"])
        fitted[name] = (model, fill)
        results[name] = {
            "val": metrics(val["y"], model.predict(val[features].fillna(fill))),
            "test": metrics(test["y"], model.predict(test[features].fillna(fill))),
        }
        print(f"{name:14s} val RMSE={results[name]['val']['rmse']:.2f}  test RMSE={results[name]['test']['rmse']:.2f}")
    print(f"{'persistence':14s} val RMSE={results['persistence']['val']['rmse']:.2f}  test RMSE={results['persistence']['test']['rmse']:.2f}")

    best = min(fitted, key=lambda n: results[n]["val"]["rmse"])
    beats_baseline = results[best]["val"]["rmse"] < results["persistence"]["val"]["rmse"]

    # Refit the chosen model on train+val before saving.
    model, _ = fitted[best]
    trainval = pd.concat([train, val])
    fill = trainval[features].median()
    model.fit(trainval[features].fillna(fill), trainval["y"])

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    import joblib

    joblib.dump({"model": model, "features": features, "fill": fill.to_dict(), "stations": sorted(df["station"].unique())}, out / "model.joblib")
    latest = df.sort_values("time").groupby("station").tail(1)
    latest[["station", "time", *features]].to_csv(out / "latest_features.csv", index=False)

    meta = {
        "target": args.target,
        "horizon_hours": args.horizon,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data_period": [str(aq["time"].min()), str(aq["time"].max())],
        "stations": sorted(aq["station"].unique().tolist()),
        # [lon, lat] per station — lets the frontend map station forecasts onto the grid.
        "station_locations": {}
        if stations is None
        else {r.station: [float(r.longitude), float(r.latitude)] for r in stations.itertuples() if r.station in set(aq["station"])},
        "split": {"val_start": str(pd.Timestamp(val_start)), "test_start": str(pd.Timestamp(test_start))},
        "features": features,
        "weather": bool(weather is not None),
        "results": results,
        "chosen_model": best,
        "chosen_beats_persistence_on_val": bool(beats_baseline),
        "shap_group_importance": shap_groups(model, test[features].fillna(fill)) if len(test) else None,
        "status": "MODEL_PREDICTION",
    }
    (out / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(f"chosen: {best} (beats persistence on validation: {beats_baseline}) → {out}")
    return meta


if __name__ == "__main__":
    main()
