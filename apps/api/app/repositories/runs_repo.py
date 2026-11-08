from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from apps.api.app.models.db import Run, RunMetric, Artifact, User, Quota, AuditLog
import uuid
import datetime
import json

SORT_FIELDS = {
    "created_at": Run.created_at,
    "final_l2": Run.final_l2,
    "best_loss": Run.best_loss,
    "name": Run.name
}


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, email: str, password_hash: str, role: str = "researcher") -> User:
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=password_hash,
        role=role,
        status="active"
    )
    db.add(user)
    
    # Initialize quota
    quota = Quota(
        user_id=user.id,
        gpu_min_limit=120,
        gpu_min_used=0.0,
        max_active_jobs=2
    )
    db.add(quota)
    db.commit()
    db.refresh(user)
    return user


def get_user_quota(db: Session, user_id: str) -> Optional[Quota]:
    return db.query(Quota).filter(Quota.user_id == user_id).first()


def count_active_jobs(db: Session, user_id: str) -> int:
    return db.query(Run).filter(
        Run.user_id == user_id,
        Run.status.in_(["queued", "running"])
    ).count()


def create_run(db: Session, user_id: str, run_data: dict) -> Run:
    run = Run(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=run_data["name"],
        dimension=run_data.get("dimension", 1),
        model_type=run_data.get("model", {}).get("type", "ri"),
        status="queued",
        phase="search",
        progress=0.0,
        config_json=json.dumps(run_data),
        seed=run_data.get("training", {}).get("seed", 0)
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def list_runs(
    db: Session,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    dimension: Optional[int] = None,
    model: Optional[str] = None,
    sort_by: str = "created_at",
    descending: bool = True,
    limit: int = 50,
    offset: int = 0
) -> List[Run]:
    query = db.query(Run)
    if user_id:
        query = query.filter(Run.user_id == user_id)
    if status:
        query = query.filter(Run.status == status)
    if dimension:
        query = query.filter(Run.dimension == dimension)
    if model:
        query = query.filter(Run.model_type == model)
        
    sort_column = SORT_FIELDS.get(sort_by, Run.created_at)
    if descending:
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(asc(sort_column))
        
    return query.offset(offset).limit(limit).all()


def get_owned_run(db: Session, run_id: str, user_id: Optional[str] = None) -> Optional[Run]:
    query = db.query(Run).filter(Run.id == run_id)
    if user_id:
        query = query.filter(Run.user_id == user_id)
    return query.first()


def update_run_status(
    db: Session,
    run_id: str,
    status: str,
    phase: Optional[str] = None,
    progress: Optional[float] = None,
    best_loss: Optional[float] = None,
    final_l2: Optional[float] = None,
    mse: Optional[float] = None,
    shock_pos_err: Optional[float] = None,
    epochs: Optional[int] = None,
    wall_clock_s: Optional[float] = None,
    error_message: Optional[str] = None
):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return
    run.status = status
    if phase:
        run.phase = phase
    if progress is not None:
        run.progress = progress
    if best_loss is not None:
        run.best_loss = best_loss
    if final_l2 is not None:
        run.final_l2 = final_l2
    if mse is not None:
        run.mse = mse
    if shock_pos_err is not None:
        run.shock_pos_err = shock_pos_err
    if epochs is not None:
        run.epochs = epochs
    if wall_clock_s is not None:
        run.wall_clock_s = wall_clock_s
    if error_message is not None:
        run.error_message = error_message
    if status in ["succeeded", "failed", "cancelled"]:
        run.finished_at = datetime.datetime.utcnow()
    db.commit()


def add_run_metric(db: Session, run_id: str, epoch: int, loss: float, best_loss: float, patience: int, phase: str):
    metric = RunMetric(
        run_id=run_id,
        epoch=epoch,
        loss=loss,
        best_loss=best_loss,
        patience=patience,
        phase=phase
    )
    db.add(metric)
    db.commit()


def get_run_metrics(db: Session, run_id: str, limit: int = 2000):
    return db.query(RunMetric).filter(RunMetric.run_id == run_id).order_by(RunMetric.epoch.asc()).limit(limit).all()


def add_artifact(db: Session, run_id: str, name: str, file_path: str, size_bytes: int, content_type: str):
    art = Artifact(
        id=str(uuid.uuid4()),
        run_id=run_id,
        name=name,
        file_path=file_path,
        size_bytes=size_bytes,
        content_type=content_type
    )
    db.add(art)
    db.commit()


def add_audit_log(db: Session, action: str, user_id: Optional[str] = None, ip: Optional[str] = None, detail: Optional[str] = None):
    log = AuditLog(
        user_id=user_id,
        action=action,
        ip=ip,
        detail=detail
    )
    db.add(log)
    db.commit()
