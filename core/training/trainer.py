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
        self.is_cancelled = False

    def cancel(self):
        self.is_cancelled = True

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
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        best_loss = float("inf")
        best_weights = copy.deepcopy(self.model.state_dict())
        epochs_no_improve = 0
        
        # Sample datasets
        coords_colloc = self.problem.sample_collocation(n_colloc, device=self.device)
        coords_bc, target_bc = self.problem.sample_bc(n_bc, device=self.device)
        coords_ic, target_ic = self.problem.sample_ic(n_ic, device=self.device)
        
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
            
            # Re-initialization detection check (only for RI-PINN in search phase)
            if self.model_type == "ri" and phase_name == "search":
                if self.tracker.is_detection_epoch(current_epoch, phase_name):
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
                    self.tracker.last_detection_epoch = current_epoch
                    
                    # Random targets for reinit
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
                            "n_detected": n_dr,
                            "sample": vis_regions.tolist()
                        })
            
            # Residual and boundary losses
            res = self.problem.residual(self.model, coords_colloc)
            l_pde = pde_loss(res)
            
            pred_bc = self.model(coords_bc)
            l_bc = bc_loss(pred_bc, target_bc)
            
            pred_ic = self.model(coords_ic)
            l_ic = ic_loss(pred_ic, target_ic)
            
            total_loss = l_pde + self.ri_config.lambda_bc * l_bc + self.ri_config.lambda_ic * l_ic
            
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
                
            # Periodic PCA weight recording
            if local_ep % pca_record_every == 0 or local_ep == 1:
                layer0_w = getattr(self.model, "get_layer0_weights", lambda: torch.tensor([]))()
                if layer0_w.numel() > 0:
                    self.trajectory_records.append({
                        "epoch": current_epoch,
                        "phase": phase_name,
                        "loss": loss_val,
                        "weights": layer0_w.numpy()
                    })
                    
            # Periodic callback reporting
            if local_ep % report_every == 0 or local_ep == max_epochs:
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

    def train(
        self,
        n_colloc: int = 10000,
        n_bc: int = 1000,
        n_ic: int = 1000,
        report_every: int = 50
    ) -> Dict[str, Any]:
        """Runs two-phase training loop."""
        start_time = time.time()
        
        # Phase 1: Search
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
        
        # Phase 2: Fine-Tuning
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
            
        elapsed_s = time.time() - start_time
        total_epochs = res2["final_epoch"]
        all_loss_history = res1["loss_history"] + res2["loss_history"]
        
        return {
            "epochs": total_epochs,
            "wall_clock_s": elapsed_s,
            "best_loss": res2["best_loss"],
            "loss_history": all_loss_history,
            "trajectory_records": self.trajectory_records
        }
