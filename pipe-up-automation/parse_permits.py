#!/usr/bin/env python3
"""
BCER Permit Parser — Eagle Mountain Woodfibre Gas Pipeline
===========================================================
Parses BCER permit PDFs and extracts location-specific regulatory conditions
into a structured regulatory_zones.json file.

Usage:
    python parse_permits.py                    # Parse all PDFs in permits/
    python parse_permits.py --dry-run          # Show what would be extracted, don't write
    python parse_permits.py --keep-existing    # Merge with existing zones (don't overwrite hand-authored ones)
    python parse_permits.py --ai               # AI-assisted extraction (haiku default)
    python parse_permits.py --ai --model sonnet  # Use sonnet for higher accuracy
    python parse_permits.py --ai --dry-run     # Preview AI results without writing
"""

import argparse
from datetime import date, timedelta
import json
import re
import sys
import time
from pathlib import Path

import pdfplumber

# Optional AI dependencies — graceful degradation if missing
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

try:
    from dotenv import load_dotenv
    # Load .env from the project root (one level up from pipe-up-automation/)
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

import os


# ─── Configuration ───────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
PERMITS_DIR = BASE_DIR / "permits"
OUTPUT_FILE = BASE_DIR / "data" / "regulatory_zones.json"
REVIEW_FILE = BASE_DIR / "data" / "zones_needing_review.json"

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]
MONTH_ABBREVS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
]
MONTH_MAP = {}
for i, name in enumerate(MONTH_NAMES, 1):
    MONTH_MAP[name] = i
    MONTH_MAP[MONTH_ABBREVS[i - 1]] = i
    # Also handle longer abbreviations like "sept"
MONTH_MAP["sept"] = 9

# Section headings that indicate administrative/boilerplate content to skip
SKIP_SECTIONS = {
    "notification", "general", "clearing/forest act", "clearing / forest act",
    "advisory guidance", "advisory", "definitions",
}

# Section heading → zone type strong signal
SECTION_TYPE_MAP = {
    "water course crossings and works": "fisheries",
    "water course crossings": "fisheries",
    "watercourse crossings and works": "fisheries",
    "watercourse crossings": "fisheries",
    "environmental": "environmental",
    "archaeology": "ground_disturbance",
    "archaeological": "ground_disturbance",
    "pipeline conditions": None,  # generic, classify by keywords
    "facility conditions": None,
    "road conditions": None,
    "short term water use": "water_management",
    "short term water use conditions": "water_management",
    "authorized discharges": "water_management",
    "general requirements": None,
}

# Zone type keyword sets
ZONE_KEYWORDS = {
    "fisheries": [
        "dfo", "fisheries", "fish habitat", "watercourse crossing",
        "timing window", "in-stream work", "reduced risk window",
        "least risk window", "spawning", "fish bearing", "fish-bearing",
        "stream crossing", "stream, lake and wetland",
    ],
    "environmental": [
        "esa", "environmentally sensitive", "wildlife", "species at risk",
        "setback", "buffer", "riparian", "wetland", "terrain hazard",
        "steep slope", "avalanche", "erosion", "murrelet", "spotted owl",
        "mountain goat", "raptor", "eagle nest", "heron",
    ],
    "ground_disturbance": [
        "ground disturbance", "pre-disturbance assessment",
        "archaeological", "heritage", "contaminated", "geotechnical",
        "aia", "artifact", "heritage conservation act",
    ],
    "invasive_species": [
        "invasive", "noxious weed", "knotweed", "soil disposal",
        "equipment wash", "weed control act", "invasive plant",
    ],
    "safety": [
        "blasting", "exclusion zone", "helicopter", "flight operations",
        "danger zone", "worksafebc",
    ],
    "timing_restriction": [
        "timing window", "seasonal restriction", "no work period",
        "restricted activity period", "wildlife window", "migratory bird",
        "nesting", "no clearing between",
    ],
    "water_management": [
        "water withdrawal", "water intake", "turbidity", "sediment",
        "silt", "erosion control", "water quality monitoring",
        "water sustainability act", "discharge", "effluent",
        "point of diversion", "withdrawal rate", "withdrawal volume",
    ],
}

# Zone type display config (extends the existing 5 types)
ZONE_TYPE_CONFIG = {
    "fisheries": {"label": "Fisheries Timing Windows", "color": "#00BCD4"},
    "environmental": {"label": "Environmental Sensitive Areas", "color": "#FF9800"},
    "ground_disturbance": {"label": "Ground Disturbance Permits", "color": "#4CAF50"},
    "invasive_species": {"label": "Invasive Species Zones", "color": "#E91E63"},
    "safety": {"label": "Safety / Exclusion Zones", "color": "#F44336"},
    "water_management": {"label": "Water Management", "color": "#2196F3"},
    "timing_restriction": {"label": "Timing Restrictions", "color": "#9C27B0"},
}

VALID_ZONE_TYPES = set(ZONE_TYPE_CONFIG.keys())

# ─── AI Configuration ────────────────────────────────────────────────────────

AI_MODEL_MAP = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-20250514",
}
AI_DEFAULT_MODEL = "haiku"
AI_RATE_LIMIT_DELAY = 0.1  # seconds between requests
AI_MAX_RETRIES = 3
AI_BACKOFF_BASE = 2  # exponential backoff: 2s → 4s → 8s

