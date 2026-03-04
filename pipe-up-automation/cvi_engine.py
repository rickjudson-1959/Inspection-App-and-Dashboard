#!/usr/bin/env python3
"""
Pipe-Up Capital Variance Index (CVI) Engine
============================================
Standalone proof-of-concept that calculates a single headline metric telling
a VP whether the project will finish over budget and by how much.

CVI = Approved Capital / EAC_adjusted

Where EAC_adjusted includes schedule-driven indirect cost growth that standard
EVM misses. Produces dashboard-ready JSON for future React widget consumption.

Usage:
    python cvi_engine.py --demo                        # Generate 180 days of simulated data
    python cvi_engine.py --demo --dry-run              # Preview demo without writing files
    python cvi_engine.py --input data/daily_evm.json   # Process real EVM data file
    python cvi_engine.py --date 2026-03-01             # Override calculation date
"""

import argparse
import json
import math
import random
import sys
from datetime import datetime, timedelta, date
from pathlib import Path


# ─── Configuration ───────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
CONFIG_FILE = BASE_DIR / "data" / "cvi_project_config.json"
HISTORY_FILE = BASE_DIR / "data" / "cvi_history.json"
DASHBOARD_FILE = BASE_DIR / "data" / "cvi_dashboard.json"

BAR = "═" * 43

# Default alert thresholds (overridable from config)
DEFAULT_THRESHOLDS = {
    "cvi_overall_warning": 0.95,
    "cvi_trend_7d_warning": -0.01,
    "schedule_overrun_days_warning": 30,
    "phase_cvi_warning": 0.85,
    "cvi_indirect_warning": 0.90,
}

# CPI floor to prevent runaway EAC from near-zero CPI
CPI_FLOOR = 0.7


# ─── Data Loading ────────────────────────────────────────────────────────────

def load_config():
    """Read cvi_project_config.json and return parsed dict."""
    if not CONFIG_FILE.exists():
        print(f"  ERROR: Config file not found: {CONFIG_FILE}")
        sys.exit(1)
    config = json.loads(CONFIG_FILE.read_text())
    validate_config(config)
    return config


def load_daily_input(path):
    """Read a daily EVM JSON input file."""
    p = Path(path)
    if not p.exists():
        print(f"  ERROR: Input file not found: {p}")
        sys.exit(1)
    return json.loads(p.read_text())


def load_history():
    """Read cvi_history.json or return empty list."""
    if HISTORY_FILE.exists():
        return json.loads(HISTORY_FILE.read_text())
    return []


def validate_config(config):
    """Check that config has all required keys and budgets sum correctly."""
    required = [
        "project_name", "approved_capital", "budget_at_completion",
        "planned_duration_days", "project_start_date", "planned_end_date",
        "daily_indirect_rate", "indirect_budget", "direct_budget", "phases",
    ]
    missing = [k for k in required if k not in config]
    if missing:
        print(f"  ERROR: Config missing required keys: {', '.join(missing)}")
        sys.exit(1)

    # Validate: direct + indirect = BAC (working budget)
    direct = config["direct_budget"]
    indirect = config["indirect_budget"]
    contingency = config.get("contingency", 0)
    bac = config["budget_at_completion"]
    if abs((direct + indirect) - bac) > 1:
        print(f"  WARNING: direct ({direct:,}) + indirect ({indirect:,}) "
              f"= {direct + indirect:,} != BAC ({bac:,})")
    # Validate: BAC + contingency = approved capital
    approved = config["approved_capital"]
    if abs((bac + contingency) - approved) > 1:
        print(f"  WARNING: BAC ({bac:,}) + contingency ({contingency:,}) "
              f"= {bac + contingency:,} != approved_capital ({approved:,})")

    # Validate phases have required fields
    for i, phase in enumerate(config["phases"]):
        for key in ["name", "budget", "planned_start", "planned_end", "weight"]:
            if key not in phase:
                print(f"  ERROR: Phase {i} missing '{key}'")
                sys.exit(1)


# ─── EVM Calculations ────────────────────────────────────────────────────────

