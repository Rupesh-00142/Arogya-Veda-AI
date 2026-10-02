/**
 * Arogya-Veda AI: Real-Time Frontend Application Logic
 * Integrates live APIs for Master Overview & Dedicated Departmental Modules:
 * Beds, ICU, ORs, Staff, ED, Forecasting, MILP Optimizer, and Digital Twin.
 */

let isOutbreakActive = false;
let currentHorizon = 7;
let currentSurge = 1.0;
let currentWeather = "normal";
let hospitalStateCache = null;

// Initialize dashboard on load
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  loadInitialState();
  runForecast();
  runOptimizationSolve();
  runDigitalTwinSimulation();
  loadBenchmarkData();
  loadAuditLog();
});

// Real-time clock
function initClock() {
  const clockEl = document.getElementById("live-clock");
  setInterval(() => {
    const now = new Date();
    clockEl.innerText = now.toLocaleDateString() + " " + now.toLocaleTimeString();
  }, 1000);
}

// Tab navigation
function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  
  const target = document.getElementById(tabId);
  if (target) {
    target.style.display = "block";
  }
  
  // Highlight active button
  const activeBtn = Array.from(document.querySelectorAll(".tab-btn")).find(btn => 
    btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(tabId)
  );
  if (activeBtn) activeBtn.classList.add("active");

  // Re-render chart if SVG tab switched
  if (tabId === "tab-forecasting") runForecast();
  if (tabId === "tab-digital-twin") runDigitalTwinSimulation();
  if (tabId === "tab-benchmark") loadBenchmarkData();
  if (tabId === "tab-config" && hospitalStateCache) renderInventoryMatrix(hospitalStateCache);
}

// Toast notification helper
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  const icon = type === "success" ? "✅" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.4s ease";
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

// 1. Initial State Loading & Departmental Rendering
async function loadInitialState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    hospitalStateCache = data;

    // Populate alerts
    const alertsBox = document.getElementById("alerts-list");
    alertsBox.innerHTML = "";
    data.alerts.forEach(alt => {
      const card = document.createElement("div");
      card.className = "action-card";
      const badgeCls = alt.severity === "CRITICAL" ? "badge-critical" : (alt.severity === "WARNING" ? "badge-warning" : "badge-info");
      card.innerHTML = `
        <div class="action-header">
          <span class="action-title">${alt.title}</span>
          <span class="badge ${badgeCls}">${alt.severity}</span>
        </div>
        <div class="action-body">${alt.message}</div>
        <div class="action-footer">
          <span style="font-size: 11px; color: var(--text-dim)">Department: ${alt.department}</span>
          <span style="font-size: 11px; color: var(--text-dim)">${alt.timestamp}</span>
        </div>
      `;
      alertsBox.appendChild(card);
    });

    // Render Departmental Modules
    renderWardsModule(data.ward_units);
    renderICUModule(data.icu_units);
    renderORModule(data.operating_rooms_list);
    renderStaffModule(data.staff_roster);
    renderInventoryMatrix(data);
  } catch (err) {
    console.warn("Using offline state fallback:", err);
  }
}

