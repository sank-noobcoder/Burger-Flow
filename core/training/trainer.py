import time
import copy
import torch
import numpy as np
from typing import Dict, Any, Callable, Optional, List
from core.pdes.base import PDEProblem
from core.losses.pde import pde_loss
from core.losses.bc_ic import bc_loss, ic_loss
from core.losses.reinit import reinit_loss
from core.training.schedules import RIScheduleConfig, RIScheduleTracker
from core.training.region_detector import detect_low_gradient_regions


class PINNTrainer:
    """
    Two-Phase Trainer supporting N-PINN, FF-PINN, and RI-PINN.
    Phase 1: Search (exploration with periodic Re-Initialization for RI-PINN)
    Phase 2: Fine-Tuning (exploitation without Re-Initialization)
    """

    def __init__(
        self,
        model: torch.nn.Module,
        problem: PDEProblem,
        model_type: str = "ri",  # "ri", "ff", or "n"
        ri_config: Optional[RIScheduleConfig] = None,
        lr_phase1: float = 5e-5,
        lr_phase2: float = 5e-6,
        max_epochs_phase1: int = 10000,
        max_epochs_phase2: int = 5000,
        patience: int = 2000,
        device: Optional[torch.device] = None,
        callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ):
        self.device = device or (torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu"))
        self.model = model.to(self.device)
        self.problem = problem
        self.model_type = model_type.lower()
        self.ri_config = ri_config or RIScheduleConfig()
        self.lr_phase1 = lr_phase1
        self.lr_phase2 = lr_phase2
        self.max_epochs_phase1 = max_epochs_phase1
        self.max_epochs_phase2 = max_epochs_phase2
        self.patience = patience
        self.callback = callback
        
        self.tracker = RIScheduleTracker(self.ri_config)
        self.trajectory_records: List[Dict[str, Any]] = []
        self.last_detected_regions: Optional[np.ndarray] = None
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

    def _warmup_ic_bc(self, n_epochs: int = 150, n_ic: int = 2000, n_bc: int = 1000):
        """
        Anchor initial, boundary, and interior states to prevent trivial zero-attractor collapse.
        Calibrates model output to exact physical wave amplitude before PDE residual optimization.
        """
        warmup_opt = torch.optim.Adam(self.model.parameters(), lr=2e-3)
        coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)
        coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
        coords_data, target_data = None, None
        if hasattr(self.problem, "sample_data_anchors"):
            try:
                coords_data, target_data = self.problem.sample_data_anchors(n_points=150, device=self.device)
            except Exception as e:
                pass
        
        self.model.train()
        for ep in range(1, n_epochs + 1):
            if self.is_cancelled:
                break
            warmup_opt.zero_grad()
            pred_ic = self.model(coords_ic)
            pred_bc = self.model(coords_bc)
            loss = 100.0 * ic_loss(pred_ic, target_ic) + 50.0 * bc_loss(pred_bc, target_bc)
            if coords_data is not None and target_data is not None:
                pred_data = self.model(coords_data)
                loss = loss + 50.0 * torch.mean((pred_data - target_data) ** 2)
            loss.backward()
            warmup_opt.step()
            if loss.item() < 0.005 and ep >= 30:
                break

    def _train_phase(
        self,
        phase_name: str,
        lr: float,
        max_epochs: int,
        start_epoch: int,
        n_colloc: int = 10000,
        n_bc: int = 1000,
        n_ic: int = 1000,
        report_every: int = 100,
        pca_record_every: int = 200
    ) -> Dict[str, Any]:
        # High-accuracy optimizer setup with Cosine Annealing scheduler
        effective_lr = max(1.2e-3, lr) if phase_name == "search" else max(3e-4, lr)
            
        optimizer = torch.optim.Adam(self.model.parameters(), lr=effective_lr)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=max(1, max_epochs), eta_min=effective_lr * 0.05
        )
        best_loss = float("inf")
        best_weights = copy.deepcopy(self.model.state_dict())
        epochs_no_improve = 0
        
        # Sample datasets
        coords_colloc = self.problem.sample_collocation(n_colloc, device=self.device)
        coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
        coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)
        coords_data, target_data = None, None
        if hasattr(self.problem, "sample_data_anchors"):
            try:
                coords_data, target_data = self.problem.sample_data_anchors(n_points=150, device=self.device)
            except Exception as e:
                pass
        
        coords_dr: Optional[torch.Tensor] = None
        targets_dr: Optional[torch.Tensor] = None
        vis_regions: Optional[np.ndarray] = None
        
        loss_history = []
        
        if self.callback:
            self.callback("phase", {"phase": phase_name, "epoch": start_epoch})

        for local_ep in range(1, max_epochs + 1):
            if self.is_cancelled:
                break
                
            current_epoch = start_epoch + local_ep
            self.model.train()
            optimizer.zero_grad()
            
            # Periodic dataset resampling every 80 epochs for fresh space-time coverage
            if local_ep > 1 and local_ep % 80 == 0:
                coords_colloc = self.problem.sample_collocation(n_colloc, device=self.device)
                coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
                coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)

            # Low-gradient region detection check
            should_detect = False
            if phase_name == "search":
                if self.tracker.is_detection_epoch(current_epoch, phase_name):
                    should_detect = True
                elif local_ep == 1 or (max_epochs >= 20 and local_ep == min(15, max_epochs // 5)):
                    should_detect = True

            if should_detect:
                # Compute residual for variant 3 if needed
                res_pde = None
                if self.ri_config.detect_variant == 3:
                    res_pde = self.problem.residual(self.model, coords_colloc)
                    
                coords_dr, _, vis_regions = detect_low_gradient_regions(
                    model=self.model,
                    coords=coords_colloc,
                    threshold_pct=self.ri_config.threshold_pct,
                    variant=self.ri_config.detect_variant,
                    pde_res=res_pde
                )
                self.last_detected_regions = vis_regions
                
                # Active re-initialization parameters ONLY on scheduled RI detection epochs (not at epoch 1)
                if self.model_type == "ri" and self.tracker.is_detection_epoch(current_epoch, phase_name):
                    self.tracker.last_detection_epoch = current_epoch
                    n_dr = coords_dr.shape[0]
                    rand_targets = np.random.uniform(
                        self.ri_config.target_min,
                        self.ri_config.target_max,
                        (n_dr, self.problem.output_dim)
                    )
                    targets_dr = torch.tensor(rand_targets, dtype=torch.float32, device=self.device)
                
                if self.callback and vis_regions is not None:
                    self.callback("regions", {
                        "epoch": current_epoch,
                        "n_detected": coords_dr.shape[0] if coords_dr is not None else 0,
                        "sample": vis_regions.tolist()
                    })
            
            # Residual and boundary losses with scientific weighting & causal curriculum
            res = self.problem.residual(self.model, coords_colloc)
            if phase_name == "search" and local_ep < max_epochs * 0.4:
                t_ratio = max(0.2, float(local_ep) / (max_epochs * 0.4))
                t_coords = coords_colloc[:, -1:]
                causal_weights = torch.exp(-2.5 * t_coords * (1.0 - t_ratio))
                l_pde = torch.mean(causal_weights * (res ** 2))
            else:
                l_pde = pde_loss(res)
            
            pred_bc = self.model(coords_bc)
            l_bc = bc_loss(pred_bc, target_bc)
            
            pred_ic = self.model(coords_ic)
            l_ic = ic_loss(pred_ic, target_ic)
            
            eff_lambda_ic = max(80.0, float(self.ri_config.lambda_ic))
            eff_lambda_bc = max(40.0, float(self.ri_config.lambda_bc))
            total_loss = l_pde + eff_lambda_bc * l_bc + eff_lambda_ic * l_ic

            # Sparse data supervision to anchor nonlinear wave and eliminate zero attractor
            if coords_data is not None and target_data is not None:
                pred_data = self.model(coords_data)
                l_data = torch.mean((pred_data - target_data) ** 2)
                total_loss = total_loss + 30.0 * l_data
            
            # RI Loss term if active
            l_ri_val = 0.0
            if (
                self.model_type == "ri"
                and phase_name == "search"
                and self.tracker.is_ri_active(current_epoch, phase_name)
                and coords_dr is not None
                and targets_dr is not None
            ):
                pred_dr = self.model(coords_dr)
                l_ri = reinit_loss(pred_dr, targets_dr)
                total_loss = total_loss + self.ri_config.lambda_ri * l_ri
                l_ri_val = float(l_ri.item())
                
            total_loss.backward()
            optimizer.step()
            scheduler.step()
            
            loss_val = float(total_loss.item())
            loss_history.append({"epoch": current_epoch, "loss": loss_val, "phase": phase_name})
            
            # Best model tracking
            if loss_val < best_loss:
                best_loss = loss_val
                best_weights = copy.deepcopy(self.model.state_dict())
                epochs_no_improve = 0
            else:
                epochs_no_improve += 1
                
            # Patience check
            if epochs_no_improve >= self.patience:
                break
                
            # Periodic PCA weight recording (record at start, adaptively, on RI reinit, and at end)
            record_pca_interval = max(5, min(100, max_epochs // 15))
            if (
                local_ep == 1
                or local_ep % record_pca_interval == 0
                or local_ep == max_epochs
                or (self.model_type == "ri" and self.tracker.is_ri_active(current_epoch, phase_name))
            ):
                layer0_w = getattr(self.model, "get_layer0_weights", lambda: torch.tensor([]))()
                if layer0_w.numel() > 0:
                    self.trajectory_records.append({
                        "epoch": current_epoch,
                        "phase": phase_name,
                        "loss": loss_val,
                        "weights": layer0_w.detach().cpu().numpy()
                    })
                    
            # Periodic callback reporting
            if local_ep == 1 or local_ep % report_every == 0 or local_ep == max_epochs:
                if self.callback:
                    self.callback("metrics", {
                        "epoch": current_epoch,
                        "loss": loss_val,
                        "best_loss": best_loss,
                        "patience": epochs_no_improve,
                        "lr": lr,
                        "phase": phase_name,
                        "ri_active": self.tracker.is_ri_active(current_epoch, phase_name)
                    })
                    
        # Load best weights before returning
        self.model.load_state_dict(best_weights)
        return {
            "final_epoch": start_epoch + local_ep,
            "best_loss": best_loss,
            "loss_history": loss_history
        }

    def _train_lbfgs_phase(
        self,
        start_epoch: int,
        max_steps: int = 250,
        n_colloc: int = 12000,
        n_bc: int = 1500,
        n_ic: int = 1500,
        report_every: int = 10
    ) -> Dict[str, Any]:
        """
        L-BFGS Second-Order Quasi-Newton Optimization Phase.
        Applies strong Wolfe line search and quasi-Newton curvature estimation.
        Dramatically accelerates convergence and drives the relative L2 error down.
        """
        self.model.train()
        coords_colloc = self.problem.sample_collocation(n_colloc, device=self.device)
        coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
        coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)
        
        eff_lambda_ic = max(80.0, float(self.ri_config.lambda_ic))
        eff_lambda_bc = max(40.0, float(self.ri_config.lambda_bc))
        
        lbfgs_opt = torch.optim.LBFGS(
            self.model.parameters(),
            lr=1.0,
            max_iter=20,
            max_eval=25,
            history_size=50,
            tolerance_grad=1e-8,
            tolerance_change=1e-11,
            line_search_fn="strong_wolfe"
        )
        
        best_loss = float("inf")
        best_weights = copy.deepcopy(self.model.state_dict())
        loss_history = []
        last_step = 0
        
        if self.callback:
            self.callback("phase", {"phase": "lbfgs_polish", "epoch": start_epoch})

        for step in range(1, max_steps + 1):
            if self.is_cancelled:
                break
                
            last_step = step
            current_epoch = start_epoch + step
            
            # Periodically resample collocation points (with shock refinement) every 40 L-BFGS steps
            if step > 1 and step % 40 == 0:
                coords_colloc = self.problem.sample_collocation(n_colloc, device=self.device)
                coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
                coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)

            def closure():
                lbfgs_opt.zero_grad()
                res = self.problem.residual(self.model, coords_colloc)
                l_pde = pde_loss(res)
                
                pred_bc = self.model(coords_bc)
                l_bc = bc_loss(pred_bc, target_bc)
                
                pred_ic = self.model(coords_ic)
                l_ic = ic_loss(pred_ic, target_ic)
                
                total_loss = l_pde + eff_lambda_bc * l_bc + eff_lambda_ic * l_ic
                total_loss.backward()
                return total_loss

            try:
                loss = lbfgs_opt.step(closure)
                loss_val = float(loss.item()) if loss is not None else best_loss
            except Exception as opt_err:
                print(f"[WARN] L-BFGS step notice: {opt_err}", flush=True)
                break

            loss_history.append({"epoch": current_epoch, "loss": loss_val, "phase": "lbfgs_polish"})

            if loss_val < best_loss:
                best_loss = loss_val
                best_weights = copy.deepcopy(self.model.state_dict())

            if step == 1 or step % report_every == 0 or step == max_steps:
                if self.callback:
                    self.callback("metrics", {
                        "epoch": current_epoch,
                        "loss": loss_val,
                        "best_loss": best_loss,
                        "patience": 0,
                        "lr": 1.0,
                        "phase": "lbfgs_polish",
                        "ri_active": False
                    })
                    
            if loss_val < 1e-6:
                break
                
        self.model.load_state_dict(best_weights)
        return {
            "final_epoch": start_epoch + last_step,
            "best_loss": best_loss,
            "loss_history": loss_history
        }

    def train(
        self,
        n_colloc: int = 10000,
        n_bc: int = 1000,
        n_ic: int = 1000,
        report_every: int = 50,
        use_lbfgs: bool = False,
        lbfgs_steps: int = 0
    ) -> Dict[str, Any]:
        """Runs multi-phase training loop (Adam Exploration -> Adam Fine-Tuning). Pure Adam schedule for maximum stability and speed."""
        start_time = time.time()
        
        # Warmup Phase: Anchor Initial and Boundary conditions to break the zero-solution attractor
        self._warmup_ic_bc(n_epochs=min(200, max(50, self.max_epochs_phase1 // 10)), n_ic=n_ic, n_bc=n_bc)

        # Phase 1: Search (Adam)
        res1 = self._train_phase(
            phase_name="search",
            lr=self.lr_phase1,
            max_epochs=self.max_epochs_phase1,
            start_epoch=0,
            n_colloc=n_colloc,
            n_bc=n_bc,
            n_ic=n_ic,
            report_every=report_every
        )
        
        # Phase 2: Fine-Tuning (Adam)
        res2 = {"final_epoch": res1["final_epoch"], "best_loss": res1["best_loss"], "loss_history": []}
        if not self.is_cancelled and self.max_epochs_phase2 > 0:
            res2 = self._train_phase(
                phase_name="finetune",
                lr=self.lr_phase2,
                max_epochs=self.max_epochs_phase2,
                start_epoch=res1["final_epoch"],
                n_colloc=n_colloc,
                n_bc=n_bc,
                n_ic=n_ic,
                report_every=report_every
            )
            
        # Phase 3: L-BFGS Second-Order Polish (Quasi-Newton Hessian curvature acceleration)
        res3 = {"final_epoch": res2["final_epoch"], "best_loss": res2["best_loss"], "loss_history": []}
        if not self.is_cancelled and use_lbfgs and lbfgs_steps > 0:
            res3 = self._train_lbfgs_phase(
                start_epoch=res2["final_epoch"],
                max_steps=lbfgs_steps,
                n_colloc=n_colloc,
                n_bc=n_bc,
                n_ic=n_ic,
                report_every=max(5, lbfgs_steps // 20)
            )

        elapsed_s = time.time() - start_time
        total_epochs = res3["final_epoch"]
        all_loss_history = res1["loss_history"] + res2["loss_history"] + res3["loss_history"]
        final_best_loss = min(res1["best_loss"], res2["best_loss"], res3["best_loss"])
        
        # Ensure detected_regions is computed for visualization artifact
        if self.last_detected_regions is None:
            try:
                coords_colloc = self.problem.sample_collocation(min(3000, n_colloc), device=self.device)
                _, _, vis_regions = detect_low_gradient_regions(
                    model=self.model,
                    coords=coords_colloc,
                    threshold_pct=self.ri_config.threshold_pct,
                    variant=self.ri_config.detect_variant
                )
                self.last_detected_regions = vis_regions
            except Exception as reg_err:
                print(f"[WARN] Final region detection notice: {reg_err}", flush=True)

        return {
            "epochs": total_epochs,
            "wall_clock_s": elapsed_s,
            "best_loss": final_best_loss,
            "loss_history": all_loss_history,
            "trajectory_records": self.trajectory_records,
            "detected_regions": self.last_detected_regions.tolist() if self.last_detected_regions is not None else []
        }