def compute_evm(bcws, bcwp, acwp, bac):
    """
    Standard EVM from input data.
    CV = BCWP - ACWP, SV = BCWP - BCWS
    CPI = BCWP / ACWP, SPI = BCWP / BCWS
    """
    cv = bcwp - acwp
    sv = bcwp - bcws

    cpi = bcwp / acwp if acwp > 0 else 1.0
    spi = bcwp / bcws if bcws > 0 else 1.0

    return {
        "bcws": round(bcws, 2),
        "bcwp": round(bcwp, 2),
        "acwp": round(acwp, 2),
        "bac": round(bac, 2),
        "cv": round(cv, 2),
        "sv": round(sv, 2),
        "cpi": round(cpi, 4),
        "spi": round(spi, 4),
    }


# ─── EAC Direct ──────────────────────────────────────────────────────────────

def compute_eac_direct(acwp, bac, bcwp, cpi):
    """
    EAC_direct = ACWP + ((BAC - BCWP) / CPI)
    Floor CPI at 0.7 to prevent runaway estimates.
    """
    cpi_adj = max(cpi, CPI_FLOOR)
    remaining_work = bac - bcwp
    eac_direct = acwp + (remaining_work / cpi_adj)
    return round(eac_direct, 2)


# ─── Indirect Cost Growth ────────────────────────────────────────────────────

def compute_indirect_growth(spi, planned_duration, elapsed_days, daily_indirect_rate):
    """
    When SPI < 1.0, schedule slippage drives indirect cost growth:
      planned_remaining = planned_duration - elapsed_days
      projected_remaining = planned_remaining / SPI
      overrun_days = min(projected_remaining - planned_remaining, planned_remaining)
      indirect_cost_growth = overrun_days * daily_indirect_rate
    """
    if spi >= 1.0 or elapsed_days <= 0:
        return 0.0, 0

    planned_remaining = max(planned_duration - elapsed_days, 1)
    projected_remaining = planned_remaining / spi
    overrun_days = projected_remaining - planned_remaining
    # Cap overrun at planned_remaining (can't more than double the remaining schedule)
    overrun_days = min(overrun_days, planned_remaining)
    overrun_days = max(overrun_days, 0)

    indirect_cost_growth = overrun_days * daily_indirect_rate
    return round(indirect_cost_growth, 2), round(overrun_days)


# ─── CVI Metrics ─────────────────────────────────────────────────────────────

def compute_cvi(config, evm, eac_direct, indirect_cost_growth, overrun_days):
    """
    CVI_overall = approved_capital / EAC_adjusted
    CVI_direct = direct_budget / EAC_direct_only
    CVI_indirect = indirect_budget / (indirect_budget + indirect_cost_growth)
    capital_exposure = EAC_adjusted - approved_capital

    EAC_direct_only scales the project-level EAC to the direct-cost portion,
    so the comparison against direct_budget is apples-to-apples.
    """
    approved = config["approved_capital"]
    indirect_budget = config["indirect_budget"]
    direct_budget = config["direct_budget"]
    bac = config["budget_at_completion"]

    # Direct-only EAC: proportional share of ACWP/BCWP for direct costs
    direct_ratio = direct_budget / bac if bac > 0 else 0.7
    cpi = evm["cpi"]
    cpi_adj = max(cpi, CPI_FLOOR)
    direct_acwp = evm["acwp"] * direct_ratio
    direct_bcwp = evm["bcwp"] * direct_ratio
    eac_direct_only = direct_acwp + ((direct_budget - direct_bcwp) / cpi_adj)

    eac_adjusted = eac_direct + indirect_cost_growth
    cvi_overall = approved / eac_adjusted if eac_adjusted > 0 else 1.0
    cvi_direct = direct_budget / eac_direct_only if eac_direct_only > 0 else 1.0
    cvi_indirect = (indirect_budget / (indirect_budget + indirect_cost_growth)
                    if (indirect_budget + indirect_cost_growth) > 0 else 1.0)

    capital_exposure = eac_adjusted - approved

    # Projected end date
    start = datetime.strptime(config["project_start_date"], "%Y-%m-%d").date()
    planned_end = datetime.strptime(config["planned_end_date"], "%Y-%m-%d").date()
    projected_end = planned_end + timedelta(days=overrun_days)

    # Status color (matches evmCalculations.js thresholds)
    def status_color(val):
        if val >= 0.95:
            return "GREEN"
        if val >= 0.85:
            return "AMBER"
        return "RED"

    return {
        "cvi_overall": round(cvi_overall, 4),
        "cvi_direct": round(cvi_direct, 4),
        "cvi_indirect": round(cvi_indirect, 4),
        "eac_adjusted": round(eac_adjusted, 2),
        "eac_direct": round(eac_direct, 2),
        "capital_exposure": round(capital_exposure, 2),
        "overrun_days": overrun_days,
        "projected_end_date": projected_end.isoformat(),
        "planned_end_date": planned_end.isoformat(),
        "status": status_color(cvi_overall),
    }


