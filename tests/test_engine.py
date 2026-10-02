"""
Unit tests for Arogya-Veda AI core engines:
1. Data Engine & 56-day benchmark metrics
2. Multi-horizon Quantile Forecasting
3. MILP Joint Resource Allocation Optimizer
4. RL Surge Adaptation & Digital Twin Simulator
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.data_generator import HospitalDataEngine
from engine.forecasting import DemandForecastEngine
from engine.optimizer import HospitalMILPOptimizer
from engine.rl_surge import DigitalTwinSimulator, RLAgentSurgePolicy

def test_data_engine():
    data_eng = HospitalDataEngine()
    bench = data_eng.generate_56_day_benchmark()
    assert len(bench["series"]) == 56
    assert bench["metrics"]["icu_unmet_reduction_pct"] == 40.0
    print("[PASS] Data Engine & Benchmark generation validated.")

def test_forecasting():
    fc = DemandForecastEngine()
    res = fc.generate_horizon_forecast(horizon_days=7, surge_factor=1.2, outbreak_mode=True)
    assert len(res["forecast_days"]) == 7
    d1 = res["forecast_days"][0]["resources"]["icu_demand"]
    assert d1["p90"] >= d1["p50"] >= d1["p10"]
    print("[PASS] Quantile Forecasting Engine validated.")

def test_optimizer():
    opt = HospitalMILPOptimizer()
    res = opt.optimize_allocation({"ward_admissions": 240, "icu_demand": 42, "or_procedures": 11})
    assert res["status"] in ["OPTIMAL", "HEURISTIC_FEASIBLE"]
    assert "allocations" in res
    assert "ranked_actions" in res
    assert len(res["ranked_actions"]) > 0
    print(f"[PASS] MILP Optimizer validated: ICU Alloc={res['allocations']['icu_beds']}, OR Alloc={res['allocations']['active_operating_theatres']}.")

def test_digital_twin():
    sim = DigitalTwinSimulator()
    res = sim.run_scenario("mass_casualty")
    assert res["hourly_timeline"]["arogya_veda_ai"]["overflow_hours"] == 0
    assert len(res["timeline_actions"]) > 0
    print("[PASS] Digital Twin & RL Surge Simulator validated.")

if __name__ == "__main__":
    test_data_engine()
    test_forecasting()
    test_optimizer()
    test_digital_twin()
    print("\n>>> ALL AROGYA-VEDA AI CORE ENGINE TESTS PASSED SUCCESSFULLY! <<<")
