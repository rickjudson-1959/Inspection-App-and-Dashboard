/**
 * nameMatchingUtils.js
 *
 * Fuzzy name-matching utility for LEM reconciliation.
 * Matches contractor LEM worker names against inspector report worker names
 * using a 7-pass algorithm with nickname resolution, Levenshtein distance,
 * and reversed-name-order fallback.
 */

// ---------------------------------------------------------------------------
// Nickname map — canonical (long) form → array of known short forms
// ---------------------------------------------------------------------------
const NICKNAME_MAP = {
  WILLIAM: ['WILL', 'BILL', 'BILLY', 'WILLY', 'LIAM'],
  ROBERT: ['ROB', 'BOB', 'BOBBY', 'ROBBIE', 'BERT'],
  RICHARD: ['RICK', 'RICH', 'DICK', 'RICKY'],
  JAMES: ['JIM', 'JIMMY', 'JAMIE'],
  JOHN: ['JACK', 'JOHNNY', 'JON'],
  JOSEPH: ['JOE', 'JOEY'],
  MICHAEL: ['MIKE', 'MIKEY', 'MICK'],
  THOMAS: ['TOM', 'TOMMY'],
  CHRISTOPHER: ['CHRIS', 'TOPHER'],
  DANIEL: ['DAN', 'DANNY'],
  MATTHEW: ['MATT', 'MATTY'],
  ANTHONY: ['TONY'],
  PATRICK: ['PAT', 'PADDY'],
  EDWARD: ['ED', 'EDDIE', 'TED', 'TEDDY'],
  GERALD: ['GERRY', 'JERRY'],
  STEPHEN: ['STEVE', 'STEVIE'],
  STEVEN: ['STEVE', 'STEVIE'],
  TIMOTHY: ['TIM', 'TIMMY'],
  KENNETH: ['KEN', 'KENNY'],
  RONALD: ['RON', 'RONNIE'],
  DONALD: ['DON', 'DONNIE'],
  LAWRENCE: ['LARRY'],
  RAYMOND: ['RAY'],
  BRADLEY: ['BRAD'],
  DOUGLAS: ['DOUG'],
  JEFFREY: ['JEFF'],
  GREGORY: ['GREG'],
  NICHOLAS: ['NICK', 'NICKY'],
  ALEXANDER: ['ALEX'],
  BENJAMIN: ['BEN', 'BENNY'],
  JONATHAN: ['JON', 'JONNY'],
  FREDERICK: ['FRED', 'FREDDY'],
  SAMUEL: ['SAM', 'SAMMY'],
  'JEAN-PIERRE': ['JP'],
  'JEAN-PAUL': ['JP'],
  'JEAN-LUC': ['JL'],
  'JEAN-MARC': ['JM'],
};

// ---------------------------------------------------------------------------
// Reverse lookup — built once at module load so 'TONY' → 'ANTHONY', etc.
// ---------------------------------------------------------------------------
const REVERSE_NICKNAME = {};
for (const [canonical, nicknames] of Object.entries(NICKNAME_MAP)) {
  for (const nick of nicknames) {
    // If two canonical names share a nickname (e.g. STEPHEN & STEVEN → STEVE),
    // store both so we can try either during matching.
    if (!REVERSE_NICKNAME[nick]) {
      REVERSE_NICKNAME[nick] = [];
    }
    REVERSE_NICKNAME[nick].push(canonical);
  }
}

// ---------------------------------------------------------------------------
// normalizeName — uppercase, trim, collapse whitespace, strip periods/commas,
//                 normalize hyphens (en-dash / em-dash → ASCII hyphen)
// ---------------------------------------------------------------------------
/**
 * Extract worker name from an entry object — handles all field name conventions.
 * LEM entries use: name
 * Inspector entries use: employeeName, employee_name, or name
 */
export function getWorkerName(entry) {
  if (!entry) return ''
  return entry.employeeName || entry.employee_name || entry.name || ''
}

/**
 * Extract equipment name from an entry object — handles all field name conventions.
 * LEM entries use: type
 * Inspector entries use: type, equipment_type, description
 */
export function getEquipmentName(entry) {
  if (!entry) return ''
  return entry.type || entry.equipment_type || entry.description || entry.name || ''
}

export function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toUpperCase()
    .trim()
    .replace(/[.,]/g, '')          // remove periods and commas
    .replace(/[\u2010-\u2015]/g, '-') // normalize Unicode hyphens to ASCII
    .replace(/\s+/g, ' ');         // collapse whitespace
}

