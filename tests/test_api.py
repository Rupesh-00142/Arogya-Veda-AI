"""
Integration tests for Arogya-Veda AI FastAPI endpoints.
"""

import sys
import os

# Add parent directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from starlette.testclient import TestClient
from app import app

def test_api_endpoints():
    client = TestClient(app)

    # 1. Test Index
    res = client.get("/")
    assert res.status_code == 200
    assert "Arogya-Veda AI" in res.text
    print("[PASS] GET / (Dashboard Index) - OK")

    # 2. Test Live State
    res = client.get("/api/state")
    assert res.status_code == 200
    data = res.json()
    assert "capacity" in data
    assert "alerts" in data
    print("[PASS] GET /api/state - OK")

    # 3. Test Benchmark 56-day
    res = client.get("/api/benchmark")
    assert res.status_code == 200
    bench = res.json()
    assert len(bench["series"]) == 56
    assert bench["metrics"]["ml_mape"] == 6.7
    print("[PASS] GET /api/benchmark (Performance Overview Data) - OK")

    # 4. Test Forecasting API
    res = client.post("/api/forecast", json={"horizon_days": 7, "surge_factor": 1.2, "outbreak_mode": True})
    assert res.status_code == 200
    fc = res.json()
    assert len(fc["forecast_days"]) == 7
    print("[PASS] POST /api/forecast - OK")

    # 5. Test MILP Optimizer API
    res = client.post("/api/optimize", json={
        "demands": {"ward_admissions": 240, "icu_demand": 41, "or_procedures": 11}
    })
    assert res.status_code == 200
    opt = res.json()
    assert "allocations" in opt
    assert len(opt["ranked_actions"]) > 0
    print("[PASS] POST /api/optimize (HiGHS MILP Solver) - OK")

    # 6. Test Digital Twin Simulation API
    res = client.post("/api/simulate", json={"scenario_type": "mass_casualty"})
    assert res.status_code == 200
    sim = res.json()
    assert "hourly_timeline" in sim
    print("[PASS] POST /api/simulate (RL Digital Twin) - OK")

    # 7. Test Admin Action Logging API
    res = client.post("/api/action", json={
        "action_title": "Expedite 2 ICU step-downs",
        "department": "ICU",
        "action_type": "APPROVE",
        "notes": "Test approval"
    })
    assert res.status_code == 200
    act = res.json()
    assert act["status"] == "SUCCESS"
    print("[PASS] POST /api/action (Feedback Loop Registry) - OK")

    # 8. Test Hospital Configure API
    res = client.post("/api/hospital/configure", json={
        "hospital_name": "Test Regional Hospital",
        "total_ward_beds": 320,
        "total_icu_beds": 50,
        "total_or_theatres": 14,
        "total_ed_bays": 40,
        "total_nurses": 140,
        "total_doctors": 45,
        "nurse_to_icu_ratio": 2.0,
        "nurse_to_ward_ratio": 5.0
    })
    assert res.status_code == 200
    cfg = res.json()
    assert cfg["status"] == "SUCCESS"
    assert cfg["hospital_state"]["capacity"]["general_beds"]["total"] == 320
    print("[PASS] POST /api/hospital/configure (Live Resource Editor) - OK")

    # 9. Test Hospital Preset API
    res = client.post("/api/hospital/preset", json={"preset_type": "metro_standard"})
    assert res.status_code == 200
    pre = res.json()
    assert pre["status"] == "SUCCESS"
    assert pre["hospital_state"]["capacity"]["general_beds"]["total"] == 280
    print("[PASS] POST /api/hospital/preset (Scale Presets) - OK")

    print("\n>>> ALL AROGYA-VEDA AI API ENDPOINTS VALIDATED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    test_api_endpoints()
