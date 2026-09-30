import numpy as np
from typing import List, Tuple
from scipy.stats import qmc


def latin_hypercube_sample(bounds: List[Tuple[float, float]], n_samples: int, seed: int = None) -> np.ndarray:
    """
    Generate space-time points using Latin Hypercube Sampling (LHS).
    bounds: List of (min, max) tuples for each dimension
    n_samples: Number of points to sample
    seed: Optional random seed for reproducibility
    Returns: ndarray of shape (n_samples, len(bounds))
    """
    dim = len(bounds)
    sampler = qmc.LatinHypercube(d=dim, seed=seed)
    sample = sampler.random(n=n_samples)
    
    lower = np.array([b[0] for b in bounds])
    upper = np.array([b[1] for b in bounds])
    
    scaled_points = qmc.scale(sample, lower, upper)
    return scaled_points.astype(np.float32)
