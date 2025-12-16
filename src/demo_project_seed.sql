-- ============================================================
-- PIPE-UP DEMO PROJECT: Clearwater Pipeline
-- Complete seed data for demonstration purposes
-- ============================================================

-- First, let's check if demo data already exists and clean up
DELETE FROM contractor_lems WHERE field_log_id LIKE 'DEMO-%';
DELETE FROM daily_tickets WHERE notes LIKE '%DEMO%' OR inspector_name = 'Dave Larden (Demo)';

-- ============================================================
-- DEMO PROJECT SETUP
-- ============================================================

-- Create or get demo organization
INSERT INTO organizations (id, name, slug)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Clearwater Energy Corp',
  'clearwater-demo'
) ON CONFLICT (slug) DO NOTHING;

-- Create demo project
INSERT INTO projects (id, organization_id, name, short_code, description, status)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Clearwater Pipeline - NPS 12 x 45km',
  'CWP',
  'Demo pipeline project for demonstration and training purposes. 45km NPS 12 natural gas pipeline.',
  'active'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- CONTRACTOR LEMS - 15 Sample LEMs
-- Crews: Welding, Ditching, Lowering-In, Backfill, Tie-In
-- ============================================================

-- DAY 1: Monday, March 18, 2024
-- ---------------------------------------------------------

-- LEM DEMO-001: Mainline Welding Crew (Brad Whitworth)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-001',
  'CWP-2145',
  'Brad Whitworth',
  '2024-03-18',
  18450.00,
  6200.00,
  '[
    {"employee_id": "W001", "name": "Brad Whitworth", "type": "UA Welder Foreman", "rt_hours": 10.0, "rt_rate": 95.00, "ot_hours": 2.0, "ot_rate": 142.50},
    {"employee_id": "W002", "name": "James Morrison", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W003", "name": "Tyler Bennett", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W004", "name": "Kevin OBrien", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W005", "name": "Mike Santos", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W006", "name": "Chris Adams", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W007", "name": "Dan Murphy", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "W008", "name": "Steve Collins", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1554", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "OR1555", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "SB-301", "type": "SIDEBOOM CAT 583T", "hours": 12.0, "rate": 125.00},
    {"equipment_id": "CR-101", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "CR-102", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "WS-001", "type": "WELD SHACK", "hours": 12.0, "rate": 15.00}
  ]'::jsonb
);

