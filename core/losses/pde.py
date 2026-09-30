import torch
import torch.nn as nn


def pde_loss(residual: torch.Tensor) -> torch.Tensor:
    """Mean squared residual loss across all output residual components."""
    return torch.mean(residual ** 2)
