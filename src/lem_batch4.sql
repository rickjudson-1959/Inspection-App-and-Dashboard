-- Batch 4: LEMs 18213, 18219, 18220, 18222, 18226, 18229, 18230
-- From January 20-21, 2014

-- LEM 18213 - Kirk Ochocki - Tie In (Page 2 only - partial data)
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18213',
  'CLX2',
  'Kirk Ochocki',
  '2014-01-20',
  0.00,
  0.00,
  '[]'::jsonb,
  '[]'::jsonb
);

-- LEM 18219 - Clayton Pickering - Frost Packing Nights
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18219',
  'CLX2101',
  'Clayton Pickering',
  '2014-01-20',
  5773.51,
  587.00,
  '[
    {"employee_id": "3885", "name": "Anthony Shaw", "type": "Intermediate Operator", "rt_hours": 8.0, "rt_rate": 57.74, "ot_hours": 4.0, "ot_rate": 86.62, "dt_hours": 0.0, "dt_rate": 115.49},
    {"employee_id": "3928", "name": "Chad Day", "type": "Intermediate Operator", "rt_hours": 8.0, "rt_rate": 57.74, "ot_hours": 5.0, "ot_rate": 86.62, "dt_hours": 0.0, "dt_rate": 115.49},
    {"employee_id": "1224", "name": "Clay Griffin", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 5.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1075", "name": "Clayton Pickering", "type": "Straw (Operator)", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 7.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "3494", "name": "Denis Arbour", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 6.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "3929", "name": "Nathan Bourasa", "type": "Intermediate Operator", "rt_hours": 8.0, "rt_rate": 57.74, "ot_hours": 4.0, "ot_rate": 86.62, "dt_hours": 0.0, "dt_rate": 115.49}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1084", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "OR1449", "type": "LIGHT TOWER - 6 KW", "hours": 1.0, "rate": 212.00},
    {"equipment_id": "OR1453", "type": "LIGHT TOWER - 6 KW", "hours": 1.0, "rate": 212.00}
  ]'::jsonb
);

-- LEM 18220 - Shaun Quinn - Engineering
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18220',
  'CLX2120',
  'Shaun Quinn',
  '2014-01-20',
  5162.15,
  421.00,
  '[
    {"employee_id": "1103", "name": "Brian Paquette", "type": "Straw (Operator)", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 6.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "3043", "name": "Cameron Burns", "type": "Specialized Labourer", "rt_hours": 8.0, "rt_rate": 49.84, "ot_hours": 4.0, "ot_rate": 74.75, "dt_hours": 0.0, "dt_rate": 99.67},
    {"employee_id": "3914", "name": "John Roby", "type": "Specialized Labourer", "rt_hours": 8.0, "rt_rate": 49.84, "ot_hours": 4.0, "ot_rate": 74.75, "dt_hours": 0.0, "dt_rate": 99.67},
    {"employee_id": "3213", "name": "Michael Kostynuik", "type": "Specialized Labourer", "rt_hours": 8.0, "rt_rate": 49.84, "ot_hours": 5.0, "ot_rate": 74.75, "dt_hours": 0.0, "dt_rate": 99.67},
    {"employee_id": "1007", "name": "Shaun Quinn", "type": "Project Engineer", "rt_hours": 1.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00}
  ]'::jsonb,
  '[
    {"equipment_id": "DL2603", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 145.00},
    {"equipment_id": "DL2625", "type": "SUV - TAHOE/YUKON/EXPEDITION", "hours": 1.0, "rate": 138.00},
    {"equipment_id": "DL2722", "type": "SUV - TAHOE/YUKON/EXPEDITION", "hours": 1.0, "rate": 138.00}
  ]'::jsonb
);

