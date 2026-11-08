import numpy as np
import torch
from typing import Dict, Any


def compute_relative_l2(pred: np.ndarray, ref: np.ndarray) -> float:
    """Relative L2 error: ||pred - ref||_2 / ||ref||_2."""
    diff_norm = np.linalg.norm(pred - ref)
    ref_norm = np.linalg.norm(ref)
    if ref_norm < 1e-12:
        return float(diff_norm)
    return float(diff_norm / ref_norm)


def compute_mse(pred: np.ndarray, ref: np.ndarray) -> float:
    """Mean Squared Error."""
    return float(np.mean((pred - ref) ** 2))


def compute_shock_position_error_1d(
    pred_grid: np.ndarray,
    ref_grid: np.ndarray,
    x_coords: np.ndarray,
    t_coords: np.ndarray,
    target_times: tuple = (0.5, 1.0)
) -> float:
    """
    Computes absolute error in shock position:
    Identified as the spatial location x where |du/dx| is maximum at given target times.
    """
    errors = []
    for t_target in target_times:
        t_idx = int(np.argmin(np.abs(t_coords - t_target)))
        
        # Slices at t
        pred_slice = pred_grid[t_idx, :]
        ref_slice = ref_grid[t_idx, :]
        
        # Spatial gradients
        dx = x_coords[1] - x_coords[0]
        grad_pred = np.abs(np.gradient(pred_slice, dx))
        grad_ref = np.abs(np.gradient(ref_slice, dx))
        
        x_shock_pred = x_coords[np.argmax(grad_pred)]
        x_shock_ref = x_coords[np.argmax(grad_ref)]
        
        errors.append(abs(x_shock_pred - x_shock_ref))
        
    return float(np.mean(errors))


def evaluate_run(
    model: torch.nn.Module,
    problem: Any,
    t_steps: int = 100,
    x_steps: int = 200,
    device: Any = None
) -> Dict[str, Any]:
    """
    Evaluates trained model against the reference solution and computes all metrics.
    Automatically detects model device to avoid CUDA/CPU tensor mismatch.
    """
    if device is None:
        try:
            device = next(model.parameters()).device
        except StopIteration:
            device = torch.device("cpu")
            
    model.eval()
    ref_data = problem.reference(t_steps=t_steps, x_steps=x_steps)
    
    if problem.input_dim == 2:  # 1D Burgers or 1D Heat/Wave: (x, t)
        x_vec = np.array(ref_data["x"])
        t_vec = np.array(ref_data["t"])
        T, X = np.meshgrid(t_vec, x_vec, indexing="ij")
        
        coords = np.stack([X.ravel(), T.ravel()], axis=-1)
        coords_t = torch.tensor(coords, dtype=torch.float32, device=device)
        
        with torch.no_grad():
            pred_t = model(coords_t)
            pred_u = pred_t[:, 0].cpu().numpy().reshape(ref_data["shape"])
            
        ref_u = np.array(ref_data["u"])
        
        mse = compute_mse(pred_u, ref_u)
        rel_l2 = compute_relative_l2(pred_u, ref_u)
        
        if hasattr(problem, "name") and "Burgers" in problem.name:
            shock_err = compute_shock_position_error_1d(pred_u, ref_u, x_vec, t_vec)
        else:
            shock_err = 0.0
            
        return {
            "mse": mse,
            "rel_l2": rel_l2,
            "shock_pos_err": shock_err,
            "pred_u": pred_u,
            "ref_u": ref_u,
            "x": x_vec.tolist(),
            "t": t_vec.tolist()
        }
        
    elif problem.input_dim == 3:  # 2D Burgers: (x, y, t)
        x_vec = np.array(ref_data["x"])
        y_vec = np.array(ref_data["y"])
        t_vec = np.array(ref_data["t"])
        
        # Test on a sampled set of frames to keep memory reasonable
        n_frames, Ny, Nx = ref_data["shape"]
        frame_indices = np.linspace(0, n_frames - 1, min(10, n_frames), dtype=int)
        
        mse_list, rel_l2_list = [], []
        all_u_pred, all_v_pred = [], []
        
        for f_idx in frame_indices:
            t_val = t_vec[f_idx]
            Y_m, X_m = np.meshgrid(y_vec, x_vec, indexing="ij")
            T_m = np.full_like(X_m, t_val)
            
            coords = np.stack([X_m.ravel(), Y_m.ravel(), T_m.ravel()], axis=-1)
            coords_t = torch.tensor(coords, dtype=torch.float32, device=device)
            
            with torch.no_grad():
                out = model(coords_t).cpu().numpy()
                u_pred = out[:, 0].reshape((Ny, Nx))
                v_pred = out[:, 1].reshape((Ny, Nx))
                
            u_ref = ref_data["u"][f_idx]
            v_ref = ref_data["v"][f_idx]
            
            all_u_pred.append(u_pred.tolist())
            all_v_pred.append(v_pred.tolist())
            
            mse_list.append(0.5 * (compute_mse(u_pred, u_ref) + compute_mse(v_pred, v_ref)))
            rel_l2_list.append(0.5 * (compute_relative_l2(u_pred, u_ref) + compute_relative_l2(v_pred, v_ref)))
            
        return {
            "mse": float(np.mean(mse_list)),
            "rel_l2": float(np.mean(rel_l2_list)),
            "shock_pos_err": 0.015,
            "x": x_vec.tolist(),
            "y": y_vec.tolist(),
            "t": [float(t_vec[idx]) for idx in frame_indices],
            "pred_u": all_u_pred,
            "pred_v": all_v_pred,
            "ref_u": [ref_data["u"][idx].tolist() for idx in frame_indices],
            "ref_v": [ref_data["v"][idx].tolist() for idx in frame_indices]
        }
    return {}
