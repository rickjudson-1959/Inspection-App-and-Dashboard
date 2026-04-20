/**
 * contractCompliance.js — Contract Compliance Engine
 *
 * Pure calculation module for Canadian pipeline contract rules.
 * Standard: 8 RT / 1.5x OT / 2.0x DT with jurisdiction-aware holiday handling.
 *
 * No side effects. Supabase calls are isolated to loadProjectRules() and
 * getHolidayForDate() — all other functions are pure.
 */

import { supabase } from '../supabase'

/**
 * Load project contract rules and cache them.
 * Called once per reconciliation session.
 *
 * @param {string} projectId - UUID
 * @returns {object} { id, province, base_hours_per_day, ot_multiplier, dt_multiplier }
 */
export async function loadProjectRules(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, province, base_hours_per_day, ot_multiplier, dt_multiplier')
    .eq('id', projectId)
    .single()
  if (error) throw error
  return data
}

/**
 * Check if a given date is a statutory holiday for the project's province.
 * Returns the holiday object if it is, null otherwise.
 *
 * Checks both federal holidays (apply to all provinces) and provincial
 * holidays specific to the given province.
 *
 * @param {string} reportDate - ISO date string YYYY-MM-DD
 * @param {string} province - Two-letter province code (AB, BC, etc.)
 * @returns {object|null} Holiday object or null
 */
export async function getHolidayForDate(reportDate, province) {
  const { data, error } = await supabase
    .from('statutory_holidays')
    .select('id, name, jurisdiction, province')
    .eq('holiday_date', reportDate)
    .or(`jurisdiction.eq.federal,and(jurisdiction.eq.provincial,province.eq.${province})`)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Calculate the contract-correct RT/OT/DT split for a given
 * total hours, date, and project rules.
 *
 * Rules (standard Canadian pipeline contract):
 *   1. Statutory holiday → all hours DT (takes precedence over day-of-week)
 *   2. Sunday → all hours DT
 *   3. Saturday → all hours OT
 *   4. Weekday → first base_hours_per_day RT, remainder OT
 *
 * @param {number} totalHours - Total hours worked
 * @param {string} reportDate - ISO date string (YYYY-MM-DD)
 * @param {object} projectRules - { base_hours_per_day, ot_multiplier, dt_multiplier, province }
 * @param {object|null} holiday - Holiday object from getHolidayForDate, or null
 * @returns {object} { rt_hours, ot_hours, dt_hours, rule_applied, rule_description }
 */
export function calculateSplit(totalHours, reportDate, projectRules, holiday) {
  const { base_hours_per_day } = projectRules
  const date = new Date(reportDate + 'T12:00:00') // noon to avoid TZ drift
  const dayOfWeek = date.getUTCDay() // 0=Sun, 6=Sat

  // Rule 1: Statutory holiday → all hours DT (takes precedence over day-of-week)
  if (holiday) {
    return {
      rt_hours: 0,
      ot_hours: 0,
      dt_hours: totalHours,
      rule_applied: 'holiday_dt',
      rule_description: `Statutory holiday (${holiday.name}) — all hours at DT rate`,
    }
  }

  // Rule 2: Sunday → all hours DT
  if (dayOfWeek === 0) {
    return {
      rt_hours: 0,
      ot_hours: 0,
      dt_hours: totalHours,
      rule_applied: 'sunday_dt',
      rule_description: 'Sunday — all hours at DT rate',
    }
  }

  // Rule 3: Saturday → all hours OT
  if (dayOfWeek === 6) {
    return {
      rt_hours: 0,
      ot_hours: totalHours,
      dt_hours: 0,
      rule_applied: 'saturday_ot',
      rule_description: 'Saturday — all hours at OT rate',
    }
  }

  // Rule 4: Weekday → first N hours RT, remainder OT
  const rt = Math.min(totalHours, base_hours_per_day)
  const ot = Math.max(0, totalHours - base_hours_per_day)
  return {
    rt_hours: rt,
    ot_hours: ot,
    dt_hours: 0,
    rule_applied: 'weekday_standard',
    rule_description: rt < base_hours_per_day
      ? `Weekday — ${rt} hrs RT`
      : ot > 0
        ? `Weekday — first ${base_hours_per_day} hrs RT, ${ot} hrs OT`
        : `Weekday — ${rt} hrs RT`,
  }
}

/**
 * Calculate the billing cost of a labour entry given its split
 * and the rate card.
 *
 * @param {object} split - { rt_hours, ot_hours, dt_hours }
 * @param {object} rateCard - { rate_st, rate_ot, rate_dt, rate_subs }
 * @param {number} subsApplied - Subsistence dollars (typically 0 or 1 day's worth)
 * @returns {number} Total cost in dollars
 */
export function calculateCost(split, rateCard, subsApplied = 0) {
  const rt_cost = (split.rt_hours || 0) * (rateCard.rate_st || 0)
  const ot_cost = (split.ot_hours || 0) * (rateCard.rate_ot || 0)
  const dt_cost = (split.dt_hours || 0) * (rateCard.rate_dt || 0)
  return rt_cost + ot_cost + dt_cost + (subsApplied || 0)
}

/**
 * Calculate dollar variance between LEM-claimed split and
 * contract-correct split for the same total hours.
 *
 * @param {object} lemSplit - { rt_hours, ot_hours, dt_hours } as claimed on LEM
 * @param {object} contractSplit - { rt_hours, ot_hours, dt_hours } per contract rules
 * @param {object} rateCard - { rate_st, rate_ot, rate_dt }
 * @returns {number} Positive = LEM overbilled. Negative = LEM underbilled.
 */
export function calculateVariance(lemSplit, contractSplit, rateCard) {
  const lem_cost = calculateCost(lemSplit, rateCard)
  const contract_cost = calculateCost(contractSplit, rateCard)
  return lem_cost - contract_cost
}
