-- =====================================================
-- FEED INTELLIGENCE v2 — Views
-- Date: 2026-03-19
-- Segment 2: Updated variance view + summary + benchmarks
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- VIEW 1: feed_wbs_variance (REPLACE existing)
-- Per-WBS-item variance with new scope_category,
-- basis_notes, and tagged LEM count columns.
-- =====================================================
DROP VIEW IF EXISTS feed_category_benchmarks;
DROP VIEW IF EXISTS feed_estimate_summary;
DROP VIEW IF EXISTS feed_wbs_variance;

CREATE VIEW feed_wbs_variance AS
SELECT
  w.id,
  w.organization_id,
  w.feed_estimate_id,
  w.wbs_code,
  w.scope_name,
  w.scope_category,
  w.estimated_amount,
  w.unit,
  w.unit_rate,
  w.quantity,
  w.basis_notes,
  w.sort_order,
  COALESCE(SUM(a.actual_amount), 0)                        AS actual_amount,
  COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount   AS variance_amount,
  CASE WHEN w.estimated_amount > 0
    THEN ROUND(
      ((COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount)
        / w.estimated_amount) * 100, 1
    )
    ELSE NULL
  END                                                       AS variance_pct,
  COUNT(a.id)                                               AS tagged_lem_count
FROM feed_wbs_items w
LEFT JOIN feed_wbs_actuals a ON a.wbs_item_id = w.id
GROUP BY w.id, w.organization_id, w.feed_estimate_id,
         w.wbs_code, w.scope_name, w.scope_category,
         w.estimated_amount, w.unit, w.unit_rate,
         w.quantity, w.basis_notes, w.sort_order;

-- =====================================================
-- VIEW 2: feed_estimate_summary
-- Rolled-up estimate-level metrics for dashboard cards
-- and EPCM firm scoring (Phase 2).
-- =====================================================
CREATE OR REPLACE VIEW feed_estimate_summary AS
SELECT
  e.id                                                     AS feed_estimate_id,
  e.organization_id,
  e.project_id,
  e.epcm_firm,
  e.epcm_firm_id,
  e.estimate_class,
  e.estimate_version,
  e.estimate_basis_year,
  e.contingency_pct,
  e.escalation_pct,
  e.approval_status,
  e.total_estimate,
  e.estimate_date,
  e.source_document_url,
  COALESCE(SUM(v.actual_amount), 0)                        AS total_actual,
  COALESCE(SUM(v.actual_amount), 0) - e.total_estimate     AS total_variance_amount,
  CASE WHEN e.total_estimate > 0
    THEN ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / e.total_estimate) * 100, 1
    )
    ELSE NULL
  END                                                       AS total_variance_pct,
  CASE
    WHEN e.total_estimate IS NULL OR e.total_estimate = 0 THEN NULL
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / e.total_estimate) * 100, 1)) <= 5  THEN 'A'
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / e.total_estimate) * 100, 1)) <= 10 THEN 'B'
    WHEN ABS(ROUND(
      ((COALESCE(SUM(v.actual_amount), 0) - e.total_estimate)
        / e.total_estimate) * 100, 1)) <= 20 THEN 'C'
    ELSE 'D'
  END                                                       AS epcm_accuracy_grade,
  COUNT(DISTINCT v.id)                                      AS wbs_item_count,
  COUNT(DISTINCT v.id) FILTER (WHERE v.actual_amount > 0)  AS wbs_items_with_actuals
FROM feed_estimates e
LEFT JOIN feed_wbs_variance v ON v.feed_estimate_id = e.id
GROUP BY e.id, e.organization_id, e.project_id, e.epcm_firm,
         e.epcm_firm_id, e.estimate_class, e.estimate_version,
         e.estimate_basis_year, e.contingency_pct, e.escalation_pct,
         e.approval_status, e.total_estimate, e.estimate_date,
         e.source_document_url;

-- =====================================================
-- VIEW 3: feed_category_benchmarks (Phase 2 foundation)
-- Cross-project benchmark by WBS scope category.
-- Every project added builds the benchmark dataset.
-- UI consuming this is Phase 2.
-- =====================================================
CREATE OR REPLACE VIEW feed_category_benchmarks AS
SELECT
  w.organization_id,
  w.scope_category,
  COUNT(DISTINCT w.feed_estimate_id)                       AS project_count,
  ROUND(AVG(v.variance_pct), 1)                            AS avg_variance_pct,
  ROUND(MIN(v.variance_pct), 1)                            AS min_variance_pct,
  ROUND(MAX(v.variance_pct), 1)                            AS max_variance_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
    (ORDER BY v.variance_pct)::NUMERIC, 1)                 AS median_variance_pct,
  ROUND(AVG(w.unit_rate), 2)                               AS avg_unit_rate
FROM feed_wbs_items w
JOIN feed_wbs_variance v ON v.id = w.id
WHERE v.actual_amount > 0
  AND w.scope_category IS NOT NULL
GROUP BY w.organization_id, w.scope_category;

-- =====================================================
-- Notes on RLS:
-- All three views inherit RLS from their underlying
-- tables (feed_wbs_items, feed_wbs_actuals, feed_estimates)
-- which all have org-scoped policies with super_admin bypass.
-- No additional view-level policies needed.
-- =====================================================