# ─── Phase-Level CVI ─────────────────────────────────────────────────────────

def compute_phase_cvi(phases_config, phase_data):
    """
    For each phase: CPI, SPI, EAC, CVI, exposure, percent_complete, status.
    phase_data is a list of dicts with: name, bcws, bcwp, acwp.
    """
    results = []
    for pc, pd in zip(phases_config, phase_data):
        budget = pc["budget"]
        bcwp = pd.get("bcwp", 0)
        acwp = pd.get("acwp", 0)
        bcws = pd.get("bcws", 0)

        cpi = bcwp / acwp if acwp > 0 else 1.0
        spi = bcwp / bcws if bcws > 0 else 1.0
        cpi_adj = max(cpi, CPI_FLOOR)

        remaining = budget - bcwp
        eac = acwp + (remaining / cpi_adj) if remaining > 0 else acwp
        phase_cvi = budget / eac if eac > 0 else 1.0

        pct_complete = (bcwp / budget * 100) if budget > 0 else 0

        def status(val):
            if val >= 0.95:
                return "GREEN"
            if val >= 0.85:
                return "AMBER"
            return "RED"

        results.append({
            "name": pc["name"],
            "budget": budget,
            "bcws": round(bcws, 2),
            "bcwp": round(bcwp, 2),
            "acwp": round(acwp, 2),
            "cpi": round(cpi, 4),
            "spi": round(spi, 4),
            "eac": round(eac, 2),
            "cvi": round(phase_cvi, 4),
            "exposure": round(eac - budget, 2),
            "percent_complete": round(pct_complete, 1),
            "status": status(phase_cvi),
        })

    return results


# ─── Trend Calculations ──────────────────────────────────────────────────────

def compute_trends(history, current_cvi):
    """
    Load history, calculate 7d/14d/30d deltas.
    Direction: improving (>+0.005), worsening (<-0.005), stable.
    """
    def delta(days_back):
        if len(history) < days_back:
            return None
        past = history[-days_back]["cvi"]
        return round(current_cvi - past, 4)

    def direction(d):
        if d is None:
            return "insufficient_data"
        if d > 0.005:
            return "improving"
        if d < -0.005:
            return "worsening"
        return "stable"

    d7 = delta(7)
    d14 = delta(14)
    d30 = delta(30)

    return {
        "delta_7d": d7,
        "delta_14d": d14,
        "delta_30d": d30,
        "direction_7d": direction(d7),
        "direction_14d": direction(d14),
        "direction_30d": direction(d30),
    }


# ─── Alert Generation ────────────────────────────────────────────────────────

