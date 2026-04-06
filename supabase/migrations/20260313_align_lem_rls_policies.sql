-- Fix P1: Align LEM table RLS policies with standard pattern
-- Adds is_super_admin() OR clause to all four LEM-related tables.
-- This matches the pattern used in 20260131_05_add_rls_policies.sql.
-- Paste directly into Supabase SQL Editor

-- =====================================================
-- 1. contractor_lem_uploads
-- =====================================================
DROP POLICY IF EXISTS "Tenant isolation for contractor_lem_uploads" ON contractor_lem_uploads;
CREATE POLICY "Tenant isolation for contractor_lem_uploads"
ON contractor_lem_uploads FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- =====================================================
-- 2. lem_line_items
-- =====================================================
DROP POLICY IF EXISTS "Tenant isolation for lem_line_items" ON lem_line_items;
CREATE POLICY "Tenant isolation for lem_line_items"
ON lem_line_items FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- =====================================================
-- 3. lem_reconciliation_pairs
-- =====================================================
DROP POLICY IF EXISTS "Tenant isolation for lem_reconciliation_pairs" ON lem_reconciliation_pairs;
CREATE POLICY "Tenant isolation for lem_reconciliation_pairs"
ON lem_reconciliation_pairs FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);

-- =====================================================
-- 4. contractor_invoices
-- =====================================================
DROP POLICY IF EXISTS "Tenant isolation for contractor_invoices" ON contractor_invoices;
CREATE POLICY "Tenant isolation for contractor_invoices"
ON contractor_invoices FOR ALL
USING (
  is_super_admin() OR
  organization_id IN (SELECT user_organization_ids())
);