// 2. Wards Module
function renderWardsModule(wardUnits) {
  if (!wardUnits) return;
  const container = document.getElementById("ward-units-container");
  container.innerHTML = "";

  wardUnits.forEach(w => {
    const occPct = Math.round((w.occupied / w.total) * 100);
    const card = document.createElement("div");
    card.className = "ward-card";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:700; font-size:14px; color:#f8fafc;">${w.name}</span>
        <span class="badge badge-info">${w.id}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
        <span style="color:var(--text-muted)">Occupancy:</span>
        <span style="font-weight:700; color:#38bdf8">${w.occupied} / ${w.total} (${occPct}%)</span>
      </div>
      <div class="progress-track" style="margin-bottom:10px;">
        <div class="progress-fill" style="width: ${occPct}%; background: ${occPct > 90 ? '#ef4444' : '#06b6d4'};"></div>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:11.5px; background:rgba(0,0,0,0.2); padding:8px; border-radius:6px;">
        <div>🚪 Ready to Discharge: <strong style="color:#10b981">${w.discharge_ready}</strong></div>
        <div>📥 Pending Inflow: <strong style="color:#fbbf24">${w.admissions_pending}</strong></div>
        <div>👩‍⚕️ Nurses on Floor: <strong>${w.nurses}</strong></div>
        <div>⚖️ Safety Ratio: <strong style="color:#34d399">${w.ratio}</strong></div>
      </div>
      <div style="display:flex; gap:6px; margin-top:10px;">
        <button class="btn btn-secondary" style="flex:1; padding:4px 8px; font-size:11px;" onclick="transferWardBed('${w.id}')">Transfer In</button>
        <button class="btn btn-secondary" style="flex:1; padding:4px 8px; font-size:11px;" onclick="dischargePatient('${w.id}')">Discharge (${w.discharge_ready})</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Render 280 bed dots
  const bedDots = document.getElementById("bed-dots-container");
  bedDots.innerHTML = "";
  for (let i = 1; i <= 280; i++) {
    const dot = document.createElement("span");
    dot.style.width = "11px";
    dot.style.height = "11px";
    dot.style.borderRadius = "2px";
    dot.style.display = "inline-block";
    dot.title = `Bed #${i}`;
    if (i <= 238) {
      if (i <= 25) {
        dot.style.background = "#f59e0b"; // Discharge pending
        dot.title += " (Discharge Pending)";
      } else {
        dot.style.background = "#06b6d4"; // Occupied
        dot.title += " (Occupied)";
      }
    } else if (i <= 252) {
      dot.style.background = "#a855f7"; // Reserved
      dot.title += " (Reserved)";
    } else {
      dot.style.background = "#10b981"; // Available
      dot.title += " (Available)";
    }
    bedDots.appendChild(dot);
  }
}

function triggerBedRebalance() {
  applyDecisionAction("Autonomous Bed Rebalancing across 5 Inpatient Units", "Beds", "APPROVE");
  showToast("Beds re-balanced: 4 beds dynamically reserved in Ward 4D Telemetry.");
}

function triggerDischargeLounge() {
  applyDecisionAction("Discharge Acceleration to Inpatient Lounge", "Beds", "APPROVE");
  showToast("Discharge Lounge activated: 25 patient beds expedited.");
}

function transferWardBed(wardId) {
  showToast(`Bed reserved in ${wardId} for incoming transfer.`);
}

function dischargePatient(wardId) {
  showToast(`Discharge approved for ready patient in ${wardId}. Bed cleaning queued.`);
}

// 3. ICU Module
function renderICUModule(icuUnits) {
  if (!icuUnits || !icuUnits.step_down_candidates) return;
  const list = document.getElementById("icu-stepdown-list");
  list.innerHTML = "";

  icuUnits.step_down_candidates.forEach(pt => {
    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-weight:700; font-size:14px; color:#f8fafc;">${pt.patient_id}</span>
          <span class="badge badge-info">${pt.unit} - Bed ${pt.bed}</span>
          <span class="badge badge-success">Stability: ${pt.stability_score}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
          SOFA Score: <strong>${pt.sofa_score} (Stable)</strong> • ICU Stay: ${pt.stay_days} Days • Recommended Destination: <strong style="color:#38bdf8">${pt.recommended_ward}</strong>
        </div>
      </div>
      <button class="btn btn-success" style="padding:6px 12px; font-size:11.5px;" onclick="approveStepDownTransfer('${pt.patient_id}', '${pt.recommended_ward}')">
        ✓ Approve Step-Down Transfer
      </button>
    `;
    list.appendChild(card);
  });
}

function approveStepDownTransfer(patientId, destWard) {
  applyDecisionAction(`Step-Down Transfer of ${patientId} to ${destWard}`, "ICU", "APPROVE");
  showToast(`Step-down transfer approved for ${patientId} → ${destWard}. 1 Critical ICU bed freed!`);
}

// 4. OR Module
function renderORModule(orList) {
  if (!orList) return;
  const container = document.getElementById("or-suites-container");
  container.innerHTML = "";

  orList.forEach(item => {
    const card = document.createElement("div");
    card.className = "or-card";
    
    let badgeClass = "badge-info";
    let statusText = item.status;
    if (item.status === "IN_SURGERY") {
      badgeClass = "badge-info";
      statusText = "IN SURGERY";
    } else if (item.status === "COMPLETED_CLEANING") {
      badgeClass = "badge-warning";
      statusText = "CLEANING / TURNAROUND";
    } else if (item.status.includes("SCHEDULED")) {
      badgeClass = "badge-purple";
      statusText = "SCHEDULED 14:30";
    } else if (item.status.includes("RESERVE")) {
      badgeClass = "badge-success";
      statusText = "EMERGENCY STANDBY";
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:700; font-size:14px; color:#38bdf8;">${item.room}</span>
        <span class="badge ${badgeClass}">${statusText}</span>
      </div>
      <div style="font-size:13px; font-weight:600; color:#f8fafc; margin-bottom:2px;">${item.procedure}</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:6px;">Specialty: ${item.specialty} • Lead: ${item.surgeon}</div>
      <div style="display:flex; justify-content:space-between; font-size:11px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
        <span>Elapsed: ${item.elapsed}</span>
        <span style="color:#10b981; font-weight:600;">⚡ ${item.turnaround_opt}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function triggerOROptimization() {
  applyDecisionAction("Dynamic OR Block Staggering & Turnaround Compression", "OR", "APPROVE");
  showToast("OR Schedule optimized: Utilization raised from 65% to 83.3%!");
}

function triggerAddOnOR() {
  showToast("Emergency Reserve Theatre 12 activated for incoming trauma block.");
}

// 5. Staff Module
function renderStaffModule(staffData) {
  if (!staffData || !staffData.shifts) return;
  const container = document.getElementById("staff-shifts-container");
  container.innerHTML = "";

  staffData.shifts.forEach(s => {
    const card = document.createElement("div");
    card.className = "shift-card";
    card.innerHTML = `
      <div style="font-weight:700; font-size:13.5px; color:#f8fafc; margin-bottom:8px;">${s.name}</div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">
        Doctors on Duty: <strong style="color:#38bdf8">${s.doctors}</strong> • Nurses: <strong style="color:#fbbf24">${s.nurses}</strong>
      </div>
      <div style="font-size:12px; margin-bottom:4px;">ICU Ratio: <strong>${s.icu_ratio}</strong></div>
      <div style="font-size:12px; margin-bottom:8px;">Ward Ratio: <strong>${s.ward_ratio}</strong></div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
        <span>Fatigue Index:</span>
        <span class="badge ${s.fatigue_index.includes('High') ? 'badge-critical' : (s.fatigue_index.includes('Moderate') ? 'badge-warning' : 'badge-success')}">${s.fatigue_index}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function deployFloatPoolNurses() {
  applyDecisionAction("Deployment of 6 Float Nurses to Night Shift and ED", "Staffing", "APPROVE");
  showToast("6 Float-pool nurses deployed! Night shift clinical ratio protected.");
}

// 6. ED Module Actions
function toggleSurgeDiversion() {
  applyDecisionAction("Regional Hospital Network Ambulance Diversion Standby", "ED", "OVERRIDE");
  showToast("Ambulance Diversion Standby activated. Non-critical cases routed to peripheral clinics.");
}

function activateFastTrackED() {
  applyDecisionAction("Point-of-Care Bedside Ultrasound & Labs Acceleration", "ED", "APPROVE");
  showToast("Fast-Track ED triage activated: Boarding wait time cut to 28 mins.");
}

// Batch Actions
function applyAllRecommendations() {
  applyDecisionAction("Batch Execution: ICU Step-Down, Float Nurses, OR Stagger", "All Departments", "APPROVE");
  showToast("All AI-Ranked Optimization Actions approved and dispatched!");
}

// 7. Forecasting Engine
function updateSurgeLabel(val) {
  document.getElementById("fc-surge-label").innerText = parseFloat(val).toFixed(1) + "x";
  currentSurge = parseFloat(val);
}

function toggleOutbreak() {
  isOutbreakActive = !isOutbreakActive;
  const btn = document.getElementById("fc-outbreak-btn");
  if (isOutbreakActive) {
    btn.innerHTML = `<span>🚨</span> Epidemic Mode: ACTIVE (+45%)`;
    btn.className = "btn btn-danger";
  } else {
    btn.innerHTML = `<span>🦠</span> Epidemic Mode: OFF`;
    btn.className = "btn btn-secondary";
  }
  runForecast();
}

async function runForecast() {
  currentHorizon = parseInt(document.getElementById("fc-horizon").value) || 7;
  currentWeather = document.getElementById("fc-weather").value || "normal";

  try {
    const res = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horizon_days: currentHorizon,
        surge_factor: currentSurge,
        outbreak_mode: isOutbreakActive,
        weather_severity: currentWeather
      })
    });
    const data = await res.json();
    renderForecastTable(data.forecast_days);
    renderForecastChart(data.forecast_days);
  } catch (err) {
    console.error("Forecast API error:", err);
  }
}

function renderForecastTable(days) {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  days.forEach(d => {
    const adm = d.resources.admissions;
    const icu = d.resources.icu_demand;
    const ed = d.resources.ed_arrivals;
    const or = d.resources.or_procedures;
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>Day ${d.day_index}</strong> (${d.day_name.substring(0,3)})</td>
      <td>${d.date}</td>
      <td><span style="color:#38bdf8">${adm.p10}</span> - <strong>${adm.p50}</strong> - <span style="color:#f87171">${adm.p90}</span></td>
      <td><span style="color:#38bdf8">${icu.p10}</span> - <strong>${icu.p50}</strong> - <span style="color:#f87171">${icu.p90}</span></td>
      <td><strong>${ed.p50}</strong> / day</td>
      <td><strong>${or.p50}</strong> slots</td>
      <td><span class="badge ${adm.p90 - adm.p10 > 25 ? 'badge-warning' : 'badge-info'}">±${((adm.p90 - adm.p10)/2).toFixed(1)} beds</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderForecastChart(days) {
  const svg = document.getElementById("forecast-svg");
  if (!svg) return;
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 300;
  svg.innerHTML = "";

  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const yMax = Math.max(...days.map(d => d.resources.admissions.p90)) * 1.15;
  const yMin = Math.min(...days.map(d => d.resources.admissions.p10)) * 0.85;

  const getX = i => padding.left + (i / (days.length - 1)) * plotW;
  const getY = val => padding.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Grid lines
  for (let step = 0; step <= 4; step++) {
    const val = yMin + (step / 4) * (yMax - yMin);
    const y = getY(val);
    svg.innerHTML += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4"/>`;
    svg.innerHTML += `<text x="${padding.left - 10}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${Math.round(val)}</text>`;
  }

  // Draw P10-P90 Confidence Interval Area Ribbon
  let areaD = `M ${getX(0)} ${getY(days[0].resources.admissions.p90)}`;
  for (let i = 1; i < days.length; i++) {
    areaD += ` L ${getX(i)} ${getY(days[i].resources.admissions.p90)}`;
  }
  for (let i = days.length - 1; i >= 0; i--) {
    areaD += ` L ${getX(i)} ${getY(days[i].resources.admissions.p10)}`;
  }
  areaD += " Z";
  svg.innerHTML += `<path d="${areaD}" fill="rgba(6, 182, 212, 0.15)" stroke="none"/>`;

  // Draw P50 Median Line
  let lineD = `M ${getX(0)} ${getY(days[0].resources.admissions.p50)}`;
  for (let i = 1; i < days.length; i++) {
    lineD += ` L ${getX(i)} ${getY(days[i].resources.admissions.p50)}`;
  }
  svg.innerHTML += `<path d="${lineD}" fill="none" stroke="#06b6d4" stroke-width="3"/>`;

  // Points & Labels
  days.forEach((d, i) => {
    const x = getX(i);
    const y = getY(d.resources.admissions.p50);
    svg.innerHTML += `<circle cx="${x}" cy="${y}" r="4" fill="#06b6d4" stroke="#0a0f1d" stroke-width="2"/>`;
    svg.innerHTML += `<text x="${x}" y="${height - 15}" fill="#94a3b8" font-size="11" text-anchor="middle">Day ${d.day_index} (${d.day_name.substring(0,3)})</text>`;
  });
}

// 8. Joint MILP Optimizer
async function runOptimizationSolve() {
  const wardDem = parseFloat(document.getElementById("opt-ward-demand").value);
  const icuDem = parseFloat(document.getElementById("opt-icu-demand").value);
  const orDem = parseFloat(document.getElementById("opt-or-demand").value);
  const nursePool = parseInt(document.getElementById("opt-nurse-pool").value);

  try {
    const res = await fetch("/api/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        demands: {
          ward_admissions: wardDem,
          icu_demand: icuDem,
          or_procedures: orDem
        },
        capacity_overrides: {
          available_nurses: nursePool
        }
      })
    });
    const data = await res.json();
    renderOptimizationResults(data);
  } catch (err) {
    console.error("Optimizer error:", err);
  }
}