-- LEM DEMO-002: Ditching Crew (Gary Nelson)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-002',
  'CWP-2160',
  'Gary Nelson',
  '2024-03-18',
  12800.00,
  14500.00,
  '[
    {"employee_id": "D001", "name": "Gary Nelson", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 0.0, "ot_rate": 187.50},
    {"employee_id": "D002", "name": "Tom Richards", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "D003", "name": "Bill Hayes", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "D004", "name": "Ron Peters", "type": "Intermediate Operator", "rt_hours": 10.0, "rt_rate": 62.00, "ot_hours": 2.0, "ot_rate": 93.00},
    {"employee_id": "D005", "name": "Jake Wilson", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "D006", "name": "Sam Turner", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "EX-501", "type": "EXCAVATOR CAT 336", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-502", "type": "EXCAVATOR CAT 330", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "DZ-201", "type": "DOZER CAT D6T", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "PD-101", "type": "PADDING MACHINE", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "CR-201", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- LEM DEMO-003: Lowering-In Crew (Shaun Cook)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-003',
  'CWP-2180',
  'Shaun Cook',
  '2024-03-18',
  14200.00,
  18900.00,
  '[
    {"employee_id": "L001", "name": "Shaun Cook", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 2.0, "ot_rate": 187.50},
    {"employee_id": "L002", "name": "Mark Davis", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L003", "name": "Paul Green", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L004", "name": "Eric Brown", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L005", "name": "Jeff White", "type": "Intermediate Operator", "rt_hours": 10.0, "rt_rate": 62.00, "ot_hours": 2.0, "ot_rate": 93.00},
    {"employee_id": "L006", "name": "Tim Black", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "L007", "name": "Joe Gray", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "SB-401", "type": "SIDEBOOM CAT 594", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "SB-402", "type": "SIDEBOOM CAT 594", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "SB-403", "type": "SIDEBOOM CAT 583", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "SB-404", "type": "SIDEBOOM CAT 583", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-601", "type": "EXCAVATOR CAT 320", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "CR-301", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- DAY 2: Tuesday, March 19, 2024
-- ---------------------------------------------------------

-- LEM DEMO-004: Mainline Welding (Brad Whitworth) - WITH DISCREPANCY
-- Contractor claims 8 workers, 12 hours each
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-004',
  'CWP-2145',
  'Brad Whitworth',
  '2024-03-19',
  19200.00,
  6800.00,
  '[
    {"employee_id": "W001", "name": "Brad Whitworth", "type": "UA Welder Foreman", "rt_hours": 10.0, "rt_rate": 95.00, "ot_hours": 2.0, "ot_rate": 142.50},
    {"employee_id": "W002", "name": "James Morrison", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W003", "name": "Tyler Bennett", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W004", "name": "Kevin OBrien", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W005", "name": "Mike Santos", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W006", "name": "Chris Adams", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W007", "name": "Dan Murphy", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "W008", "name": "Steve Collins", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1554", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "OR1555", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "SB-301", "type": "SIDEBOOM CAT 583T", "hours": 12.0, "rate": 125.00},
    {"equipment_id": "CR-101", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "CR-102", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "WS-001", "type": "WELD SHACK", "hours": 12.0, "rate": 15.00}
  ]'::jsonb
);

-- LEM DEMO-005: Ditching Crew (Gary Nelson) - WITH EQUIPMENT DISCREPANCY
-- Contractor claims excavator for 12 hours
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-005',
  'CWP-2160',
  'Gary Nelson',
  '2024-03-19',
  12800.00,
  15200.00,
  '[
    {"employee_id": "D001", "name": "Gary Nelson", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 0.0, "ot_rate": 187.50},
    {"employee_id": "D002", "name": "Tom Richards", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "D003", "name": "Bill Hayes", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "D004", "name": "Ron Peters", "type": "Intermediate Operator", "rt_hours": 10.0, "rt_rate": 62.00, "ot_hours": 2.0, "ot_rate": 93.00},
    {"employee_id": "D005", "name": "Jake Wilson", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "D006", "name": "Sam Turner", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "EX-501", "type": "EXCAVATOR CAT 336", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-502", "type": "EXCAVATOR CAT 330", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "EX-503", "type": "EXCAVATOR CAT 320", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "DZ-201", "type": "DOZER CAT D6T", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "PD-101", "type": "PADDING MACHINE", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "CR-201", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- LEM DEMO-006: Lowering-In Crew (Shaun Cook)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-006',
  'CWP-2180',
  'Shaun Cook',
  '2024-03-19',
  14200.00,
  18900.00,
  '[
    {"employee_id": "L001", "name": "Shaun Cook", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 2.0, "ot_rate": 187.50},
    {"employee_id": "L002", "name": "Mark Davis", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L003", "name": "Paul Green", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L004", "name": "Eric Brown", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L005", "name": "Jeff White", "type": "Intermediate Operator", "rt_hours": 10.0, "rt_rate": 62.00, "ot_hours": 2.0, "ot_rate": 93.00},
    {"employee_id": "L006", "name": "Tim Black", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "L007", "name": "Joe Gray", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "SB-401", "type": "SIDEBOOM CAT 594", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "SB-402", "type": "SIDEBOOM CAT 594", "hours": 12.0, "rate": 225.00},
    {"equipment_id": "SB-403", "type": "SIDEBOOM CAT 583", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "SB-404", "type": "SIDEBOOM CAT 583", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-601", "type": "EXCAVATOR CAT 320", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "CR-301", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- DAY 3: Wednesday, March 20, 2024
-- ---------------------------------------------------------

-- LEM DEMO-007: Backfill Crew (Randy Langlois)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-007',
  'CWP-2190',
  'Randy Langlois',
  '2024-03-20',
  9800.00,
  12400.00,
  '[
    {"employee_id": "B001", "name": "Randy Langlois", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 0.0, "ot_rate": 187.50},
    {"employee_id": "B002", "name": "Dave Parker", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "B003", "name": "Jim Foster", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "B004", "name": "Rob King", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "B005", "name": "Andy Stone", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "EX-701", "type": "EXCAVATOR CAT 336", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-702", "type": "EXCAVATOR CAT 330", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "DZ-301", "type": "DOZER CAT D6T", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "GR-101", "type": "GRADER CAT 14M", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "CR-401", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- LEM DEMO-008: Mainline Welding (Brad Whitworth)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-008',
  'CWP-2145',
  'Brad Whitworth',
  '2024-03-20',
  18450.00,
  6200.00,
  '[
    {"employee_id": "W001", "name": "Brad Whitworth", "type": "UA Welder Foreman", "rt_hours": 10.0, "rt_rate": 95.00, "ot_hours": 2.0, "ot_rate": 142.50},
    {"employee_id": "W002", "name": "James Morrison", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W003", "name": "Tyler Bennett", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W004", "name": "Kevin OBrien", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W005", "name": "Mike Santos", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W006", "name": "Chris Adams", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W007", "name": "Dan Murphy", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "W008", "name": "Steve Collins", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1554", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "OR1555", "type": "AUTOMATIC WELDING TRACTOR", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "SB-301", "type": "SIDEBOOM CAT 583T", "hours": 12.0, "rate": 125.00},
    {"equipment_id": "CR-101", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "CR-102", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00},
    {"equipment_id": "WS-001", "type": "WELD SHACK", "hours": 12.0, "rate": 15.00}
  ]'::jsonb
);

-- LEM DEMO-009: Tie-In Crew (Kerry Untinen) - WITH HOURS DISCREPANCY
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-009',
  'CWP-2146',
  'Kerry Untinen',
  '2024-03-20',
  16500.00,
  8200.00,
  '[
    {"employee_id": "T001", "name": "Kerry Untinen", "type": "UA Tie-in Foreman", "rt_hours": 10.0, "rt_rate": 98.00, "ot_hours": 4.0, "ot_rate": 147.00},
    {"employee_id": "T002", "name": "Brian Untinen", "type": "FE Welder (Auto)", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 4.0, "ot_rate": 123.00},
    {"employee_id": "T003", "name": "Guy Skori", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 4.0, "ot_rate": 123.00},
    {"employee_id": "T004", "name": "James Martin", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 4.0, "ot_rate": 82.50},
    {"employee_id": "T005", "name": "Kamen Stefanov", "type": "Welder Steward", "rt_hours": 10.0, "rt_rate": 65.00, "ot_hours": 4.0, "ot_rate": 97.50},
    {"employee_id": "T006", "name": "Kasey Kay", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 4.0, "ot_rate": 82.50}
  ]'::jsonb,
  '[
    {"equipment_id": "SB-501", "type": "SIDEBOOM CAT 583T", "hours": 14.0, "rate": 125.00},
    {"equipment_id": "SB-502", "type": "SIDEBOOM CAT 583T", "hours": 14.0, "rate": 125.00},
    {"equipment_id": "WR-101", "type": "WELD RIG", "hours": 14.0, "rate": 85.00},
    {"equipment_id": "WR-102", "type": "WELD RIG", "hours": 14.0, "rate": 85.00},
    {"equipment_id": "CR-501", "type": "CREWCAB 1 TON", "hours": 14.0, "rate": 18.00}
  ]'::jsonb
);

