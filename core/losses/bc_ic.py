import torch


def bc_loss(pred_bc: torch.Tensor, target_bc: torch.Tensor) -> torch.Tensor:
    """Mean squared error on boundary conditions."""
    return torch.mean((pred_bc - target_bc) ** 2)


def ic_loss(pred_ic: torch.Tensor, target_ic: torch.Tensor) -> torch.Tensor:
    """Mean squared error on initial condition."""
    return torch.mean((pred_ic - target_ic) ** 2)
