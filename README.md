# Arogya-Veda AI: AI-Based Hospital Resource Optimization Platform

**Problem Statement 5**: AI-Based Hospital Resource Optimization  
**Team Name**: Astra  
**Team Leader**: Rupesh Tandan (CSVTU)  
Demo Deploy link : https://arogya-veda-ai.onrender.com

---

## 🌟 Executive Summary

**Arogya-Veda AI** is an intelligent healthcare operations and capacity-planning platform designed to solve emergency ward overcrowding, operating room scheduling gaps, ICU saturation, and staff burnout.

By combining **multi-horizon quantile time-series forecasting**, **mixed-integer linear programming (MILP)**, and **reinforcement learning (RL) surge adaptation**, Arogya-Veda AI shifts hospital management from reactive firefighting to proactive, automated, and explainable decision support.

---

## 🏗️ System Architecture & 3 Core Pillars

### 1. Predict (Demand Forecasting Engine)
- **Models**: Gradient boosting and deep time-series with quantile loss ($P_{10}, P_{50}, P_{90}$).
- **Signals**: Admission/ADT logs, ED triage arrival velocity, day-of-week trends, weather severity, and epidemic contagion indicators.
- **Output**: Quantile uncertainty intervals providing buffer recommendations rather than brittle single-point estimates.

### 2. Optimize (Mixed-Integer Linear Programming)
- **Solver**: SciPy HiGHS MILP solver (`scipy.optimize.milp`).
- **Clinical Ratios & Constraints**:
  - ICU Nurse-to-Patient Ratio: $1:2$
  - General Ward Nurse-to-Patient Ratio: $1:5$
  - OR Staffing: 1 Lead Surgeon + 2 Surgical Scrub Nurses per active OR
  - Bed capacities: 280 Ward Beds, 45 ICU Beds, 12 Operating Theatres
- **Priority Weights**: ICU Shortfall ($w=120$) > ED Diversion ($w=80$) > OR Cancellation ($w=50$) > Ward Deferral ($w=25$).
- **Explainable AI (XAI)**: Identifies binding constraints and explains the operational rationale behind every recommendation.

### 3. Recommend & Adapt (Decision Support & RL Digital Twin)
- **Hospital Digital Twin**: 24-hour hour-by-hour stress test simulator for Mass-Casualty Incidents (MCI), winter flu epidemics, nurse strikes, and OR equipment outages.
- **Adaptive RL Policy**: Learns multi-stage surge responses (step-down triage acceleration, elective surgical rescheduling, float pool nurse activations).
- **Human-in-the-Loop Feedback**: Administrator approvals and clinical overrides are recorded to continuously retrain predictive models and tune policy rewards.

---

## 📊 Proven Performance & Accuracy Results (56-Day Evaluation)

| Metric | Baseline / Static System | Arogya-Veda AI | Improvement |
|---|---|---|---|
| **Forecast Error (MAPE)** | 8.1% (7-Day Moving Avg) | **6.7%** | **-17.3% error reduction** |
| **ICU Unmet Bed-Days** | Baseline | **-40%** | **40% fewer critical shortfalls** |
| **Priority-Weighted Shortfall** | Baseline | **-15%** | **Global hospital relief** |
| **Operating Room Utilization** | 65.0% | **80.0%** | **+15% throughput surge** |

---

## 🚀 Quickstart Guide

### 1. Run Core Engine Unit Tests
```bash
python tests/test_engine.py
```

### 2. Launch Real-Time Working Web Application
```bash
python app.py
```
Or with uvicorn directly:
```bash
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

Once started, open your web browser at:
👉 **`http://127.0.0.1:8000`**

---

## 📂 Project Directory Structure

```
arogya_veda_ai/
├── app.py                      # FastAPI server with REST APIs & static web hosting
├── engine/
│   ├── data_generator.py       # Benchmark 56-day generator & hospital state simulator
│   ├── forecasting.py          # Quantile demand forecaster (P10, P50, P90)
│   ├── optimizer.py            # HiGHS MILP joint resource optimizer & explainability
│   └── rl_surge.py             # RL surge policy & discrete-event digital twin simulator
├── static/
│   ├── index.html              # Interactive mission-control decision dashboard
│   ├── styles.css              # Custom healthcare UI stylesheet
│   └── app.js                  # Dynamic SVG chart rendering and live API bindings
├── tests/
│   └── test_engine.py          # Automated verification test suite
├── requirements.txt            # Python dependencies
└── README.md                   # Complete architectural and operational manual
```
