import os
from pydantic import BaseModel


class Settings(BaseModel):
    PROJECT_NAME: str = "BurgersFlow PINN Studio API"
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "burgersflow-super-secret-production-key-change-me")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day for local development convenience
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite:///{os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../burgersflow.db'))}"
    )
    
    ARTIFACTS_DIR: str = os.getenv(
        "ARTIFACTS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../artifacts_storage"))
    )
    
    DEFAULT_GPU_MIN_LIMIT: int = 120
    DEFAULT_MAX_ACTIVE_JOBS: int = 3
    
    DEV_MODE: bool = os.getenv("DEV_MODE", "true").lower() in ("true", "1", "yes")
    
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]


settings = Settings()
