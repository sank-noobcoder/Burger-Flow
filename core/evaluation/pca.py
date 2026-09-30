import numpy as np
from sklearn.decomposition import PCA
from typing import List, Dict, Any


def compute_pca_trajectory(trajectories: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Fits PCA on layer-0 parameter snapshots across training epochs
    and projects them into 2D coordinates.
    
    trajectories: List of dicts, each with keys:
      - epoch: int
      - phase: str ('search' or 'finetune')
      - weights: np.ndarray or list of floats (flattened layer 0 weights)
      - loss: float
    """
    if len(trajectories) < 2:
        return {"points": [], "explained_variance": [0.0, 0.0]}
        
    weights_matrix = np.array([t["weights"] for t in trajectories], dtype=np.float32)
    
    # 2-component PCA
    pca = PCA(n_components=2)
    coords_2d = pca.fit_transform(weights_matrix)
    
    points = []
    for idx, t in enumerate(trajectories):
        points.append({
            "epoch": t["epoch"],
            "phase": t["phase"],
            "loss": float(t["loss"]),
            "x": float(coords_2d[idx, 0]),
            "y": float(coords_2d[idx, 1])
        })
        
    var_ratio = [float(v) for v in pca.explained_variance_ratio_]
    return {
        "points": points,
        "explained_variance": var_ratio
    }