def generate_alerts(cvi_metrics, trends, phase_results, config):
    """
    Five alert rules:
    1. CVI overall < 0.95 → capital at risk
    2. CVI trend 7d < -0.01 → declining rapidly
    3. Schedule overrun > 30 days → indirect burn accelerating
    4. Any phase CVI < 0.85 → phase significantly over budget
    5. CVI indirect < 0.90 → indirect cost growth critical
    """
    alerts = []
    thresholds = config.get("alert_thresholds", DEFAULT_THRESHOLDS)

    cvi = cvi_metrics["cvi_overall"]
    threshold_overall = thresholds.get("cvi_overall_warning",
                                       DEFAULT_THRESHOLDS["cvi_overall_warning"])
    if cvi < threshold_overall:
        severity = "HIGH" if cvi < 0.90 else "MEDIUM"
        exposure = cvi_metrics["capital_exposure"]
        alerts.append({
            "severity": severity,
            "metric": "cvi_overall",
            "value": cvi,
            "threshold": threshold_overall,
            "message": (f"CVI {cvi:.3f} below {threshold_overall} — "
                        f"capital at risk (exposure: ${exposure:+,.0f})"),
        })

    # Trend alert
    threshold_trend = thresholds.get("cvi_trend_7d_warning",
                                     DEFAULT_THRESHOLDS["cvi_trend_7d_warning"])
    if trends["delta_7d"] is not None and trends["delta_7d"] < threshold_trend:
        alerts.append({
            "severity": "HIGH",
            "metric": "cvi_trend_7d",
            "value": trends["delta_7d"],
            "threshold": threshold_trend,
            "message": (f"CVI declining rapidly: {trends['delta_7d']:+.4f} over 7 days "
                        f"(threshold: {threshold_trend})"),
        })

    # Schedule overrun
    threshold_overrun = thresholds.get("schedule_overrun_days_warning",
                                       DEFAULT_THRESHOLDS["schedule_overrun_days_warning"])
    if cvi_metrics["overrun_days"] > threshold_overrun:
        alerts.append({
            "severity": "MEDIUM",
            "metric": "schedule_overrun",
            "value": cvi_metrics["overrun_days"],
            "threshold": threshold_overrun,
            "message": (f"Projected schedule overrun: {cvi_metrics['overrun_days']} days "
                        f"— indirect burn accelerating "
                        f"(projected end: {cvi_metrics['projected_end_date']})"),
        })

    # Phase-level alerts
    threshold_phase = thresholds.get("phase_cvi_warning",
                                     DEFAULT_THRESHOLDS["phase_cvi_warning"])
    for phase in phase_results:
        if phase["cvi"] < threshold_phase:
            alerts.append({
                "severity": "HIGH",
                "metric": "phase_cvi",
                "value": phase["cvi"],
                "threshold": threshold_phase,
                "message": (f"Phase '{phase['name']}' CVI {phase['cvi']:.3f} — "
                            f"significantly over budget "
                            f"(exposure: ${phase['exposure']:+,.0f})"),
            })

    # Indirect CVI
    threshold_indirect = thresholds.get("cvi_indirect_warning",
                                        DEFAULT_THRESHOLDS["cvi_indirect_warning"])
    if cvi_metrics["cvi_indirect"] < threshold_indirect:
        alerts.append({
            "severity": "HIGH",
            "metric": "cvi_indirect",
            "value": cvi_metrics["cvi_indirect"],
            "threshold": threshold_indirect,
            "message": (f"Indirect CVI {cvi_metrics['cvi_indirect']:.3f} — "
                        f"indirect cost growth critical"),
        })

    return alerts


# ─── Demo Data Generation ────────────────────────────────────────────────────

def logistic(t, k=0.04, mid=90):
    """Logistic function for S-curve and trend decay. Returns 0..1."""
    return 1.0 / (1.0 + math.exp(-k * (t - mid)))


