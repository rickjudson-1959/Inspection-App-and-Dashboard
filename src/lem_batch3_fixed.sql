-- LEM 18214 - Randy Langlois - Grade #2 Winter Grade Crew
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18214',
  'CLX2091',
  'Randy Langlois',
  '2014-01-20',
  5417.94,
  3048.00,
  '[
    {"employee_id": "1495", "name": "Brian Daniels", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 6.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1050", "name": "John Laschuk", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "4008", "name": "John MacDonald", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1003", "name": "Randy Langlois", "type": "General Foreman (OPR)", "rt_hours": 8.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.0, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "1464", "name": "Robert Laur", "type": "Principal Operator 1", "rt_hours": 1.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1519", "type": "BACKHOE CAT 336 (OR EQUIVALENT)", "hours": 1.0, "rate": 794.00},
    {"equipment_id": "OR1726", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "OR1756", "type": "CREWCAB 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "OR1538", "type": "DOZER CAT D6T LGP OR EQUIVALENT", "hours": 1.0, "rate": 964.00},
    {"equipment_id": "OR1540", "type": "DOZER D6T LGP (OR EQUIVALENT)", "hours": 1.0, "rate": 964.00}
  ]'::jsonb
);

-- LEM 18215 - Wes Lien - Phase II Maintenance
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18215',
  'CLX2032',
  'Wes Lien',
  '2014-01-20',
  10705.59,
  19057.57,
  '[
    {"employee_id": "2277", "name": "Chuck Lush", "type": "Bus Driver", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 5.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "3294", "name": "Daniel Dionne", "type": "Security (7 Days/Wk)", "rt_hours": 8.0, "rt_rate": 42.48, "ot_hours": 4.0, "ot_rate": 63.72, "dt_hours": 0.0, "dt_rate": 84.96},
    {"employee_id": "3235", "name": "Denny Connolly", "type": "Warehouseman Class 2", "rt_hours": 8.0, "rt_rate": 59.79, "ot_hours": 5.0, "ot_rate": 89.69, "dt_hours": 0.0, "dt_rate": 119.58},
    {"employee_id": "3108", "name": "Derek Haines", "type": "Forklift Warehouse", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 6.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "1034", "name": "Jonathan Hunter", "type": "Warehouseman Class 1", "rt_hours": 8.0, "rt_rate": 59.75, "ot_hours": 4.0, "ot_rate": 89.69, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3408", "name": "Kelly Van Welleghem", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 7.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1469", "name": "Lawrence Jacques", "type": "Security (7 Days/Wk)", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 5.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 84.96},
    {"employee_id": "1380", "name": "Mark Rogers", "type": "Specialized Labourer", "rt_hours": 8.0, "rt_rate": 42.48, "ot_hours": 4.0, "ot_rate": 63.72, "dt_hours": 0.0, "dt_rate": 99.67},
    {"employee_id": "1115", "name": "Michael Piwtarak", "type": "Bus Driver", "rt_hours": 8.0, "rt_rate": 49.84, "ot_hours": 4.0, "ot_rate": 74.75, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "1524", "name": "Vic Giese", "type": "Purchasing Agent", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 5.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "WL001", "name": "Wes Lien", "type": "Foreman", "rt_hours": 1.0, "rt_rate": 1317.40, "ot_hours": 0.0, "ot_rate": 0.0, "dt_hours": 0.0, "dt_rate": 0.0}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1043", "type": "FUEL TANK - 75000L", "hours": 1.0, "rate": 0.0},
    {"equipment_id": "OR1476", "type": "SKID STEER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "ATV18", "type": "ATV/GATOR", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1130", "type": "AIR COMPRESSOR 200-250", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "OR1135", "type": "BUS", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "OR1137", "type": "BUS", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "OR1139", "type": "BUS", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "OR1140", "type": "BUS", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "OR17520", "type": "BUS", "hours": 1.0, "rate": 254.00},
    {"equipment_id": "DL2532", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "CT15", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT16", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT20", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT21", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT22", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT23", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "CT34", "type": "STORAGE CONTAINERS", "hours": 1.0, "rate": 27.00},
    {"equipment_id": "OR1192", "type": "STORAGE TRAILER VAN", "hours": 1.0, "rate": 159.00},
    {"equipment_id": "OR1324", "type": "STORAGE TRAILER VAN", "hours": 1.0, "rate": 159.00},
    {"equipment_id": "SA9020", "type": "WAREHOUSE TRAILER - DIESEL HEATED", "hours": 1.0, "rate": 196.85}
  ]'::jsonb
);

