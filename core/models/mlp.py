import torch
import torch.nn as nn
from typing import List


class MLP(nn.Module):
    """
    Standard Physics-Informed Neural Network (N-PINN) backbone.
    Default: 6 layers, width 128, tanh activation, Xavier normal init.
    """

    def __init__(
        self,
        in_dim: int,
        out_dim: int,
        layers: int = 6,
        width: int = 128,
        activation: str = "tanh"
    ):
        super().__init__()
        self.in_dim = in_dim
        self.out_dim = out_dim
        self.layers_count = layers
        self.width = width
        
        act_fn = nn.Tanh() if activation.lower() == "tanh" else nn.GELU()
        
        net_layers: List[nn.Module] = []
        # Input layer
        net_layers.append(nn.Linear(in_dim, width))
        net_layers.append(act_fn)
        
        # Hidden layers
        for _ in range(layers - 2):
            net_layers.append(nn.Linear(width, width))
            net_layers.append(act_fn)
            
        # Output layer
        net_layers.append(nn.Linear(width, out_dim))
        
        self.net = nn.Sequential(*net_layers)
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

    def get_layer0_weights(self) -> torch.Tensor:
        """Returns flattened layer 0 weights for PCA trajectory analysis."""
        for m in self.net:
            if isinstance(m, nn.Linear):
                return m.weight.detach().cpu().flatten()
        return torch.tensor([])