-- DAY 4: Thursday, March 21, 2024
-- ---------------------------------------------------------

-- LEM DEMO-010: Mainline Welding (Brad Whitworth)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-010',
  'CWP-2145',
  'Brad Whitworth',
  '2024-03-21',
  17200.00,
  5800.00,
  '[
    {"employee_id": "W001", "name": "Brad Whitworth", "type": "UA Welder Foreman", "rt_hours": 10.0, "rt_rate": 95.00, "ot_hours": 1.0, "ot_rate": 142.50},
    {"employee_id": "W002", "name": "James Morrison", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 1.0, "ot_rate": 123.00},
    {"employee_id": "W003", "name": "Tyler Bennett", "type": "FE Welder", "rt_hours": 10.0, "rt_rate": 82.00, "ot_hours": 1.0, "ot_rate": 123.00},
    {"employee_id": "W004", "name": "Kevin OBrien", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 1.0, "ot_rate": 82.50},
    {"employee_id": "W005", "name": "Mike Santos", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 1.0, "ot_rate": 82.50},
    {"employee_id": "W006", "name": "Chris Adams", "type": "Welder Helper", "rt_hours": 10.0, "rt_rate": 55.00, "ot_hours": 1.0, "ot_rate": 82.50},
    {"employee_id": "W007", "name": "Dan Murphy", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 1.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1554", "type": "AUTOMATIC WELDING TRACTOR", "hours": 11.0, "rate": 145.00},
    {"equipment_id": "OR1555", "type": "AUTOMATIC WELDING TRACTOR", "hours": 11.0, "rate": 145.00},
    {"equipment_id": "SB-301", "type": "SIDEBOOM CAT 583T", "hours": 11.0, "rate": 125.00},
    {"equipment_id": "CR-101", "type": "CREWCAB 1 TON", "hours": 11.0, "rate": 18.00},
    {"equipment_id": "WS-001", "type": "WELD SHACK", "hours": 11.0, "rate": 15.00}
  ]'::jsonb
);