-- LEM 18222 - Aurele Robert - Mechanic/Maintenance
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18222',
  'CLX2030',
  'Aurele Robert',
  '2014-01-21',
  23671.59,
  14338.11,
  '[
    {"employee_id": "1154", "name": "Andrew (Andy) McQuaker", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1013", "name": "Aurel Robert", "type": "Master Mechanic", "rt_hours": 1.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 141.88},
    {"employee_id": "1124", "name": "Bernard Hill", "type": "Serviceman (Night)", "rt_hours": 8.0, "rt_rate": 71.04, "ot_hours": 5.0, "ot_rate": 106.46, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3741", "name": "Brad Gagne", "type": "Serviceman", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 98.89},
    {"employee_id": "3998", "name": "Chantelle Pertell", "type": "Apprentice Operator", "rt_hours": 8.0, "rt_rate": 49.44, "ot_hours": 5.0, "ot_rate": 74.16, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1338", "name": "Darryon Pidherny", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1144", "name": "Donald (Al) Pettifer", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 121.17},
    {"employee_id": "2144", "name": "Gordon Husak", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 6.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3326", "name": "James Norton", "type": "Utility Welder", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3891", "name": "Jean Paul Tessier", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1156", "name": "Jessie Levall", "type": "Utility Welder", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.36, "dt_hours": 0.0, "dt_rate": 128.47},
    {"employee_id": "3932", "name": "Jim McQuaker", "type": "Principal Operator 1", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1342", "name": "Larry Balash", "type": "Utility Welder", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3042", "name": "Leslie Beever", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3037", "name": "Mark Shabaga", "type": "Utility Welder", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3150", "name": "Randy Haney", "type": "Serviceman", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1200", "name": "Sean Imeson", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 6.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "1016", "name": "Sid Mulkay", "type": "Mechanic (Nites)", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 106.46, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3173", "name": "Travis Schmidt", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 106.46, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3923", "name": "Tyler Balan", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 71.04, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17},
    {"employee_id": "3943", "name": "William B Pettifer", "type": "Mechanic", "rt_hours": 8.0, "rt_rate": 65.69, "ot_hours": 5.0, "ot_rate": 98.43, "dt_hours": 0.0, "dt_rate": 131.17}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1159", "type": "MCH RIG (B Pettifer)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1161", "type": "MCH RIG (TESSIER)", "hours": 17.0, "rate": 48.00},
    {"equipment_id": "OR1156", "type": "MCH RIG (A McQuaker)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1157", "type": "MCH RIG (D Pettifer)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1155", "type": "MCH RIG (G Husak)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1149", "type": "MCH RIG (J Levall)", "hours": 19.0, "rate": 48.00},
    {"equipment_id": "OR1148", "type": "MCH RIG (L Beever)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1154", "type": "MCH RIG (M Shabaga)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1153", "type": "MCH RIG (S Imeson)", "hours": 19.0, "rate": 48.00},
    {"equipment_id": "OR1146", "type": "MCH Rig (S Mulkay)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1145", "type": "MCH RIG (T Balan)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1162", "type": "MECH RIG (T Schmidt)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1150", "type": "MECH RIG (J Norton)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "OR1329", "type": "SERVICE TRUCK", "hours": 1.0, "rate": 741.00},
    {"equipment_id": "SA3-009", "type": "SERVICE TRUCK", "hours": 1.0, "rate": 476.25},
    {"equipment_id": "OR1304D", "type": "WASH UNIT - STEAM, WATER TRUCK", "hours": 1.0, "rate": 48.00},
    {"equipment_id": "OR1158", "type": "WELD RIG (J NORTON)", "hours": 18.0, "rate": 48.00},
    {"equipment_id": "DL2623", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "OR1434", "type": "DIESEL HEATER 390K BTU", "hours": 1.0, "rate": 41.43},
    {"equipment_id": "OR14450", "type": "DIESEL HEATER 390K BTU", "hours": 1.0, "rate": 41.43}
  ]'::jsonb
);

-- LEM 18226 - Gordon Seaby - Signs and Flagging
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18226',
  'CLX2045',
  'Gordon Seaby',
  '2014-01-20',
  4990.57,
  1135.19,
  '[
    {"employee_id": "3920", "name": "Alo Pankow", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 4.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "1066", "name": "Ernie Cardinal", "type": "Labour Steward", "rt_hours": 3.0, "rt_rate": 48.71, "ot_hours": 0.0, "ot_rate": 73.06, "dt_hours": 0.0, "dt_rate": 97.41},
    {"employee_id": "1170", "name": "Gordon Seaby", "type": "General Foreman (OPR)", "rt_hours": 1.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "3773", "name": "John Rostek", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 4.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "3068", "name": "Kevin Brindley", "type": "Flat Deck < 5 Ton", "rt_hours": 8.0, "rt_rate": 59.79, "ot_hours": 4.0, "ot_rate": 89.69, "dt_hours": 0.0, "dt_rate": 119.58},
    {"employee_id": "3701", "name": "Kyle Spencer", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 4.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20}
  ]'::jsonb,
  '[
    {"equipment_id": "OR1008", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "OR1096", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "DL2504", "type": "FLATDECK - 2 TON", "hours": 1.0, "rate": 165.00},
    {"equipment_id": "OR1470", "type": "GENERATOR PUMP AND LIGHT PACKAGE 15-20KW", "hours": 1.0, "rate": 230.19},
    {"equipment_id": "OR1447", "type": "LIGHT TOWER - 6 KW", "hours": 1.0, "rate": 212.00},
    {"equipment_id": "OR1450", "type": "LIGHT TOWER - 6 KW", "hours": 1.0, "rate": 212.00}
  ]'::jsonb
);