-- LEM 18216 - Tanner MacDonald - Tie-in Crew
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18216',
  'CLX22200',
  'Tanner MacDonald',
  '2014-01-20',
  15395.58,
  4459.30,
  '[
    {"employee_id": "1176", "name": "Brett McLean", "type": "Straw Fitter - Auto", "rt_hours": 8.0, "rt_rate": 82.81, "ot_hours": 7.0, "ot_rate": 124.21, "dt_hours": 0.0, "dt_rate": 165.62},
    {"employee_id": "1423", "name": "Bradley McLean", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "1521", "name": "Andrew Ochocki", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1145", "name": "Denver Reid", "type": "Journeyman Fitter", "rt_hours": 8.0, "rt_rate": 69.01, "ot_hours": 6.0, "ot_rate": 103.51, "dt_hours": 0.0, "dt_rate": 138.02},
    {"employee_id": "1396", "name": "Doug Motkow", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 95.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "4010", "name": "Glen Quaghebeur", "type": "Apprentice Operator", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 5.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "1408", "name": "James Quann", "type": "Bus Driver", "rt_hours": 8.0, "rt_rate": 49.44, "ot_hours": 5.0, "ot_rate": 74.16, "dt_hours": 0.0, "dt_rate": 98.89},
    {"employee_id": "1173", "name": "Jesse Hebert", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1169", "name": "Jocelyn Mathais", "type": "Straw Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 7.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1190", "name": "John R Brazeau", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "3345", "name": "John Bozzelli", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "1155", "name": "Kirkland Kirk Ochocki", "type": "UA Tie-in Foreman", "rt_hours": 1.0, "rt_rate": 1952.31, "ot_hours": 0.0, "ot_rate": 0.0, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "3700", "name": "Leslie Trepanier", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1236", "name": "Mark Lajoie", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.20, "ot_hours": 5.0, "ot_rate": 123.30, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1414", "name": "Murray Robinson", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "3856", "name": "Robert Henderson", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 5.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1323", "name": "Robert Vaughn", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 164.40},
    {"employee_id": "1283", "name": "Sheldon McDonald", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 5.0, "ot_rate": 123.30, "dt_hours": 0.0, "dt_rate": 164.40}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1056", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "OR1043", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "OR1642", "type": "SIDEBOOM - CAT 587T", "hours": 1.0, "rate": 1323.00},
    {"equipment_id": "SB414", "type": "TAG-A-LONG TRAILER 6 TON", "hours": 1.0, "rate": 159.00},
    {"equipment_id": "OR1199", "type": "WILD RIG MARCHUK", "hours": 1.0, "rate": 576.00},
    {"equipment_id": "OR1184", "type": "WILD RIG CAZABON", "hours": 1.0, "rate": 576.00},
    {"equipment_id": "SB412", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.00}
  ]'::jsonb
);

-- LEM 18218 - Kirkland Kirk Ochocki - Road Bore ML Tie In
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18218',
  'CLX2170',
  'Kirkland Kirk Ochocki',
  '2014-01-20',
  18600.68,
  10483.00,
  '[
    {"employee_id": "1521", "name": "Andrew Ochocki", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "1423", "name": "Bradley McLean", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1145", "name": "Denver Reid", "type": "Journeyman Fitter", "rt_hours": 8.0, "rt_rate": 69.01, "ot_hours": 6.0, "ot_rate": 103.51, "dt_hours": 0.0, "dt_rate": 138.02},
    {"employee_id": "1396", "name": "Doug Motkow", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 95.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "4010", "name": "Glen Quaghebeur", "type": "Apprentice Operator", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 5.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "1408", "name": "James Quann", "type": "Bus Driver", "rt_hours": 8.0, "rt_rate": 49.44, "ot_hours": 5.0, "ot_rate": 74.16, "dt_hours": 0.0, "dt_rate": 98.89},
    {"employee_id": "1173", "name": "Jesse Hebert", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1169", "name": "Jocelyn Mathais", "type": "Straw Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 7.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1190", "name": "John R Brazeau", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "3345", "name": "John Bozzelli", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "1155", "name": "Kirkland Kirk Ochocki", "type": "UA Tie-in Foreman", "rt_hours": 1.0, "rt_rate": 1952.31, "ot_hours": 0.0, "ot_rate": 0.0, "dt_hours": 0.0, "dt_rate": 0.0},
    {"employee_id": "3700", "name": "Leslie Trepanier", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1236", "name": "Mark Lajoie", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.20, "ot_hours": 5.0, "ot_rate": 123.30, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "1414", "name": "Murray Robinson", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 107.05},
    {"employee_id": "3856", "name": "Robert Henderson", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 5.0, "ot_rate": 80.29, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1323", "name": "Robert Vaughn", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 164.40},
    {"employee_id": "1283", "name": "Sheldon McDonald", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 5.0, "ot_rate": 123.30, "dt_hours": 0.0, "dt_rate": 164.40}
  ]'::jsonb,
  '[
    {"equipment_id": "DL2572", "type": "FLATDECK - 2 TON", "hours": 1.0, "rate": 165.00},
    {"equipment_id": "OR1054", "type": "FLATDECK - 2 TON", "hours": 1.0, "rate": 165.00},
    {"equipment_id": "OR1783", "type": "SIDEBOOM - CAT 587T", "hours": 1.0, "rate": 1323.00},
    {"equipment_id": "SB409", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.00},
    {"equipment_id": "SB412", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.00},
    {"equipment_id": "SB413", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.00},
    {"equipment_id": "OR1175", "type": "WLD RIG M Lajoie", "hours": 12.0, "rate": 48.00},
    {"equipment_id": "OR1174", "type": "WLD RIG McDonald", "hours": 12.0, "rate": 48.00}
  ]'::jsonb
);
