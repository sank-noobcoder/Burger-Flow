import torch


def reinit_loss(pred_dr: torch.Tensor, targets_dr: torch.Tensor) -> torch.Tensor:
    """
    Re-initialization loss (Paper Eq. 4):
      L_RI = (1 / N_dr) * sum(|R(x_dr) - NN(x_dr; theta)|^2)
    where R ~ U[-1, 1] are random target values assigned to detected low-gradient regions.
    """
    if pred_dr.numel() == 0 or targets_dr.numel() == 0:
        return torch.tensor(0.0, device=pred_dr.device)
    return torch.mean((targets_dr - pred_dr) ** 2)
