import torch
import numpy as np
from typing import Dict, Any, Tuple
from core.pdes.base import PDEProblem
from core.reference.cole_hopf import generate_1d_reference_grid, cole_hopf_solution


class Burgers1D(PDEProblem):
    """
    1D Viscous Burgers' Equation:
      u_t + u * u_x = nu * u_xx
      x in [-1, 1], t in [0, t_max]
      IC: u(x, 0) = -sin(pi * x)
      BC: u(-1, t) = u(1, t) = 0
    """

    def __init__(
        self,
        nu: float = 0.01 / np.pi,
        t_max: float = 1.0,
        x_min: float = -1.0,
        x_max: float = 1.0,
        ic_preset: str = "b1d_shock"
    ):
        super().__init__(name="Burgers1D", input_dim=2, output_dim=1)
        self.nu = nu
        self.t_max = t_max
        self.x_min = x_min
        self.x_max = x_max
        self.ic_preset = ic_preset

    def residual(self, model: torch.nn.Module, coords: torch.Tensor) -> torch.Tensor:
        """
        Compute autograd PDE residual:
          r = u_t + u * u_x - nu * u_xx
        coords: Tensor of shape (N, 2) where coords[:, 0] = x, coords[:, 1] = t
        """
        coords = coords.clone().detach().requires_grad_(True)
        u = model(coords)  # (N, 1)
        
        # First derivatives
        grads = torch.autograd.grad(
            u, coords,
            grad_outputs=torch.ones_like(u),
            create_graph=True,
            retain_graph=True
        )[0]
        
        u_x = grads[:, 0:1]
        u_t = grads[:, 1:2]
        
        # Second derivative u_xx
        u_xx = torch.autograd.grad(
            u_x, coords,
            grad_outputs=torch.ones_like(u_x),
            create_graph=True,
            retain_graph=True
        )[0][:, 0:1]
        
        res = u_t + u * u_x - self.nu * u_xx
        return res

    def sample_ic(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """Sample initial condition points at t=0."""
        x = np.random.uniform(self.x_min, self.x_max, (n_points, 1))
        t = np.zeros((n_points, 1))
        coords = np.hstack([x, t])
        
        if self.ic_preset in ["b1d_shock", "neg_sin", "b1d_control"]:
            u_target = -np.sin(np.pi * x)
        else:
            u_target = -np.sin(np.pi * x)
            
        return (
            torch.tensor(coords, dtype=torch.float32, device=device),
            torch.tensor(u_target, dtype=torch.float32, device=device)
        )

    def sample_bc(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """Sample Dirichlet boundary conditions at x = -1 and x = 1."""
        half = n_points // 2
        t1 = np.random.uniform(0.0, self.t_max, (half, 1))
        x1 = np.full((half, 1), self.x_min)
        
        t2 = np.random.uniform(0.0, self.t_max, (n_points - half, 1))
        x2 = np.full((n_points - half, 1), self.x_max)
        
        coords = np.vstack([np.hstack([x1, t1]), np.hstack([x2, t2])])
        targets = np.zeros((n_points, 1))
        
        return (
            torch.tensor(coords, dtype=torch.float32, device=device),
            torch.tensor(targets, dtype=torch.float32, device=device)
        )

    def sample_collocation(self, n_points: int, device: torch.device = torch.device("cpu")) -> torch.Tensor:
        """Sample space-time collocation points via Latin Hypercube Sampling or uniform."""
        from core.sampling.lhs import latin_hypercube_sample
        bounds = [(self.x_min, self.x_max), (0.0, self.t_max)]
        pts = latin_hypercube_sample(bounds, n_points)
        return torch.tensor(pts, dtype=torch.float32, device=device)

    def reference(self, t_steps: int = 100, x_steps: int = 256) -> Dict[str, Any]:
        """Compute exact Cole-Hopf reference solution."""
        return generate_1d_reference_grid(
            nu=self.nu,
            nx=x_steps,
            nt=t_steps,
            x_range=(self.x_min, self.x_max),
            t_range=(0.0, self.t_max)
        )