-- LEM DEMO-011: Ditching Crew (Gary Nelson)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-011',
  'CWP-2160',
  'Gary Nelson',
  '2024-03-21',
  11500.00,
  13200.00,
  '[
    {"employee_id": "D001", "name": "Gary Nelson", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 0.0, "ot_rate": 187.50},
    {"employee_id": "D002", "name": "Tom Richards", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 1.0, "ot_rate": 108.00},
    {"employee_id": "D003", "name": "Bill Hayes", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 1.0, "ot_rate": 108.00},
    {"employee_id": "D004", "name": "Ron Peters", "type": "Intermediate Operator", "rt_hours": 10.0, "rt_rate": 62.00, "ot_hours": 1.0, "ot_rate": 93.00},
    {"equipment_id": "D005", "name": "Jake Wilson", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 1.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "EX-501", "type": "EXCAVATOR CAT 336", "hours": 11.0, "rate": 185.00},
    {"equipment_id": "EX-502", "type": "EXCAVATOR CAT 330", "hours": 11.0, "rate": 165.00},
    {"equipment_id": "DZ-201", "type": "DOZER CAT D6T", "hours": 11.0, "rate": 145.00},
    {"equipment_id": "PD-101", "type": "PADDING MACHINE", "hours": 11.0, "rate": 225.00},
    {"equipment_id": "CR-201", "type": "CREWCAB 1 TON", "hours": 11.0, "rate": 18.00}
  ]'::jsonb
);

-- LEM DEMO-012: Backfill Crew (Randy Langlois) - WITH MANPOWER DISCREPANCY
-- Contractor claims 6 workers
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-012',
  'CWP-2190',
  'Randy Langlois',
  '2024-03-21',
  11200.00,
  12400.00,
  '[
    {"employee_id": "B001", "name": "Randy Langlois", "type": "General Foreman (OPR)", "rt_hours": 10.0, "rt_rate": 125.00, "ot_hours": 0.0, "ot_rate": 187.50},
    {"employee_id": "B002", "name": "Dave Parker", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "B003", "name": "Jim Foster", "type": "Principal Operator 1", "rt_hours": 10.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "B004", "name": "Rob King", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "B005", "name": "Andy Stone", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "B006", "name": "Pete Walsh", "type": "General Labourer", "rt_hours": 10.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "EX-701", "type": "EXCAVATOR CAT 336", "hours": 12.0, "rate": 185.00},
    {"equipment_id": "EX-702", "type": "EXCAVATOR CAT 330", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "DZ-301", "type": "DOZER CAT D6T", "hours": 12.0, "rate": 145.00},
    {"equipment_id": "GR-101", "type": "GRADER CAT 14M", "hours": 12.0, "rate": 165.00},
    {"equipment_id": "CR-401", "type": "CREWCAB 1 TON", "hours": 12.0, "rate": 18.00}
  ]'::jsonb
);

