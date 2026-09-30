from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional
import torch
import numpy as np


class PDEProblem(ABC):
    """Abstract base class for time-dependent PDE problems in PINN formulation."""

    def __init__(self, name: str, input_dim: int, output_dim: int):
        self.name = name
        self.input_dim = input_dim  # e.g., (x, t) -> 2 or (x, y, t) -> 3
        self.output_dim = output_dim  # e.g., u -> 1 or (u, v) -> 2

    @abstractmethod
    def residual(self, model: torch.nn.Module, coords: torch.Tensor) -> torch.Tensor:
        """
        Compute PDE residual using autograd.
        coords: Tensor of shape (N, input_dim) with requires_grad=True
        Returns: Tensor of shape (N, output_dim) containing the residual(s)
        """
        pass

    @abstractmethod
    def sample_ic(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Sample initial condition points at t=0.
        Returns: (coords, targets) where coords is (N, input_dim), targets is (N, output_dim)
        """
        pass

    @abstractmethod
    def sample_bc(self, n_points: int, device: torch.device = torch.device("cpu")) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Sample boundary condition points at spatial borders for t in [0, t_max].
        Returns: (coords, targets) where coords is (N, input_dim), targets is (N, output_dim)
        """
        pass

    @abstractmethod
    def sample_collocation(self, n_points: int, device: torch.device = torch.device("cpu")) -> torch.Tensor:
        """
        Sample space-time collocation points within domain interior.
        Returns: coords (N, input_dim)
        """
        pass

    @abstractmethod
    def reference(self, t_steps: int = 100, x_steps: int = 100) -> Dict[str, Any]:
        """
        Compute or evaluate high-fidelity reference solution on a regular grid.
        Returns a dict containing grid coordinates and reference values.
        """
        pass