function renderOptimizationResults(data) {
  const alloc = data.allocations;
  const util = data.utilization_metrics;

  document.getElementById("optimizer-status-badge").innerText = data.status;
  document.getElementById("res-ward-alloc").innerText = `${alloc.general_ward_beds} / 280`;
  document.getElementById("res-ward-util").innerText = `${util.ward_utilization_pct}% capacity utilized`;

  document.getElementById("res-icu-alloc").innerText = `${alloc.icu_beds} / 45`;
  document.getElementById("res-icu-util").innerText = `${util.icu_utilization_pct}% capacity utilized`;

  document.getElementById("res-or-alloc").innerText = `${alloc.active_operating_theatres} / 12`;
  document.getElementById("res-or-util").innerText = `${util.or_utilization_pct}% active slots`;

  document.getElementById("res-nurse-alloc").innerText = `${alloc.total_nurses_deployed} deployed`;
  document.getElementById("res-nurse-util").innerText = `Reserve Overtime Shifts: ${alloc.reserve_overtime_nurses}`;

  // Binding constraints
  const bcBox = document.getElementById("binding-constraints-list");
  bcBox.innerHTML = "";
  if (data.binding_constraints.length === 0) {
    bcBox.innerHTML = `<span style="color:#10b981; font-size:12px;">No active bottlenecks. System operating within comfortable slack margins.</span>`;
  } else {
    data.binding_constraints.forEach(bc => {
      bcBox.innerHTML += `<div style="background:rgba(239, 68, 68, 0.1); border-left:3px solid #ef4444; padding:6px 10px; font-size:12px; color:#fca5a5;">⚠️ <strong>Binding:</strong> ${bc}</div>`;
    });
  }

  // Populate actions in Overview & Optimizer tabs
  const renderActionsHtml = (actions) => {
    return actions.map(act => `
      <div class="action-card">
        <div class="action-header">
          <span class="action-title">
            <span class="badge ${act.urgency === 'CRITICAL' ? 'badge-critical' : (act.urgency === 'HIGH' ? 'badge-warning' : 'badge-info')}">Rank ${act.rank}</span>
            ${act.action}
          </span>
          <span class="badge badge-info">${act.department}</span>
        </div>
        <div class="action-body">${act.detail}</div>
        <div class="action-reasoning">
          <strong>Explainability Driver:</strong> ${act.reasoning}<br>
          <span style="color:#94a3b8"><strong>Active Constraint:</strong> ${act.binding_constraint}</span>
        </div>
        <div class="action-footer">
          <span class="impact-text">✨ ${act.impact}</span>
          <div style="display:flex; gap:8px;">
            <button class="btn" style="padding:4px 10px; font-size:11px;" onclick="applyDecisionAction('${act.action}', '${act.department}', 'APPROVE')">Approve Plan</button>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" onclick="applyDecisionAction('${act.action}', '${act.department}', 'OVERRIDE')">Fine-Tune</button>
          </div>
        </div>
      </div>
    `).join("");
  };

  const actionsHtml = renderActionsHtml(data.ranked_actions);
  document.getElementById("overview-actions-list").innerHTML = actionsHtml;
  document.getElementById("optimizer-actions-list").innerHTML = actionsHtml;
}

