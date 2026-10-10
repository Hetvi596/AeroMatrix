"""CPCB / CAAQMS air-quality loader.

Reads one or many CSV exports (CPCB CCR downloads with a metadata preamble,
"station_hour"-style tables, or tidy long tables) into a clean hourly frame:

    station | time (IST, hourly) | pm25 | pm10 | no2 | so2 | co | o3

Same header conventions as the frontend importer (src/data/import/cpcbImport.ts).
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

POLLUTANTS = ["pm25", "pm10", "no2", "so2", "co", "o3"]
_POLLUTANT_ALIASES = {"pm25": "pm25", "pm10": "pm10", "no2": "no2", "so2": "so2", "co": "co", "o3": "o3", "ozone": "o3"}
_STATION = ["station", "stationname", "stationid", "site", "sitename", "location", "locationname"]
_TIME = ["fromdate", "datetime", "timestamp", "datetimeist", "time", "date"]
_NA = ["None", "NA", "N/A", "NaN", "null", "-", "--", ""]

# Plausibility limits for QA (values outside are set to NaN).
_LIMITS = {"pm25": 1000, "pm10": 2000, "no2": 1000, "so2": 1000, "co": 50, "o3": 1000}


def norm_header(h: str) -> str:
    h = re.sub(r"\(.*?\)|\[.*?\]", "", str(h).lower())
    return re.sub(r"[^a-z0-9]", "", h)


def _find_header(lines: list[str]) -> int:
    for i, line in enumerate(lines[:40]):
        cells = [norm_header(c) for c in re.split(r"[,;\t]", line)]
        if any(c in _TIME for c in cells) and any(c in _POLLUTANT_ALIASES for c in cells):
            return i
    raise ValueError("no header row with a time column and a pollutant column")


def read_cpcb_csv(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    lines = path.read_text(encoding="utf-8-sig", errors="replace").splitlines()
    header_idx = _find_header(lines)

    preamble_station = None
    for line in lines[:header_idx]:
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 2 and norm_header(parts[0]) in _STATION and parts[1]:
            preamble_station = parts[1]

    df = pd.read_csv(path, skiprows=header_idx, na_values=_NA, keep_default_na=True, encoding="utf-8-sig", sep=None, engine="python")
    cols = {c: norm_header(c) for c in df.columns}
    df = df.rename(columns=cols)

    time_col = next((c for c in _TIME if c in df.columns), None)
    station_col = next((c for c in _STATION if c in df.columns), None)
    out = pd.DataFrame()
    out["time"] = pd.to_datetime(df[time_col].astype(str).str.replace(r"\s*-\s*(?=\d{1,2}:)", " ", regex=True), dayfirst=True, errors="coerce")
    out["station"] = df[station_col].astype(str).str.strip() if station_col else (preamble_station or path.stem)
    for src, dst in _POLLUTANT_ALIASES.items():
        if src in df.columns and dst not in out.columns:
            out[dst] = pd.to_numeric(df[src], errors="coerce")
    for p in POLLUTANTS:
        if p not in out.columns:
            out[p] = np.nan
    return out.dropna(subset=["time"])


def qa(df: pd.DataFrame) -> pd.DataFrame:
    """Plausibility QA: negatives / out-of-range → NaN; 24h+ flat-lined runs → NaN."""
    df = df.copy()
    for p in POLLUTANTS:
        s = df[p]
        s = s.where((s >= 0) & (s <= _LIMITS[p]))
        # flat-line detection per station
        run_id = (s != s.groupby(df["station"]).shift()).cumsum()
        run_len = s.groupby([df["station"], run_id]).transform("size")
        df[p] = s.where(~((run_len >= 24) & s.notna()))
    return df


def to_hourly(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["time"] = df["time"].dt.floor("h")
    hourly = df.groupby(["station", "time"], as_index=False)[POLLUTANTS].mean()
    # Re-index to a complete hourly calendar per station so lags are well defined.
    frames = []
    for st, g in hourly.groupby("station"):
        idx = pd.date_range(g["time"].min(), g["time"].max(), freq="h")
        g = g.set_index("time").reindex(idx)
        g.index.name = "time"
        g["station"] = st
        frames.append(g.reset_index())
    return pd.concat(frames, ignore_index=True)


def load_cpcb(paths: list[str | Path]) -> pd.DataFrame:
    frames = [read_cpcb_csv(p) for p in paths]
    if not frames:
        raise ValueError("no CPCB files given")
    return to_hourly(qa(pd.concat(frames, ignore_index=True)))


def load_stations(path: str | Path) -> pd.DataFrame:
    """stations.csv with columns station, latitude, longitude (names flexible)."""
    df = pd.read_csv(path)
    df = df.rename(columns={c: norm_header(c) for c in df.columns})
    st = next(c for c in _STATION if c in df.columns)
    lat = next(c for c in ("latitude", "lat") if c in df.columns)
    lon = next(c for c in ("longitude", "lon", "lng", "long") if c in df.columns)
    return pd.DataFrame({"station": df[st].astype(str).str.strip(), "latitude": df[lat], "longitude": df[lon]})
