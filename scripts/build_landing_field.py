import os
import sys
import json
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.reference.cole_hopf import generate_1d_reference_grid


def build_landing_field():
    print("Generating landing hero fluid field from Burgers 1D Cole-Hopf...")
    # 150 spatial points, 60 time points
    grid = generate_1d_reference_grid(nu=0.01 / np.pi, nx=150, nt=60)
    
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../apps/web/public/landing"))
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "field.json")
    
    data = {
        "x": grid["x"],
        "t": grid["t"],
        "shape": grid["shape"],
        "u": grid["u"].tolist(),
        "vmin": grid["vmin"],
        "vmax": grid["vmax"],
        "nu": grid["nu"]
    }
    
    with open(out_path, "w") as f:
        json.dump(data, f)
        
    print(f"Landing hero field successfully written to: {out_path}")


if __name__ == "__main__":
    build_landing_field()
