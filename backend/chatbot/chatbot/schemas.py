from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class MapLocation(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    zoom: float | None = Field(default=None, ge=0, le=30)

class AppContext(BaseModel):
    model_config = ConfigDict(extra='forbid')
    selected_region: str | None = Field(default=None, max_length=120)
    selected_station: str | None = Field(default=None, max_length=120)
    selected_pollutant: str | None = Field(default=None, max_length=30)
    dashboard_time: str | None = Field(default=None, max_length=50)
    scenario_id: str | None = Field(default=None, pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    scenario_description: str | None = Field(default=None, max_length=1000)
    active_section: str | None = Field(default=None, max_length=80)
    selected_factory: str | None = Field(default=None, max_length=120)
    graph_description: str | None = Field(default=None, max_length=1500)
    map_location: MapLocation | None = None

class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    session_id: str | None = Field(default=None, pattern=r'^[A-Za-z0-9_-]{8,80}$')
    message: str = Field(min_length=1, max_length=4000)
    context: AppContext = Field(default_factory=AppContext)
    language: Literal['auto', 'en', 'hi', 'hinglish'] = 'auto'
    detail: Literal['simple', 'normal', 'detailed'] = 'normal'
    allow_historical: bool = False

    @field_validator('message')
    @classmethod
    def not_blank(cls, v):
        if not v.strip(): raise ValueError('message must not be blank')
        return v.strip()

class SessionRequest(BaseModel):
    session_id: str = Field(pattern=r'^[A-Za-z0-9_-]{8,80}$')

class ChatResponse(BaseModel):
    session_id: str
    session_token: str = Field(description='Private bearer credential; do not display or log')
    answer: str
    intent: str
    sources: list[dict]
    data_status: str
    data: list[dict]
    model_used: str | None
    language: str
    timestamp: str | None
    generated_at: str
    latency_ms: float
    warnings: list[str]

class Route(BaseModel):
    model_config = ConfigDict(extra='forbid')
    intent: Literal['project', 'concept', 'observation', 'forecast', 'comparison', 'coverage', 'reliability', 'simulation', 'general']
    regions: list[str] = Field(default_factory=list, max_length=2)
    pollutant: str = Field(default='aqi', max_length=30)
    mode: Literal['observation', 'forecast'] = 'observation'
    historical: bool = False
