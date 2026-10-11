from pathlib import Path
from urllib.parse import urlparse
import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env', override=False)

def endpoint(value):
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Service URLs must be HTTP(S) origins/paths without credentials, query or fragment')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Remote service URLs require HTTPS')
    return value.rstrip('/')

@dataclass
class Settings:
    root: Path = ROOT
    provider: str = field(default_factory=lambda: os.getenv('LLM_PROVIDER', 'gemini'))
    model: str = field(default_factory=lambda: os.getenv('LLM_MODEL', 'gemini-3.5-flash-lite'))
    api_key: str = field(default_factory=lambda: os.getenv('GEMINI_API_KEY') or os.getenv('LLM_API_KEY', ''))
    llm_url: str = field(default_factory=lambda: os.getenv('LLM_BASE_URL', ''))
    ml_url: str = field(default_factory=lambda: os.getenv('AEROMATRIX_ML_API_URL', 'http://127.0.0.1:8000'))
    simulation_url: str = field(default_factory=lambda: os.getenv('AEROMATRIX_SIMULATION_API_URL', ''))
    # Current model data when the ML backend has none (same source as the dashboard). Empty disables it.
    open_meteo_url: str = field(default_factory=lambda: os.getenv('OPEN_METEO_AIR_QUALITY_URL', 'https://air-quality-api.open-meteo.com/v1/air-quality'))
    host: str = field(default_factory=lambda: os.getenv('CHATBOT_HOST', '127.0.0.1'))
    port: int = field(default_factory=lambda: int(os.getenv('CHATBOT_PORT', '8010')))
    service_key: str = field(default_factory=lambda: os.getenv('CHATBOT_API_KEY', ''))
    cors: list[str] = field(default_factory=lambda: os.getenv('CHATBOT_CORS_ORIGINS', 'http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:5178,http://localhost:5178,http://127.0.0.1:4178').split(','))
    llm_timeout: float = field(default_factory=lambda: float(os.getenv('LLM_TIMEOUT_SECONDS', '60')))
    ml_timeout: float = field(default_factory=lambda: float(os.getenv('ML_TIMEOUT_SECONDS', '15')))
    retention_hours: int = field(default_factory=lambda: int(os.getenv('HISTORY_RETENTION_HOURS', '24')))
    history_turns: int = field(default_factory=lambda: int(os.getenv('HISTORY_MAX_TURNS', '12')))
    rate_limit: int = field(default_factory=lambda: int(os.getenv('REQUESTS_PER_MINUTE', '30')))
    max_sessions: int = field(default_factory=lambda: int(os.getenv('MAX_SESSIONS', '1000')))

    def __post_init__(self):
        if self.provider not in ('gemini', 'ollama', 'openai_compatible', 'disabled'):
            raise ValueError('Unknown LLM_PROVIDER')
        if not self.llm_url:
            self.llm_url = {'gemini':'https://generativelanguage.googleapis.com/v1beta', 'ollama':'http://127.0.0.1:11434', 'openai_compatible':'http://127.0.0.1:8080/v1', 'disabled':'http://127.0.0.1:11434'}[self.provider]
        self.llm_url = endpoint(self.llm_url)
        self.ml_url = endpoint(self.ml_url) if self.ml_url else ''
        self.simulation_url = endpoint(self.simulation_url) if self.simulation_url else ''
        self.open_meteo_url = endpoint(self.open_meteo_url) if self.open_meteo_url else ''
        self.cors = [s.strip() for s in self.cors if s.strip()]
        if '*' in self.cors: raise ValueError('Use explicit CORS origins')
        if self.host not in ('127.0.0.1', 'localhost', '::1') and not self.service_key:
            raise ValueError('CHATBOT_API_KEY is required when binding beyond loopback')
        if min(self.retention_hours, self.history_turns, self.rate_limit, self.max_sessions) < 1: raise ValueError('Limits must be positive')

    @property
    def state_dir(self): return self.root / 'runtime'