def generate_demo_data(config, as_of_date=None):
    """
    Generate 180 days of realistic simulated EVM data.

    CPI trend: Logistic decay from ~1.02 to ~0.94 (cost erosion)
    SPI trend: Logistic decay from ~1.05 to ~0.88 (schedule slippage)
    S-curve: BAC allocation follows logistic for realistic earned value
    Discrete events injected at specific days
    Seeded: random.seed(42) for reproducibility
    """
    random.seed(42)

    bac = config["budget_at_completion"]
    planned_days = config["planned_duration_days"]
    start = datetime.strptime(config["project_start_date"], "%Y-%m-%d").date()
    demo_days = 180

    # Phase profiles: CPI/SPI multipliers (HDD worst, Cleanup best)
    phase_profiles = {
        "Clearing & Grading":   {"cpi_mult": 0.98, "spi_mult": 1.00},
        "Stringing & Bending":  {"cpi_mult": 1.00, "spi_mult": 0.97},
        "Welding":              {"cpi_mult": 0.96, "spi_mult": 0.95},
        "Coating & Inspection": {"cpi_mult": 1.01, "spi_mult": 0.99},
        "Ditching":             {"cpi_mult": 0.97, "spi_mult": 0.96},
        "Lower-in & Backfill":  {"cpi_mult": 0.99, "spi_mult": 0.98},
        "HDD & Bores":          {"cpi_mult": 0.88, "spi_mult": 0.90},
        "Hydrostatic Testing":  {"cpi_mult": 1.02, "spi_mult": 1.01},
        "Tie-ins":              {"cpi_mult": 1.00, "spi_mult": 0.99},
        "Cleanup & Restoration": {"cpi_mult": 1.05, "spi_mult": 1.03},
    }

    # Discrete events
    events = [
        {"day": 35, "duration": 7, "cpi_impact": 0.0,  "spi_impact": -0.08,
         "name": "Heavy rain — 7-day work stoppage"},
        {"day": 72, "duration": 5, "cpi_impact": -0.06, "spi_impact": 0.0,
         "name": "Unexpected rock — extra blasting required"},
        {"day": 110, "duration": 3, "cpi_impact": 0.0,  "spi_impact": -0.04,
         "name": "Environmental window restriction"},
        {"day": 140, "duration": 10, "cpi_impact": -0.04, "spi_impact": 0.0,
         "name": "Scope change — additional HDD crossing"},
    ]

    history = []

    for day in range(1, demo_days + 1):
        t = day / demo_days  # 0..1 normalized progress

        # Base CPI: logistic decay from ~1.02 to ~0.94
        cpi_base = 1.02 - 0.08 * logistic(day, k=0.035, mid=100)

        # Base SPI: logistic decay from ~1.05 to ~0.88
        spi_base = 1.05 - 0.17 * logistic(day, k=0.030, mid=110)

        # Apply discrete events
        cpi_event = 0.0
        spi_event = 0.0
        active_events = []
        for evt in events:
            if evt["day"] <= day < evt["day"] + evt["duration"]:
                cpi_event += evt["cpi_impact"]
                spi_event += evt["spi_impact"]
                active_events.append(evt["name"])

        # Add daily noise
        cpi_noise = random.gauss(0, 0.005)
        spi_noise = random.gauss(0, 0.008)

        cpi = max(0.5, min(1.3, cpi_base + cpi_event + cpi_noise))
        spi = max(0.5, min(1.3, spi_base + spi_event + spi_noise))

        # S-curve: cumulative planned value follows logistic
        s_progress = logistic(day, k=0.04, mid=90)
        bcws = bac * s_progress
        bcwp = bcws * spi
        acwp = bcwp / cpi if cpi > 0 else bcwp

        # Elapsed days into project
        elapsed = day
        current_date = start + timedelta(days=day - 1)

        # Full CVI pipeline for this day
        evm = compute_evm(bcws, bcwp, acwp, bac)
        eac_direct = compute_eac_direct(acwp, bac, bcwp, cpi)
        indirect_growth, overrun = compute_indirect_growth(
            spi, planned_days, elapsed, config["daily_indirect_rate"]
        )
        cvi_metrics = compute_cvi(config, evm, eac_direct, indirect_growth, overrun)

        # Phase breakdown
        phase_data = []
        for pc in config["phases"]:
            pname = pc["name"]
            profile = phase_profiles.get(pname, {"cpi_mult": 1.0, "spi_mult": 1.0})
            p_weight = pc["weight"]
            p_budget = pc["budget"]

            # Phase progress depends on its planned window
            p_start = datetime.strptime(pc["planned_start"], "%Y-%m-%d").date()
            p_end = datetime.strptime(pc["planned_end"], "%Y-%m-%d").date()
            p_duration = (p_end - p_start).days
            p_elapsed = (current_date - p_start).days

            if p_elapsed <= 0:
                # Phase hasn't started
                phase_data.append({
                    "name": pname, "bcws": 0, "bcwp": 0, "acwp": 0,
                })
                continue

            p_progress = min(1.0, logistic(p_elapsed, k=0.05, mid=p_duration * 0.5))
            p_bcws = p_budget * p_progress

            p_cpi = cpi * profile["cpi_mult"]
            p_spi = spi * profile["spi_mult"]

            # Add phase-specific noise
            p_cpi += random.gauss(0, 0.003)
            p_spi += random.gauss(0, 0.004)
            p_cpi = max(0.5, min(1.3, p_cpi))
            p_spi = max(0.5, min(1.3, p_spi))

            p_bcwp = p_bcws * p_spi
            p_acwp = p_bcwp / p_cpi if p_cpi > 0 else p_bcwp

            phase_data.append({
                "name": pname,
                "bcws": round(p_bcws, 2),
                "bcwp": round(p_bcwp, 2),
                "acwp": round(p_acwp, 2),
            })

        phase_results = compute_phase_cvi(config["phases"], phase_data)

        # Build history entry
        history.append({
            "date": current_date.isoformat(),
            "day": day,
            "cvi": cvi_metrics["cvi_overall"],
            "cvi_direct": cvi_metrics["cvi_direct"],
            "cvi_indirect": cvi_metrics["cvi_indirect"],
            "cpi": evm["cpi"],
            "spi": evm["spi"],
            "capital_exposure": cvi_metrics["capital_exposure"],
            "overrun_days": cvi_metrics["overrun_days"],
            "status": cvi_metrics["status"],
            "active_events": active_events,
        })

    # Build final dashboard from last day
    last = history[-1]
    last_date = date.fromisoformat(last["date"])

    # Recompute final day fully for dashboard output
    final_evm = compute_evm(bcws, bcwp, acwp, bac)
    final_eac_direct = compute_eac_direct(acwp, bac, bcwp, cpi)
    final_indirect_growth, final_overrun = compute_indirect_growth(
        spi, planned_days, demo_days, config["daily_indirect_rate"]
    )
    final_cvi = compute_cvi(config, final_evm, final_eac_direct,
                            final_indirect_growth, final_overrun)
    final_phases = compute_phase_cvi(config["phases"], phase_data)
    final_trends = compute_trends(history, final_cvi["cvi_overall"])
    final_alerts = generate_alerts(final_cvi, final_trends, final_phases, config)

    dashboard = build_dashboard(
        config, final_evm, final_cvi, final_phases,
        final_alerts, final_trends, history, last_date,
        planned_days, demo_days,
    )

    return history, dashboard


