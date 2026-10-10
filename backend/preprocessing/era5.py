"""ERA5 single-levels loader → hourly weather per station (IST).

Input: a NetCDF downloaded from the Copernicus CDS (variables such as 2m_temperature,
2m_dewpoint_temperature, 10m_u/v_component_of_wind, surface_pressure,
total_precipitation, boundary_layer_height), or a CSV point extract with the same
short names (t2m, d2m, u10, v10, sp, tp, blh) plus a time column and optionally station.

Output columns: station, time (IST), temperature, humidity, wind_speed,
wind_direction, pressure, rainfall, [blh]
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

IST = pd.Timedelta(hours=5, minutes=30)


def _derive(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame({"station": df["station"], "time": df["time"]})
    if "t2m" in df:
        out["temperature"] = df["t2m"] - 273.15
    if "t2m" in df and "d2m" in df:
        t, td = df["t2m"] - 273.15, df["d2m"] - 273.15
        # Magnus formula
        out["humidity"] = 100 * np.exp(17.625 * td / (243.04 + td)) / np.exp(17.625 * t / (243.04 + t))
    if "u10" in df and "v10" in df:
        out["wind_speed"] = np.hypot(df["u10"], df["v10"])
        out["wind_direction"] = (np.degrees(np.arctan2(-df["u10"], -df["v10"])) + 360) % 360
    if "sp" in df:
        out["pressure"] = df["sp"] / 100
    if "tp" in df:
        out["rainfall"] = df["tp"] * 1000
    if "blh" in df:
        out["blh"] = df["blh"]
    return out


def load_era5_netcdf(path: str | Path, stations: pd.DataFrame) -> pd.DataFrame:
    import xarray as xr  # optional dependency

    ds = xr.open_dataset(path)
    time_dim = "valid_time" if "valid_time" in ds.dims else "time"
    lat_name = "latitude" if "latitude" in ds.coords else "lat"
    lon_name = "longitude" if "longitude" in ds.coords else "lon"
    frames = []
    for _, st in stations.iterrows():
        point = ds.sel({lat_name: st["latitude"], lon_name: st["longitude"]}, method="nearest")
        df = point.to_dataframe().reset_index()
        df = df.rename(columns={time_dim: "time"})
        df["station"] = st["station"]
        frames.append(df)
    raw = pd.concat(frames, ignore_index=True)
    raw["time"] = pd.to_datetime(raw["time"]) + IST  # ERA5 is UTC; CPCB is IST
    return _derive(raw)


def load_era5_csv(path: str | Path, stations: pd.DataFrame | None = None, utc: bool = True) -> pd.DataFrame:
    df = pd.read_csv(path)
    tcol = next(c for c in ("valid_time", "time", "datetime", "date") if c in df.columns)
    df["time"] = pd.to_datetime(df[tcol]) + (IST if utc else pd.Timedelta(0))
    if "station" not in df.columns:
        if stations is None:
            raise ValueError("CSV has no station column: pass stations to broadcast the single point to all stations")
        df = pd.concat([df.assign(station=s) for s in stations["station"]], ignore_index=True)
    return _derive(df)


def load_era5(path: str | Path, stations: pd.DataFrame) -> pd.DataFrame:
    path = Path(path)
    weather = load_era5_netcdf(path, stations) if path.suffix in (".nc", ".nc4") else load_era5_csv(path, stations)
    weather["time"] = weather["time"].dt.floor("h")
    return weather.groupby(["station", "time"], as_index=False).mean(numeric_only=True)