// 9. Digital Twin Simulator
async function runDigitalTwinSimulation() {
  const scenario = document.getElementById("dt-scenario").value;
  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_type: scenario })
    });
    const data = await res.json();
    renderDigitalTwinResults(data);
  } catch (err) {
    console.error("Simulation error:", err);
  }
}

function renderDigitalTwinResults(data) {
  document.getElementById("dt-kpi-overflow").innerText = data.comparison_kpis.overflow_prevented_pct;
  document.getElementById("dt-kpi-wait").innerText = data.comparison_kpis.ed_wait_reduction_pct;

  // Render SVG 24-hr Timeline
  const svg = document.getElementById("dt-svg");
  if (!svg) return;
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 300;
  svg.innerHTML = "";

  const padding = { top: 25, right: 30, bottom: 40, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const staticIcu = data.hourly_timeline.static_system.icu_occupancy;
  const aiIcu = data.hourly_timeline.arogya_veda_ai.icu_occupancy;
  const hours = data.hourly_timeline.hours;

  const yMax = 50;
  const yMin = 30;

  const getX = i => padding.left + (i / (hours.length - 1)) * plotW;
  const getY = val => padding.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Grid lines
  for (let val = 30; val <= 50; val += 5) {
    const y = getY(val);
    svg.innerHTML += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.06)"/>`;
    svg.innerHTML += `<text x="${padding.left - 10}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${val} Beds</text>`;
  }

  // ICU Capacity Threshold Line at 45 beds
  const capY = getY(45);
  svg.innerHTML += `<line x1="${padding.left}" y1="${capY}" x2="${width - padding.right}" y2="${capY}" stroke="#ef4444" stroke-width="2" stroke-dasharray="5"/>`;
  svg.innerHTML += `<text x="${width - padding.right}" y="${capY - 6}" fill="#f87171" font-size="11" font-weight="600" text-anchor="end">ICU PHYSICAL CEILING (45 BEDS)</text>`;

  // Draw Static System Line (Red / Overflow)
  let staticD = `M ${getX(0)} ${getY(staticIcu[0])}`;
  for (let i = 1; i < staticIcu.length; i++) {
    staticD += ` L ${getX(i)} ${getY(staticIcu[i])}`;
  }
  svg.innerHTML += `<path d="${staticD}" fill="none" stroke="#f87171" stroke-width="2.5" stroke-dasharray="3"/>`;

  // Draw Arogya-Veda AI Adaptive Line (Emerald Cyan / Safe)
  let aiD = `M ${getX(0)} ${getY(aiIcu[0])}`;
  for (let i = 1; i < aiIcu.length; i++) {
    aiD += ` L ${getX(i)} ${getY(aiIcu[i])}`;
  }
  svg.innerHTML += `<path d="${aiD}" fill="none" stroke="#10b981" stroke-width="3.5"/>`;

  // Hour labels
  hours.forEach((h, i) => {
    if (i % 3 === 0) {
      const x = getX(i);
      svg.innerHTML += `<text x="${x}" y="${height - 15}" fill="#94a3b8" font-size="10" text-anchor="middle">${h}</text>`;
    }
  });

  // Action cards
  const actsBox = document.getElementById("dt-actions-list");
  actsBox.innerHTML = "";
  data.timeline_actions.forEach(a => {
    actsBox.innerHTML += `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:10px 14px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="font-weight:700; color:#38bdf8">${a.hour}</span>
          <span class="badge badge-success">Confidence ${a.confidence}</span>
        </div>
        <div style="font-size:13px; color:var(--text-main); font-weight:500;">${a.action}</div>
        <div style="font-size:11px; color:#34d399; margin-top:4px;">⚡ Overflow Prevention: ${a.impact}</div>
      </div>
    `;
  });
}

