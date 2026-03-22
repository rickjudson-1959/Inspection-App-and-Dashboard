/**
 * varianceCalculation.js
 *
 * Calculates hour and cost variances between contractor LEM entries
 * and inspector report entries for reconciliation.
 *
 * Pure utility functions — no imports required.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise an inspector entry into { rt, ot, dt } hours regardless of
 * which field-naming convention the caller used.
 *
 * Accepted keys (checked in priority order):
 *   RT  — rtHours | rt_hours | rt | hours
 *   OT  — otHours | ot_hours | ot
 *   DT  — dtHours | dt_hours | dt
 */
function normalizeInspectorHours(entry) {
  if (!entry) return { rt: 0, ot: 0, dt: 0 };

  const rt = num(
    entry.rtHours ?? entry.rt_hours ?? entry.rt ?? entry.hours ?? entry.jh ?? 0
  );
  const ot = num(entry.otHours ?? entry.ot_hours ?? entry.ot ?? 0);
  const dt = num(entry.dtHours ?? entry.dt_hours ?? entry.dt ?? 0);

  return { rt, ot, dt };
}

// ---------------------------------------------------------------------------
// 1. Worker variance
// ---------------------------------------------------------------------------

/**
 * Compare a single contractor LEM worker line against the matched
 * inspector report line and return hour / cost variance detail.
 *
 * @param {Object} lemEntry   — contractor LEM row
 * @param {Object} inspectorEntry — matched inspector row (may be null)
 * @returns {Object}
 */
export function calculateWorkerVariance(lemEntry, inspectorEntry) {
  const lem = lemEntry || {};
  const ins = inspectorEntry ? normalizeInspectorHours(inspectorEntry) : { rt: 0, ot: 0, dt: 0 };

  // LEM hours
  const lemHours = {
    rt: num(lem.rt_hours),
    ot: num(lem.ot_hours),
    dt: num(lem.dt_hours),
    total: num(lem.rt_hours) + num(lem.ot_hours) + num(lem.dt_hours),
  };

  // Inspector hours
  const inspectorHours = {
    rt: ins.rt,
    ot: ins.ot,
    dt: ins.dt,
    total: ins.rt + ins.ot + ins.dt,
  };

  // Rates from LEM
  const rtRate = num(lem.rt_rate);
  const otRate = num(lem.ot_rate);
  const dtRate = num(lem.dt_rate);

  // Hour variance (positive = contractor billed more)
  const hourVariance = {
    rt: lemHours.rt - inspectorHours.rt,
    ot: lemHours.ot - inspectorHours.ot,
    dt: lemHours.dt - inspectorHours.dt,
    total: lemHours.total - inspectorHours.total,
  };

  // Cost variance = hour variance * LEM rate per hour type
  const costVariance = {
    rt: hourVariance.rt * rtRate,
    ot: hourVariance.ot * otRate,
    dt: hourVariance.dt * dtRate,
    total: hourVariance.rt * rtRate + hourVariance.ot * otRate + hourVariance.dt * dtRate,
  };

  // LEM total cost (use provided total if available, otherwise compute)
  const lemCost =
    lem.total != null
      ? num(lem.total)
      : lemHours.rt * rtRate + lemHours.ot * otRate + lemHours.dt * dtRate;

  // Status determination based on total hour variance
  const totalHourVar = hourVariance.total;
  let status;
  if (totalHourVar === 0) {
    status = 'match';
  } else if (totalHourVar > 0 && totalHourVar <= 1) {
    status = 'minor';
  } else if (totalHourVar > 1) {
    status = 'review';
  } else {
    // totalHourVar < 0 — inspector recorded more hours than LEM
    status = 'under';
  }

  return {
    lemHours,
    inspectorHours,
    variance: {
      hours: hourVariance,
      cost: costVariance,
    },
    lemCost,
    status,
  };
}

// ---------------------------------------------------------------------------
// 2. Equipment variance
// ---------------------------------------------------------------------------

/**
 * Compare a single contractor LEM equipment line against the matched
 * inspector report line.
 *
 * @param {Object} lemEntry       — contractor LEM equipment row
 * @param {Object} inspectorEntry — matched inspector equipment row (may be null)
 * @returns {Object}
 */
