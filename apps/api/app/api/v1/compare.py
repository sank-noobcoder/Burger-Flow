import json
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from apps.api.app.models.db import get_db, User
from apps.api.app.core.dependencies import get_current_user
from apps.api.app.schemas.run import CompareResponse, RunDetail, RunMetricsSummary
from apps.api.app.repositories import runs_repo

router = APIRouter(prefix="/compare", tags=["compare"])


@router.get("", response_model=CompareResponse)
def compare_runs(
    ids: str = Query(..., description="Comma-separated run IDs to compare (e.g. id1,id2,id3)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run_ids = [rid.strip() for rid in ids.split(",") if rid.strip()]
    if not run_ids:
        raise HTTPException(status_code=400, detail="At least one run ID must be provided")
    if len(run_ids) > 10:
        raise HTTPException(status_code=400, detail="Cannot compare more than 10 runs simultaneously")
        
    runs_list = []
    summary_table = []
    
    # Group metrics by model_type
    metrics_by_model = {}
    
    for rid in run_ids:
        u_id = None if user.role == "admin" else user.id
        run = runs_repo.get_owned_run(db, rid, u_id)
        if not run:
            continue
            
        cfg = json.loads(run.config_json) if run.config_json else {}
        arts = [a.name for a in run.artifacts]
        
        detail = RunDetail(
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
        runs_list.append(detail)
        
        summary_table.append({
            "id": run.id,
            "name": run.name,
            "dimension": run.dimension,
            "model_type": run.model_type,
            "status": run.status,
            "seed": run.seed,
            "final_l2": run.final_l2,
            "mse": run.mse,
            "shock_pos_err": run.shock_pos_err,
            "epochs": run.epochs,
            "wall_clock_s": run.wall_clock_s
        })
        
        m_type = run.model_type.upper()
        if m_type not in metrics_by_model:
            metrics_by_model[m_type] = {"mse": [], "rel_l2": [], "shock_pos_err": []}
            
        if run.mse is not None:
            metrics_by_model[m_type]["mse"].append(run.mse)
        if run.final_l2 is not None:
            metrics_by_model[m_type]["rel_l2"].append(run.final_l2)
        if run.shock_pos_err is not None:
            metrics_by_model[m_type]["shock_pos_err"].append(run.shock_pos_err)

    mean_metrics = {}
    std_metrics = {}
    
    for m_type, vals in metrics_by_model.items():
        mean_metrics[m_type] = {}
        std_metrics[m_type] = {}
        for k in ["mse", "rel_l2", "shock_pos_err"]:
            arr = np.array(vals[k]) if len(vals[k]) > 0 else np.array([0.0])
            mean_metrics[m_type][k] = float(np.mean(arr))
            std_metrics[m_type][k] = float(np.std(arr))

    return CompareResponse(
        runs=runs_list,
        summary_table=summary_table,
        mean_metrics=mean_metrics,
        std_metrics=std_metrics
    )
