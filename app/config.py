import os
import json
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
KNOWLEDGE_DIR = DATA_DIR / "knowledge"
UPLOADS_DIR = DATA_DIR / "uploads"
EXPORTS_DIR = DATA_DIR / "exports"
CONFIG_FILE = DATA_DIR / "settings.json"

# Ensure directories exist
for folder in [DATA_DIR, KNOWLEDGE_DIR, UPLOADS_DIR, EXPORTS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    app_name: str = "RFPilot - Autonomous RFP & Questionnaire Agent"
    provider: str = "groq"  # "groq", "gemini", "openai", "ollama", "local_engine"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    confidence_threshold: float = 0.65

def load_settings() -> Settings:
    settings = Settings()
    # Check environment variables first
    settings.groq_api_key = os.getenv("GROQ_API_KEY", "")
    settings.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    settings.openai_api_key = os.getenv("OPENAI_API_KEY", "")
    settings.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")

    # If config file exists, load saved overrides
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return Settings(**data)
        except Exception:
            pass
    return settings

def save_settings(settings: Settings) -> None:
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.model_dump(), f, indent=2)
