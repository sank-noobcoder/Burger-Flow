from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from apps.api.app.models.db import get_db, User, Quota, AuditLog
from apps.api.app.core.dependencies import get_current_admin
from apps.api.app.schemas.auth import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[UserResponse])
def list_users(
    limit: int = 50,
    offset: int = 0,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    return db.query(User).offset(offset).limit(limit).all()


@router.post("/block/{user_id}")
def block_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "blocked"
    db.commit()
    return {"message": f"User {user.email} has been blocked"}


@router.post("/unblock/{user_id}")
def unblock_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "active"
    db.commit()
    return {"message": f"User {user.email} has been unblocked"}


@router.get("/quotas")
def get_all_quotas(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    quotas = db.query(Quota).all()
    return [
        {
            "user_id": q.user_id,
            "gpu_min_limit": q.gpu_min_limit,
            "gpu_min_used": q.gpu_min_used,
            "max_active_jobs": q.max_active_jobs
        }
        for q in quotas
    ]


@router.put("/quotas/{user_id}")
def update_user_quota(
    user_id: str,
    gpu_min_limit: int = Body(...),
    max_active_jobs: int = Body(...),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    quota = db.query(Quota).filter(Quota.user_id == user_id).first()
    if not quota:
        raise HTTPException(status_code=404, detail="Quota not found")
    quota.gpu_min_limit = gpu_min_limit
    quota.max_active_jobs = max_active_jobs
    db.commit()
    return {"message": "Quota updated successfully"}


@router.get("/audit")
def get_audit_logs(
    limit: int = 100,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "user_id": l.user_id,
            "action": l.action,
            "ip": l.ip,
            "detail": l.detail,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in logs
    ]