# ─── History Management ──────────────────────────────────────────────────────

def save_history(new_entries, replace_all=False):
    """
    Append-only, keyed by date (idempotent re-runs replace same date).
    Cap at 365 entries (rolling year).
    replace_all=True for demo mode batch-write.
    """
    if replace_all:
        history = {}
    else:
        existing = load_history()
        history = {e["date"]: e for e in existing}

    for entry in new_entries:
        history[entry["date"]] = entry

    # Sort by date and cap at 365
    sorted_entries = sorted(history.values(), key=lambda e: e["date"])
    if len(sorted_entries) > 365:
        sorted_entries = sorted_entries[-365:]

    HISTORY_FILE.write_text(json.dumps(sorted_entries, indent=2) + "\n")
    return len(sorted_entries)


def save_dashboard(dashboard):
    """Write dashboard JSON file."""
    DASHBOARD_FILE.write_text(json.dumps(dashboard, indent=2) + "\n")


# ─── Dashboard JSON Output ───────────────────────────────────────────────────

def build_dashboard(config, evm, cvi_metrics, phases, alerts, trends,
                    history, as_of_date, planned_duration, elapsed_days):
    """Build the output JSON matching the brief's schema."""
    # Trim history for dashboard (last 90 entries max)
    history_trimmed = [
        {
            "date": h["date"],
            "cvi": h["cvi"],
            "cvi_direct": h["cvi_direct"],
            "cvi_indirect": h["cvi_indirect"],
            "cpi": h.get("cpi"),
            "spi": h.get("spi"),
            "capital_exposure": h.get("capital_exposure"),
            "status": h.get("status"),
        }
        for h in history[-90:]
    ]

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "project": config["project_name"],
        "as_of_date": as_of_date.isoformat() if isinstance(as_of_date, date) else str(as_of_date),
        "summary": {
            "cvi_overall": cvi_metrics["cvi_overall"],
            "cvi_direct": cvi_metrics["cvi_direct"],
            "cvi_indirect": cvi_metrics["cvi_indirect"],
            "eac_adjusted": cvi_metrics["eac_adjusted"],
            "eac_direct": cvi_metrics["eac_direct"],
            "capital_exposure": cvi_metrics["capital_exposure"],
            "approved_capital": config["approved_capital"],
            "budget_at_completion": config["budget_at_completion"],
            "overrun_days": cvi_metrics["overrun_days"],
            "projected_end_date": cvi_metrics["projected_end_date"],
            "planned_end_date": cvi_metrics["planned_end_date"],
            "status": cvi_metrics["status"],
        },
        "evm": evm,
        "trends": trends,
        "schedule": {
            "planned_duration_days": planned_duration,
            "elapsed_days": elapsed_days,
            "overrun_days": cvi_metrics["overrun_days"],
            "projected_end_date": cvi_metrics["projected_end_date"],
            "planned_end_date": cvi_metrics["planned_end_date"],
            "percent_elapsed": round(elapsed_days / planned_duration * 100, 1),
        },
        "phases": phases,
        "alerts": alerts,
        "history": history_trimmed,
    }