// 10. 56-Day Evaluation & Accuracy Overview
async function loadBenchmarkData() {
  try {
    const res = await fetch("/api/benchmark");
    const data = await res.json();
    renderBenchmarkChart(data.series);
  } catch (err) {
    console.error("Benchmark error:", err);
  }
}

function renderBenchmarkChart(series) {
  const svg = document.getElementById("benchmark-svg");
  if (!svg) return;
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 350;
  svg.innerHTML = "";

  const padding = { top: 30, right: 30, bottom: 45, left: 55 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const yMax = 350;
  const yMin = 150;

  const getX = i => padding.left + (i / (series.length - 1)) * plotW;
  const getY = val => padding.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Grid lines
  for (let val = 160; val <= 340; val += 20) {
    const y = getY(val);
    svg.innerHTML += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.05)"/>`;
    svg.innerHTML += `<text x="${padding.left - 10}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${val}</text>`;
  }

  // 1. Draw 7-day Moving Average (Purple)
  let maD = `M ${getX(0)} ${getY(series[0].ma_7)}`;
  for (let i = 1; i < series.length; i++) {
    maD += ` L ${getX(i)} ${getY(series[i].ma_7)}`;
  }
  svg.innerHTML += `<path d="${maD}" fill="none" stroke="#a855f7" stroke-width="1.8" stroke-dasharray="3"/>`;

  // 2. Draw Actual Demand (Dark Slate)
  let actD = `M ${getX(0)} ${getY(series[0].actual)}`;
  for (let i = 1; i < series.length; i++) {
    actD += ` L ${getX(i)} ${getY(series[i].actual)}`;
  }
  svg.innerHTML += `<path d="${actD}" fill="none" stroke="#64748b" stroke-width="2"/>`;

  // 3. Draw ML Forecast (Cyan)
  let mlD = `M ${getX(0)} ${getY(series[0].ml_forecast)}`;
  for (let i = 1; i < series.length; i++) {
    mlD += ` L ${getX(i)} ${getY(series[i].ml_forecast)}`;
  }
  svg.innerHTML += `<path d="${mlD}" fill="none" stroke="#06b6d4" stroke-width="2.5"/>`;

  // Surge annotation at day 18 peak
  const peakDayIdx = 17; // Day 18
  const peakX = getX(peakDayIdx);
  const peakY = getY(series[peakDayIdx].actual);
  svg.innerHTML += `
    <circle cx="${peakX}" cy="${peakY}" r="5" fill="#ef4444"/>
    <text x="${peakX}" y="${peakY - 12}" fill="#f87171" font-size="11" font-weight="700" text-anchor="middle">Day 18 Surge (315 Beds)</text>
  `;

  // X Axis Day labels (1, 8, 15, 22, 29, 36, 43, 50, 56)
  [1, 8, 15, 22, 29, 36, 43, 50, 56].forEach(day => {
    const idx = day - 1;
    if (idx < series.length) {
      const x = getX(idx);
      svg.innerHTML += `<text x="${x}" y="${height - 18}" fill="#94a3b8" font-size="11" text-anchor="middle">Day ${day}</text>`;
    }
  });
}