// ---------------------------------------------------------------------------
// extractNameParts — handles "LAST, FIRST [MIDDLE]" and "FIRST [MIDDLE] LAST"
// Returns { first, last, middle, full }
// ---------------------------------------------------------------------------
export function extractNameParts(normalizedName) {
  if (!normalizedName) return { first: '', last: '', middle: '', full: '' };

  const full = normalizedName;
  let first = '';
  let last = '';
  let middle = '';

  if (normalizedName.includes(',')) {
    // "LAST, FIRST [MIDDLE ...]"
    const [lastPart, ...rest] = normalizedName.split(',');
    last = lastPart.trim();
    const firstParts = rest.join(',').trim().split(/\s+/);
    first = firstParts[0] || '';
    middle = firstParts.slice(1).join(' ');
  } else {
    const parts = normalizedName.split(/\s+/);
    if (parts.length === 1) {
      // Single token — treat as last name
      last = parts[0];
    } else if (parts.length === 2) {
      first = parts[0];
      last = parts[1];
    } else {
      // 3+ tokens: first, middle(s), last
      first = parts[0];
      last = parts[parts.length - 1];
      middle = parts.slice(1, -1).join(' ');
    }
  }

  return { first, last, middle, full };
}

// ---------------------------------------------------------------------------
// levenshtein — standard dynamic-programming edit distance
// ---------------------------------------------------------------------------
export function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  if (a === b) return 0;

  const m = a.length;
  const n = b.length;

  // Use single-row optimisation
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return all canonical forms a given first name could represent.
 * e.g. 'TONY' → ['ANTHONY'], 'WILLIAM' → ['WILLIAM'] (itself is canonical),
 *      'STEVE' → ['STEPHEN', 'STEVEN']
 */
function getCanonicalNames(firstName) {
  const results = [];
  // If the name IS a canonical form, include it
  if (NICKNAME_MAP[firstName]) {
    results.push(firstName);
  }
  // If the name is a nickname, include its canonical form(s)
  if (REVERSE_NICKNAME[firstName]) {
    results.push(...REVERSE_NICKNAME[firstName]);
  }
  return results;
}

/**
 * Return all nicknames for a given first name (including the canonical form
 * and the name itself).
 */
export function getAllVariants(firstName) {
  const variants = new Set([firstName]);

  // If canonical, add its nicknames
  if (NICKNAME_MAP[firstName]) {
    for (const n of NICKNAME_MAP[firstName]) variants.add(n);
  }

  // If nickname, add canonical + siblings
  const canonicals = REVERSE_NICKNAME[firstName];
  if (canonicals) {
    for (const c of canonicals) {
      variants.add(c);
      for (const n of (NICKNAME_MAP[c] || [])) variants.add(n);
    }
  }

  return variants;
}

/**
 * Check if two first names are nickname-equivalent.
 */
function isNicknameMatch(nameA, nameB) {
  if (!nameA || !nameB) return false;
  return getAllVariants(nameA).has(nameB);
}

// ---------------------------------------------------------------------------
// 7-pass matching engine (internal)
// ---------------------------------------------------------------------------

/**
 * Attempt to match a single LEM name-parts object against an array of
 * inspector name-parts objects.  Returns the best match or null.
 *
 * Each pass is tried in order; the first hit wins.
 */
