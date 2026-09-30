import numpy as np
from scipy.special import roots_hermite, logsumexp, softmax
from typing import Union, Tuple


def cole_hopf_solution(
    x: Union[float, np.ndarray],
    t: Union[float, np.ndarray],
    nu: float = 0.01 / np.pi,
    n_quad: int = 128
) -> np.ndarray:
    """
    Exact Cole-Hopf analytical solution for 1D Burgers' equation:
      u_t + u*u_x = nu*u_xx
      u(x, 0) = -sin(pi * x), x in [-1, 1], t in [0, 1]
      u(-1, t) = u(1, t) = 0
    
    Evaluated using Gauss-Hermite quadrature with log-sum-exp / softmax stabilization
    to prevent numerical overflow/underflow in the low-viscosity shock regime (e.g. nu = 0.01/pi).
    """
    x_arr = np.asarray(x, dtype=np.float64)
    t_arr = np.asarray(t, dtype=np.float64)
    
    # Broadcast to common shape if needed
    orig_scalar = np.isscalar(x) and np.isscalar(t)
    x_b, t_b = np.broadcast_arrays(x_arr, t_arr)
    shape = x_b.shape
    x_flat = x_b.ravel()
    t_flat = t_b.ravel()
    
    u_out = np.zeros_like(x_flat)
    
    # Handle t = 0 exactly
    t_zero_mask = (t_flat <= 1e-12)
    u_out[t_zero_mask] = -np.sin(np.pi * x_flat[t_zero_mask])
    
    # Quadrature nodes and weights for int exp(-xi^2) * f(xi) dxi
    xi, w = roots_hermite(n_quad)
    log_w = np.log(w)
    
    t_pos_idx = np.where(~t_zero_mask)[0]
    if len(t_pos_idx) > 0:
        x_sub = x_flat[t_pos_idx, None]  # (M, 1)
        t_sub = t_flat[t_pos_idx, None]  # (M, 1)
        
        # eta = 2 * sqrt(nu * t) * xi
        sqrt_term = 2.0 * np.sqrt(nu * t_sub)
        arg = x_sub - sqrt_term * xi  # (M, n_quad)
        
        sin_arg = np.sin(np.pi * arg)
        # g(xi) = -cos(pi * arg) / (2 * pi * nu)
        g = -np.cos(np.pi * arg) / (2.0 * np.pi * nu)  # (M, n_quad)
        
        # denominator weights via softmax(g + log_w)
        logits = g + log_w  # (M, n_quad)
        probs = softmax(logits, axis=1)  # (M, n_quad), stable
        
        # u(x, t) = - sum( sin_arg * probs )
        u_calc = -np.sum(sin_arg * probs, axis=1)
        u_out[t_pos_idx] = u_calc
        
    res = u_out.reshape(shape)
    return float(res) if orig_scalar else res


def generate_1d_reference_grid(
    nu: float = 0.01 / np.pi,
    nx: int = 256,
    nt: int = 100,
    x_range: Tuple[float, float] = (-1.0, 1.0),
    t_range: Tuple[float, float] = (0.0, 1.0)
) -> dict:
    """Generate high-resolution grid of exact Cole-Hopf solution."""
    x = np.linspace(x_range[0], x_range[1], nx)
    t = np.linspace(t_range[0], t_range[1], nt)
    T_mesh, X_mesh = np.meshgrid(t, x, indexing="ij")  # (nt, nx)
    
    u_grid = cole_hopf_solution(X_mesh, T_mesh, nu=nu)
    return {
        "x": x.tolist(),
        "t": t.tolist(),
        "u": u_grid,
        "shape": [nt, nx],
        "nu": nu,
        "vmin": float(np.min(u_grid)),
        "vmax": float(np.max(u_grid)),
    }