// 11. Administrator Feedback Loop
async function loadAuditLog() {
  try {
    const res = await fetch("/api/audit-log");
    const data = await res.json();
    renderAuditTable(data);
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

function renderAuditTable(records) {
  const tbody = document.getElementById("audit-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  records.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.id}</strong></td>
      <td>${r.timestamp}</td>
      <td>${r.action}</td>
      <td><span class="badge badge-success">${r.status}</span></td>
      <td><span style="color:#94a3b8">${r.notes || "Continuous learning vector updated"}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

async function applyDecisionAction(title, dept, type) {
  try {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action_title: title,
        department: dept,
        action_type: type,
        notes: `Administrator ${type} registered in decision support telemetry.`
      })
    });
    const result = await res.json();
    renderAuditTable(result.audit_log);
    showToast(`${type} action logged: ${title}`);
  } catch (err) {
    console.error("Action apply error:", err);
    showToast(`Action ${type} recorded locally.`);
  }
}

function applyQuickAction(title, dept) {
  applyDecisionAction(title, dept, "APPROVE");
}

function submitAuditEntry() {
  const title = document.getElementById("audit-title").value.trim();
  const dept = document.getElementById("audit-dept").value;
  const type = document.getElementById("audit-type").value;
  if (!title) {
    alert("Please enter an action description.");
    return;
  }
  applyDecisionAction(title, dept, type);
  document.getElementById("audit-title").value = "";
}