function findBestMatch(lemParts, inspectorPartsArr) {
  // ----- Pass 1: exact normalized match -----
  for (const ip of inspectorPartsArr) {
    if (lemParts.full === ip.full) {
      return { inspectorParts: ip, confidence: 1.0, matchMethod: 'exact' };
    }
  }

  // ----- Pass 2: last name exact + first initial -----
  for (const ip of inspectorPartsArr) {
    if (
      lemParts.last &&
      ip.last &&
      lemParts.last === ip.last &&
      lemParts.first &&
      ip.first &&
      lemParts.first[0] === ip.first[0]
    ) {
      return { inspectorParts: ip, confidence: 0.95, matchMethod: 'last_exact_first_initial' };
    }
  }

  // ----- Pass 3: last name exact + first name Levenshtein ≤ 2 -----
  for (const ip of inspectorPartsArr) {
    if (
      lemParts.last &&
      ip.last &&
      lemParts.last === ip.last &&
      lemParts.first &&
      ip.first &&
      levenshtein(lemParts.first, ip.first) <= 2
    ) {
      return { inspectorParts: ip, confidence: 0.85, matchMethod: 'last_exact_first_fuzzy' };
    }
  }

  // ----- Pass 4: last name exact + nickname lookup -----
  for (const ip of inspectorPartsArr) {
    if (
      lemParts.last &&
      ip.last &&
      lemParts.last === ip.last &&
      lemParts.first &&
      ip.first &&
      isNicknameMatch(lemParts.first, ip.first)
    ) {
      return { inspectorParts: ip, confidence: 0.80, matchMethod: 'last_exact_nickname' };
    }
  }

  // ----- Pass 5: last name Levenshtein ≤ 1 + first initial -----
  for (const ip of inspectorPartsArr) {
    if (
      lemParts.last &&
      ip.last &&
      levenshtein(lemParts.last, ip.last) <= 1 &&
      lemParts.first &&
      ip.first &&
      lemParts.first[0] === ip.first[0]
    ) {
      return { inspectorParts: ip, confidence: 0.70, matchMethod: 'last_fuzzy_first_initial' };
    }
  }

  // ----- Pass 6: reversed name order — re-run passes 1-3 -----
  const reversedLem = { first: lemParts.last, last: lemParts.first, middle: lemParts.middle, full: lemParts.full };

  // 6a: exact after reversal
  for (const ip of inspectorPartsArr) {
    const reversedFull = reversedLem.last && reversedLem.first
      ? `${reversedLem.first} ${reversedLem.last}`
      : reversedLem.full;
    if (reversedFull === ip.full) {
      return { inspectorParts: ip, confidence: 0.75, matchMethod: 'reversed_exact' };
    }
  }

  // 6b: reversed last exact + first initial
  for (const ip of inspectorPartsArr) {
    if (
      reversedLem.last &&
      ip.last &&
      reversedLem.last === ip.last &&
      reversedLem.first &&
      ip.first &&
      reversedLem.first[0] === ip.first[0]
    ) {
      return { inspectorParts: ip, confidence: 0.75, matchMethod: 'reversed_last_first_initial' };
    }
  }

  // 6c: reversed last exact + first Levenshtein ≤ 2
  for (const ip of inspectorPartsArr) {
    if (
      reversedLem.last &&
      ip.last &&
      reversedLem.last === ip.last &&
      reversedLem.first &&
      ip.first &&
      levenshtein(reversedLem.first, ip.first) <= 2
    ) {
      return { inspectorParts: ip, confidence: 0.75, matchMethod: 'reversed_last_first_fuzzy' };
    }
  }

  // ----- Pass 7: initials + last name match -----
  for (const ip of inspectorPartsArr) {
    // Build initials from the LEM entry (first initial + middle initials)
    const lemInitials = [lemParts.first?.[0], ...(lemParts.middle || '').split(/\s+/).filter(Boolean).map(m => m[0])].filter(Boolean).join('');
    const ipInitials = [ip.first?.[0], ...(ip.middle || '').split(/\s+/).filter(Boolean).map(m => m[0])].filter(Boolean).join('');

    if (
      lemParts.last &&
      ip.last &&
      lemParts.last === ip.last &&
      lemInitials &&
      ipInitials &&
      lemInitials === ipInitials
    ) {
      return { inspectorParts: ip, confidence: 0.65, matchMethod: 'initials_last' };
    }

    // Also handle the case where the LEM entry is just initials + last name
    // e.g. "J SMITH" matching "JOHN SMITH"
    if (
      lemParts.last &&
      ip.last &&
      lemParts.last === ip.last &&
      lemParts.first &&
      lemParts.first.length === 1 &&
      ip.first &&
      lemParts.first === ip.first[0]
    ) {
      return { inspectorParts: ip, confidence: 0.65, matchMethod: 'initials_last' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// matchWorkers — main exported matching function
// ---------------------------------------------------------------------------
/**
 * Match LEM worker entries against inspector report entries.
 *
 * @param {Array<{ name: string, [key: string]: any }>} lemEntries
 *   Each entry must have at least a `name` property.
 * @param {Array<{ name: string, [key: string]: any }>} inspectorEntries
 *   Each entry must have at least a `name` property.
 *
 * @returns {Array<{
 *   lemEntry: object,
 *   inspectorEntry: object | null,
 *   confidence: number,
 *   matchMethod: string,
 *   status: 'matched' | 'lem_only' | 'inspector_only'
 * }>}
 */
export function matchWorkers(lemEntries, inspectorEntries) {
  if (!Array.isArray(lemEntries) || !Array.isArray(inspectorEntries)) {
    return [];
  }

  // Pre-compute normalized parts for every inspector entry
  const inspectorParsed = inspectorEntries.map(entry => ({
    entry,
    parts: extractNameParts(normalizeName(getWorkerName(entry))),
  }));

  const results = [];
  const matchedInspectorIndices = new Set();

  // For each LEM entry, find the best inspector match
  for (const lemEntry of lemEntries) {
    const lemNorm = normalizeName(getWorkerName(lemEntry));
    const lemParts = extractNameParts(lemNorm);

    // Only consider unmatched inspector entries
    const available = inspectorParsed
      .map((ip, idx) => ({ ...ip, idx }))
      .filter(ip => !matchedInspectorIndices.has(ip.idx));

    const best = findBestMatch(
      lemParts,
      available.map(a => a.parts),
    );

    if (best) {
      // Find the index of the matched inspector entry
      const matchedAvailable = available.find(a => a.parts === best.inspectorParts);
      if (matchedAvailable) {
        matchedInspectorIndices.add(matchedAvailable.idx);
        results.push({
          lemEntry,
          inspectorEntry: matchedAvailable.entry,
          confidence: best.confidence,
          matchMethod: best.matchMethod,
          status: 'matched',
        });
        continue;
      }
    }

    // No match — potential ghost worker
    results.push({
      lemEntry,
      inspectorEntry: null,
      confidence: 0,
      matchMethod: 'none',
      status: 'lem_only',
    });
  }

  // Append unmatched inspector entries
  for (let idx = 0; idx < inspectorParsed.length; idx++) {
    if (!matchedInspectorIndices.has(idx)) {
      results.push({
        lemEntry: null,
        inspectorEntry: inspectorParsed[idx].entry,
        confidence: 0,
        matchMethod: 'none',
        status: 'inspector_only',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// matchEquipment — token-overlap matching for equipment descriptions
// ---------------------------------------------------------------------------

/**
 * Tokenize an equipment name for comparison.
 * Uppercase, strip non-alphanumeric (except spaces), split on whitespace,
 * drop single-character tokens.
 */
function tokenizeEquipment(name) {
  if (!name || typeof name !== 'string') return [];
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Match LEM equipment entries against inspector equipment entries using
 * token-overlap ratio.
 *
 * @param {Array<{ name: string, [key: string]: any }>} lemEquipment
 * @param {Array<{ name: string, [key: string]: any }>} inspectorEquipment
 *
 * @returns {Array<{
 *   lemEntry: object,
 *   inspectorEntry: object | null,
 *   confidence: number,
 *   matchMethod: string,
 *   status: 'matched' | 'lem_only' | 'inspector_only'
 * }>}
 */
export function matchEquipment(lemEquipment, inspectorEquipment) {
  if (!Array.isArray(lemEquipment) || !Array.isArray(inspectorEquipment)) {
    return [];
  }

  const results = [];
  const matchedInspectorIndices = new Set();

  for (const lemEntry of lemEquipment) {
    const lemTokens = tokenizeEquipment(getEquipmentName(lemEntry));
    if (lemTokens.length === 0) {
      results.push({
        lemEntry,
        inspectorEntry: null,
        confidence: 0,
        matchMethod: 'none',
        status: 'lem_only',
      });
      continue;
    }

    let bestMatch = null;
    let bestOverlap = 0;
    let bestIdx = -1;

    for (let idx = 0; idx < inspectorEquipment.length; idx++) {
      if (matchedInspectorIndices.has(idx)) continue;

      const ipTokens = tokenizeEquipment(getEquipmentName(inspectorEquipment[idx]));
      if (ipTokens.length === 0) continue;

      // Count overlapping tokens
      const lemSet = new Set(lemTokens);
      const ipSet = new Set(ipTokens);
      let overlap = 0;
      for (const t of lemSet) {
        if (ipSet.has(t)) overlap++;
      }

      // Overlap ratio = intersection / union
      const union = new Set([...lemSet, ...ipSet]).size;
      const ratio = union > 0 ? overlap / union : 0;

      if (ratio > bestOverlap) {
        bestOverlap = ratio;
        bestMatch = inspectorEquipment[idx];
        bestIdx = idx;
      }
    }

    if (bestOverlap > 0.3 && bestIdx >= 0) {
      matchedInspectorIndices.add(bestIdx);
      results.push({
        lemEntry,
        inspectorEntry: bestMatch,
        confidence: Math.round(bestOverlap * 100) / 100,
        matchMethod: 'token_overlap',
        status: 'matched',
      });
    } else {
      results.push({
        lemEntry,
        inspectorEntry: null,
        confidence: 0,
        matchMethod: 'none',
        status: 'lem_only',
      });
    }
  }

  // Append unmatched inspector equipment
  for (let idx = 0; idx < inspectorEquipment.length; idx++) {
    if (!matchedInspectorIndices.has(idx)) {
      results.push({
        lemEntry: null,
        inspectorEntry: inspectorEquipment[idx],
        confidence: 0,
        matchMethod: 'none',
        status: 'inspector_only',
      });
    }
  }

  return results;
}
