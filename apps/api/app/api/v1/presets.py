from fastapi import APIRouter, Query
from typing import List, Optional
from apps.api.app.schemas.run import PresetResponse

router = APIRouter(prefix="/presets", tags=["presets"])

PRESETS = [
    PresetResponse(
        id="b1d_shock",
        name="1D Burgers Shock (Headline)",
        dimension=1,
        description="Headline shock case from Lee et al. (2025) with nu = 0.01/pi and steep gradient front.",
        config={
            "dimension": 1,
            "name": "RI-PINN 1D Shock",
            "problem": {"nu": 0.00318309886, "ic_preset": "b1d_shock", "x_min": -1.0, "x_max": 1.0, "t_max": 1.0},
            "model": {"type": "ri", "layers": 6, "width": 128, "fourier_sigma": 3.0, "fourier_size": 128, "activation": "tanh"},
            "ri": {"threshold_pct": 30.0, "period": 2000, "duration": 500, "lambda_ri": 1.0, "lambda_bc": 5.0, "lambda_ic": 1.0, "detect_variant": 1},
            "training": {"seed": 0, "n_colloc": 15000, "n_bc": 1500, "n_ic": 1500, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "max_epochs_phase1": 10000, "max_epochs_phase2": 5000, "patience": 3000}
        }
    ),
    PresetResponse(
        id="b1d_control",
        name="1D Burgers Smooth Control",
        dimension=1,
        description="Smooth control problem with nu = 0.1/pi without sharp shock formation.",
        config={
            "dimension": 1,
            "name": "Burgers 1D Control",
            "problem": {"nu": 0.0318309886, "ic_preset": "b1d_control", "x_min": -1.0, "x_max": 1.0, "t_max": 1.0},
            "model": {"type": "ff", "layers": 6, "width": 128, "fourier_sigma": 3.0, "fourier_size": 128, "activation": "tanh"},
            "ri": {"threshold_pct": 30.0, "period": 2000, "duration": 500, "lambda_ri": 1.0, "lambda_bc": 5.0, "lambda_ic": 1.0, "detect_variant": 1},
            "training": {"seed": 0, "n_colloc": 10000, "n_bc": 1000, "n_ic": 1000, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "max_epochs_phase1": 8000, "max_epochs_phase2": 4000, "patience": 2500}
        }
    ),
    PresetResponse(
        id="b2d_gaussian_pulse",
        name="2D Burgers Gaussian Pulse",
        dimension=2,
        description="2D pulse that steepens into a multidimensional shock front with nu = 0.003.",
        config={
            "dimension": 2,
            "name": "RI-PINN 2D Pulse",
            "problem": {"nu": 0.003, "ic_preset": "b2d_gaussian_pulse", "t_max": 1.0},
            "model": {"type": "ri", "layers": 6, "width": 128, "fourier_sigma": 3.0, "fourier_size": 128, "activation": "tanh"},
            "ri": {"threshold_pct": 30.0, "period": 2000, "duration": 500, "lambda_ri": 1.0, "lambda_bc": 5.0, "lambda_ic": 1.0, "detect_variant": 2},
            "training": {"seed": 0, "n_colloc": 25000, "n_bc": 2500, "n_ic": 2500, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "max_epochs_phase1": 10000, "max_epochs_phase2": 5000, "patience": 3000}
        }
    ),
    PresetResponse(
        id="b2d_sine_product",
        name="2D Burgers Sine Product",
        dimension=2,
        description="2D smooth field satisfying boundary conditions on all four edges.",
        config={
            "dimension": 2,
            "name": "Burgers 2D Sine Product",
            "problem": {"nu": 0.003, "ic_preset": "b2d_sine_product", "t_max": 1.0},
            "model": {"type": "ff", "layers": 6, "width": 128, "fourier_sigma": 3.0, "fourier_size": 128, "activation": "tanh"},
            "ri": {"threshold_pct": 30.0, "period": 2000, "duration": 500, "lambda_ri": 1.0, "lambda_bc": 5.0, "lambda_ic": 1.0, "detect_variant": 2},
            "training": {"seed": 0, "n_colloc": 20000, "n_bc": 2000, "n_ic": 2000, "lr_phase1": 5e-5, "lr_phase2": 5e-6, "max_epochs_phase1": 8000, "max_epochs_phase2": 4000, "patience": 2500}
        }
    )
]


@router.get("", response_model=List[PresetResponse])
def get_presets(dimension: Optional[int] = Query(None, ge=1, le=2)):
    if dimension is not None:
        return [p for p in PRESETS if p.dimension == dimension]
    return PRESETS