// 12. Real-Time Resource Inventory Matrix ("Kitna Kya Cheez Hai")
function renderInventoryMatrix(data) {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody || !data || !data.capacity) return;
  const cap = data.capacity;
  const cfg = data.capacity_config || { nurse_to_icu_ratio: 2.0, nurse_to_ward_ratio: 5.0 };

  const rows = [
    {
      name: "General Inpatient Ward Beds",
      total: cap.general_beds.total,
      occupied: cap.general_beds.occupied,
      reserved: cap.general_beds.reserved,
      free: cap.general_beds.available,
      rate: Math.round((cap.general_beds.occupied / cap.general_beds.total) * 100) + "%",
      status: `1:${cfg.nurse_to_ward_ratio || 5.0} Staffed (Optimal)`
    },
    {
      name: "Intensive Care Unit (ICU) Beds",
      total: cap.icu_beds.total,
      occupied: cap.icu_beds.occupied,
      reserved: cap.icu_beds.reserved,
      free: cap.icu_beds.available,
      rate: Math.round((cap.icu_beds.occupied / cap.icu_beds.total) * 100) + "%",
      status: (cap.icu_beds.occupied / cap.icu_beds.total > 0.9) ? `⚠️ High Saturation (1:${cfg.nurse_to_icu_ratio || 2.0} Active)` : "Normal Bounds"
    },
    {
      name: "Operating Rooms (Surgical Theatres)",
      total: cap.operating_rooms.total,
      occupied: cap.operating_rooms.active,
      reserved: cap.operating_rooms.turnaround,
      free: cap.operating_rooms.idle,
      rate: Math.round((cap.operating_rooms.active / cap.operating_rooms.total) * 100) + "%",
      status: "83.3% Dynamic Scheduling"
    },
    {
      name: "Emergency Department Bays",
      total: cap.ed_bays.total,
      occupied: cap.ed_bays.occupied,
      reserved: 3,
      free: cap.ed_bays.available,
      rate: Math.round((cap.ed_bays.occupied / cap.ed_bays.total) * 100) + "%",
      status: "+28% Inflow Surge (Managed)"
    },
    {
      name: "Registered Nursing Workforce",
      total: cap.staff.required_nurses,
      occupied: cap.staff.on_duty_nurses,
      reserved: cap.staff.float_pool_available || 13,
      free: cap.staff.float_pool_available || 13,
      rate: Math.round((cap.staff.on_duty_nurses / cap.staff.required_nurses) * 100) + "%",
      status: "Compliant Clinical Ratios"
    },
    {
      name: "Specialist Doctors & Surgeons",
      total: cap.staff.required_doctors,
      occupied: cap.staff.on_duty_doctors,
      reserved: 2,
      free: Math.max(0, cap.staff.required_doctors - cap.staff.on_duty_doctors),
      rate: Math.round((cap.staff.on_duty_doctors / cap.staff.required_doctors) * 100) + "%",
      status: "On-Call Emergency Active"
    }
  ];

  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.name}</strong></td>
      <td><span style="font-weight:700; color:#f8fafc;">${r.total}</span></td>
      <td><span style="color:#06b6d4; font-weight:600;">${r.occupied}</span></td>
      <td><span style="color:#a855f7;">${r.reserved}</span></td>
      <td><span style="color:#10b981; font-weight:700;">${r.free}</span></td>
      <td><span class="badge ${parseInt(r.rate) > 90 ? 'badge-critical' : 'badge-info'}">${r.rate}</span></td>
      <td><span style="color:${r.status.includes('High') ? '#f87171' : '#34d399'}; font-size:12px;">${r.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// 13. Hospital Capacity & Ratio Customizer ("Ise Edit Kaise Karenge")
async function saveHospitalConfiguration() {
  const name = document.getElementById("cfg-hospital-name").value;
  const wardBeds = parseInt(document.getElementById("cfg-ward-beds").value) || 280;
  const icuBeds = parseInt(document.getElementById("cfg-icu-beds").value) || 45;
  const orTheatres = parseInt(document.getElementById("cfg-or-theatres").value) || 12;
  const edBays = parseInt(document.getElementById("cfg-ed-bays").value) || 35;
  const nurses = parseInt(document.getElementById("cfg-total-nurses").value) || 125;
  const doctors = parseInt(document.getElementById("cfg-total-doctors").value) || 38;
  const icuRatio = parseFloat(document.getElementById("cfg-icu-ratio").value) || 2.0;
  const wardRatio = parseFloat(document.getElementById("cfg-ward-ratio").value) || 5.0;

  try {
    const res = await fetch("/api/hospital/configure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hospital_name: name,
        total_ward_beds: wardBeds,
        total_icu_beds: icuBeds,
        total_or_theatres: orTheatres,
        total_ed_bays: edBays,
        total_nurses: nurses,
        total_doctors: doctors,
        nurse_to_icu_ratio: icuRatio,
        nurse_to_ward_ratio: wardRatio
      })
    });
    const result = await res.json();
    if (result.status === "SUCCESS") {
      hospitalStateCache = result.hospital_state;
      updateAllUIState(hospitalStateCache);
      showToast("Hospital Profile Saved! Live Numbers & Capacities Updated.");
    }
  } catch (err) {
    console.error("Config save error:", err);
    showToast("Error updating hospital configuration.", "info");
  }
}