AI_SYSTEM_PROMPT = """You are parsing a BCER (BC Energy Regulator) permit for the Eagle Mountain \
Woodfibre Gas Pipeline (KP 0 to KP 38.5, Squamish BC). Analyze this single \
regulatory condition and return a JSON object.

Return ONLY a JSON object with these fields:
{
  "name": "Short descriptive name for this zone (e.g. 'Stawamus River Fish Window', 'Hixon Creek Riparian Setback')",
  "type": "One of: fisheries, environmental, ground_disturbance, invasive_species, safety, timing_restriction, water_management",
  "kp_start": 0.0,
  "kp_end": 0.0,
  "restriction": "One-sentence summary of what is restricted or required",
  "authority": "Regulatory authority reference",
  "timing_windows": [{"restricted_start": "MM-DD", "restricted_end": "MM-DD", "description": "brief"}],
  "needs_kp": true,
  "is_location_specific": true,
  "skip": false
}

Rules:
- "name": Use proper location names when present (creek, river, lake names). Never use generic names like "Condition #14".
- "type": Must be one of the 7 listed types. Pick the best single match.
- "kp_start"/"kp_end": Extract if KP/chainage values are present, otherwise 0.0.
- "restriction": Concise 1-2 sentence summary of the regulatory requirement. Not the full text.
- "needs_kp": true if the condition references a specific location by name (creek, river, site) but has no KP chainage data.
- "is_location_specific": true if the condition applies to a specific geographic location, false if it's a general pipeline-wide rule.
- "skip": true if this is administrative boilerplate, general notification, or a condition that does not create a zone-mappable restriction (e.g. "notify the regulator", "submit reports", general compliance). Most conditions should NOT be skipped — only skip truly non-spatial administrative items.
- "timing_windows": Extract date ranges if present, otherwise empty array [].
- Return ONLY the JSON object, no markdown fences, no explanation."""


# ─── PDF Text Extraction ─────────────────────────────────────────────────────

def extract_text_by_page(pdf_path):
    """Extract text from each page of a PDF.

    Returns list of (page_number, page_text) tuples (1-indexed).
    Flags likely scanned PDFs (very little extractable text).
    """
    pages = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                pages.append((i + 1, text))
    except Exception as e:
        print(f"    ERROR reading {pdf_path.name}: {e}")
        return []

    total_chars = sum(len(t) for _, t in pages)
    if len(pages) > 1 and total_chars < 100:
        print(f"    WARNING: {pdf_path.name} appears to be scanned ({total_chars} chars across {len(pages)} pages) — skipping")
        return []

    return pages


# ─── Permit Metadata Extraction ──────────────────────────────────────────────

def extract_permit_metadata(full_text, filename):
    """Extract permit number, date, type, application number from text and filename."""
    meta = {
        "filename": filename,
        "permit_number": "",
        "permit_type": "",
        "date_issued": "",
        "application_number": "",
        "disturbance_footprint_ha": None,
    }

    # Application/Determination number
    m = re.search(r'Application Determination Number[:\s]*(\d+)', full_text)
    if m:
        meta["application_number"] = m.group(1)
        meta["permit_number"] = m.group(1)

    m = re.search(r'Determination of Application Number[:\s]*(\d+)', full_text)
    if m and not meta["application_number"]:
        meta["application_number"] = m.group(1)
        meta["permit_number"] = m.group(1)

    # EMA permit number (PE-XXXXXX)
    m = re.search(r'PERMIT\s+(PE[-\s]?\d+)', full_text)
    if m:
        meta["permit_number"] = m.group(1).replace(" ", "")

    # Commission number (older OGC format)
    m = re.search(r'Commission No[.:\s]*(\d+)', full_text)
    if m and not meta["permit_number"]:
        meta["permit_number"] = m.group(1)

    # Date of issuance
    for pattern in [
        r'(?:Amendment )?Date of Issuance[:\s]*(.+?)(?:\n|$)',
        r'Date Issued[:\s]*(.+?)(?:\n|$)',
        r'Date of Issuance[:\s]*(.+?)(?:\n|$)',
    ]:
        m = re.search(pattern, full_text)
        if m:
            meta["date_issued"] = m.group(1).strip().rstrip("x ")
            break

    # Disturbance footprint
    m = re.search(r'Approved Disturbance Footprint[:\s]*([\d.]+)\s*ha', full_text)
    if m:
        meta["disturbance_footprint_ha"] = float(m.group(1))

    # Classify permit type from filename
    fn = filename.upper()
    if fn.startswith("WATR_"):
        meta["permit_type"] = "WATR"
    elif fn.startswith("IUP_"):
        meta["permit_type"] = "IUP"
    elif fn.startswith("ROAD_"):
        meta["permit_type"] = "ROAD"
    elif fn.startswith("ANC_"):
        meta["permit_type"] = "ANC"
    elif fn.startswith("PE") and "EMA" in fn:
        meta["permit_type"] = "EMA"
    elif "PIPE" in fn:
        meta["permit_type"] = "PIPE"
    elif "FACILITY" in fn:
        meta["permit_type"] = "FACILITY"
    else:
        meta["permit_type"] = "OTHER"

    return meta


# ─── Condition Splitting ─────────────────────────────────────────────────────

