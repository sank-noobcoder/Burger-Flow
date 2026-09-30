import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from apps.api.app.main import app


def export_openapi():
    schema = app.openapi()
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../apps/web"))
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "openapi.json")
    with open(out_file, "w") as f:
        json.dump(schema, f, indent=2)
    print(f"OpenAPI schema successfully exported to: {out_file}")


if __name__ == "__main__":
    export_openapi()
