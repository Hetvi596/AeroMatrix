from typing import Literal
from pydantic import BaseModel,Field,ConfigDict
from fastapi import FastAPI,HTTPException
from .inference import predict
class Observation(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    station:str
    timestamp:str
    available_at:str
    pollutant:Literal['pm25','pm10']
    value:float=Field(ge=0)
    category:Literal['MEASURED']
    units:Literal['ug/m3']
class Request(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    station:str
    pollutant:Literal['pm25','pm10']
    cutoff:str
    excluded_station:str|None=None
    observations:list[Observation]=Field(max_length=100)
    weather:dict=Field(default_factory=dict)
app=FastAPI(title='AeroMatrix Task 2 model',version='1.0.0')
@app.post('/task2/predict')
def prediction(request:Request):
    try:return predict(request.model_dump())
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(422,str(e)) from e
@app.get('/task2/health')
def health():return {'status':'ok','note':'Health is not proof of successful inference; run tests and demos.'}
