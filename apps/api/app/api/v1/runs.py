import os
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
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
    # 1. Quota check & self-healing of stale jobs
    active_jobs = runs_repo.count_active_jobs(db, user.id)
    quota = runs_repo.get_user_quota(db, user.id)
    max_active = 10 if settings.DEV_MODE else (quota.max_active_jobs if quota else 3)
    
    # In DEV_MODE, auto-recover or relax limits so developers can always launch experiments
    if active_jobs >= max_active:
        if settings.DEV_MODE:
            # Terminate oldest running/queued jobs to make room
            oldest_stuck = db.query(runs_repo.Run).filter(
                runs_repo.Run.user_id == user.id,
                runs_repo.Run.status.in_(["queued", "running"])
            ).order_by(runs_repo.Run.created_at.asc()).limit(active_jobs - max_active + 1).all()
            for r in oldest_stuck:
                r.status = "cancelled"
                r.error_message = "Auto-cancelled to prioritize newly launched run"
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Concurrent job limit ({max_active}) reached. Please wait for current jobs to finish."
            )
        
    if quota and quota.gpu_min_used >= quota.gpu_min_limit:
        if settings.DEV_MODE:
            quota.gpu_min_limit = 5000.0
            quota.gpu_min_used = 0.0
            db.commit()
        else:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"GPU compute quota exhausted ({quota.gpu_min_used:.1f}/{quota.gpu_min_limit} minutes used)."
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
    result = []
    for r in runs:
        final_l2 = r.final_l2
        pred_path = os.path.join(settings.ARTIFACTS_DIR, r.id, "prediction_final.json")
        if os.path.exists(pred_path):
            try:
                with open(pred_path, "r", encoding="utf-8") as f:
                    pdata = json.load(f)
                    if "rel_l2" in pdata:
                        final_l2 = pdata["rel_l2"]
                    elif "rel_l2_error" in pdata:
                        final_l2 = pdata["rel_l2_error"]
            except Exception:
                pass
        result.append(RunSummary(
            id=r.id,
            name=r.name,
            dimension=r.dimension,
            model_type=r.model_type,
            status=r.status,
            phase=r.phase,
            progress=r.progress,
            best_loss=r.best_loss,
            final_l2=final_l2,
            created_at=r.created_at,
            finished_at=r.finished_at
        ))
    return result


@router.get("/{run_id}", response_model=RunDetail)
def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if (user.role == "admin" or settings.DEV_MODE) else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    cfg = json.loads(run.config_json) if run.config_json else {}
    arts = [a.name for a in run.artifacts]
    art_dir = os.path.join(settings.ARTIFACTS_DIR, run.id)
    if os.path.exists(art_dir):
        for fname in os.listdir(art_dir):
            if fname not in arts and os.path.isfile(os.path.join(art_dir, fname)):
                arts.append(fname)
    
    # Sync with prediction_final.json if available
    pred_path = os.path.join(settings.ARTIFACTS_DIR, run.id, "prediction_final.json")
    final_l2 = run.final_l2
    mse = run.mse
    shock_pos_err = run.shock_pos_err
    if os.path.exists(pred_path):
        try:
            with open(pred_path, "r", encoding="utf-8") as f:
                pdata = json.load(f)
                if "rel_l2" in pdata:
                    final_l2 = pdata["rel_l2"]
                elif "rel_l2_error" in pdata:
                    final_l2 = pdata["rel_l2_error"]
                if "mse" in pdata:
                    mse = pdata["mse"]
                if "shock_pos_err" in pdata:
                    shock_pos_err = pdata["shock_pos_err"]
        except Exception:
            pass
    
    return RunDetail(
        id=run.id,
        name=run.name,
        dimension=run.dimension,
        model_type=run.model_type,
        status=run.status,
        phase=run.phase,
        progress=run.progress,
        best_loss=run.best_loss,
        final_l2=final_l2,
        created_at=run.created_at,
        finished_at=run.finished_at,
        config=cfg,
        seed=run.seed,
        metrics=RunMetricsSummary(
            mse=mse,
            rel_l2=final_l2,
            shock_pos_err=shock_pos_err,
            epochs=run.epochs,
            wall_clock_s=run.wall_clock_s
        ),
        artifacts=arts,
        error_message=run.error_message
    )


