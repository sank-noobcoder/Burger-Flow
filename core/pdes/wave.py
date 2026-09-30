import torch
import numpy as np
from typing import Dict, Any, Tuple
from core.pdes.base import PDEProblem


class Wave1D(PDEProblem):
    """
    1D Wave Equation:
      u_tt = c^2 * u_xx
      x in [0, 1], t in [0, t_max]
      IC: u(x, 0) = sin(pi * x), u_t(x, 0) = 0
      BC: u(0, t) = u(1, t) = 0
      Analytical solution: u(x, t) = sin(pi * x) * cos(c * pi * t)
    """

    def __init__(self, c: float = 1.0, t_max: float = 1.0):
        super().__init__(name="Wave1D", input_dim=2, output_dim=1)
        self.c = c
        self.t_max = t_max

    def residual(self, model: torch.nn.Module, coords: torch.Tensor) -> torch.Tensor:
        if not coords.requires_grad:
            coords.requires_grad_(True)
        u = model(coords)
        grads = torch.autograd.grad(u, coords, grad_outputs=torch.ones_like(u), create_graph=True)[0]
        u_x = grads[:, 0:1]
        u_t = grads[:, 1:2]
        
        u_xx = torch.autograd.grad(u_x, coords, grad_outputs=torch.ones_like(u_x), create_graph=True)[0][:, 0:1]
        u_tt = torch.autograd.grad(u_t, coords, grad_outputs=torch.ones_like(u_t), create_graph=True)[0][:, 1:2]
        
        return u_tt - (self.c ** 2) * u_xx

    def sample_ic(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        x = np.random.uniform(0, 1, (n_points, 1))
        t = np.zeros((n_points, 1))
        u = np.sin(np.pi * x)
        return torch.tensor(np.hstack([x, t]), dtype=torch.float32, device=device), torch.tensor(u, dtype=torch.float32, device=device)

    def sample_bc(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        half = n_points // 2
        t1 = np.random.uniform(0, self.t_max, (half, 1))
        x1 = np.zeros((half, 1))
        t2 = np.random.uniform(0, self.t_max, (n_points - half, 1))
        x2 = np.ones((n_points - half, 1))
        coords = np.vstack([np.hstack([x1, t1]), np.hstack([x2, t2])])
        return torch.tensor(coords, dtype=torch.float32, device=device), torch.zeros((n_points, 1), dtype=torch.float32, device=device)

    def sample_collocation(self, n_points: int, device: torch.device = torch.device("cpu")) -> torch.Tensor:
        from core.sampling.lhs import latin_hypercube_sample
        pts = latin_hypercube_sample([(0.0, 1.0), (0.0, self.t_max)], n_points)
        return torch.tensor(pts, dtype=torch.float32, device=device)

    def reference(self, t_steps: int = 100, x_steps: int = 100) -> Dict[str, Any]:
        x = np.linspace(0, 1, x_steps)
        t = np.linspace(0, self.t_max, t_steps)
        T, X = np.meshgrid(t, x, indexing="ij")
        u = np.sin(np.pi * X) * np.cos(self.c * np.pi * T)
        return {"x": x.tolist(), "t": t.tolist(), "u": u, "shape": [t_steps, x_steps]}
