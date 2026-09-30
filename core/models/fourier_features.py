import torch
import torch.nn as nn
import numpy as np
from core.models.mlp import MLP


class FourierFeatureEmbedding(nn.Module):
    """
    Random Fourier Feature mapping:
      gamma(x) = [cos(2*pi * B @ x), sin(2*pi * B @ x)]
      where B ~ N(0, sigma^2) has shape (m, in_dim).
      Output dimension is 2*m = fourier_size.
    """

    def __init__(self, in_dim: int, fourier_size: int = 128, sigma: float = 3.0):
        super().__init__()
        self.in_dim = in_dim
        self.fourier_size = fourier_size
        self.m = fourier_size // 2
        self.sigma = sigma
        
        # B matrix is fixed and non-trainable
        B = torch.randn(self.m, in_dim) * sigma
        self.register_buffer("B", B)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (N, in_dim)
        # 2*pi * x @ B.T -> (N, m)
        proj = 2.0 * np.pi * torch.matmul(x, self.B.t())
        return torch.cat([torch.cos(proj), torch.sin(proj)], dim=-1)


class FFPINN(nn.Module):
    """
    Fourier Feature PINN (used for both FF-PINN and as the network backbone for RI-PINN).
    Paper setup: sigma = 3, fourier_size = 128, 6 layers, width 128, tanh activation.
    """

    def __init__(
        self,
        in_dim: int,
        out_dim: int,
        layers: int = 6,
        width: int = 128,
        fourier_size: int = 128,
        fourier_sigma: float = 3.0,
        activation: str = "tanh"
    ):
        super().__init__()
        self.embedding = FourierFeatureEmbedding(in_dim=in_dim, fourier_size=fourier_size, sigma=fourier_sigma)
        self.mlp = MLP(in_dim=fourier_size, out_dim=out_dim, layers=layers, width=width, activation=activation)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        embedded = self.embedding(x)
        return self.mlp(embedded)

    def get_layer0_weights(self) -> torch.Tensor:
        """Returns layer 0 weights of the MLP backbone for PCA."""
        return self.mlp.get_layer0_weights()