-- DAY 5: Friday, March 22, 2024
-- ---------------------------------------------------------

-- LEM DEMO-013: Mainline Welding (Brad Whitworth)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-013',
  'CWP-2145',
  'Brad Whitworth',
  '2024-03-22',
  15800.00,
  5400.00,
  '[
    {"employee_id": "W001", "name": "Brad Whitworth", "type": "UA Welder Foreman", "rt_hours": 8.0, "rt_rate": 95.00, "ot_hours": 2.0, "ot_rate": 142.50},
    {"employee_id": "W002", "name": "James Morrison", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W003", "name": "Tyler Bennett", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "W004", "name": "Kevin OBrien", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W005", "name": "Mike Santos", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W006", "name": "Chris Adams", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "W007", "name": "Dan Murphy", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00},
    {"employee_id": "W008", "name": "Steve Collins", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1554", "type": "AUTOMATIC WELDING TRACTOR", "hours": 10.0, "rate": 145.00},
    {"equipment_id": "OR1555", "type": "AUTOMATIC WELDING TRACTOR", "hours": 10.0, "rate": 145.00},
    {"equipment_id": "SB-301", "type": "SIDEBOOM CAT 583T", "hours": 10.0, "rate": 125.00},
    {"equipment_id": "CR-101", "type": "CREWCAB 1 TON", "hours": 10.0, "rate": 18.00},
    {"equipment_id": "WS-001", "type": "WELD SHACK", "hours": 10.0, "rate": 15.00}
  ]'::jsonb
);

-- LEM DEMO-014: Lowering-In Crew (Shaun Cook)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-014',
  'CWP-2180',
  'Shaun Cook',
  '2024-03-22',
  12400.00,
  16200.00,
  '[
    {"employee_id": "L001", "name": "Shaun Cook", "type": "General Foreman (OPR)", "rt_hours": 8.0, "rt_rate": 125.00, "ot_hours": 2.0, "ot_rate": 187.50},
    {"employee_id": "L002", "name": "Mark Davis", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L003", "name": "Paul Green", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L004", "name": "Eric Brown", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 72.00, "ot_hours": 2.0, "ot_rate": 108.00},
    {"employee_id": "L005", "name": "Jeff White", "type": "Intermediate Operator", "rt_hours": 8.0, "rt_rate": 62.00, "ot_hours": 2.0, "ot_rate": 93.00},
    {"equipment_id": "L006", "name": "Tim Black", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.00, "ot_hours": 2.0, "ot_rate": 72.00}
  ]'::jsonb,
  '[
    {"equipment_id": "SB-401", "type": "SIDEBOOM CAT 594", "hours": 10.0, "rate": 225.00},
    {"equipment_id": "SB-402", "type": "SIDEBOOM CAT 594", "hours": 10.0, "rate": 225.00},
    {"equipment_id": "SB-403", "type": "SIDEBOOM CAT 583", "hours": 10.0, "rate": 185.00},
    {"equipment_id": "SB-404", "type": "SIDEBOOM CAT 583", "hours": 10.0, "rate": 185.00},
    {"equipment_id": "EX-601", "type": "EXCAVATOR CAT 320", "hours": 10.0, "rate": 145.00},
    {"equipment_id": "CR-301", "type": "CREWCAB 1 TON", "hours": 10.0, "rate": 18.00}
  ]'::jsonb
);

