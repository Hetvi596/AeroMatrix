"""Feature engineering for station-level PM2.5 forecasting (hourly)."""

from __future__ import annotations

import numpy as np
import pandas as pd

LAGS = [1, 2, 3, 6, 12, 24, 48]
ROLLING = [6, 24, 72]
WEATHER_COLS = ["temperature", "humidity", "wind_speed", "wind_direction", "pressure", "rainfall", "blh"]

# Feature → group, used to aggregate SHAP values into interpretable categories.
FEATURE_GROUPS = {
    "history": ("lag_", "roll_", "other_"),
    "meteorology": ("temperature", "humidity", "wind_", "pressure", "rainfall", "blh"),
    "calendar": ("hour", "dow", "month", "is_weekend"),
    "location": ("station_code",),
}


def feature_group(name: str) -> str:
    for g, prefixes in FEATURE_GROUPS.items():
        if name.startswith(prefixes):
            return g
    return "other"


def build_features(aq: pd.DataFrame, weather: pd.DataFrame | None, target: str = "pm25", horizon: int = 24) -> tuple[pd.DataFrame, list[str]]:
    """Return (frame with features + 'y' + 'y_time', feature column names).

    Row at time t predicts target at t + horizon, using only information available at t.
    """
    df = aq.sort_values(["station", "time"]).copy()
    if weather is not None:
        df = df.merge(weather, on=["station", "time"], how="left")

    g = df.groupby("station")[target]
    for lag in LAGS:
        df[f"lag_{lag}"] = g.shift(lag - 1)  # lag_1 == value at t (latest observed)
    for w in ROLLING:
        df[f"roll_mean_{w}"] = g.transform(lambda s, w=w: s.rolling(w, min_periods=max(1, w // 2)).mean())
    df["roll_std_24"] = g.transform(lambda s: s.rolling(24, min_periods=12).std())

    for p in ("pm10", "no2", "so2", "co", "o3"):
        if p != target and p in df and df[p].notna().mean() > 0.3:
            df[f"other_{p}"] = df[p]

    df["hour"] = df["time"].dt.hour
    df["dow"] = df["time"].dt.dayofweek
    df["month"] = df["time"].dt.month
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["station_code"] = df["station"].astype("category").cat.codes

    if "wind_direction" in df:
        rad = np.radians(df["wind_direction"])
        df["wind_u"] = -df.get("wind_speed", 1) * np.sin(rad)
        df["wind_v"] = -df.get("wind_speed", 1) * np.cos(rad)

    df["y"] = g.shift(-horizon)
    df["y_time"] = df["time"] + pd.Timedelta(hours=horizon)

    features = [c for c in df.columns if c.startswith(("lag_", "roll_", "other_", "wind_u", "wind_v"))]
    features += ["hour", "dow", "month", "is_weekend", "station_code"]
    features += [c for c in WEATHER_COLS if c in df.columns and c != "wind_direction" and df[c].notna().mean() > 0.3]
    return df, features