@router.get("/{run_id}/metrics")
def get_run_metrics(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if (user.role == "admin" or settings.DEV_MODE) else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run and not settings.DEV_MODE:
        raise HTTPException(status_code=404, detail="Run not found")
        
    metrics = runs_repo.get_run_metrics(db, run_id) if run else []
    if not metrics:
        loss_art = os.path.join(settings.ARTIFACTS_DIR, run_id, "loss_history.json")
        if os.path.exists(loss_art):
            try:
                with open(loss_art, "r") as lf:
                    hist = json.load(lf)
                    if isinstance(hist, list) and len(hist) > 0:
                        return hist
            except Exception:
                pass

    return [
        {
            "epoch": m.epoch,
            "loss": m.loss,
            "best_loss": m.best_loss,
            "patience": m.patience,
            "phase": m.phase
        }
        for m in metrics
    ]


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
    u_id = None if (user.role == "admin" or settings.DEV_MODE) else user.id
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
    u_id = None if (user.role == "admin" or settings.DEV_MODE) else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    if not run and not settings.DEV_MODE:
        raise HTTPException(status_code=404, detail="Run not found")
        
    arts = [{"name": a.name, "size": a.size_bytes, "content_type": a.content_type} for a in (run.artifacts if run else [])]
    # In DEV_MODE, also inspect artifacts_storage directory so any saved artifacts on disk are included
    art_dir = os.path.join(settings.ARTIFACTS_DIR, run_id)
    if os.path.exists(art_dir):
        existing_names = {a["name"] for a in arts}
        for fname in os.listdir(art_dir):
            if fname not in existing_names and os.path.isfile(os.path.join(art_dir, fname)):
                fpath = os.path.join(art_dir, fname)
                arts.append({
                    "name": fname,
                    "size": os.path.getsize(fpath),
                    "content_type": "application/json" if fname.endswith(".json") else "text/yaml"
                })
    return arts


@router.get("/{run_id}/artifacts/{name}")
def download_artifact(
    run_id: str,
    name: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    u_id = None if (user.role == "admin" or settings.DEV_MODE) else user.id
    run = runs_repo.get_owned_run(db, run_id, u_id)
    art_dir = os.path.join(settings.ARTIFACTS_DIR, run_id)
    file_path = os.path.join(art_dir, name)

    # Dynamic generation of regions.json if missing from historical run
    if name == "regions.json" and not os.path.exists(file_path):
        pred_path = os.path.join(art_dir, "prediction_final.json")
        if os.path.exists(pred_path):
            try:
                import numpy as np
                with open(pred_path, "r") as pf:
                    pdata = json.load(pf)
                xs = pdata.get("x", [])
                ts = pdata.get("t", [])
                pred_u = pdata.get("pred_u", [])
                sample_pts = []
                if xs and ts and pred_u:
                    u_arr = np.array(pred_u)
                    if u_arr.ndim == 2 and u_arr.shape[1] > 1:
                        dx = float(xs[1] - xs[0]) if len(xs) > 1 else 0.01
                        grad_x = np.abs(np.gradient(u_arr, dx, axis=1))
                        cutoff = float(np.percentile(grad_x, 30.0))
                        low_mask = grad_x <= cutoff
                        t_indices, x_indices = np.where(low_mask)
                        all_pts = [[float(xs[xi]), float(ts[ti])] for ti, xi in zip(t_indices, x_indices)]
                        if len(all_pts) > 120:
                            step = len(all_pts) // 120
                            sample_pts = all_pts[::step][:120]
                        else:
                            sample_pts = all_pts

                os.makedirs(art_dir, exist_ok=True)
                with open(file_path, "w") as rf:
                    json.dump({"sample": sample_pts}, rf)
                if run:
                    runs_repo.add_artifact(db, run_id, "regions.json", file_path, os.path.getsize(file_path), "application/json")
            except Exception as reg_err:
                print(f"[WARN] Failed generating regions.json for run {run_id}: {reg_err}", flush=True)

    art = next((a for a in run.artifacts if a.name == name), None) if run else None
    target_path = art.file_path if (art and os.path.exists(art.file_path)) else file_path
    if not os.path.exists(target_path):
        if name == "loss_history.json":
            return JSONResponse(content=[])
        elif name == "regions.json":
            return JSONResponse(content={"sample": []})
        elif name == "pca.json":
            return JSONResponse(content={"points": [], "explained_variance": [0.0, 0.0]})
        elif name in ["prediction_final.json", "prediction_2d.json"]:
            return JSONResponse(content={"status": "pending", "message": "Artifact not yet generated for active run", "pred_u": []})
        elif name.endswith(".json"):
            return JSONResponse(content={"status": "pending", "message": "Artifact not yet generated"})
        raise HTTPException(status_code=404, detail="Artifact not found")
        
    if name in ["prediction_final.json", "prediction_2d.json"]:
        try:
            with open(target_path, "r", encoding="utf-8") as pf:
                pdata = json.load(pf)
            # Unwrap PowerShell value wrappers if present
            if isinstance(pdata.get("pred_u"), dict) and "value" in pdata["pred_u"]:
                pdata["pred_u"] = pdata["pred_u"]["value"]
            if isinstance(pdata.get("ref_u"), dict) and "value" in pdata["ref_u"]:
                pdata["ref_u"] = pdata["ref_u"]["value"]
            if isinstance(pdata.get("pred_v"), dict) and "value" in pdata["pred_v"]:
                pdata["pred_v"] = pdata["pred_v"]["value"]
            if isinstance(pdata.get("ref_v"), dict) and "value" in pdata["ref_v"]:
                pdata["ref_v"] = pdata["ref_v"]["value"]
            # If ref_u is missing or empty in 1D run, supply Cole-Hopf reference
            if (not pdata.get("ref_u") or len(pdata.get("ref_u")) == 0) and (not run or run.dimension == 1):
                field_path = os.path.join(os.path.dirname(__file__), "../../../web/public/landing/field.json")
                if os.path.exists(field_path):
                    with open(field_path, "r", encoding="utf-8") as ff:
                        fdata = json.load(ff)
                        if "u" in fdata:
                            pdata["ref_u"] = fdata["u"]
            return JSONResponse(content=pdata)
        except Exception as pred_err:
            print(f"[WARN] Failed sanitizing prediction artifact {target_path}: {pred_err}", flush=True)

    return FileResponse(
        target_path,
        media_type="application/json" if name.endswith(".json") else "application/octet-stream",
        filename=name
    )
