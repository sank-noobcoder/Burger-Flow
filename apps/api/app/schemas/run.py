from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime


class ProblemConfig1D(BaseModel):
    nu: float = Field(0.00318309886, ge=1e-5, le=1.0, description="Kinematic viscosity")
    ic_preset: str = Field("b1d_shock", description="IC preset")
    t_max: float = Field(1.0, ge=0.1, le=10.0)
    x_min: float = Field(-1.0, ge=-10.0, le=0.0)
    x_max: float = Field(1.0, ge=0.0, le=10.0)


class ProblemConfig2D(BaseModel):
    nu: float = Field(0.003, ge=1e-5, le=1.0, description="Kinematic viscosity")
    ic_preset: str = Field("b2d_gaussian_pulse", description="2D IC preset")
    t_max: float = Field(1.0, ge=0.1, le=10.0)


class ModelConfig(BaseModel):
    type: str = Field("ri", description="Model architecture: 'ri', 'ff', or 'n'")
    layers: int = Field(6, ge=2, le=12)
    width: int = Field(128, ge=16, le=512)
    fourier_sigma: float = Field(3.0, ge=0.1, le=20.0)
    fourier_size: int = Field(128, ge=16, le=512)
    activation: str = Field("tanh")


class RIConfig(BaseModel):
    threshold_pct: float = Field(30.0, ge=1.0, le=90.0, description="Detection threshold % (A%)")
    period: int = Field(2000, ge=10, le=20000, description="Detection period in epochs")
    duration: int = Field(500, ge=1, le=5000, description="RI active window duration")
    lambda_ri: float = Field(1.0, ge=0.0, le=50.0)
    lambda_bc: float = Field(5.0, ge=0.0, le=50.0)
    lambda_ic: float = Field(1.0, ge=0.0, le=50.0)
    detect_variant: int = Field(1, ge=1, le=3)


class TrainingConfig(BaseModel):
    seed: int = Field(0, ge=0)
    n_colloc: int = Field(15000, ge=100, le=100000)
    n_bc: int = Field(1500, ge=20, le=20000)
    n_ic: int = Field(1500, ge=20, le=20000)
    lr_phase1: float = Field(5e-5, ge=1e-6, le=1e-1)
    lr_phase2: float = Field(5e-6, ge=1e-7, le=1e-2)
    max_epochs_phase1: int = Field(10000, ge=10, le=150000)
    max_epochs_phase2: int = Field(5000, ge=0, le=100000)
    use_lbfgs: bool = Field(True, description="Enable L-BFGS second-order quasi-Newton polish after Adam")
    lbfgs_steps: int = Field(250, ge=0, le=5000, description="Number of L-BFGS steps with line search")
    patience: int = Field(3000, ge=100, le=30000)
    seeds: Optional[List[int]] = Field(default_factory=lambda: [0])


class CreateRunRequest(BaseModel):
    name: str = Field("Burgers PINN Run", max_length=100)
    dimension: int = Field(1, ge=1, le=2)
    problem: Union[ProblemConfig1D, ProblemConfig2D, Dict[str, Any]]
    model: ModelConfig = Field(default_factory=ModelConfig)
    ri: RIConfig = Field(default_factory=RIConfig)
    training: TrainingConfig = Field(default_factory=TrainingConfig)


class RunSummary(BaseModel):
    id: str
    name: str
    dimension: int
    model_type: str
    status: str
    phase: str
    progress: float
    best_loss: Optional[float] = None
    final_l2: Optional[float] = None
    created_at: datetime
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RunMetricsSummary(BaseModel):
    mse: Optional[float] = None
    rel_l2: Optional[float] = None
    shock_pos_err: Optional[float] = None
    epochs: int = 0
    wall_clock_s: float = 0.0


class RunDetail(RunSummary):
    config: Dict[str, Any]
    seed: int
    metrics: RunMetricsSummary
    artifacts: List[str]
    error_message: Optional[str] = None


class CompareResponse(BaseModel):
    runs: List[RunDetail]
    summary_table: List[Dict[str, Any]]
    mean_metrics: Dict[str, Dict[str, float]]  # model_type -> {mse, rel_l2, ...}
    std_metrics: Dict[str, Dict[str, float]]


class PresetResponse(BaseModel):
    id: str
    name: str
    dimension: int
    description: str
    config: Dict[str, Any]