-- LEM DEMO-015: Tie-In Crew (Kerry Untinen)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  'DEMO-015',
  'CWP-2146',
  'Kerry Untinen',
  '2024-03-22',
  14200.00,
  7400.00,
  '[
    {"employee_id": "T001", "name": "Kerry Untinen", "type": "UA Tie-in Foreman", "rt_hours": 8.0, "rt_rate": 98.00, "ot_hours": 2.0, "ot_rate": 147.00},
    {"employee_id": "T002", "name": "Brian Untinen", "type": "FE Welder (Auto)", "rt_hours": 8.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "T003", "name": "Guy Skori", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.00, "ot_hours": 2.0, "ot_rate": 123.00},
    {"employee_id": "T004", "name": "James Martin", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50},
    {"employee_id": "T005", "name": "Kamen Stefanov", "type": "Welder Steward", "rt_hours": 8.0, "rt_rate": 65.00, "ot_hours": 2.0, "ot_rate": 97.50},
    {"employee_id": "T006", "name": "Kasey Kay", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 55.00, "ot_hours": 2.0, "ot_rate": 82.50}
  ]'::jsonb,
  '[
    {"equipment_id": "SB-501", "type": "SIDEBOOM CAT 583T", "hours": 10.0, "rate": 125.00},
    {"equipment_id": "SB-502", "type": "SIDEBOOM CAT 583T", "hours": 10.0, "rate": 125.00},
    {"equipment_id": "WR-101", "type": "WELD RIG", "hours": 10.0, "rate": 85.00},
    {"equipment_id": "WR-102", "type": "WELD RIG", "hours": 10.0, "rate": 85.00},
    {"equipment_id": "CR-501", "type": "CREWCAB 1 TON", "hours": 10.0, "rate": 18.00}
  ]'::jsonb
);


-- ============================================================
-- INSPECTOR DAILY REPORTS - Matching dates with discrepancies
-- ============================================================

-- DAY 1: Monday, March 18, 2024 - Inspector Report
INSERT INTO daily_tickets (
  date, 
  inspector_name, 
  spread, 
  contractor,
  weather,
  temperature_high,
  temperature_low,
  start_time,
  end_time,
  manpower,
  equipment,
  notes
)
VALUES (
  '2024-03-18',
  'Dave Larden (Demo)',
  'Spread 1',
  'Clearwater Pipeline Constructors',
  'Clear',
  12,
  -2,
  '07:00',
  '18:00',
  '[
    {"crew": "Mainline Welding", "foreman": "Brad Whitworth", "count": 8, "hours": 12},
    {"crew": "Ditching", "foreman": "Gary Nelson", "count": 6, "hours": 12},
    {"crew": "Lowering-In", "foreman": "Shaun Cook", "count": 7, "hours": 12}
  ]'::jsonb,
  '[
    {"type": "AUTOMATIC WELDING TRACTOR", "count": 2, "hours": 12},
    {"type": "SIDEBOOM CAT 583T", "count": 1, "hours": 12},
    {"type": "EXCAVATOR CAT 336", "count": 1, "hours": 12},
    {"type": "EXCAVATOR CAT 330", "count": 1, "hours": 12},
    {"type": "DOZER CAT D6T", "count": 1, "hours": 12},
    {"type": "PADDING MACHINE", "count": 1, "hours": 12},
    {"type": "SIDEBOOM CAT 594", "count": 2, "hours": 12},
    {"type": "SIDEBOOM CAT 583", "count": 2, "hours": 12}
  ]'::jsonb,
  'DEMO - Day 1: Good progress on all fronts. Mainline welding completed 42 welds. Ditching advanced 850m. Lowering-in completed 1.2km.'
);