def split_into_conditions(pages_text):
    """Split permit text into individual numbered conditions.

    Returns [(condition_id, section_heading, full_text, page_number), ...]
    """
    conditions = []
    current_section = "General"
    current_condition_id = None
    current_condition_text = []
    current_condition_page = 1

    # Known section headings (appear as standalone lines)
    # Note: "Conditions" is a top-level heading, not a real section — we keep
    # the current section when we see it rather than resetting to "Conditions"
    top_level_headers = {"conditions", "activity specific details, permissions and conditions"}
    section_patterns = [
        "Conditions", "Notification", "General", "Environmental",
        "Water Course Crossings and Works", "Watercourse Crossings and Works",
        "Water Course Crossings", "Watercourse Crossings",
        "Archaeology", "Archaeological",
        "Clearing/Forest Act", "Clearing / Forest Act",
        "Pipeline Conditions", "Facility Conditions", "Road Conditions",
        "Short Term Water Use", "Short Term Water Use Conditions",
        "Advisory Guidance", "Advisory",
        "AUTHORIZED DISCHARGES", "GENERAL REQUIREMENTS",
        "Activity Specific Details, Permissions and Conditions",
        "Definitions",
    ]

    # Condition number patterns
    # Match: "7. text", "27. text", "2.1. text", "2.1.1. text", "2.1.1 text"
    # Leading number must be <= 999 to avoid matching addresses/postal codes
    cond_re = re.compile(r'^\s*(\d{1,3}(?:\.\d+)*\.?)\s+(.+)')

    for page_num, page_text in pages_text:
        for line in page_text.split("\n"):
            stripped = line.strip()

            # Skip header lines that repeat on every page
            if stripped.startswith("Permit holder:") or stripped.startswith("Permit Holder:"):
                continue
            if stripped.startswith("Application Determination Number:"):
                continue
            if stripped.startswith("Application Submission Date:"):
                continue
            if stripped.startswith("Date Issued:"):
                continue
            if re.match(r'^BC Energy Regulator', stripped):
                continue

            # Check for section heading
            is_section = False
            for sp in section_patterns:
                if stripped.lower() == sp.lower() or stripped.lower().startswith(sp.lower() + "\n"):
                    # Save any in-progress condition
                    if current_condition_id is not None:
                        conditions.append((
                            current_condition_id,
                            current_section,
                            "\n".join(current_condition_text).strip(),
                            current_condition_page,
                        ))
                        current_condition_id = None
                        current_condition_text = []

                    # Top-level headers like "Conditions" don't change the section
                    if stripped.lower() not in top_level_headers:
                        current_section = stripped
                    is_section = True
                    break

            if is_section:
                continue

            # Check for numbered condition start
            m = cond_re.match(stripped)
            if m:
                # Save previous condition
                if current_condition_id is not None:
                    conditions.append((
                        current_condition_id,
                        current_section,
                        "\n".join(current_condition_text).strip(),
                        current_condition_page,
                    ))

                current_condition_id = m.group(1).rstrip(".")
                current_condition_text = [m.group(2)]
                current_condition_page = page_num
            elif current_condition_id is not None:
                # Continuation of current condition
                current_condition_text.append(stripped)

    # Final condition
    if current_condition_id is not None:
        conditions.append((
            current_condition_id,
            current_section,
            "\n".join(current_condition_text).strip(),
            current_condition_page,
        ))

    return conditions


# ─── Condition Classification ─────────────────────────────────────────────────

def classify_condition(text, section_heading):
    """Classify a condition into zone types based on section heading and keywords.

    Returns a list of matching zone types, or empty list for generic/admin conditions.
    """
    heading_lower = section_heading.lower().strip()

    # Skip purely administrative sections (but NOT "general" — it may contain
    # real conditions in EMA and other permit formats)
    hard_skip = {"notification", "clearing/forest act", "clearing / forest act",
                 "advisory guidance", "advisory", "definitions"}
    if heading_lower in hard_skip:
        return []

    text_lower = text.lower()
    matched_types = set()

    # Section heading provides strong signal
    for section_key, zone_type in SECTION_TYPE_MAP.items():
        if section_key in heading_lower and zone_type:
            matched_types.add(zone_type)

    # Keyword scan
    for zone_type, keywords in ZONE_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                matched_types.add(zone_type)
                break

    # Filter out generic conditions that matched only weakly
    if not matched_types:
        return []

    # If section was "General", only keep if text has real regulatory content
    # (filter out Crown land boilerplate, stumpage, timber, etc.)
    if heading_lower == "general":
        generic_indicators = [
            "exclusive possession", "stumpage", "timber mark",
            "cutting permit", "crown land", "crown timber",
            "free of garbage", "waste billing",
        ]
        if any(gi in text_lower for gi in generic_indicators):
            return []

    return sorted(matched_types)


# ─── KP Reference Extraction ─────────────────────────────────────────────────