# ─── Console Output ──────────────────────────────────────────────────────────

def print_summary(dashboard, demo=False):
    """Print CVI summary matching generate.py/parse_permits.py bar style."""
    s = dashboard["summary"]
    mode = " (DEMO)" if demo else ""

    print(BAR)
    print(f"  Pipe-Up Capital Variance Index (CVI){mode}")
    print(f"  {dashboard['project']}")
    print(f"  As of: {dashboard['as_of_date']}")
    print(BAR)
    print(f"  CVI Overall:      {s['cvi_overall']:.3f}  [{s['status']}]")
    print(f"  CVI Direct:       {s['cvi_direct']:.3f}")
    print(f"  CVI Indirect:     {s['cvi_indirect']:.3f}")
    print(f"  Capital Exposure:  ${s['capital_exposure']:+,.0f}")
    print(f"  EAC Adjusted:      ${s['eac_adjusted']:,.0f}")
    print(f"  Approved Capital:  ${s['approved_capital']:,.0f}")

    # Schedule
    sched = dashboard["schedule"]
    print(f"  Schedule Overrun:  {sched['overrun_days']} days")
    print(f"  Projected End:     {sched['projected_end_date']}")

    # EVM
    evm = dashboard["evm"]
    print(f"  CPI: {evm['cpi']:.3f}   SPI: {evm['spi']:.3f}")

    # Trends
    trends = dashboard.get("trends", {})
    d7 = trends.get("delta_7d")
    if d7 is not None:
        print(f"  7-day Trend:       {d7:+.4f} ({trends['direction_7d']})")

    # Alerts
    alerts = dashboard.get("alerts", [])
    if alerts:
        print(f"  Alerts:            {len(alerts)}")
        for a in alerts:
            print(f"    [{a['severity']}] {a['message']}")

    # Phases summary
    phases = dashboard.get("phases", [])
    if phases:
        red_phases = [p for p in phases if p["status"] == "RED"]
        amber_phases = [p for p in phases if p["status"] == "AMBER"]
        green_phases = [p for p in phases if p["status"] == "GREEN"]
        print(f"  Phases:            {len(green_phases)} GREEN, "
              f"{len(amber_phases)} AMBER, {len(red_phases)} RED")

    print(BAR)


# ─── Main / CLI ──────────────────────────────────────────────────────────────

def run_demo_mode(config, dry_run=False, as_of_date=None):
    """Generate 180 days of demo data, write history + dashboard, print summary."""
    print(f"  Mode: DEMO {'(dry run)' if dry_run else ''}")
    print(f"  Generating 180 days of simulated EVM data...")
    print(f"  Random seed: 42 (reproducible)\n")

    history, dashboard = generate_demo_data(config, as_of_date)

    if not dry_run:
        count = save_history(history, replace_all=True)
        save_dashboard(dashboard)
        hist_rel = HISTORY_FILE.relative_to(BASE_DIR)
        dash_rel = DASHBOARD_FILE.relative_to(BASE_DIR)
        print(f"  History entries: {count}")
        print(BAR)
        print("  Output:")
        print(f"    → {hist_rel} ({count} entries)")
        print(f"    → {dash_rel}")
        print(BAR)
    else:
        print(f"  History entries: {len(history)} (not written — dry run)")
        print(f"  Dashboard keys: {', '.join(dashboard.keys())}")

    print()
    print_summary(dashboard, demo=True)