-- DAY 2: Tuesday, March 19, 2024 - Inspector Report WITH DISCREPANCIES NOTED
INSERT INTO daily_tickets (
  date, 
  inspector_name, 
  spread, 
  contractor,
  weather,
  temperature_high,
  temperature_low,
  start_time,
  end_time,
  manpower,
  equipment,
  notes
)
VALUES (
  '2024-03-19',
  'Dave Larden (Demo)',
  'Spread 1',
  'Clearwater Pipeline Constructors',
  'Partly Cloudy',
  8,
  -5,
  '07:00',
  '18:00',
  '[
    {"crew": "Mainline Welding", "foreman": "Brad Whitworth", "count": 6, "hours": 12},
    {"crew": "Ditching", "foreman": "Gary Nelson", "count": 6, "hours": 12},
    {"crew": "Lowering-In", "foreman": "Shaun Cook", "count": 7, "hours": 12}
  ]'::jsonb,
  '[
    {"type": "AUTOMATIC WELDING TRACTOR", "count": 2, "hours": 12},
    {"type": "SIDEBOOM CAT 583T", "count": 1, "hours": 12},
    {"type": "EXCAVATOR CAT 336", "count": 1, "hours": 12},
    {"type": "EXCAVATOR CAT 330", "count": 1, "hours": 10},
    {"type": "DOZER CAT D6T", "count": 1, "hours": 12},
    {"type": "PADDING MACHINE", "count": 1, "hours": 12},
    {"type": "SIDEBOOM CAT 594", "count": 2, "hours": 12},
    {"type": "SIDEBOOM CAT 583", "count": 2, "hours": 12}
  ]'::jsonb,
  'DEMO - Day 2: NOTE - Welding crew short 2 helpers (Dan Murphy and Steve Collins not on site). Excavator CAT 320 NOT observed on ditch crew despite being on contractor LEM. EX-502 down for 2 hours for repairs.'
);

-- DAY 3: Wednesday, March 20, 2024 - Inspector Report
INSERT INTO daily_tickets (
  date, 
  inspector_name, 
  spread, 
  contractor,
  weather,
  temperature_high,
  temperature_low,
  start_time,
  end_time,
  manpower,
  equipment,
  notes
)
VALUES (
  '2024-03-20',
  'Dave Larden (Demo)',
  'Spread 1',
  'Clearwater Pipeline Constructors',
  'Clear',
  15,
  2,
  '07:00',
  '19:00',
  '[
    {"crew": "Mainline Welding", "foreman": "Brad Whitworth", "count": 8, "hours": 12},
    {"crew": "Backfill", "foreman": "Randy Langlois", "count": 5, "hours": 12},
    {"crew": "Tie-In", "foreman": "Kerry Untinen", "count": 6, "hours": 12}
  ]'::jsonb,
  '[
    {"type": "AUTOMATIC WELDING TRACTOR", "count": 2, "hours": 12},
    {"type": "SIDEBOOM CAT 583T", "count": 3, "hours": 12},
    {"type": "EXCAVATOR CAT 336", "count": 1, "hours": 12},
    {"type": "EXCAVATOR CAT 330", "count": 1, "hours": 12},
    {"type": "DOZER CAT D6T", "count": 1, "hours": 12},
    {"type": "GRADER CAT 14M", "count": 1, "hours": 12},
    {"type": "WELD RIG", "count": 2, "hours": 12}
  ]'::jsonb,
  'DEMO - Day 3: Excellent progress. 38 welds completed on mainline. Tie-in crew started valve assembly at KP 12+450. NOTE - Tie-in sidebooms only worked 12 hours, not 14 as may be claimed.'
);

-- DAY 4: Thursday, March 21, 2024 - Inspector Report WITH DISCREPANCIES
INSERT INTO daily_tickets (
  date, 
  inspector_name, 
  spread, 
  contractor,
  weather,
  temperature_high,
  temperature_low,
  start_time,
  end_time,
  manpower,
  equipment,
  notes
)
VALUES (
  '2024-03-21',
  'Dave Larden (Demo)',
  'Spread 1',
  'Clearwater Pipeline Constructors',
  'Overcast',
  10,
  0,
  '07:00',
  '18:00',
  '[
    {"crew": "Mainline Welding", "foreman": "Brad Whitworth", "count": 7, "hours": 11},
    {"crew": "Ditching", "foreman": "Gary Nelson", "count": 5, "hours": 11},
    {"crew": "Backfill", "foreman": "Randy Langlois", "count": 4, "hours": 12}
  ]'::jsonb,
  '[
    {"type": "AUTOMATIC WELDING TRACTOR", "count": 2, "hours": 11},
    {"type": "SIDEBOOM CAT 583T", "count": 1, "hours": 11},
    {"type": "EXCAVATOR CAT 336", "count": 1, "hours": 11},
    {"type": "EXCAVATOR CAT 330", "count": 1, "hours": 11},
    {"type": "DOZER CAT D6T", "count": 2, "hours": 11},
    {"type": "PADDING MACHINE", "count": 1, "hours": 11},
    {"type": "GRADER CAT 14M", "count": 1, "hours": 12}
  ]'::jsonb,
  'DEMO - Day 4: NOTE - Backfill crew only had 4 workers observed, not 6 as may be claimed. Pete Walsh and Andy Stone were NOT on site today - confirmed with foreman that they were reassigned to Spread 2.'
);

