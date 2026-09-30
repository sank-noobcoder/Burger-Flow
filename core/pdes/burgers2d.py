import torch
import numpy as np
from typing import Dict, Any, Tuple
from core.pdes.base import PDEProblem
from core.reference.fd_solver_2d import solve_2d_burgers


class Burgers2D(PDEProblem):
    """
    2D Viscous Burgers' Equations:
      u_t + u*u_x + v*u_y = nu*(u_xx + u_yy)
      v_t + u*v_x + v*v_y = nu*(v_xx + v_yy)
      (x, y) in [0, 1]^2, t in [0, t_max]
      BC: u = v = 0 on all 4 boundaries (x=0, x=1, y=0, y=1)
    """

    def __init__(
        self,
        nu: float = 0.003,
        t_max: float = 1.0,
        ic_preset: str = "b2d_gaussian_pulse"
    ):
        super().__init__(name="Burgers2D", input_dim=3, output_dim=2)
        self.nu = nu
        self.t_max = t_max
        self.ic_preset = ic_preset

    def residual(self, model: torch.nn.Module, coords: torch.Tensor) -> torch.Tensor:
        """
        Compute autograd PDE residuals for both momentum components:
          r_u = u_t + u*u_x + v*u_y - nu*(u_xx + u_yy)
          r_v = v_t + u*v_x + v*v_y - nu*(v_xx + v_yy)
        coords: Tensor of shape (N, 3) where coords[:, 0]=x, coords[:, 1]=y, coords[:, 2]=t
        Returns: Tensor of shape (N, 2) [r_u, r_v]
        """
        coords = coords.clone().detach().requires_grad_(True)
        out = model(coords)  # (N, 2) -> (u, v)
        u = out[:, 0:1]
        v = out[:, 1:2]
        
        # Gradients of u
        grad_u = torch.autograd.grad(
            u, coords,
            grad_outputs=torch.ones_like(u),
            create_graph=True,
            retain_graph=True
        )[0]
        u_x = grad_u[:, 0:1]
        u_y = grad_u[:, 1:2]
        u_t = grad_u[:, 2:3]
        
        # Gradients of v
        grad_v = torch.autograd.grad(
            v, coords,
            grad_outputs=torch.ones_like(v),
            create_graph=True,
            retain_graph=True
        )[0]
        v_x = grad_v[:, 0:1]
        v_y = grad_v[:, 1:2]
        v_t = grad_v[:, 2:3]
        
        # Second derivatives for u
        u_xx = torch.autograd.grad(
            u_x, coords,
            grad_outputs=torch.ones_like(u_x),
            create_graph=True,
            retain_graph=True
        )[0][:, 0:1]
        
        u_yy = torch.autograd.grad(
            u_y, coords,
            grad_outputs=torch.ones_like(u_y),
            create_graph=True,
            retain_graph=True
        )[0][:, 1:2]
        
        # Second derivatives for v
        v_xx = torch.autograd.grad(
            v_x, coords,
            grad_outputs=torch.ones_like(v_x),
            create_graph=True,
            retain_graph=True
        )[0][:, 0:1]
        
        v_yy = torch.autograd.grad(
            v_y, coords,
            grad_outputs=torch.ones_like(v_y),
            create_graph=True,
            retain_graph=True
        )[0][:, 1:2]
        
        # Residuals
        r_u = u_t + u * u_x + v * u_y - self.nu * (u_xx + u_yy)
        r_v = v_t + u * v_x + v * v_y - self.nu * (v_xx + v_yy)
        
        return torch.cat([r_u, r_v], dim=1)

    def _ic_function(self, x: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Compute initial velocity field (u0, v0)."""
        if self.ic_preset in ["b2d_sine_product", "sine_product"]:
            u0 = np.sin(np.pi * x) * np.sin(np.pi * y)
            v0 = u0.copy()
        else:
            # Default: Gaussian pulse
            sigma = 0.1
            r_sq = (x - 0.5)**2 + (y - 0.5)**2
            pulse = np.exp(-r_sq / (2.0 * sigma**2))
            # Zero out boundary
            edge_damp = np.sin(np.pi * x) * np.sin(np.pi * y)
            u0 = pulse * edge_damp
            v0 = u0.copy()
        return u0, v0

    def sample_ic(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """Sample initial condition points at t=0."""
        x = np.random.uniform(0.0, 1.0, (n_points, 1))
        y = np.random.uniform(0.0, 1.0, (n_points, 1))
        t = np.zeros((n_points, 1))
        coords = np.hstack([x, y, t])
        
        u0, v0 = self._ic_function(x, y)
        targets = np.hstack([u0, v0])
        
        return (
            torch.tensor(coords, dtype=torch.float32, device=device),
            torch.tensor(targets, dtype=torch.float32, device=device)
        )

    def sample_bc(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """Sample Dirichlet boundary conditions on four edges (x=0, x=1, y=0, y=1)."""
        quarter = n_points // 4
        # Left edge x=0
        c1 = np.hstack([np.zeros((quarter, 1)), np.random.uniform(0, 1, (quarter, 1)), np.random.uniform(0, self.t_max, (quarter, 1))])
        # Right edge x=1
        c2 = np.hstack([np.ones((quarter, 1)), np.random.uniform(0, 1, (quarter, 1)), np.random.uniform(0, self.t_max, (quarter, 1))])
        # Bottom edge y=0
        c3 = np.hstack([np.random.uniform(0, 1, (quarter, 1)), np.zeros((quarter, 1)), np.random.uniform(0, self.t_max, (quarter, 1))])
        # Top edge y=1
        rem = n_points - 3 * quarter
        c4 = np.hstack([np.random.uniform(0, 1, (rem, 1)), np.ones((rem, 1)), np.random.uniform(0, self.t_max, (rem, 1))])
        
        coords = np.vstack([c1, c2, c3, c4])
        targets = np.zeros((n_points, 2))
        
        return (
            torch.tensor(coords, dtype=torch.float32, device=device),
            torch.tensor(targets, dtype=torch.float32, device=device)
        )

    def sample_collocation(self, n_points: int, device: torch.device = torch.device("cpu")) -> torch.Tensor:
        """Sample space-time collocation points within [0, 1]^3."""
        from core.sampling.lhs import latin_hypercube_sample
        bounds = [(0.0, 1.0), (0.0, 1.0), (0.0, self.t_max)]
        pts = latin_hypercube_sample(bounds, n_points)
        return torch.tensor(pts, dtype=torch.float32, device=device)

    def reference(self, t_steps: int = 50, x_steps: int = 64) -> Dict[str, Any]:
        """Solve 2D Burgers reference using the high-resolution finite difference solver."""
        x = np.linspace(0, 1, x_steps)
        y = np.linspace(0, 1, x_steps)
        Y_mesh, X_mesh = np.meshgrid(y, x, indexing="ij")
        
        u0, v0 = self._ic_function(X_mesh, Y_mesh)
        res = solve_2d_burgers(
            u0=u0,
            v0=v0,
            nu=self.nu,
            t_max=self.t_max,
            n_save_frames=t_steps
        )
        res["x"] = x.tolist()
        res["y"] = y.tolist()
        return res