def extract_kp_references(text):
    """Extract KP (kilometre post) values from condition text.

    Returns (kp_start, kp_end, has_named_location).
    has_named_location is True when text references a named geographic feature
    (Creek, River, Lake, etc.) but has no KP chainage data.
    """
    kp_values = []

    # Pattern 1: "KP 14+638", "kp 2+700"
    for m in re.finditer(r'(?:KP|Kp|kp)\s*(\d{1,3})\+(\d{1,4})', text):
        kp = int(m.group(1)) + float(m.group(2)) / 1000.0
        kp_values.append(round(kp, 3))

    # Pattern 2: "5+222", "19+195" (no KP prefix, chainage format)
    for m in re.finditer(r'(?<!\d)(\d{1,2})\+(\d{2,4})(?!\d)', text):
        kp = int(m.group(1)) + float(m.group(2)) / 1000.0
        if 0 <= kp <= 50:  # reasonable pipeline range
            kp_values.append(round(kp, 3))

    # Pattern 3: "KP 14" (whole KP, no chainage)
    for m in re.finditer(r'(?:KP|Kp|kp)\s*(\d{1,3})(?:\s|$|[^+\d])', text):
        kp = float(m.group(1))
        if 0 <= kp <= 50:
            kp_values.append(round(kp, 3))

    # Pattern 4: "km 4.2"
    for m in re.finditer(r'(?:km|KM|Km)\s*(\d{1,3}(?:\.\d+)?)', text):
        kp = float(m.group(1))
        if 0 <= kp <= 50:
            kp_values.append(round(kp, 3))

    # Detect named geographic features (proper noun + feature type)
    named_location_re = re.compile(
        r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+'
        r'(?:Creek|River|Lake|Stream|Wetland|Brook|Springs?|Slough|Channel|'
        r'Tributary|Pond|Marsh|Estuary|Inlet|Falls)\b'
    )
    has_named_location = bool(named_location_re.search(text))

    if not kp_values:
        return (0.0, 0.0, has_named_location)

    kp_values = sorted(set(kp_values))
    if len(kp_values) >= 2:
        return (kp_values[0], kp_values[-1], has_named_location)
    else:
        # Single KP reference — estimate a small range
        return (kp_values[0], round(kp_values[0] + 0.5, 3), has_named_location)


# ─── Timing Window Extraction ────────────────────────────────────────────────

def extract_timing_windows(text):
    """Extract date-range timing restrictions from condition text.

    Returns list of {"restricted_start": "MM-DD", "restricted_end": "MM-DD", "description": ...}
    """
    windows = []
    text_lower = text.lower()

    # Build month pattern
    month_pattern = "|".join(MONTH_NAMES + MONTH_ABBREVS + ["sept"])

    # Pattern 1: "March 1 - June 15", "April 1 to September 30"
    pattern1 = re.compile(
        rf'({month_pattern})\.?\s+(\d{{1,2}})\s*[-–—]\s*({month_pattern})\.?\s+(\d{{1,2}})'
        rf'|({month_pattern})\.?\s+(\d{{1,2}})\s+to\s+({month_pattern})\.?\s+(\d{{1,2}})',
        re.IGNORECASE,
    )
    for m in pattern1.finditer(text):
        groups = m.groups()
        if groups[0]:  # dash pattern
            start_month, start_day = groups[0].lower(), int(groups[1])
            end_month, end_day = groups[2].lower(), int(groups[3])
        else:  # "to" pattern
            start_month, start_day = groups[4].lower(), int(groups[5])
            end_month, end_day = groups[6].lower(), int(groups[7])

        sm = MONTH_MAP.get(start_month)
        em = MONTH_MAP.get(end_month)
        if sm and em:
            # Extract surrounding context for description
            start_idx = max(0, m.start() - 60)
            end_idx = min(len(text), m.end() + 60)
            context = text[start_idx:end_idx].strip()
            windows.append({
                "restricted_start": f"{sm:02d}-{start_day:02d}",
                "restricted_end": f"{em:02d}-{end_day:02d}",
                "description": context[:120],
            })

    # Pattern 2: "MM-DD to MM-DD" or "MM/DD - MM/DD"
    pattern2 = re.compile(r'(\d{1,2})[/-](\d{1,2})\s*[-–—to]+\s*(\d{1,2})[/-](\d{1,2})')
    for m in pattern2.finditer(text):
        sm, sd = int(m.group(1)), int(m.group(2))
        em, ed = int(m.group(3)), int(m.group(4))
        if 1 <= sm <= 12 and 1 <= sd <= 31 and 1 <= em <= 12 and 1 <= ed <= 31:
            start_idx = max(0, m.start() - 60)
            end_idx = min(len(text), m.end() + 60)
            context = text[start_idx:end_idx].strip()
            windows.append({
                "restricted_start": f"{sm:02d}-{sd:02d}",
                "restricted_end": f"{em:02d}-{ed:02d}",
                "description": context[:120],
            })

    # Deduplicate
    seen = set()
    unique = []
    for w in windows:
        key = (w["restricted_start"], w["restricted_end"])
        if key not in seen:
            seen.add(key)
            unique.append(w)

    return unique


# ─── Coordinate Extraction ────────────────────────────────────────────────────

def extract_coordinates(text):
    """Extract UTM and lat/long coordinates from text.

    Returns list of (lat, lon) tuples (informational).
    """
    coords = []

    # UTM Zone 10: "Northing 5485711, Easting 511914"
    for m in re.finditer(
        r'Zone\s*10.*?Northing\s*([\d,.]+).*?Easting\s*([\d,.]+)',
        text, re.IGNORECASE | re.DOTALL,
    ):
        northing = float(m.group(1).replace(",", ""))
        easting = float(m.group(2).replace(",", ""))
        coords.append({"type": "UTM10", "northing": northing, "easting": easting})

    # Lat/Long: "49.7236 N, -123.1597W" or "49.7236 N, 123.1597 W"
    for m in re.finditer(r'([\d.]+)\s*N[,\s]+(-?[\d.]+)\s*W', text):
        lat = float(m.group(1))
        lon = -abs(float(m.group(2)))
        coords.append({"type": "latlon", "lat": lat, "lon": lon})

    return coords