-- DAY 5: Friday, March 22, 2024 - Inspector Report
INSERT INTO daily_tickets (
  date, 
  inspector_name, 
  spread, 
  contractor,
  weather,
  temperature_high,
  temperature_low,
  start_time,
  end_time,
  manpower,
  equipment,
  notes
)
VALUES (
  '2024-03-22',
  'Dave Larden (Demo)',
  'Spread 1',
  'Clearwater Pipeline Constructors',
  'Clear',
  18,
  5,
  '07:00',
  '17:00',
  '[
    {"crew": "Mainline Welding", "foreman": "Brad Whitworth", "count": 8, "hours": 10},
    {"crew": "Lowering-In", "foreman": "Shaun Cook", "count": 6, "hours": 10},
    {"crew": "Tie-In", "foreman": "Kerry Untinen", "count": 6, "hours": 10}
  ]'::jsonb,
  '[
    {"type": "AUTOMATIC WELDING TRACTOR", "count": 2, "hours": 10},
    {"type": "SIDEBOOM CAT 583T", "count": 3, "hours": 10},
    {"type": "SIDEBOOM CAT 594", "count": 2, "hours": 10},
    {"type": "SIDEBOOM CAT 583", "count": 2, "hours": 10},
    {"type": "EXCAVATOR CAT 320", "count": 1, "hours": 10},
    {"type": "WELD RIG", "count": 2, "hours": 10}
  ]'::jsonb,
  'DEMO - Day 5: Week completed. Mainline welding finished section KP 8+000 to KP 12+000. Total 186 welds this week with 2 repairs. Tie-in valve assembly 80% complete.'
);


-- ============================================================
-- SUMMARY OF BUILT-IN DISCREPANCIES FOR DEMO
-- ============================================================
/*
DISCREPANCY SUMMARY (for demo/training):

1. DEMO-004 vs Inspector Day 2:
   - Contractor claims 8 welding crew members
   - Inspector observed only 6 (Dan Murphy and Steve Collins not on site)
   - Potential overbilling: ~$1,440 (2 workers x 12 hrs x avg $60/hr)

2. DEMO-005 vs Inspector Day 2:
   - Contractor claims EX-503 (Excavator CAT 320) for 12 hours
   - Inspector did NOT observe this equipment on site
   - Potential overbilling: $1,740 (12 hrs x $145/hr)
   - Additionally: EX-502 was down 2 hours but charged for 12
   - Additional overbilling: $330 (2 hrs x $165/hr)

3. DEMO-009 vs Inspector Day 3:
   - Contractor claims 14 hours on all equipment
   - Inspector observed only 12 hours worked
   - Potential overbilling: ~$1,080 (5 pieces x 2 hrs x avg $108/hr)

4. DEMO-012 vs Inspector Day 4:
   - Contractor claims 6 backfill workers
   - Inspector observed only 4 (Pete Walsh and Andy Stone on different spread)
   - Potential overbilling: ~$1,200 (2 workers x 12 hrs x avg $50/hr)

TOTAL POTENTIAL SAVINGS IDENTIFIED: ~$5,790 in ONE WEEK
Annualized on a 45km project: ~$150,000+ in recovered costs

This demonstrates the ROI of the inspection reconciliation system!
*/


-- ============================================================
-- VERIFY DATA LOADED
-- ============================================================
SELECT 'Contractor LEMs loaded:' as info, COUNT(*) as count FROM contractor_lems WHERE field_log_id LIKE 'DEMO-%'
UNION ALL
SELECT 'Inspector Reports loaded:', COUNT(*) FROM daily_tickets WHERE inspector_name = 'Dave Larden (Demo)';
