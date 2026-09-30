from dataclasses import dataclass
from typing import Optional


@dataclass
class RIScheduleConfig:
    """Configuration for Re-Initialization training schedule."""
    threshold_pct: float = 30.0   # Percentage of lowest gradient points to re-init (A%)
    period: int = 2000            # Detection frequency in epochs
    duration: int = 500           # Duration of active re-initialization window in epochs
    lambda_ri: float = 1.0        # Weight of RI loss term
    lambda_bc: float = 5.0        # Weight of boundary condition loss term
    lambda_ic: float = 1.0        # Weight of initial condition loss term
    detect_variant: int = 1       # 1: |u_x|, 2: |u_x|+|u_t|, 3: variant 2 minus high-res
    target_min: float = -1.0      # Min random target value R
    target_max: float = 1.0       # Max random target value R


class RIScheduleTracker:
    """Tracks whether re-initialization is active at a given epoch."""

    def __init__(self, config: RIScheduleConfig):
        self.config = config
        self.last_detection_epoch: int = -1

    def is_detection_epoch(self, epoch: int, phase: str) -> bool:
        if phase != "search":
            return False
        return (epoch % self.config.period == 0)

    def is_ri_active(self, epoch: int, phase: str) -> bool:
        if phase != "search" or self.last_detection_epoch < 0:
            return False
        epochs_since = epoch - self.last_detection_epoch
        return 0 <= epochs_since < self.config.duration