# ─── Status Calculation ──────────────────────────────────────────────────────

def calculate_status(text, timing_windows):
    """Calculate zone status based on timing windows and today's date.

    For zones with timing windows, compares against today:
      - Inside restricted period → "RESTRICTION ACTIVE"
      - Within 7 days of a restriction starting → "OPEN" + status_detail
      - Outside all restricted periods → "OPEN"

    For zones without timing windows, falls back to keyword detection.

    Returns (status, status_detail_or_None).
    """
    today = date.today()

    if timing_windows:
        for tw in timing_windows:
            try:
                start_parts = tw["restricted_start"].split("-")
                end_parts = tw["restricted_end"].split("-")
                start_month, start_day = int(start_parts[0]), int(start_parts[1])
                end_month, end_day = int(end_parts[0]), int(end_parts[1])

                restricted_start = date(today.year, start_month, start_day)
                restricted_end = date(today.year, end_month, end_day)

                # Handle windows that wrap around year-end (e.g. Nov 1 - Feb 28)
                if restricted_start > restricted_end:
                    # We're either in the tail (start..Dec31) or head (Jan1..end)
                    in_window = today >= restricted_start or today <= restricted_end
                else:
                    in_window = restricted_start <= today <= restricted_end

                if in_window:
                    return "RESTRICTION ACTIVE", None

                # Check if within 7 days of restriction starting
                days_until = (restricted_start - today).days
                if 0 < days_until <= 7:
                    return "OPEN", f"CLOSES IN {days_until} DAY{'S' if days_until != 1 else ''}"

                # Also check next year's start for year-end proximity
                next_year_start = date(today.year + 1, start_month, start_day)
                days_until_next = (next_year_start - today).days
                if 0 < days_until_next <= 7:
                    return "OPEN", f"CLOSES IN {days_until_next} DAY{'S' if days_until_next != 1 else ''}"

            except (ValueError, KeyError):
                continue

        # Has timing windows but not currently restricted
        return "OPEN", None

    # No timing windows — fall back to keyword detection
    text_lower = text.lower()
    if "pending" in text_lower:
        return "PENDING", None
    elif any(w in text_lower for w in ["restricted", "restriction", "must not", "prohibited"]):
        return "RESTRICTION ACTIVE", None
    else:
        return "VALID", None


# ─── Zone Data Assembly ───────────────────────────────────────────────────────

def extract_zone_name(text, section_heading, condition_id):
    """Derive a human-readable zone name from the condition text."""
    # Look for named water features (proper nouns + feature type)
    feature_patterns = [
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Creek|River|Lake|Stream|Wetland|Brook|Springs?))\b',
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Site|Portal|Station))\b',
    ]
    for pattern in feature_patterns:
        m = re.search(pattern, text)
        if m:
            name = m.group(1).strip()
            if len(name) > 5:
                return name

    return f"{section_heading} — Condition #{condition_id}"


def extract_zone_data(text, zone_type, section_heading, condition_id, permit_meta, page):
    """Assemble a zone entry from a classified condition."""
    kp_start, kp_end, has_named_location = extract_kp_references(text)
    timing_windows = extract_timing_windows(text)
    coordinates = extract_coordinates(text)

    # Determine restriction text (truncate if very long)
    restriction = text.strip()
    if len(restriction) > 500:
        restriction = restriction[:497] + "..."

    # Calculate status from timing windows or keywords
    status, status_detail = calculate_status(text, timing_windows)

    # Authority string
    permit_id = permit_meta.get("permit_number", permit_meta.get("application_number", ""))
    if permit_meta["permit_type"] == "EMA":
        authority = f"BCER {permit_id} — Section {condition_id}"
    else:
        authority = f"BCER Permit {permit_id} — Condition #{condition_id}"

    zone = {
        "name": extract_zone_name(text, section_heading, condition_id),
        "type": zone_type,
        "kp_start": kp_start,
        "kp_end": kp_end,
        "restriction": restriction,
        "status": status,
        "authority": authority,
        "source_document": permit_meta["filename"],
        "source_page": page,
    }

    if status_detail:
        zone["status_detail"] = status_detail

    # Flag zones that reference named locations but lack KP data
    if kp_start == 0.0 and has_named_location:
        zone["needs_kp"] = True

    if timing_windows:
        zone["timing_windows"] = timing_windows

    if coordinates:
        zone["coordinates"] = coordinates

    return zone


# ─── Single Permit Parsing ────────────────────────────────────────────────────

def parse_single_permit(pdf_path):
    """Parse one permit PDF and return (metadata, [zone_entries])."""
    pages = extract_text_by_page(pdf_path)
    if not pages:
        return None, []

    full_text = "\n".join(text for _, text in pages)
    meta = extract_permit_metadata(full_text, pdf_path.name)
    conditions = split_into_conditions(pages)

    zones = []
    zone_relevant_count = 0

    for cond_id, section, text, page in conditions:
        zone_types = classify_condition(text, section)
        if zone_types:
            zone_relevant_count += 1
            for zt in zone_types:
                zone = extract_zone_data(text, zt, section, cond_id, meta, page)
                zones.append(zone)

    meta["total_conditions"] = len(conditions)
    meta["total_conditions_extracted"] = zone_relevant_count

    return meta, zones


# ─── AI-Assisted Extraction ──────────────────────────────────────────────────

