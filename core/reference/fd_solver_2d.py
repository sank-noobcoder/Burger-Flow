import numpy as np
from typing import Dict, Any, Tuple, Optional, Callable


def upwind_diff_x(f: np.ndarray, u_vel: np.ndarray, dx: float) -> np.ndarray:
    """
    3rd-order upwind-biased convective difference in x-direction with 1st-order fallback at boundaries.
    f: 2D array of shape (Ny, Nx)
    u_vel: 2D array of local advection velocity
    """
    Ny, Nx = f.shape
    fx = np.zeros_like(f)
    
    # Interior 3rd-order upwind biased:
    # If u > 0: (2 f_{i+1} + 3 f_i - 6 f_{i-1} + f_{i-2}) / (6 dx)
    # If u < 0: (-f_{i+2} + 6 f_{i+1} - 3 f_i - 2 f_{i-1}) / (6 dx)
    pos = u_vel[:, 2:-2] >= 0
    neg = ~pos
    
    # For indices 2 to Nx-3
    f_p2 = f[:, 4:]
    f_p1 = f[:, 3:-1]
    f_0  = f[:, 2:-2]
    f_m1 = f[:, 1:-3]
    f_m2 = f[:, :-4]
    
    diff_pos = (2.0 * f_p1 + 3.0 * f_0 - 6.0 * f_m1 + f_m2) / (6.0 * dx)
    diff_neg = (-f_p2 + 6.0 * f_p1 - 3.0 * f_0 - 2.0 * f_m1) / (6.0 * dx)
    
    fx[:, 2:-2] = np.where(pos, diff_pos, diff_neg)
    
    # Boundary fallback (1st order upwind)
    # index 1
    u1 = u_vel[:, 1]
    fx[:, 1] = np.where(u1 >= 0, (f[:, 1] - f[:, 0]) / dx, (f[:, 2] - f[:, 1]) / dx)
    # index Nx-2
    u_end = u_vel[:, -2]
    fx[:, -2] = np.where(u_end >= 0, (f[:, -2] - f[:, -3]) / dx, (f[:, -1] - f[:, -2]) / dx)
    
    return fx


def upwind_diff_y(f: np.ndarray, v_vel: np.ndarray, dy: float) -> np.ndarray:
    """3rd-order upwind-biased convective difference in y-direction."""
    # Transpose, apply upwind_diff_x, and transpose back
    return upwind_diff_x(f.T, v_vel.T, dy).T


def diffusion_2d(f: np.ndarray, dx: float, dy: float) -> np.ndarray:
    """2nd-order central difference Laplacian."""
    lap = np.zeros_like(f)
    lap[1:-1, 1:-1] = (
        (f[1:-1, 2:] - 2.0 * f[1:-1, 1:-1] + f[1:-1, :-2]) / (dx * dx) +
        (f[2:, 1:-1] - 2.0 * f[1:-1, 1:-1] + f[:-2, 1:-1]) / (dy * dy)
    )
    return lap


def rhs_2d_burgers(u: np.ndarray, v: np.ndarray, nu: float, dx: float, dy: float) -> Tuple[np.ndarray, np.ndarray]:
    """Compute RHS of 2D Burgers: -u*u_x - v*u_y + nu*Lap(u), -u*v_x - v*v_y + nu*Lap(v)."""
    ux = upwind_diff_x(u, u, dx)
    uy = upwind_diff_y(u, v, dy)
    vx = upwind_diff_x(v, u, dx)
    vy = upwind_diff_y(v, v, dy)
    
    lap_u = diffusion_2d(u, dx, dy)
    lap_v = diffusion_2d(v, dx, dy)
    
    du_dt = - (u * ux + v * uy) + nu * lap_u
    dv_dt = - (u * vx + v * vy) + nu * lap_v
    
    # Enforce zero boundary conditions
    du_dt[0, :] = du_dt[-1, :] = du_dt[:, 0] = du_dt[:, -1] = 0.0
    dv_dt[0, :] = dv_dt[-1, :] = dv_dt[:, 0] = dv_dt[:, -1] = 0.0
    
    return du_dt, dv_dt


def solve_2d_burgers(
    u0: np.ndarray,
    v0: np.ndarray,
    nu: float = 0.003,
    t_max: float = 1.0,
    n_save_frames: int = 50,
    cfl: float = 0.35
) -> Dict[str, Any]:
    """
    High-resolution 2D Burgers solver using 3rd-order upwind differences
    and SSP-RK3 time integration on [0, 1]^2.
    """
    Ny, Nx = u0.shape
    dx = 1.0 / (Nx - 1)
    dy = 1.0 / (Ny - 1)
    h = min(dx, dy)
    
    u = u0.copy().astype(np.float64)
    v = v0.copy().astype(np.float64)
    
    # Enforce boundary zero
    u[0, :] = u[-1, :] = u[:, 0] = u[:, -1] = 0.0
    v[0, :] = v[-1, :] = v[:, 0] = v[:, -1] = 0.0
    
    save_times = np.linspace(0.0, t_max, n_save_frames)
    u_frames = [u.copy()]
    v_frames = [v.copy()]
    
    t_curr = 0.0
    frame_idx = 1
    
    while frame_idx < n_save_frames:
        t_target = save_times[frame_idx]
        
        while t_curr < t_target - 1e-12:
            # Adaptive time-step
            max_vel = max(float(np.max(np.abs(u))), float(np.max(np.abs(v))), 1e-4)
            dt_conv = cfl * h / max_vel
            dt_diff = 0.5 * (h * h) / (4.0 * max(nu, 1e-6))
            dt = min(dt_conv, dt_diff, t_target - t_curr)
            
            # SSP-RK3 stages
            # Stage 1
            k1_u, k1_v = rhs_2d_burgers(u, v, nu, dx, dy)
            u1 = u + dt * k1_u
            v1 = v + dt * k1_v
            
            # Stage 2
            k2_u, k2_v = rhs_2d_burgers(u1, v1, nu, dx, dy)
            u2 = 0.75 * u + 0.25 * (u1 + dt * k2_u)
            v2 = 0.75 * v + 0.25 * (v1 + dt * k2_v)
            
            # Stage 3
            k3_u, k3_v = rhs_2d_burgers(u2, v2, nu, dx, dy)
            u = (1.0 / 3.0) * u + (2.0 / 3.0) * (u2 + dt * k3_u)
            v = (1.0 / 3.0) * v + (2.0 / 3.0) * (v2 + dt * k3_v)
            
            # Enforce zero boundary
            u[0, :] = u[-1, :] = u[:, 0] = u[:, -1] = 0.0
            v[0, :] = v[-1, :] = v[:, 0] = v[:, -1] = 0.0
            
            t_curr += dt
            
        u_frames.append(u.copy())
        v_frames.append(v.copy())
        frame_idx += 1
        
    u_arr = np.stack(u_frames, axis=0)  # (n_frames, Ny, Nx)
    v_arr = np.stack(v_frames, axis=0)  # (n_frames, Ny, Nx)
    speed_arr = np.sqrt(u_arr**2 + v_arr**2)
    
    return {
        "t": save_times.tolist(),
        "u": u_arr,
        "v": v_arr,
        "speed": speed_arr,
        "shape": [n_save_frames, Ny, Nx],
        "dx": dx,
        "dy": dy,
        "nu": nu,
        "vmin": float(np.min(u_arr)),
        "vmax": float(np.max(u_arr)),
    }
