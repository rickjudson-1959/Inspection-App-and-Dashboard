// technicalTerms.js - Pipeline construction terms for predictive typeahead
// Used by AskTheAgentPanel for prefix-match suggestions

const technicalTerms = [
  // Welding
  'preheat temperature', 'preheat requirements', 'interpass temperature',
  'root pass', 'hot pass', 'fill pass', 'cap pass', 'weld repair',
  'WPS requirements', 'WPS qualification', 'welder qualification',
  'cellulosic electrode', 'low hydrogen electrode', 'E6010', 'E7018', 'E8018',
  'root opening', 'root gap', 'hi-lo alignment', 'fit-up', 'bevel angle',
  'backing strip', 'consumable insert', 'purge gas', 'shielding gas',
  'SMAW', 'GMAW', 'FCAW', 'SAW', 'GTAW',
  'NDT requirements', 'radiographic testing', 'ultrasonic testing',
  'magnetic particle inspection', 'liquid penetrant testing',
  'API 1104', 'CSA Z662', 'ASME B31.4', 'ASME B31.8',
  'repair rate', 'reject rate', 'weld acceptance criteria',
  'heat input', 'travel speed', 'voltage', 'amperage',

  // Coating
  'FBE coating', 'fusion bonded epoxy', 'ARO coating', 'abrasion resistant overcoat',
  'three-layer polyethylene', '3LPE', 'three-layer polypropylene', '3LPP',
  'DFT reading', 'dry film thickness', 'holiday detection', 'holiday test',
  'Jeep voltage', 'coating repair', 'shrink sleeve', 'field joint coating',
  'coating damage', 'disbondment', 'cathodic disbondment',
  'surface preparation', 'blast profile', 'anchor pattern',
  'SSPC-SP10', 'near-white blast', 'white metal blast',

  // Pipe & Materials
  'pipe grade', 'pipe specification', 'wall thickness', 'nominal pipe size',
  'X42', 'X52', 'X60', 'X65', 'X70', 'X80',
  'SMYS', 'specified minimum yield strength', 'MOP', 'maximum operating pressure',
  'MAOP', 'maximum allowable operating pressure',
  'design factor', 'class location', 'location factor',
  'mill certificate', 'MTR', 'material test report', 'heat number',
  'pipe tally', 'joint number', 'pipe marking',
  'ovality', 'out of roundness', 'dent', 'gouge', 'lamination',

  // HDD & Boring
  'horizontal directional drilling', 'HDD', 'conventional bore', 'HD bore',
  'frac-out', 'inadvertent return', 'drilling fluid', 'bentonite',
  'mud weight', 'viscosity', 'annular space', 'grout', 'grout variance',
  'pilot hole', 'reaming', 'pullback', 'entry angle', 'exit angle',
  'bore profile', 'drill bit', 'steering', 'tracking',
  'casing size', 'carrier pipe size', 'spacer',
  'drilling waste', 'Directive 050', 'waste management',

  // Ditch & Lower-in
  'ditch depth', 'ditch width', 'ditch profile', 'trench',
  'rock ditch', 'bedding', 'padding', 'imported fill',
  'foreign line clearance', 'crossing clearance',
  'pipe support', 'skid', 'cradle', 'roller',
  'sideboom', 'pipe layer', 'lift plan',
  'cover depth', 'minimum cover', 'depth of cover',

  // Backfill
  'backfill material', 'select backfill', 'native backfill',
  'rock shield', 'geotextile', 'compaction', 'compaction percent',
  'lift thickness', 'moisture content', 'proctor test',

  // Topsoil & Environmental
  'topsoil stripping', 'horizon separation', 'admixture',
  'admixture contamination', 'stockpile separation',
  'erosion control', 'silt fence', 'wattle', 'erosion blanket',
  'ESC', 'environmental', 'buffer zone', 'setback',
  'wildlife passage', 'windrow break', 'watercourse crossing',
  'species at risk', 'environmental monitor',

  // Bending
  'bend angle', 'bend radius', 'minimum bend radius',
  'ovality limit', 'wrinkle', 'ripple', 'buckle',
  'cold bend', 'field bend', 'induction bend',
  'bending machine', 'mandrel', 'bending shoe',

  // Testing
  'hydrostatic test', 'hydrotest', 'test pressure',
  'test medium', 'pneumatic test', 'leak test',
  'pressure chart', 'test duration', 'hold time',
  'caliper pig', 'smart pig', 'ILI', 'inline inspection',

  // Access & Site
  'access road', 'matting', 'rig mat', 'swamp mat',
  'gate security', 'fence', 'cleaning station',
  'waterbar', 'drainage', 'culvert',
  'ROW condition', 'right of way', 'workspace',

  // Equipment
  'equipment cleaning', 'decontamination', 'pressure washer',
  'invasive species', 'noxious weed', 'equipment inspection',
  'safety inspection', 'daily inspection', 'pre-use inspection',

  // Piling
  'pile driving', 'driven pile', 'helical pile',
  'pile depth', 'refusal', 'blow count',
  'pile integrity', 'pile load test',

  // Hydrovac
  'hydrovac', 'daylighting', 'potholing', 'vacuum excavation',
  'utility locate', 'ground disturbance',

  // Cathodic Protection
  'cathodic protection', 'CP', 'anode', 'sacrificial anode',
  'impressed current', 'rectifier', 'test station',
  'pipe-to-soil potential', 'close interval survey',

  // Tie-in
  'tie-in', 'counterbore', 'transition', 'golden weld',
  'hot tap', 'stopple', 'sleeve',

  // General
  'quality check', 'quality control', 'quality assurance',
  'ITP', 'inspection test plan', 'hold point', 'witness point',
  'NCR', 'non-conformance report', 'corrective action',
  'as-built', 'red line', 'survey',
  'KP', 'kilometre post', 'chainage', 'station',
  'specification', 'procedure', 'standard',
  'permit', 'clearance', 'authorization'
]

export default technicalTerms