def init_ai_client(model_name):
    """Initialize the Anthropic API client.

    Returns (client, model_id) or (None, None) with a warning if unavailable.
    """
    if not HAS_ANTHROPIC:
        print("  WARNING: 'anthropic' package not installed — falling back to regex-only")
        print("           Install with: pip install anthropic")
        return None, None

    api_key = os.environ.get("VITE_ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("  WARNING: No API key found (checked VITE_ANTHROPIC_API_KEY and ANTHROPIC_API_KEY)")
        print("           Set in ../.env or as environment variable — falling back to regex-only")
        return None, None

    model_id = AI_MODEL_MAP.get(model_name, AI_MODEL_MAP[AI_DEFAULT_MODEL])

    try:
        client = anthropic.Anthropic(api_key=api_key)
        return client, model_id
    except Exception as e:
        print(f"  WARNING: Failed to initialize Anthropic client: {e}")
        return None, None


def ai_extract_condition(client, model_id, condition_text, section_heading, condition_id, permit_meta):
    """Send a single condition to Claude for AI-assisted extraction.

    Returns parsed dict or None on failure.
    """
    permit_id = permit_meta.get("permit_number", "")
    permit_type = permit_meta.get("permit_type", "")

    user_prompt = (
        f"Permit: {permit_id} ({permit_type})\n"
        f"Section: {section_heading}\n"
        f"Condition #{condition_id}:\n\n"
        f"{condition_text}"
    )

    last_error = None
    for attempt in range(AI_MAX_RETRIES):
        try:
            response = client.messages.create(
                model=model_id,
                max_tokens=1024,
                system=AI_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )

            raw = response.content[0].text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = re.sub(r'^```(?:json)?\s*', '', raw)
                raw = re.sub(r'\s*```$', '', raw)

            result = json.loads(raw)

            # Validate required fields
            if not isinstance(result, dict) or "name" not in result:
                last_error = "Invalid response structure"
                continue

            return result

        except anthropic.RateLimitError:
            wait = AI_BACKOFF_BASE ** (attempt + 1)
            time.sleep(wait)
            last_error = "rate_limit"
            continue

        except anthropic.AuthenticationError:
            print("    ERROR: Invalid API key — disabling AI for this run")
            return "AUTH_FAIL"

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            last_error = str(e)
            time.sleep(0.5)
            continue

        except Exception as e:
            last_error = str(e)
            time.sleep(0.5)
            continue

    return None


def parse_single_permit_with_ai(pdf_path, client, model_id):
    """Parse one permit with AI enrichment on top of regex extraction.

    Returns (metadata, [zone_entries], ai_stats).
    ai_stats = {"enriched": N, "skipped": N, "fallback": N}
    """
    pages = extract_text_by_page(pdf_path)
    if not pages:
        return None, [], {"enriched": 0, "skipped": 0, "fallback": 0}

    full_text = "\n".join(text for _, text in pages)
    meta = extract_permit_metadata(full_text, pdf_path.name)
    conditions = split_into_conditions(pages)

    zones = []
    ai_stats = {"enriched": 0, "skipped": 0, "fallback": 0}
    ai_disabled = False

    for cond_id, section, text, page in conditions:
        # Always run regex classification first
        regex_zone_types = classify_condition(text, section)

        # Send every condition to AI (not just regex-classified ones)
        # AI may find zone-relevant content that regex missed
        ai_result = None
        if not ai_disabled:
            ai_result = ai_extract_condition(client, model_id, text, section, cond_id, meta)
            time.sleep(AI_RATE_LIMIT_DELAY)

            if ai_result == "AUTH_FAIL":
                ai_disabled = True
                ai_result = None

        # If AI says skip, drop this condition entirely
        if ai_result and isinstance(ai_result, dict) and ai_result.get("skip", False):
            ai_stats["skipped"] += 1
            continue

        # If AI returned a valid result, merge with regex
        if ai_result and isinstance(ai_result, dict):
            # Validate AI zone type
            ai_type = ai_result.get("type", "")
            if ai_type not in VALID_ZONE_TYPES:
                # Fall back to regex type if AI returned something unknown
                if regex_zone_types:
                    ai_type = regex_zone_types[0]
                else:
                    ai_stats["fallback"] += 1
                    continue  # Neither AI nor regex found a valid type

            # Get regex-extracted data for merge
            kp_start, kp_end, has_named_location = extract_kp_references(text)
            regex_timing = extract_timing_windows(text)
            coordinates = extract_coordinates(text)

            # AI wins for: name, type, restriction, needs_kp
            ai_kp_start = float(ai_result.get("kp_start", 0.0) or 0.0)
            ai_kp_end = float(ai_result.get("kp_end", 0.0) or 0.0)
            final_kp_start = ai_kp_start if ai_kp_start > 0 else kp_start
            final_kp_end = ai_kp_end if ai_kp_end > 0 else kp_end

            # Determine needs_kp: AI detection OR regex detection
            ai_needs_kp = ai_result.get("needs_kp", False)
            regex_needs_kp = (kp_start == 0.0 and has_named_location)
            needs_kp = ai_needs_kp or regex_needs_kp

            # Restriction: use AI's concise summary
            restriction = ai_result.get("restriction", text.strip())
            if not restriction or len(restriction) < 5:
                restriction = text.strip()
            if len(restriction) > 500:
                restriction = restriction[:497] + "..."

            # Authority
            permit_id = meta.get("permit_number", meta.get("application_number", ""))
            if meta["permit_type"] == "EMA":
                authority = f"BCER {permit_id} — Section {cond_id}"
            else:
                authority = f"BCER Permit {permit_id} — Condition #{cond_id}"

            # Timing windows: prefer regex (structural extraction), supplement with AI
            ai_timing = ai_result.get("timing_windows", [])
            timing_windows = regex_timing if regex_timing else ai_timing

            # Calculate status from timing windows or keywords
            status, status_detail = calculate_status(text, timing_windows)

            zone = {
                "name": ai_result.get("name", extract_zone_name(text, section, cond_id)),
                "type": ai_type,
                "kp_start": final_kp_start,
                "kp_end": final_kp_end,
                "restriction": restriction,
                "status": status,
                "authority": authority,
                "source_document": meta["filename"],
                "source_page": page,
            }

            if status_detail:
                zone["status_detail"] = status_detail

            if needs_kp:
                zone["needs_kp"] = True

            if timing_windows:
                zone["timing_windows"] = timing_windows

            if coordinates:
                zone["coordinates"] = coordinates

            zones.append(zone)
            ai_stats["enriched"] += 1

        elif regex_zone_types:
            # AI failed or unavailable — fall back to regex
            ai_stats["fallback"] += 1
            for zt in regex_zone_types:
                zone = extract_zone_data(text, zt, section, cond_id, meta, page)
                zones.append(zone)
        # else: neither AI nor regex found anything — skip condition

    meta["total_conditions"] = len(conditions)
    meta["total_conditions_extracted"] = ai_stats["enriched"] + ai_stats["fallback"]

    return meta, zones, ai_stats


# ─── Zone Merging & Deduplication ─────────────────────────────────────────────

def merge_zones(all_zones):
    """Deduplicate and sort zones.

    Zones with same name + type + overlapping KP range are merged,
    keeping the longest restriction text.
    """
    # Group by (name, type)
    grouped = {}
    for z in all_zones:
        key = (z["name"], z["type"])
        if key not in grouped:
            grouped[key] = z
        else:
            existing = grouped[key]
            # Check for KP overlap
            if (z["kp_start"] == 0.0 and z["kp_end"] == 0.0) or \
               (existing["kp_start"] == 0.0 and existing["kp_end"] == 0.0) or \
               (z["kp_start"] <= existing["kp_end"] and z["kp_end"] >= existing["kp_start"]):
                # Merge: expand KP range, keep longer restriction
                if z["kp_start"] != 0.0 or z["kp_end"] != 0.0:
                    if existing["kp_start"] == 0.0:
                        existing["kp_start"] = z["kp_start"]
                        existing["kp_end"] = z["kp_end"]
                    else:
                        existing["kp_start"] = min(existing["kp_start"], z["kp_start"])
                        existing["kp_end"] = max(existing["kp_end"], z["kp_end"])
                if len(z["restriction"]) > len(existing["restriction"]):
                    existing["restriction"] = z["restriction"]
                # Merge timing windows
                if "timing_windows" in z:
                    existing.setdefault("timing_windows", [])
                    existing_starts = {tw["restricted_start"] for tw in existing["timing_windows"]}
                    for tw in z["timing_windows"]:
                        if tw["restricted_start"] not in existing_starts:
                            existing["timing_windows"].append(tw)
            else:
                # Different KP range — treat as separate zone, disambiguate name
                z["name"] = f"{z['name']} ({z['source_document']})"
                grouped[(z["name"], z["type"])] = z

    merged = list(grouped.values())

    # Sort: by type, then kp_start (unlocated zones last), then name
    def sort_key(z):
        kp = z["kp_start"] if z["kp_start"] > 0 else 9999
        return (z["type"], kp, z["name"])

    merged.sort(key=sort_key)
    return merged


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BCER Permit Parser")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be extracted without writing")
    parser.add_argument("--keep-existing", action="store_true",
                        help="Merge with existing zones (preserve hand-authored entries)")
    parser.add_argument("--ai", action="store_true",
                        help="Enable AI-assisted extraction via Claude API")
    parser.add_argument("--model", choices=["haiku", "sonnet"], default=AI_DEFAULT_MODEL,
                        help=f"AI model to use (default: {AI_DEFAULT_MODEL})")
    args = parser.parse_args()

    print("═══════════════════════════════════════════")
    print("  BCER Permit Parser")
    print("  Eagle Mountain Woodfibre Gas Pipeline")
    print("═══════════════════════════════════════════")

    # Initialize AI if requested
    ai_client = None
    ai_model_id = None
    use_ai = False
    if args.ai:
        ai_client, ai_model_id = init_ai_client(args.model)
        if ai_client:
            use_ai = True
            print(f"  AI Mode: ENABLED (model: {args.model} -> {ai_model_id})")
        else:
            print("  AI Mode: DISABLED (see warnings above — using regex-only)")
    else:
        print("  AI Mode: off (use --ai to enable)")

    # Find PDFs
    pdfs = sorted(PERMITS_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"\n  No PDF files found in {PERMITS_DIR}/")
        print("  Drop BCER permit PDFs into that directory and re-run.")
        sys.exit(1)

    print(f"  Scanning: {PERMITS_DIR}/")
    print(f"  Found: {len(pdfs)} PDF files\n")

    all_zones = []
    all_meta = []
    total_ai_stats = {"enriched": 0, "skipped": 0, "fallback": 0}

    for i, pdf_path in enumerate(pdfs, 1):
        print(f"  [{i}/{len(pdfs)}] {pdf_path.name}")

        if use_ai:
            meta, zones, ai_stats = parse_single_permit_with_ai(pdf_path, ai_client, ai_model_id)
        else:
            meta, zones = parse_single_permit(pdf_path)
            ai_stats = None

        if meta is None:
            print("         Skipped (could not read)\n")
            continue

        print(f"         Permit: {meta['permit_number'] or '?'} ({meta['permit_type']})"
              f" — {meta['date_issued'] or 'date unknown'}")
        print(f"         Conditions: {meta['total_conditions']} total,"
              f" {meta['total_conditions_extracted']} zone-relevant")

        if ai_stats:
            print(f"         AI: {ai_stats['enriched']} enriched,"
                  f" {ai_stats['skipped']} skipped,"
                  f" {ai_stats['fallback']} fallback-to-regex")
            total_ai_stats["enriched"] += ai_stats["enriched"]
            total_ai_stats["skipped"] += ai_stats["skipped"]
            total_ai_stats["fallback"] += ai_stats["fallback"]

        all_zones.extend(zones)
        all_meta.append(meta)

    # Merge and deduplicate
    merged_zones = merge_zones(all_zones)

    # Count statistics
    with_kp = sum(1 for z in merged_zones if z["kp_start"] > 0)
    needs_kp_named = sum(1 for z in merged_zones if z.get("needs_kp", False))
    no_kp_generic = sum(1 for z in merged_zones if z["kp_start"] == 0.0 and not z.get("needs_kp", False))
    type_counts = {}
    for z in merged_zones:
        type_counts[z["type"]] = type_counts.get(z["type"], 0) + 1

    # Count statuses
    status_counts = {}
    for z in merged_zones:
        s = z["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    print(f"\n═══════════════════════════════════════════")
    print(f"  Results:")
    print(f"    Permits parsed:     {len(all_meta)}")
    print(f"    Zones extracted:    {len(merged_zones)}")
    print(f"    With KP data:       {with_kp}")
    print(f"    Needs manual review:{needs_kp_named} (no KP found)")
    print(f"    No KP (generic):    {no_kp_generic}")

    if use_ai:
        print(f"\n    AI totals:")
        print(f"      Enriched:         {total_ai_stats['enriched']}")
        print(f"      Skipped:          {total_ai_stats['skipped']}")
        print(f"      Fallback-to-regex:{total_ai_stats['fallback']}")

    print(f"\n    By type:")
    for zt in sorted(type_counts.keys()):
        print(f"      {zt + ':':22s}{type_counts[zt]}")

    print(f"\n    By status:")
    for st in sorted(status_counts.keys()):
        detail = ""
        if st == "OPEN":
            approaching = sum(1 for z in merged_zones if z.get("status_detail"))
            if approaching:
                detail = f"  ({approaching} approaching restriction)"
        print(f"      {st + ':':22s}{status_counts[st]}{detail}")

    if args.dry_run:
        print(f"\n  DRY RUN — no files written")
        print(f"═══════════════════════════════════════════")
        return

    # Build output structure
    existing_zones = []
    existing_config = {}
    if args.keep_existing and OUTPUT_FILE.exists():
        existing_data = json.loads(OUTPUT_FILE.read_text())
        # Preserve hand-authored zones (those with KP data and no source_document)
        for z in existing_data.get("zones", []):
            if "source_document" not in z and z.get("kp_start", 0) > 0:
                existing_zones.append(z)
        existing_config = existing_data.get("zone_type_config", {})
        print(f"\n  Preserving {len(existing_zones)} hand-authored zones")

    # Merge existing hand-authored zones with new parsed zones
    final_zones = existing_zones + merged_zones

    # Build zone_type_config (merge existing with new)
    final_config = {**ZONE_TYPE_CONFIG, **existing_config}
    # Ensure new types are always present
    for zt in ZONE_TYPE_CONFIG:
        if zt not in final_config:
            final_config[zt] = ZONE_TYPE_CONFIG[zt]

    # Build permits metadata list
    permits_list = []
    for m in all_meta:
        permits_list.append({
            "filename": m["filename"],
            "permit_number": m["permit_number"],
            "permit_type": m["permit_type"],
            "date_issued": m["date_issued"],
            "application_number": m["application_number"],
            "total_conditions_extracted": m["total_conditions_extracted"],
        })

    output = {
        "zones": final_zones,
        "zone_type_config": final_config,
        "permits": permits_list,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")

    # Write zones_needing_review.json for manual KP entry
    review_zones = []
    for z in final_zones:
        if z.get("needs_kp", False):
            review_zones.append({
                "name": z["name"],
                "type": z["type"],
                "source_document": z.get("source_document", ""),
                "source_page": z.get("source_page", 0),
                "raw_text": z["restriction"],
                "needs": "KP location",
                "authority": z.get("authority", ""),
            })

    if review_zones:
        REVIEW_FILE.write_text(json.dumps(review_zones, indent=2, ensure_ascii=False) + "\n")
        print(f"\n  Output: {OUTPUT_FILE}")
        print(f"  Review: {REVIEW_FILE} ({len(review_zones)} zones need manual KP)")
    else:
        print(f"\n  Output: {OUTPUT_FILE}")

    print(f"═══════════════════════════════════════════")


if __name__ == "__main__":
    main()
