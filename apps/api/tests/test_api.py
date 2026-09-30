import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from fastapi.testclient import TestClient
from apps.api.app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_presets():
    res = client.get("/api/v1/presets")
    assert res.status_code == 200
    presets = res.json()
    assert len(presets) >= 4
    preset_ids = [p["id"] for p in presets]
    assert "b1d_shock" in preset_ids
    assert "b2d_gaussian_pulse" in preset_ids


def test_login_and_me():
    res = client.post("/api/v1/auth/login", json={
        "email": "researcher@burgersflow.org",
        "password": "researcher123"
    })
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    assert token
    
    # Get me
    headers = {"Authorization": f"Bearer {token}"}
    res_me = client.get("/api/v1/auth/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["email"] == "researcher@burgersflow.org"
    
    # Get quota
    res_quota = client.get("/api/v1/auth/me/quota", headers=headers)
    assert res_quota.status_code == 200
    assert "gpu_minutes_used" in res_quota.json()


def test_runs_list():
    res = client.post("/api/v1/auth/login", json={
        "email": "researcher@burgersflow.org",
        "password": "researcher123"
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    res_runs = client.get("/api/v1/runs", headers=headers)
    assert res_runs.status_code == 200
    runs = res_runs.json()
    assert len(runs) >= 3


if __name__ == "__main__":
    test_health()
    test_presets()
    test_login_and_me()
    test_runs_list()
    print("ALL FASTAPI GATEWAY TESTS PASSED!")
