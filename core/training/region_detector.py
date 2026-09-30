import torch
import numpy as np
from typing import Tuple, Dict, Any


def compute_gradient_metric(
    model: torch.nn.Module,
    coords: torch.Tensor,
    variant: int = 1,
    pde_res: torch.Tensor = None
) -> torch.Tensor:
    """
    Computes region detection metric according to Lee et al. (Paper Eq. 3):
      metric = sum_{i, j} | dV_j / dX_i |
    
    Variants:
      1: |u_x| (or spatial gradient sum for 2D)
      2: |u_x| + |u_t| (spatial + temporal gradient sum)
      3: Variant 2 with high-residual points excluded from candidate low-gradient set
    """
    coords_req = coords.clone().detach().requires_grad_(True)
    out = model(coords_req)  # (N, out_dim)
    
    in_dim = coords.shape[1]
    out_dim = out.shape[1]
    
    spatial_dim = in_dim - 1  # Last coordinate is time t
    
    metric = torch.zeros(coords.shape[0], device=coords.device)
    
    for j in range(out_dim):
        yj = out[:, j:j+1]
        grads = torch.autograd.grad(
            yj, coords_req,
            grad_outputs=torch.ones_like(yj),
            create_graph=False,
            retain_graph=True
        )[0]
        
        # Spatial gradients
        for i in range(spatial_dim):
            metric += torch.abs(grads[:, i])
            
        # Temporal gradient (if variant 2 or 3)
        if variant in [2, 3]:
            metric += torch.abs(grads[:, -1])
            
    if variant == 3 and pde_res is not None:
        # Exclude points where residual is high (e.g., top 10% highest residual)
        res_mag = torch.sum(pde_res.detach() ** 2, dim=-1)
        res_cutoff = torch.quantile(res_mag, 0.90)
        # Give high residual points an artificially huge metric so they aren't chosen as low-gradient
        metric = torch.where(res_mag > res_cutoff, metric + 1e6, metric)
        
    return metric


def detect_low_gradient_regions(
    model: torch.nn.Module,
    coords: torch.Tensor,
    threshold_pct: float = 30.0,
    variant: int = 1,
    pde_res: torch.Tensor = None
) -> Tuple[torch.Tensor, torch.Tensor, np.ndarray]:
    """
    Identifies the lowest A% (e.g. 30%) gradient points.
    Returns:
      coords_dr: Tensor (N_dr, in_dim)
      indices_dr: Tensor (N_dr,)
      coords_dr_np: downsampled numpy array of detected points for visualization
    """
    metric = compute_gradient_metric(model, coords, variant=variant, pde_res=pde_res)
    
    n_points = coords.shape[0]
    k = max(1, int(n_points * (threshold_pct / 100.0)))
    
    # Smallest k values
    _, lowest_indices = torch.topk(metric, k=k, largest=False)
    
    coords_dr = coords[lowest_indices].clone().detach()
    
    # Downsample for lightweight frontend transmission (e.g. max 150 points)
    sample_size = min(150, k)
    if k > sample_size:
        perm = torch.randperm(k)[:sample_size]
        vis_coords = coords_dr[perm].detach().cpu().numpy()
    else:
        vis_coords = coords_dr.detach().cpu().numpy()
        
    return coords_dr, lowest_indices, vis_coords