-- LEM 18229 - Joe Sutherland - Transportation
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18229',
  'CLX2040',
  'Joe Sutherland',
  '2014-01-20',
  23908.50,
  23568.32,
  '[
    {"employee_id": "1037", "name": "Aaron Meunier", "type": "Picker Truck > 12 Tons", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3191", "name": "Andre Thiel", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3250", "name": "Darren Rath", "type": "Pilot Car Driver", "rt_hours": 8.0, "rt_rate": 56.73, "ot_hours": 6.0, "ot_rate": 85.10, "dt_hours": 0.0, "dt_rate": 113.46},
    {"employee_id": "1111", "name": "Derek MacDonnell", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3038", "name": "Donald Starr", "type": "Swamper", "rt_hours": 8.0, "rt_rate": 48.45, "ot_hours": 4.0, "ot_rate": 72.68, "dt_hours": 0.0, "dt_rate": 96.90},
    {"employee_id": "3671", "name": "Dominique Tremblay", "type": "Picker Truck > 12 Tons", "rt_hours": 8.0, "rt_rate": 48.45, "ot_hours": 4.0, "ot_rate": 72.68, "dt_hours": 0.0, "dt_rate": 125.90},
    {"employee_id": "3851", "name": "Douglas MacPhail", "type": "Swamper - Steward", "rt_hours": 8.0, "rt_rate": 64.85, "ot_hours": 4.0, "ot_rate": 97.28, "dt_hours": 0.0, "dt_rate": 129.70},
    {"employee_id": "1023", "name": "Dwayne Wodlyn", "type": "Teamster - Steward", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 4.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 96.20},
    {"employee_id": "3030", "name": "Eric LaFrance", "type": "General Labourer", "rt_hours": 8.0, "rt_rate": 48.10, "ot_hours": 5.0, "ot_rate": 72.15, "dt_hours": 0.0, "dt_rate": 119.58},
    {"employee_id": "3341", "name": "Gerald Otten", "type": "Flat Deck < 5 Ton", "rt_hours": 8.0, "rt_rate": 59.79, "ot_hours": 6.0, "ot_rate": 89.69, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3082", "name": "Gerry Guitard", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3800", "name": "Ian Faulkner", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "1529", "name": "Joe Sutherland", "type": "General Foreman (TSK)", "rt_hours": 1.0, "rt_rate": 1332.16, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "3219", "name": "Justin Schrey", "type": "Swamper", "rt_hours": 8.0, "rt_rate": 48.45, "ot_hours": 5.0, "ot_rate": 72.68, "dt_hours": 0.0, "dt_rate": 96.90},
    {"employee_id": "1450", "name": "Kenneth Enns", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 6.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "1275", "name": "Layne Pallister", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 4.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "1092", "name": "Leonard Snyder", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 6.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3161", "name": "Michael Goldman", "type": "Lowbed / Multi Purpose Driver", "rt_hours": 8.0, "rt_rate": 56.88, "ot_hours": 6.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3927", "name": "Milton Gall", "type": "Fuel Truck Helper", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 85.25, "dt_hours": 0.0, "dt_rate": 113.61},
    {"employee_id": "3286", "name": "Nathan Langlais", "type": "Picker Truck > 12 Tons", "rt_hours": 8.0, "rt_rate": 64.24, "ot_hours": 5.0, "ot_rate": 96.37, "dt_hours": 0.0, "dt_rate": 128.49},
    {"employee_id": "3376", "name": "Robert MacPhail", "type": "Fuel Truck Driver", "rt_hours": 8.0, "rt_rate": 59.94, "ot_hours": 6.0, "ot_rate": 89.84, "dt_hours": 0.0, "dt_rate": 119.73}
  ]'::jsonb,
  '[
    {"equipment_id": "2224", "type": "Lowbed / Multi Purpose Driver", "hours": 1.0, "rate": 424.00},
    {"equipment_id": "OR1313", "type": "(FT) PICKER TRUCK - 45 TON", "hours": 1.0, "rate": 1482.00},
    {"equipment_id": "444cT", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1301C", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1303C", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-002C", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-026C", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-027C", "type": "BOOSTER FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1339", "type": "B-TRAIN TRAILER", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1454", "type": "FORK LIFT - ZOOM", "hours": 1.0, "rate": 503.00},
    {"equipment_id": "OR1506", "type": "FORK LIFT - ZOOM BOOM", "hours": 1.0, "rate": 741.00},
    {"equipment_id": "SA3-010", "type": "FUEL TRUCK TANDEM", "hours": 1.0, "rate": 927.00},
    {"equipment_id": "T314", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 170.00},
    {"equipment_id": "SA9-011", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 170.00},
    {"equipment_id": "OR1312", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "SA5-012", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "SA9-010", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "SA9-011", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "SA9-012", "type": "HIGHBOY TRAILER", "hours": 1.0, "rate": 149.00},
    {"equipment_id": "OR1301A", "type": "JEEP FOR LOBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1303A", "type": "JEEP FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-002A", "type": "JEEP FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-026A", "type": "JEEP FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "SA9-027A", "type": "JEEP FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "444aT", "type": "JEEP FOR LOWBOY", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "T318", "type": "LOW/HIGHBOY TRACTOR", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "OR1303B", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "OR1303D", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "SA9-002B", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "SA9-026B", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "SA9-027B", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "444bT", "type": "LOWBOY TRAILER", "hours": 1.0, "rate": 667.00},
    {"equipment_id": "SA4-001", "type": "LOADER CAT 930", "hours": 1.0, "rate": 424.00},
    {"equipment_id": "OR1336", "type": "LOWBOY/HIGHBOY TRUCK TRACTOR", "hours": 1.0, "rate": 424.00},
    {"equipment_id": "SA3-002", "type": "LOWBOY/HIGHBOY TRUCK TRACTOR", "hours": 1.0, "rate": 424.00},
    {"equipment_id": "SA3-003", "type": "LOWBOY/HIGHBOY TRUCK TRACTOR", "hours": 1.0, "rate": 424.00},
    {"equipment_id": "OR1129", "type": "OFFICE TRAILER", "hours": 1.0, "rate": 133.00},
    {"equipment_id": "SA3-007", "type": "PICKER TRUCK - 30 TON", "hours": 1.0, "rate": 1482.00},
    {"equipment_id": "T334", "type": "PICKER TRUCK - 8 TON", "hours": 1.0, "rate": 307.00},
    {"equipment_id": "T278", "type": "PICKER TRUCK - 8 TON", "hours": 1.0, "rate": 307.00},
    {"equipment_id": "OR1023", "type": "PICKUP 1/2 TON", "hours": 1.0, "rate": 125.00},
    {"equipment_id": "OR1039", "type": "PICKUP 1/2 TON 4x4", "hours": 1.0, "rate": 125.00},
    {"equipment_id": "DL2556", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 145.00},
    {"equipment_id": "DL2607", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 145.00},
    {"equipment_id": "DL2616", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 170.00},
    {"equipment_id": "420T", "type": "POLE/PIPE TRAILER", "hours": 1.0, "rate": 239.00},
    {"equipment_id": "446T", "type": "POLE/PIPE TRAILER", "hours": 1.0, "rate": 239.00},
    {"equipment_id": "492T", "type": "SCISSOR NECK TRAILER", "hours": 1.0, "rate": 927.00},
    {"equipment_id": "SB302", "type": "SIDEBOOM - CAT 583", "hours": 1.0, "rate": 927.00},
    {"equipment_id": "SA9-005", "type": "STEPDECK TRAILER", "hours": 1.0, "rate": 170.00}
  ]'::jsonb
);

