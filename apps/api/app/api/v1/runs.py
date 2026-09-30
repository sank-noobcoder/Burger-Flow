import os
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from apps.api.app.models.db import get_db, User
from apps.api.app.core.dependencies import get_current_user
from apps.api.app.schemas.run import CreateRunRequest, RunSummary, RunDetail, RunMetricsSummary
from apps.api.app.repositories import runs_repo
from apps.api.app.core.events import broker
from apps.api.app.core.config import settings
from apps.worker.tasks.train_run import run_training_task, cancel_run_worker

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", status_code=202)
def create_run(
    req: CreateRunRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Quota check
    active_jobs = runs_repo.count_active_jobs(db, user.id)
    quota = runs_repo.get_user_quota(db, user.id)
    max_active = quota.max_active_jobs if quota else 2
    if active_jobs >= max_active:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Concurrent job limit ({max_active}) reached. Please wait for current jobs to finish."
        )
        
    # 2. Create Run Record
    run_dict = req.model_dump()
    run = runs_repo.create_run(db, user_id=user.id, run_data=run_dict)
    
    # 3. Enqueue training in background worker
    background_tasks.add_task(run_training_task, run.id)
    
    # Audit log
    runs_repo.add_audit_log(db, action="launch_run", user_id=user.id, detail=f"Run: {run.id} ({run.name})")
    
    est_gpu_min = 1.0 if run.dimension == 1 else 3.5
    return {
        "run_id": run.id,
        "status": "queued",
        "estimated_gpu_minutes": est_gpu_min
    }


@router.get("", response_model=List[RunSummary])
def list_runs(
    status: Optional[str] = Query(None),
    dimension: Optional[int] = Query(None, ge=1, le=2),
    model: Optional[str] = Query(None),
    sort: str = Query("created_at"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Admins can see all, standard users see their own
    u_id = None if user.role == "admin" else user.id
    runs = runs_repo.list_runs(
        db,
        user_id=u_id,
        status=status,
        dimension=dimension,
        model=model,
        sort_by=sort,
        limit=limit,
        offset=offset
    )
    return runs


@router.get("/{run_id}", response_model=RunDetail)
def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    cfg = json.loads(run.config_json) if run.config_json else {}
    arts = [a.name for a in run.artifacts]
    
    return RunDetail(
        id=run.id,
        name=run.name,
        dimension=run.dimension,
        model_type=run.model_type,
        status=run.status,
        phase=run.phase,
        progress=run.progress,
        best_loss=run.best_loss,
        final_l2=run.final_l2,
        created_at=run.created_at,
        finished_at=run.finished_at,
        config=cfg,
        seed=run.seed,
        metrics=RunMetricsSummary(
            mse=run.mse,
            rel_l2=run.final_l2,
            shock_pos_err=run.shock_pos_err,
            epochs=run.epochs,
            wall_clock_s=run.wall_clock_s
        ),
        artifacts=arts,
        error_message=run.error_message
    )


@router.post("/{run_id}/cancel", status_code=202)
def cancel_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in ["succeeded", "failed", "cancelled"]:
        raise HTTPException(status_code=409, detail=f"Run already finished with status '{run.status}'")
        
    cancel_run_worker(run_id)
    runs_repo.update_run_status(db, run_id, status="cancelling")
    return {"status": "cancelling"}


@router.delete("/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status in ["queued", "running"]:
        raise HTTPException(status_code=409, detail="Cannot delete an active run; please cancel it first.")
        
    db.delete(run)
    db.commit()
    return None


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Server-Sent Events (SSE) live stream."""
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    q = broker.subscribe(run_id)
    
    async def event_generator():
        # First send current run state
        initial_data = {
            "epoch": run.epochs,
            "status": run.status,
            "phase": run.phase,
            "loss": run.best_loss or 0.0,
            "best_loss": run.best_loss or 0.0,
            "progress": run.progress
        }
        yield f"event: metrics\ndata: {json.dumps(initial_data)}\n\n"
        
        if run.status in ["succeeded", "failed", "cancelled"]:
            yield f"event: done\ndata: {json.dumps({'status': run.status})}\n\n"
            broker.unsubscribe(run_id, q)
            return

        try:
            while True:
                try:
                    # Timeout so we can send heartbeat ping if idle
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    evt = msg["event"]
                    data = json.dumps(msg["data"])
                    yield f"event: {evt}\ndata: {data}\n\n"
                    if evt in ["done", "error"]:
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            broker.unsubscribe(run_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/{run_id}/artifacts")
def get_run_artifacts(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    return [{"name": a.name, "size": a.size_bytes, "content_type": a.content_type} for a in run.artifacts]


@router.get("/{run_id}/artifacts/{name}")
def download_artifact(
    run_id: str,
    name: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if user.role == "admin" else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    art = next((a for a in run.artifacts if a.name == name), None)
    if not art or not os.path.exists(art.file_path):
        raise HTTPException(status_code=404, detail="Artifact not found")
        
    return FileResponse(
        art.file_path,
        media_type=art.content_type,
        filename=art.name
    )
