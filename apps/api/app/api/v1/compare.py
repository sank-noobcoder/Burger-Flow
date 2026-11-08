import os
import json
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from apps.api.app.models.db import get_db, User
from apps.api.app.core.dependencies import get_current_user
from apps.api.app.schemas.run import CompareResponse, RunDetail, RunMetricsSummary
from apps.api.app.repositories import runs_repo
from apps.api.app.core.config import settings

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

        detail = RunDetail(
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
        runs_list.append(detail)
        
        summary_table.append({
            "id": run.id,
            "name": run.name,
            "dimension": run.dimension,
            "model_type": run.model_type,
            "status": run.status,
            "seed": run.seed,
            "final_l2": final_l2,
            "mse": mse,
            "shock_pos_err": shock_pos_err,
            "epochs": run.epochs,
            "wall_clock_s": run.wall_clock_s
        })
        
        m_type = run.model_type.upper()
        if m_type not in metrics_by_model:
            metrics_by_model[m_type] = {"mse": [], "rel_l2": [], "shock_pos_err": []}
            
        if mse is not None:
            metrics_by_model[m_type]["mse"].append(mse)
        if final_l2 is not None:
            metrics_by_model[m_type]["rel_l2"].append(final_l2)
        if shock_pos_err is not None:
            metrics_by_model[m_type]["shock_pos_err"].append(shock_pos_err)

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
