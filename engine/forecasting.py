"""
Arogya-Veda AI: Demand Forecasting Engine
Implements multi-horizon quantile forecasting (P10, P50, P90)
incorporating seasonal patterns, calendar indicators, and epidemic/surge signals.
"""

import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any

class DemandForecastEngine:
    def __init__(self):
        # Baseline demand distributions per resource type (mean hourly arrivals / daily loads)
        self.resource_baselines = {
            "admissions": {"base": 42.0, "std": 6.5, "peak_hour": 14},
            "ed_arrivals": {"base": 78.0, "std": 12.0, "peak_hour": 19},
            "icu_demand": {"base": 18.0, "std": 3.5, "peak_hour": 16},
            "or_procedures": {"base": 24.0, "std": 4.0, "peak_hour": 10}
        }

    def generate_horizon_forecast(self, 
                                  horizon_days: int = 7, 
                                  surge_factor: float = 1.0, 
                                  outbreak_mode: bool = False,
                                  weather_severity: str = "normal") -> Dict[str, Any]:
        """
        Generates multi-day multi-resource demand forecasts with P10, P50, P90 quantile bounds.
        """
        days = []
        now = datetime.now()
        
        weather_multipliers = {
            "normal": 1.0,
            "extreme_heat": 1.15,
            "severe_cold": 1.22,
            "monsoon_flooding": 1.35
        }
        w_factor = weather_multipliers.get(weather_severity, 1.0)
        outbreak_mult = 1.45 if outbreak_mode else 1.0
        effective_multiplier = surge_factor * w_factor * outbreak_mult

        for d in range(horizon_days):
            date_val = now + timedelta(days=d)
            day_name = date_val.strftime("%A")
            is_weekend = date_val.weekday() >= 5
            
            # Weekend vs Weekday patterns
            # Admissions & OR drop on weekends, ED rises slightly
            dow_admission_factor = 0.65 if is_weekend else 1.08
            dow_or_factor = 0.30 if is_weekend else 1.20
            dow_ed_factor = 1.18 if is_weekend else 0.95
            dow_icu_factor = 0.90 if is_weekend else 1.04

            forecast_entry = {
                "day_index": d + 1,
                "date": date_val.strftime("%Y-%m-%d"),
                "day_name": day_name,
                "is_weekend": is_weekend,
                "resources": {}
            }

            for res, cfg in self.resource_baselines.items():
                if res == "admissions":
                    dow_mod = dow_admission_factor
                elif res == "or_procedures":
                    dow_mod = dow_or_factor
                elif res == "ed_arrivals":
                    dow_mod = dow_ed_factor
                else:
                    dow_mod = dow_icu_factor

                # Expected median demand (P50)
                expected_p50 = cfg["base"] * dow_mod * effective_multiplier
                # Add minor trend noise
                expected_p50 += np.sin(d / 2.0) * (cfg["std"] * 0.4)
                expected_p50 = max(1.0, expected_p50)
                
                # Volatility expands intervals during surges
                volatility = cfg["std"] * (1.0 + (effective_multiplier - 1.0) * 0.8)
                p10 = max(0.0, expected_p50 - 1.28 * volatility)
                p90 = expected_p50 + 1.28 * volatility
                
                # Outbreak shock spread
                if outbreak_mode and d >= 2:
                    shock = (d - 1) * 3.5
                    expected_p50 += shock
                    p90 += shock * 1.5

                forecast_entry["resources"][res] = {
                    "p10": round(float(p10), 1),
                    "p50": round(float(expected_p50), 1),
                    "p90": round(float(p90), 1),
                    "volatility_index": round(float(volatility / max(1.0, expected_p50)), 3)
                }

            days.append(forecast_entry)

        return {
            "horizon_days": horizon_days,
            "surge_factor": surge_factor,
            "outbreak_mode": outbreak_mode,
            "weather_severity": weather_severity,
            "effective_multiplier": round(effective_multiplier, 2),
            "forecast_days": days
        }
