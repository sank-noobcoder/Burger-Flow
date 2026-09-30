from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    email: str
    role: str


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class QuotaResponse(BaseModel):
    gpu_minutes_used: float
    gpu_minutes_limit: int
    active_jobs: int
    max_active_jobs: int
    resets_at: Optional[datetime] = None
