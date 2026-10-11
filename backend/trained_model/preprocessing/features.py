"""Exact feature transformations from the evaluated training pipeline."""
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits

def hourly_calendar(frame, target):
    """Complete each station's calendar before shifting; never interpolate targets."""
    result = []
    for station, g in frame.groupby('station'):
        g = g.sort_values('time').set_index('time')
        index = pd.date_range(g.index.min(), g.index.max(), freq='h')
        if len(index) > 24*366*40: raise ValueError(f'Implausible date range for {station}')
        g = g.reindex(index); g['station'] = station; g.index.name = 'time'
        result.append(g.reset_index())
    return pd.concat(result, ignore_index=True)

def features(frame, pollutant, horizon):
    if not 1 <= horizon <= 168: raise ValueError('Forecast horizon must be 1..168 hours')
    df = hourly_calendar(frame, pollutant).sort_values(['station','time']).reset_index(drop=True)
    g = df.groupby('station')[pollutant]
    names = []
    for lag in (0,1,3,6,12,24,48,72,168):
        name = f'lag_{lag}'; names.append(name); df[name] = g.shift(lag)
    for window in (6,24,72):
        name = f'rolling_{window}'; names.append(name)
        df[name] = g.transform(lambda x: x.rolling(window, min_periods=max(3,window//2)).mean())
    df['history_count_24'] = g.transform(lambda x: x.rolling(24,min_periods=1).count())
    # Station encoding is intentionally absent: coordinates may generalize, arbitrary integer IDs do not.
    for name in ('latitude','longitude'):
        if name in df: df[name] = df.groupby('station')[name].transform('first'); names.append(name)
    local = pd.to_datetime(df.time, utc=True).dt.tz_convert('Asia/Kolkata')
    df['hour_sin'] = np.sin(2*np.pi*local.dt.hour/24); df['hour_cos'] = np.cos(2*np.pi*local.dt.hour/24)
    df['month_sin'] = np.sin(2*np.pi*local.dt.month/12); df['month_cos'] = np.cos(2*np.pi*local.dt.month/12)
    df['dow'] = local.dt.dayofweek
    names += ['hour_sin','hour_cos','month_sin','month_cos','dow']
    for name in WEATHER:
        if name in df and name != 'wind_direction': names.append(name)
    if 'wind_direction' in df:
        df['wind_sin'] = np.sin(np.deg2rad(df.wind_direction)); df['wind_cos'] = np.cos(np.deg2rad(df.wind_direction))
        names += ['wind_sin','wind_cos']
    df['y'] = g.shift(-horizon)
    df['y_time'] = df.time+pd.Timedelta(hours=horizon)
    return df, names

def predict(bundle, frame):
    name = bundle['chosen_model']
    if name == 'persistence': values = frame.lag_0.to_numpy()
    elif name == 'seasonal_average':
        seasonal = bundle['seasonal']
        values = np.array([seasonal['table'].get((st, t.hour), seasonal['fallback']) for st,t in zip(frame.station,frame.y_time)])
    else:
        with threadpool_limits(limits=2): values = bundle['model'].predict(frame[bundle['features']])
    return np.maximum(0, values)

WEATHER=['temperature', 'humidity', 'wind_speed', 'wind_direction', 'rainfall', 'pressure', 'solar_radiation']