-- LEM 18230 - Ernie Ochocki - Pre-Construction/Supervision
INSERT INTO contractor_lems (field_log_id, account_number, foreman, date, total_labour_cost, total_equipment_cost, labour_entries, equipment_entries)
VALUES (
  '18230',
  'CLX2020',
  'Ernie Ochocki',
  '2014-01-20',
  13138.63,
  1474.13,
  '[
    {"employee_id": "1010", "name": "Bob Todd", "type": "Engineering Manager", "rt_hours": 1.0, "rt_rate": 2019.69, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "1012", "name": "Carl Andersen", "type": "Asst Superintendent", "rt_hours": 1.0, "rt_rate": 2019.69, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "1171", "name": "Chelsea Warner", "type": "Specialized Labourer", "rt_hours": 8.0, "rt_rate": 49.84, "ot_hours": 4.0, "ot_rate": 74.75, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "1017", "name": "Ernie Ochocki", "type": "Superintendent", "rt_hours": 1.0, "rt_rate": 2644.72, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "1076", "name": "Hector MacDonald", "type": "Asst Superintendent", "rt_hours": 1.0, "rt_rate": 2019.69, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "1053", "name": "Kandis Gauthier", "type": "Office Clerk", "rt_hours": 1.0, "rt_rate": 825.80, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00},
    {"employee_id": "3262", "name": "Marco Santos", "type": "Project Planner", "rt_hours": 1.0, "rt_rate": 1186.32, "ot_hours": 0.0, "ot_rate": 0.00, "dt_hours": 0.0, "dt_rate": 0.00}
  ]'::jsonb,
  '[
    {"equipment_id": "ATV16", "type": "ARGO ATV (SIDE BY SIDE)", "hours": 1.0, "rate": 238.13},
    {"equipment_id": "ATV14", "type": "ATV/GATOR", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "ATV19", "type": "ATV/GATOR", "hours": 1.0, "rate": 127.00},
    {"equipment_id": "OR1194", "type": "ATV/GATOR", "hours": 1.0, "rate": 163.00},
    {"equipment_id": "DL2507", "type": "CREWCAB - 1 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "DL2508", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "DL2714", "type": "CREWCAB 3/4 TON", "hours": 1.0, "rate": 153.00},
    {"equipment_id": "DL2612", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 145.00},
    {"equipment_id": "DL2624", "type": "PICKUP 3/4 TON 4X4", "hours": 1.0, "rate": 96.00},
    {"equipment_id": "496T", "type": "TAG-A-LONG TRAILER (6 TON)", "hours": 1.0, "rate": 96.00}
  ]'::jsonb
);