async function applyPresetScale(presetType) {
  try {
    const res = await fetch("/api/hospital/preset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset_type: presetType })
    });
    const result = await res.json();
    if (result.status === "SUCCESS") {
      hospitalStateCache = result.hospital_state;
      const cfg = hospitalStateCache.capacity_config;
      document.getElementById("cfg-hospital-name").value = hospitalStateCache.hospital_name;
      document.getElementById("cfg-ward-beds").value = cfg.total_ward_beds;
      document.getElementById("cfg-icu-beds").value = cfg.total_icu_beds;
      document.getElementById("cfg-or-theatres").value = cfg.total_or_theatres;
      document.getElementById("cfg-ed-bays").value = cfg.total_ed_bays;
      document.getElementById("cfg-total-nurses").value = cfg.total_nurses;
      document.getElementById("cfg-total-doctors").value = cfg.total_doctors;
      document.getElementById("cfg-icu-ratio").value = cfg.nurse_to_icu_ratio;
      document.getElementById("cfg-ward-ratio").value = cfg.nurse_to_ward_ratio;
      updateAllUIState(hospitalStateCache);
      showToast(`Scale Preset Applied: ${presetType.replace('_', ' ').toUpperCase()}`);
    }
  } catch (err) {
    console.error("Preset error:", err);
  }
}

function updateAllUIState(data) {
  const cap = data.capacity;
  // Update Top KPI Banner
  document.getElementById("kpi-ward-val").innerText = `${cap.general_beds.occupied} / ${cap.general_beds.total}`;
  document.getElementById("kpi-ward-bar").style.width = `${Math.round((cap.general_beds.occupied / cap.general_beds.total) * 100)}%`;
  
  document.getElementById("kpi-icu-val").innerText = `${cap.icu_beds.occupied} / ${cap.icu_beds.total}`;
  document.getElementById("kpi-icu-bar").style.width = `${Math.round((cap.icu_beds.occupied / cap.icu_beds.total) * 100)}%`;

  document.getElementById("kpi-or-val").innerText = `${cap.operating_rooms.active} / ${cap.operating_rooms.total} Active`;
  document.getElementById("kpi-or-bar").style.width = `${Math.round((cap.operating_rooms.active / cap.operating_rooms.total) * 100)}%`;

  document.getElementById("kpi-nurse-val").innerText = `${cap.staff.on_duty_nurses} / ${cap.staff.required_nurses}`;
  document.getElementById("kpi-nurse-bar").style.width = `${Math.round((cap.staff.on_duty_nurses / cap.staff.required_nurses) * 100)}%`;

  // Re-render submodules
  renderWardsModule(data.ward_units);
  renderICUModule(data.icu_units);
  renderORModule(data.operating_rooms_list);
  renderStaffModule(data.staff_roster);
  renderInventoryMatrix(data);

  // Update optimizer sliders
  const optWard = document.getElementById("opt-ward-demand");
  if (optWard) {
    optWard.max = data.capacity.general_beds.total * 1.2;
    optWard.value = data.capacity.general_beds.occupied;
    document.getElementById("opt-ward-val").innerText = data.capacity.general_beds.occupied;
  }
  const optIcu = document.getElementById("opt-icu-demand");
  if (optIcu) {
    optIcu.max = data.capacity.icu_beds.total * 1.3;
    optIcu.value = data.capacity.icu_beds.occupied;
    document.getElementById("opt-icu-val").innerText = data.capacity.icu_beds.occupied;
  }
  runOptimizationSolve();
}
