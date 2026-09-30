from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session
from apps.api.app.models.db import get_db, User
from apps.api.app.schemas.auth import LoginRequest, TokenResponse, UserResponse, QuotaResponse
from apps.api.app.repositories import runs_repo
from apps.api.app.core.security import verify_password, create_access_token
from apps.api.app.core.dependencies import get_current_user
from apps.api.app.core.config import settings
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(login_req: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = runs_repo.get_user_by_email(db, login_req.email)
    if not user or not verify_password(login_req.password, user.password_hash):
        runs_repo.add_audit_log(
            db, action="failed_login", ip=request.client.host if request.client else None, detail=f"Email: {login_req.email}"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    if user.status == "blocked":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")
        
    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "role": user.role}
    )
    
    # Audit log
    runs_repo.add_audit_log(
        db, action="login", user_id=user.id, ip=request.client.host if request.client else None
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
        role=user.role
    )


@router.post("/refresh")
def refresh(user: User = Depends(get_current_user)):
    token = create_access_token(data={"sub": user.id, "email": user.email, "role": user.role})
    return {"access_token": token, "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


@router.post("/logout", status_code=204)
def logout(user: User = Depends(get_current_user)):
    return Response(status_code=204)


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/quota", response_model=QuotaResponse)
def get_quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quota = runs_repo.get_user_quota(db, user.id)
    active_jobs = runs_repo.count_active_jobs(db, user.id)
    if not quota:
        return QuotaResponse(
            gpu_minutes_used=0.0,
            gpu_minutes_limit=120,
            active_jobs=active_jobs,
            max_active_jobs=2
        )
    return QuotaResponse(
        gpu_minutes_used=quota.gpu_min_used,
        gpu_minutes_limit=quota.gpu_min_limit,
        active_jobs=active_jobs,
        max_active_jobs=quota.max_active_jobs,
        resets_at=quota.resets_at
    )
