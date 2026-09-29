"""ENR01 backend API — scaffold only.

The frontend currently runs fully client-side with demo data. This FastAPI app
defines the contract the frontend's HttpPredictionService / future ScenarioService
will call once real data and trained models exist.

Run:  uvicorn backend.api.main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ENR01 Urban Environmental Digital Twin API", version="0.0.1")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": False, "data_sources": {"cpcb": False, "era5": False}}


@app.get("/forecast")
def forecast(cell: str, pollutant: str = "pm25", h: int = 48):
    # Returns ForecastResult (see src/services/predictionService.ts) once a model is trained.
    raise HTTPException(status_code=501, detail="No trained model yet — awaiting CPCB + ERA5 training data.")


@app.get("/explain")
def explain(cell: str, pollutant: str = "pm25"):
    raise HTTPException(status_code=501, detail="SHAP explanations require a trained model.")