def run_input_mode(config, input_path, as_of_date=None):
    """Process single-day EVM input, append to history, write dashboard."""
    data = load_daily_input(input_path)

    # Extract EVM inputs
    bcws = data["bcws"]
    bcwp = data["bcwp"]
    acwp = data["acwp"]
    bac = config["budget_at_completion"]
    elapsed = data.get("elapsed_days", 1)
    calc_date = as_of_date or date.fromisoformat(data.get("date", date.today().isoformat()))

    # Core pipeline
    evm = compute_evm(bcws, bcwp, acwp, bac)
    eac_direct = compute_eac_direct(acwp, bac, bcwp, evm["cpi"])
    indirect_growth, overrun = compute_indirect_growth(
        evm["spi"], config["planned_duration_days"],
        elapsed, config["daily_indirect_rate"],
    )
    cvi_metrics = compute_cvi(config, evm, eac_direct, indirect_growth, overrun)

    # Phase data from input (if provided)
    phase_data = data.get("phases", [
        {"name": p["name"], "bcws": 0, "bcwp": 0, "acwp": 0}
        for p in config["phases"]
    ])
    phase_results = compute_phase_cvi(config["phases"], phase_data)

    # History
    existing_history = load_history()
    entry = {
        "date": calc_date.isoformat(),
        "day": elapsed,
        "cvi": cvi_metrics["cvi_overall"],
        "cvi_direct": cvi_metrics["cvi_direct"],
        "cvi_indirect": cvi_metrics["cvi_indirect"],
        "cpi": evm["cpi"],
        "spi": evm["spi"],
        "capital_exposure": cvi_metrics["capital_exposure"],
        "overrun_days": cvi_metrics["overrun_days"],
        "status": cvi_metrics["status"],
        "active_events": [],
    }
    count = save_history([entry])

    # Trends from history + new entry
    all_history = load_history()
    trends = compute_trends(all_history, cvi_metrics["cvi_overall"])
    alerts = generate_alerts(cvi_metrics, trends, phase_results, config)

    # Dashboard
    dashboard = build_dashboard(
        config, evm, cvi_metrics, phase_results, alerts, trends,
        all_history, calc_date, config["planned_duration_days"], elapsed,
    )
    save_dashboard(dashboard)

    hist_rel = HISTORY_FILE.relative_to(BASE_DIR)
    dash_rel = DASHBOARD_FILE.relative_to(BASE_DIR)
    print(f"  Input: {input_path}")
    print(f"  Date:  {calc_date.isoformat()}")
    print(BAR)
    print("  Output:")
    print(f"    → {hist_rel} ({count} entries)")
    print(f"    → {dash_rel}")
    print(BAR)
    print()
    print_summary(dashboard)


def main():
    parser = argparse.ArgumentParser(
        description="Pipe-Up Capital Variance Index (CVI) Engine"
    )
    parser.add_argument("--demo", action="store_true",
                        help="Generate 180 days of simulated demo data")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview without writing output files")
    parser.add_argument("--input", type=str,
                        help="Path to daily EVM JSON input file")
    parser.add_argument("--date", type=str,
                        help="Override calculation date (YYYY-MM-DD)")

    args = parser.parse_args()

    # Validate arguments
    if not args.demo and not args.input:
        parser.error("Either --demo or --input is required")

    if args.dry_run and not args.demo:
        parser.error("--dry-run only works with --demo")

    # Parse date override
    as_of_date = None
    if args.date:
        try:
            as_of_date = date.fromisoformat(args.date)
        except ValueError:
            parser.error(f"Invalid date format: {args.date} (use YYYY-MM-DD)")

    # Load config
    config = load_config()

    if args.demo:
        run_demo_mode(config, dry_run=args.dry_run, as_of_date=as_of_date)
    elif args.input:
        run_input_mode(config, args.input, as_of_date=as_of_date)


if __name__ == "__main__":
    main()
