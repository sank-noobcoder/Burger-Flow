import unittest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
import numpy as np
import torch
from core.pdes.burgers1d import Burgers1D
from core.pdes.burgers2d import Burgers2D
from core.reference.cole_hopf import cole_hopf_solution
from core.models.mlp import MLP
from core.models.fourier_features import FFPINN
from core.training.trainer import PINNTrainer
from core.training.schedules import RIScheduleConfig
from core.training.region_detector import detect_low_gradient_regions
from core.evaluation.metrics import evaluate_run, compute_relative_l2


def test_cole_hopf_ic():
    """Verify Cole-Hopf matches initial condition -sin(pi*x) at t=0."""
    x = np.linspace(-1, 1, 50)
    t = np.zeros(50)
    u = cole_hopf_solution(x, t, nu=0.01 / np.pi)
    expected = -np.sin(np.pi * x)
    np.testing.assert_allclose(u, expected, atol=1e-5)


def test_burgers1d_residual():
    """Verify autograd residual calculation for Burgers1D."""
    problem = Burgers1D(nu=0.01 / np.pi)
    model = MLP(in_dim=2, out_dim=1, layers=3, width=16)
    coords = torch.rand((20, 2), requires_grad=True)
    res = problem.residual(model, coords)
    assert res.shape == (20, 1)
    assert not torch.isnan(res).any()


def test_burgers2d_residual():
    """Verify autograd residual calculation for Burgers2D."""
    problem = Burgers2D(nu=0.003)
    model = MLP(in_dim=3, out_dim=2, layers=3, width=16)
    coords = torch.rand((20, 3), requires_grad=True)
    res = problem.residual(model, coords)
    assert res.shape == (20, 2)
    assert not torch.isnan(res).any()


def test_region_detector():
    """Verify detection selects the specified percentage of lowest gradient points."""
    model = MLP(in_dim=2, out_dim=1, layers=3, width=16)
    coords = torch.rand((100, 2))
    coords_dr, idx_dr, vis = detect_low_gradient_regions(model, coords, threshold_pct=30.0, variant=1)
    assert coords_dr.shape[0] == 30
    assert len(vis) <= 30


def test_mini_train_ri():
    """Verify mini training loop runs end to end without error."""
    problem = Burgers1D(nu=0.01 / np.pi)
    model = FFPINN(in_dim=2, out_dim=1, layers=3, width=32, fourier_size=32)
    ri_cfg = RIScheduleConfig(period=10, duration=5, threshold_pct=30.0)
    
    events = []
    def callback(evt, data):
        events.append(evt)
        
    trainer = PINNTrainer(
        model=model,
        problem=problem,
        model_type="ri",
        ri_config=ri_cfg,
        lr_phase1=1e-3,
        lr_phase2=1e-4,
        max_epochs_phase1=25,
        max_epochs_phase2=10,
        patience=50,
        callback=callback
    )
    result = trainer.train(n_colloc=200, n_bc=40, n_ic=40, report_every=10)
    assert result["epochs"] > 0
    assert "best_loss" in result
    assert "phase" in events


if __name__ == "__main__":
    test_cole_hopf_ic()
    test_burgers1d_residual()
    test_burgers2d_residual()
    test_region_detector()
    test_mini_train_ri()
    print("ALL CORE UNIT TESTS PASSED!")
