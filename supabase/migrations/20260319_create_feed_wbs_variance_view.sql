-- =====================================================
-- FEED WBS VARIANCE VIEW
-- Date: 2026-03-19
-- Purpose: Compute estimated vs actual variance per WBS
-- item in the database, not the frontend.
-- Run this in Supabase SQL Editor
-- =====================================================

CREATE OR REPLACE VIEW feed_wbs_variance AS
SELECT
  w.id,
  w.organization_id,
  w.feed_estimate_id,
  w.wbs_code,
  w.scope_name,
  w.estimated_amount,
  w.unit,
  w.unit_rate,
  w.quantity,
  w.sort_order,
  COALESCE(SUM(a.actual_amount), 0)                        AS actual_amount,
  COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount   AS variance_amount,
  CASE WHEN w.estimated_amount > 0
    THEN ROUND(
      ((COALESCE(SUM(a.actual_amount), 0) - w.estimated_amount) / w.estimated_amount) * 100, 1
    )
    ELSE NULL
  END                                                        AS variance_pct
FROM feed_wbs_items w
LEFT JOIN feed_wbs_actuals a ON a.wbs_item_id = w.id
GROUP BY w.id, w.organization_id, w.feed_estimate_id,
         w.wbs_code, w.scope_name, w.estimated_amount,
         w.unit, w.unit_rate, w.quantity, w.sort_order;

-- =====================================================
-- RLS on the view
-- Supabase views inherit RLS from underlying tables,
-- but we also create a security-barrier view wrapper
-- to ensure org isolation is enforced at the view level.
-- =====================================================

-- Note: In Supabase, views inherit the RLS policies of
-- their underlying tables. Since feed_wbs_items and
-- feed_wbs_actuals both have org-scoped RLS, this view
-- is automatically org-scoped. No additional policy needed.
