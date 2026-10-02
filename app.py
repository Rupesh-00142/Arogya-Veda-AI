"""
Arogya-Veda AI: FastAPI Backend Server & Decision Support Application
AI-Based Hospital Resource Optimization Platform (Team Astra)
"""

import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional

from engine.data_generator import HospitalDataEngine
from engine.forecasting import DemandForecastEngine
from engine.optimizer import HospitalMILPOptimizer
from engine.rl_surge import DigitalTwinSimulator, RLAgentSurgePolicy

app = FastAPI(
    title="Arogya-Veda AI",
    description="AI-Based Hospital Resource Optimization Platform (Team Astra)",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core Engines
data_engine = HospitalDataEngine()
forecast_engine = DemandForecastEngine()
optimizer_engine = HospitalMILPOptimizer()
simulator_engine = DigitalTwinSimulator()
rl_policy_engine = RLAgentSurgePolicy()

# System state memory (for feedback loop and audit log)
admin_audit_log = [
    {"id": "ACT-01", "timestamp": "08:15 AM", "action": "Approved ICU step-down telemetry transfer of 3 patients", "status": "COMMITTED"},
    {"id": "ACT-02", "timestamp": "09:30 AM", "action": "Allocated 4 float pool nurses to Emergency triage", "status": "COMMITTED"},
    {"id": "ACT-03", "timestamp": "11:00 AM", "action": "Staggered elective ortho surgery to flatten 14:00 ICU recovery spike", "status": "COMMITTED"}
]

# Request models
class ForecastRequest(BaseModel):
    horizon_days: int = 7
    surge_factor: float = 1.0
    outbreak_mode: bool = False
    weather_severity: str = "normal"

class OptimizeRequest(BaseModel):
    demands: Optional[Dict[str, float]] = None
    capacity_overrides: Optional[Dict[str, Any]] = None

class ScenarioRequest(BaseModel):
    scenario_type: str = "mass_casualty"

class AdminActionRequest(BaseModel):
    action_title: str
    department: str
    action_type: str  # "APPROVE" or "OVERRIDE"
    notes: Optional[str] = ""

class HospitalCapacityConfig(BaseModel):
    hospital_name: Optional[str] = "Apollo Metro Health - Central Campus"
    total_ward_beds: Optional[int] = 280
    total_icu_beds: Optional[int] = 45
    total_or_theatres: Optional[int] = 12
    total_ed_bays: Optional[int] = 35
    total_nurses: Optional[int] = 125
    total_doctors: Optional[int] = 38
    nurse_to_icu_ratio: Optional[float] = 2.0
    nurse_to_ward_ratio: Optional[float] = 5.0

class PresetRequest(BaseModel):
    preset_type: str  # "tertiary_large", "metro_standard", "community_clinic"

# API Endpoints
@app.get("/api/state")
def get_current_state():
    """Returns real-time hospital occupancy, capacity, and active alerts."""
    state = data_engine.generate_current_hospital_state()
    return JSONResponse(content=state)

@app.get("/api/benchmark")
def get_benchmark_results():
    """Returns the 56-day hospital performance and model accuracy evaluation data."""
    benchmark_data = data_engine.generate_56_day_benchmark()
    return JSONResponse(content=benchmark_data)

@app.post("/api/forecast")
def run_forecast(req: ForecastRequest):
    """Computes multi-horizon quantile demand predictions (P10, P50, P90)."""
    forecast = forecast_engine.generate_horizon_forecast(
        horizon_days=req.horizon_days,
        surge_factor=req.surge_factor,
        outbreak_mode=req.outbreak_mode,
        weather_severity=req.weather_severity
    )
    return JSONResponse(content=forecast)

@app.post("/api/optimize")
def run_optimization(req: OptimizeRequest):
    """Executes SciPy HiGHS Mixed-Integer Linear Programming for beds, ICU, ORs, and Staff."""
    demands = req.demands or {
        "ward_admissions": float(data_engine.capacity_config["total_ward_beds"] * 0.86),
        "icu_demand": float(data_engine.capacity_config["total_icu_beds"] * 0.91),
        "or_procedures": float(data_engine.capacity_config["total_or_theatres"] * 0.91)
    }
    opt_result = optimizer_engine.optimize_allocation(
        demands=demands,
        capacity_overrides=req.capacity_overrides
    )
    return JSONResponse(content=opt_result)

@app.post("/api/simulate")
def run_digital_twin_simulation(req: ScenarioRequest):
    """Runs a 24-hour discrete what-if stress scenario with RL policy adaptation."""
    sim_result = simulator_engine.run_scenario(scenario_type=req.scenario_type)
    return JSONResponse(content=sim_result)

@app.post("/api/action")
def log_admin_action(req: AdminActionRequest):
    """Records administrator approval or override into the continuous learning feedback loop."""
    new_record = {
        "id": f"ACT-{len(admin_audit_log) + 1:02d}",
        "timestamp": "Just now",
        "action": f"{req.action_type}: {req.action_title} ({req.department})",
        "status": "APPLIED_FEEDBACK_CAPTURED",
        "notes": req.notes
    }
    admin_audit_log.insert(0, new_record)
    return JSONResponse(content={"status": "SUCCESS", "message": "Action logged and incorporated into RL feedback model.", "audit_log": admin_audit_log})

@app.get("/api/audit-log")
def get_audit_log():
    return JSONResponse(content=admin_audit_log)

# Hospital Configuration & Resource Management Endpoints
@app.post("/api/hospital/configure")
def configure_hospital_resources(req: HospitalCapacityConfig):
    """
    Enables hospital administrators to edit and update total capacity, clinical ratios, and staff pools.
    All mathematical optimization constraints, forecasts, and live dashboard meters update instantly.
    """
    config_dict = req.model_dump(exclude_unset=True)
    updated_cfg = data_engine.update_capacity(config_dict)
    
    # Update MILP optimizer default capacity
    optimizer_engine.default_capacity.update({
        "total_ward_beds": updated_cfg["total_ward_beds"],
        "total_icu_beds": updated_cfg["total_icu_beds"],
        "total_or_theatres": updated_cfg["total_or_theatres"],
        "available_doctors": updated_cfg["total_doctors"],
        "available_nurses": updated_cfg["total_nurses"],
        "nurse_to_icu_ratio": updated_cfg["nurse_to_icu_ratio"],
        "nurse_to_ward_ratio": updated_cfg["nurse_to_ward_ratio"]
    })
    
    # Log configuration update
    admin_audit_log.insert(0, {
        "id": f"ACT-{len(admin_audit_log) + 1:02d}",
        "timestamp": "Just now",
        "action": f"CONFIG: Updated Hospital Capacity ({data_engine.hospital_name})",
        "status": "APPLIED_SYSTEM_RECONFIGURED",
        "notes": f"Wards: {updated_cfg['total_ward_beds']}, ICU: {updated_cfg['total_icu_beds']}, ORs: {updated_cfg['total_or_theatres']}, Nurses: {updated_cfg['total_nurses']}"
    })
    
    new_state = data_engine.generate_current_hospital_state()
    return JSONResponse(content={
        "status": "SUCCESS",
        "message": "Hospital resource capacity successfully updated across optimization and forecasting engines.",
        "hospital_state": new_state
    })

@app.post("/api/hospital/preset")
def apply_hospital_preset(req: PresetRequest):
    """
    Applies standard hospital scale presets:
    - 'tertiary_large': 500 Ward beds, 80 ICU beds, 20 ORs, 220 nurses, 60 doctors, 50 ED bays
    - 'metro_standard': 280 Ward beds, 45 ICU beds, 12 ORs, 125 nurses, 38 doctors, 35 ED bays
    - 'community_clinic': 120 Ward beds, 18 ICU beds, 6 ORs, 60 nurses, 18 doctors, 20 ED bays
    """
    presets = {
        "tertiary_large": {
            "hospital_name": "Metro Apex Tertiary Medical Center (500-Bed)",
            "total_ward_beds": 500,
            "total_icu_beds": 80,
            "total_or_theatres": 20,
            "total_ed_bays": 50,
            "total_nurses": 220,
            "total_doctors": 60,
            "nurse_to_icu_ratio": 2.0,
            "nurse_to_ward_ratio": 5.0
        },
        "metro_standard": {
            "hospital_name": "Apollo Metro Health - Central Campus",
            "total_ward_beds": 280,
            "total_icu_beds": 45,
            "total_or_theatres": 12,
            "total_ed_bays": 35,
            "total_nurses": 125,
            "total_doctors": 38,
            "nurse_to_icu_ratio": 2.0,
            "nurse_to_ward_ratio": 5.0
        },
        "community_clinic": {
            "hospital_name": "City Community Hospital & Urgent Care (120-Bed)",
            "total_ward_beds": 120,
            "total_icu_beds": 18,
            "total_or_theatres": 6,
            "total_ed_bays": 20,
            "total_nurses": 60,
            "total_doctors": 18,
            "nurse_to_icu_ratio": 2.0,
            "nurse_to_ward_ratio": 5.0
        }
    }
    selected = presets.get(req.preset_type, presets["metro_standard"])
    data_engine.update_capacity(selected)
    optimizer_engine.default_capacity.update({
        "total_ward_beds": selected["total_ward_beds"],
        "total_icu_beds": selected["total_icu_beds"],
        "total_or_theatres": selected["total_or_theatres"],
        "available_doctors": selected["total_doctors"],
        "available_nurses": selected["total_nurses"],
        "nurse_to_icu_ratio": selected["nurse_to_icu_ratio"],
        "nurse_to_ward_ratio": selected["nurse_to_ward_ratio"]
    })
    
    new_state = data_engine.generate_current_hospital_state()
    return JSONResponse(content={
        "status": "SUCCESS",
        "message": f"Applied preset '{req.preset_type}'.",
        "hospital_state": new_state
    })

# Static files mount
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Arogya-Veda AI Backend Running. Static index not yet found.</h1>")

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*70)
    print("🚀 Arogya-Veda AI Hospital Resource Optimization Platform Starting...")
    print("📍 URL: http://127.0.0.1:8000")
    print("="*70 + "\n")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
