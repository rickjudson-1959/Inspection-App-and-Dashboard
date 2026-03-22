-- ============================================================================
-- Reconciliation Line Items — per-row reconciliation decisions
-- March 22, 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_line_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  ticket_number   text NOT NULL,

  item_type       text NOT NULL CHECK (item_type IN ('labour', 'equipment')),

  -- Matching
  lem_worker_name       text,
  inspector_worker_name text,
  match_confidence      numeric(5,4),
  match_method          text,

  -- LEM data (contractor claimed)
  lem_rt_hours    numeric(6,2) DEFAULT 0,
  lem_ot_hours    numeric(6,2) DEFAULT 0,
  lem_dt_hours    numeric(6,2) DEFAULT 0,
  lem_total_hours numeric(6,2) DEFAULT 0,
  lem_cost        numeric(10,2) DEFAULT 0,

  -- Inspector data (observed)
  inspector_rt_hours    numeric(6,2) DEFAULT 0,
  inspector_ot_hours    numeric(6,2) DEFAULT 0,
  inspector_dt_hours    numeric(6,2) DEFAULT 0,
  inspector_total_hours numeric(6,2) DEFAULT 0,

  -- Variance
  variance_hours  numeric(6,2) DEFAULT 0,
  variance_cost   numeric(10,2) DEFAULT 0,

  -- Reconciliation decision
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'disputed', 'adjusted')),
  adjusted_hours  numeric(6,2),
  adjusted_cost   numeric(10,2),
  dispute_notes   text,

  -- Who made the decision
  reconciled_by   uuid REFERENCES auth.users(id),
  reconciled_at   timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_items_ticket
  ON reconciliation_line_items(organization_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_recon_items_status
  ON reconciliation_line_items(organization_id, status);

ALTER TABLE reconciliation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for reconciliation_line_items"
  ON reconciliation_line_items FOR ALL
  USING (
    is_super_admin() OR
    organization_id IN (SELECT user_organization_ids())
  );
