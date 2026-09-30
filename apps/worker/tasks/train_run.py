import os
import json
import yaml
import time
import torch
import numpy as np
from apps.api.app.models.db import SessionLocal
from apps.api.app.repositories import runs_repo
from apps.api.app.core.config import settings
from apps.api.app.core.events import broker

from core.pdes.burgers1d import Burgers1D
from core.pdes.burgers2d import Burgers2D
from core.models.mlp import MLP
from core.models.fourier_features import FFPINN
from core.training.schedules import RIScheduleConfig
from core.training.trainer import PINNTrainer
from core.evaluation.metrics import evaluate_run
from core.evaluation.pca import compute_pca_trajectory


active_trainers = {}


def cancel_run_worker(run_id: str):
    if run_id in active_trainers:
        active_trainers[run_id].cancel()


def run_training_task(run_id: str):
    """Executes a training run end to end, publishing live metrics and writing artifacts."""
    db = SessionLocal()
    try:
        run = db.query(runs_repo.Run).filter(runs_repo.Run.id == run_id).first()
        if not run:
            return
            
        runs_repo.update_run_status(db, run_id, status="running", phase="search", progress=5.0)
        config = json.loads(run.config_json)
        
        dim = config.get("dimension", 1)
        prob_cfg = config.get("problem", {})
        model_cfg = config.get("model", {})
        ri_cfg_dict = config.get("ri", {})
        train_cfg = config.get("training", {})
        
        # 1. Build PDE Problem
        if dim == 1:
            problem = Burgers1D(
                nu=prob_cfg.get("nu", 0.01 / np.pi),
                t_max=prob_cfg.get("t_max", 1.0),
                x_min=prob_cfg.get("x_min", -1.0),
                x_max=prob_cfg.get("x_max", 1.0),
                ic_preset=prob_cfg.get("ic_preset", "b1d_shock")
            )
            in_dim = 2
            out_dim = 1
        else:
            problem = Burgers2D(
                nu=prob_cfg.get("nu", 0.003),
                t_max=prob_cfg.get("t_max", 1.0),
                ic_preset=prob_cfg.get("ic_preset", "b2d_gaussian_pulse")
            )
            in_dim = 3
            out_dim = 2
            
        # 2. Build Model
        m_type = model_cfg.get("type", "ri").lower()
        layers = model_cfg.get("layers", 6)
        width = model_cfg.get("width", 128)
        act = model_cfg.get("activation", "tanh")
        
        if m_type == "n":
            model = MLP(in_dim=in_dim, out_dim=out_dim, layers=layers, width=width, activation=act)
        else:  # "ff" or "ri"
            f_size = model_cfg.get("fourier_size", 128)
            f_sigma = model_cfg.get("fourier_sigma", 3.0)
            model = FFPINN(
                in_dim=in_dim,
                out_dim=out_dim,
                layers=layers,
                width=width,
                fourier_size=f_size,
                fourier_sigma=f_sigma,
                activation=act
            )
            
        # 3. Schedule config
        ri_config = RIScheduleConfig(
            threshold_pct=ri_cfg_dict.get("threshold_pct", 30.0),
            period=ri_cfg_dict.get("period", 2000),
            duration=ri_cfg_dict.get("duration", 500),
            lambda_ri=ri_cfg_dict.get("lambda_ri", 1.0),
            lambda_bc=ri_cfg_dict.get("lambda_bc", 5.0),
            lambda_ic=ri_cfg_dict.get("lambda_ic", 1.0),
            detect_variant=ri_cfg_dict.get("detect_variant", 1)
        )
        
        max_p1 = train_cfg.get("max_epochs_phase1", 10000)
        max_p2 = train_cfg.get("max_epochs_phase2", 5000)
        total_target_epochs = max_p1 + max_p2
        
        last_publish_time = [0.0]
        
        # Callback for real-time progress
        def on_event(evt_type: str, data: dict):
            now = time.time()
            if evt_type == "metrics":
                cur_ep = data.get("epoch", 0)
                prog = min(99.0, (cur_ep / max(1, total_target_epochs)) * 100.0)
                runs_repo.update_run_status(
                    db, run_id,
                    status="running",
                    phase=data.get("phase", "search"),
                    progress=round(prog, 1),
                    best_loss=data.get("best_loss")
                )
                runs_repo.add_run_metric(
                    db, run_id,
                    epoch=cur_ep,
                    loss=data.get("loss", 0.0),
                    best_loss=data.get("best_loss", 0.0),
                    patience=data.get("patience", 0),
                    phase=data.get("phase", "search")
                )
                
            # Throttle stream broadcasts to ~1 per 0.5 - 1.5 seconds for UI
            if evt_type in ["phase", "regions", "done"] or (now - last_publish_time[0]) >= 0.8:
                last_publish_time[0] = now
                broker.publish_sync(run_id, evt_type, data)

        trainer = PINNTrainer(
            model=model,
            problem=problem,
            model_type=m_type,
            ri_config=ri_config,
            lr_phase1=train_cfg.get("lr_phase1", 5e-5),
            lr_phase2=train_cfg.get("lr_phase2", 5e-6),
            max_epochs_phase1=max_p1,
            max_epochs_phase2=max_p2,
            patience=train_cfg.get("patience", 3000),
            callback=on_event
        )
        
        active_trainers[run_id] = trainer
        
        # Train
        train_result = trainer.train(
            n_colloc=train_cfg.get("n_colloc", 15000),
            n_bc=train_cfg.get("n_bc", 1500),
            n_ic=train_cfg.get("n_ic", 1500),
            report_every=max(10, min(100, max_p1 // 100))
        )
        
        if trainer.is_cancelled:
            runs_repo.update_run_status(db, run_id, status="cancelled")
            broker.publish_sync(run_id, "done", {"status": "cancelled"})
            return
            
        # 4. Evaluation vs Reference
        eval_metrics = evaluate_run(
            model=model,
            problem=problem,
            t_steps=100 if dim == 1 else 30,
            x_steps=200 if dim == 1 else 50
        )
        
        # 5. Compute PCA Trajectory
        pca_result = compute_pca_trajectory(train_result.get("trajectory_records", []))
        
        # 6. Save Artifacts to Storage
        art_dir = os.path.join(settings.ARTIFACTS_DIR, run_id)
        os.makedirs(art_dir, exist_ok=True)
        
        # config.yaml
        cfg_path = os.path.join(art_dir, "config.yaml")
        with open(cfg_path, "w") as f:
            yaml.dump(config, f)
        runs_repo.add_artifact(db, run_id, "config.yaml", cfg_path, os.path.getsize(cfg_path), "text/yaml")
        
        # loss_history.json
        loss_path = os.path.join(art_dir, "loss_history.json")
        with open(loss_path, "w") as f:
            json.dump(train_result.get("loss_history", []), f)
        runs_repo.add_artifact(db, run_id, "loss_history.json", loss_path, os.path.getsize(loss_path), "application/json")
        
        # pca.json
        pca_path = os.path.join(art_dir, "pca.json")
        with open(pca_path, "w") as f:
            json.dump(pca_result, f)
        runs_repo.add_artifact(db, run_id, "pca.json", pca_path, os.path.getsize(pca_path), "application/json")
        
        # prediction_final.json
        pred_path = os.path.join(art_dir, "prediction_final.json")
        with open(pred_path, "w") as f:
            json.dump({
                "mse": eval_metrics.get("mse"),
                "rel_l2": eval_metrics.get("rel_l2"),
                "shock_pos_err": eval_metrics.get("shock_pos_err"),
                "x": eval_metrics.get("x", []),
                "t": eval_metrics.get("t", []),
                "pred_u": eval_metrics.get("pred_u", np.array([])).tolist() if isinstance(eval_metrics.get("pred_u"), np.ndarray) else [],
                "ref_u": eval_metrics.get("ref_u", np.array([])).tolist() if isinstance(eval_metrics.get("ref_u"), np.ndarray) else []
            }, f)
        runs_repo.add_artifact(db, run_id, "prediction_final.json", pred_path, os.path.getsize(pred_path), "application/json")
        
        # Update Run Record with Succeeded status & metrics
        runs_repo.update_run_status(
            db, run_id,
            status="succeeded",
            phase="finetune",
            progress=100.0,
            best_loss=train_result.get("best_loss"),
            final_l2=eval_metrics.get("rel_l2"),
            mse=eval_metrics.get("mse"),
            shock_pos_err=eval_metrics.get("shock_pos_err"),
            epochs=train_result.get("epochs", 0),
            wall_clock_s=round(train_result.get("wall_clock_s", 0.0), 2)
        )
        
        # Deduct / record GPU minutes from Quota
        quota = runs_repo.get_user_quota(db, run.user_id)
        if quota:
            gpu_min = train_result.get("wall_clock_s", 0.0) / 60.0
            quota.gpu_min_used = round(quota.gpu_min_used + gpu_min, 2)
            db.commit()
            
        broker.publish_sync(run_id, "done", {
            "status": "succeeded",
            "epochs": train_result.get("epochs"),
            "final_l2": eval_metrics.get("rel_l2"),
            "mse": eval_metrics.get("mse")
        })
        
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        print(f"Error in training run {run_id}: {err_msg}")
        runs_repo.update_run_status(db, run_id, status="failed", error_message=str(e))
        broker.publish_sync(run_id, "error", {"code": "training_failed", "message": str(e)})
    finally:
        active_trainers.pop(run_id, None)
        db.close()
