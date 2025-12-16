INSERT INTO contractor_lems (
    organization_id,
    project_id,
    field_log_id,
    account_number,
    foreman,
    date,
    labour_entries,
    equipment_entries,
    total_labour_cost,
    total_equipment_cost
) VALUES (
    (SELECT id FROM organizations WHERE slug = 'demo'),
    (SELECT id FROM projects WHERE short_code = 'DPP'),
    '18198',
    'CLX2200',
    'Gerald Babchishin',
    '2014-01-20',
    '[{"employee_id": "1262", "name": "Allen Hankewich", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.2, "ot_hours": 4.0, "ot_rate": 123.3}, {"employee_id": "3193", "name": "Clayton Slack", "type": "Straw (Fitter - Auto)", "rt_hours": 8.0, "rt_rate": 82.81, "ot_hours": 6.0, "ot_rate": 124.21}, {"employee_id": "1389", "name": "Cody Jamison", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "3424", "name": "Cody Mckie", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "1373", "name": "Daniel Hallihan", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}, {"employee_id": "1359", "name": "Darryl Chartrand", "type": "Straw (Operator)", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 6.0, "ot_rate": 96.36}, {"employee_id": "1101", "name": "Don Pederson", "type": "FE Welder", "rt_hours": 8.0, "rt_rate": 82.2, "ot_hours": 4.0, "ot_rate": 123.3}, {"employee_id": "3288", "name": "Gerald Babchishin", "type": "UA Tie-In Foreman", "rt_hours": 1.0, "rt_rate": 1952.31, "ot_hours": 0.0, "ot_rate": 0.0}, {"employee_id": "1352", "name": "Gilles Gravel", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "1406", "name": "James Ball", "type": "Apprentice Operator", "rt_hours": 8.0, "rt_rate": 49.44, "ot_hours": 4.0, "ot_rate": 74.16}, {"employee_id": "2270", "name": "James Harrop", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}, {"employee_id": "3432", "name": "Johnathon Prive", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "4011", "name": "Joshua Synnes", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 2.0, "ot_rate": 72.15}, {"employee_id": "3452", "name": "Larry Bilyk", "type": "Bus Driver", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 5.0, "ot_rate": 85.1}, {"employee_id": "1215", "name": "Richard Jones", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29}, {"employee_id": "1096", "name": "Rob Deford", "type": "Welder Helper", "rt_hours": 8.0, "rt_rate": 53.52, "ot_hours": 4.0, "ot_rate": 80.29}, {"employee_id": "1417", "name": "Robert Prive", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "1421", "name": "Vance Simpson", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "4000", "name": "Yusuf Wali Fidin", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}]'::jsonb,
    '[{"equipment_id": "SA6-013", "type": "BACKHOE 345 LONGSTICK", "hours": 1.0, "rate": 1085.0}, {"equipment_id": "OR1131", "type": "BUS", "hours": 1.0, "rate": 254.0}, {"equipment_id": "DL2531", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.0}, {"equipment_id": "OR1710", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.0}, {"equipment_id": "OR1097", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.0}, {"equipment_id": "DL2574", "type": "FLATDECK - 2 TON", "hours": 1.0, "rate": 165.0}, {"equipment_id": "OR1472", "type": "GENERATOR PUMP AND LIGHT 15-20KW", "hours": 1.0, "rate": 230.0}, {"equipment_id": "OR1473", "type": "GENERATOR PUMP AND LIGHT 15-20KW", "hours": 1.0, "rate": 230.0}, {"equipment_id": "OR1549", "type": "SIDEBOOM - CAT 587T", "hours": 1.0, "rate": 1323.0}, {"equipment_id": "OR1794", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.0}, {"equipment_id": "SB410", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.0}, {"equipment_id": "SB415", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.0}, {"equipment_id": "SB416", "type": "SIDEBOOM - CAT 594", "hours": 1.0, "rate": 1323.0}, {"equipment_id": "OR1401", "type": "TAG-A-LONG TRAILER (UTILITY)", "hours": 1.0, "rate": 48.0}, {"equipment_id": "OR1170", "type": "WLD RIG (HANKEWICH)", "hours": 12.0, "rate": 48.0}, {"equipment_id": "OR1171", "type": "WLD RIG (PEDERSON)", "hours": 12.0, "rate": 48.0}]'::jsonb,
    19529.33,
    10274.38
);

INSERT INTO contractor_lems (
    organization_id,
    project_id,
    field_log_id,
    account_number,
    foreman,
    date,
    labour_entries,
    equipment_entries,
    total_labour_cost,
    total_equipment_cost
) VALUES (
    (SELECT id FROM organizations WHERE slug = 'demo'),
    (SELECT id FROM projects WHERE short_code = 'DPP'),
    '18199',
    'CLX2068',
    'Chuck Baran',
    '2014-01-20',
    '[{"employee_id": "3061", "name": "Abdi Mursal", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}, {"employee_id": "2259", "name": "Bill (William) Erskine", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "1029", "name": "Chuck Baran", "type": "General Foreman (LAB)", "rt_hours": 1.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.0}, {"employee_id": "3404", "name": "Corrine Boyd", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36}, {"employee_id": "1121", "name": "Curtis Mashford", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}, {"employee_id": "2260", "name": "Doug Stinson", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.1, "ot_hours": 4.0, "ot_rate": 72.15}, {"employee_id": "1410", "name": "Jim Baran", "type": "Straw (Operator)", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.36}]'::jsonb,
    '[{"equipment_id": "OR1793", "type": "(FT) HYDROVAC TRUCK", "hours": 1.0, "rate": 85.0}, {"equipment_id": "OR1602D", "type": "BACKHOE CAT 320 (OR EQUIVALENT)", "hours": 1.0, "rate": 85.0}, {"equipment_id": "ORJ019", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 85.0}, {"equipment_id": "OR1589", "type": "DOZER CAT D6T LGP OR EQUIVALENT", "hours": 1.0, "rate": 85.0}, {"equipment_id": "OR1729", "type": "PICK UP 1/2 TON", "hours": 1.0, "rate": 85.0}, {"equipment_id": "DL2613", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 85.0}]'::jsonb,
    6500.0,
    510.0
);