export function calculateEquipmentVariance(lemEntry, inspectorEntry) {
  const lem = lemEntry || {};
  const ins = inspectorEntry || {};

  const lemHours = num(lem.hours);
  const lemRate = num(lem.rate);
  const lemCost = lem.total != null ? num(lem.total) : lemHours * lemRate;

  const inspectorHours = num(ins.hours ?? ins.count ?? 0);

  const hourVariance = lemHours - inspectorHours;
  const costVariance = hourVariance * lemRate;

  let status;
  if (hourVariance === 0) {
    status = 'match';
  } else if (hourVariance > 0 && hourVariance <= 1) {
    status = 'minor';
  } else if (hourVariance > 1) {
    status = 'review';
  } else {
    status = 'under';
  }

  return {
    lemHours: { total: lemHours },
    inspectorHours: { total: inspectorHours },
    variance: {
      hours: { total: hourVariance },
      cost: { total: costVariance },
    },
    lemCost,
    status,
  };
}

// ---------------------------------------------------------------------------
// 3. Variance color
// ---------------------------------------------------------------------------

/**
 * Return a CSS background colour keyed to the absolute cost variance.
 *
 * @param {number} costVariance — positive means contractor billed more
 * @returns {string} CSS colour value
 */
export function getVarianceColor(costVariance) {
  const v = num(costVariance);

  if (v < 0) return '#eff6ff';    // blue tint — inspector saw more (unusual)
  if (v === 0) return '#dcfce7';   // green — exact match
  if (v < 100) return '#fefce8';   // light yellow — $1-99
  if (v < 500) return '#fff7ed';   // orange tint — $100-499
  return '#fef2f2';                // red tint — $500+
}

// ---------------------------------------------------------------------------
// 4. Variance icon
// ---------------------------------------------------------------------------

/**
 * Return a status indicator character/emoji for use in the reconciliation UI.
 *
 * @param {string} status
 * @returns {string}
 */
export function getVarianceIcon(status) {
  switch (status) {
    case 'match':            return '\u2713';   // ✓
    case 'minor':            return '~';
    case 'review':           return '\u26A0\uFE0F'; // ⚠️
    case 'under':            return '\u2139\uFE0F'; // ℹ️
    case 'lem_only':         return '\uD83D\uDEA8'; // 🚨
    case 'inspector_only':   return '\u2014';   // —
    default:                 return '';
  }
}

// ---------------------------------------------------------------------------
// 5. Totals aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate an array of match results (as produced by the match engine)
 * into summary totals for the reconciliation panel.
 *
 * Each item in `matchResults` is expected to carry:
 *   - lemCost        (number)
 *   - variance.cost.total  (number)
 *   - status         ('match' | 'minor' | 'review' | 'under' | 'lem_only' | 'inspector_only')
 *
 * @param {Array} matchResults
 * @returns {Object}
 */
export function calculateTotals(matchResults) {
  if (!Array.isArray(matchResults) || matchResults.length === 0) {
    return {
      lemTotal: 0,
      inspectorTotal: 0,
      varianceTotal: 0,
      matchedCount: 0,
      unmatchedLemCount: 0,
      unmatchedInspectorCount: 0,
    };
  }

  let lemTotal = 0;
  let varianceTotal = 0;
  let matchedCount = 0;
  let unmatchedLemCount = 0;
  let unmatchedInspectorCount = 0;

  for (const r of matchResults) {
    const cost = num(r.lemCost);
    const varCost = r.variance?.cost?.total != null ? num(r.variance.cost.total) : 0;

    lemTotal += cost;
    varianceTotal += varCost;

    if (r.status === 'lem_only') {
      unmatchedLemCount++;
    } else if (r.status === 'inspector_only') {
      unmatchedInspectorCount++;
    } else {
      matchedCount++;
    }
  }

  // Inspector estimated total = LEM total minus the variance
  // (variance is positive when contractor billed more, so inspector saw less)
  const inspectorTotal = lemTotal - varianceTotal;

  return {
    lemTotal,
    inspectorTotal,
    varianceTotal,
    matchedCount,
    unmatchedLemCount,
    unmatchedInspectorCount,
  };
}
