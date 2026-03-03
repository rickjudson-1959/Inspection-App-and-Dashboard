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
"""

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber


# ─── Configuration ───────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
PERMITS_DIR = BASE_DIR / "permits"
OUTPUT_FILE = BASE_DIR / "data" / "regulatory_zones.json"

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

    Returns (kp_start, kp_end) or (0.0, 0.0) if none found.
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

    if not kp_values:
        return (0.0, 0.0)

    kp_values = sorted(set(kp_values))
    if len(kp_values) >= 2:
        return (kp_values[0], kp_values[-1])
    else:
        # Single KP reference — estimate a small range
        return (kp_values[0], round(kp_values[0] + 0.5, 3))


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
    kp_start, kp_end = extract_kp_references(text)
    timing_windows = extract_timing_windows(text)
    coordinates = extract_coordinates(text)

    # Determine restriction text (truncate if very long)
    restriction = text.strip()
    if len(restriction) > 500:
        restriction = restriction[:497] + "..."

    # Determine status
    text_lower = text.lower()
    if "pending" in text_lower:
        status = "PENDING"
    elif any(w in text_lower for w in ["restricted", "restriction", "must not", "prohibited"]):
        status = "RESTRICTION ACTIVE"
    else:
        status = "VALID"

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
    args = parser.parse_args()

    print("═══════════════════════════════════════════")
    print("  BCER Permit Parser")
    print("  Eagle Mountain Woodfibre Gas Pipeline")
    print("═══════════════════════════════════════════")

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

    for i, pdf_path in enumerate(pdfs, 1):
        print(f"  [{i}/{len(pdfs)}] {pdf_path.name}")
        meta, zones = parse_single_permit(pdf_path)
        if meta is None:
            print("         Skipped (could not read)\n")
            continue

        print(f"         Permit: {meta['permit_number'] or '?'} ({meta['permit_type']})"
              f" — {meta['date_issued'] or 'date unknown'}")
        print(f"         Conditions: {meta['total_conditions']} total,"
              f" {meta['total_conditions_extracted']} zone-relevant")

        all_zones.extend(zones)
        all_meta.append(meta)

    # Merge and deduplicate
    merged_zones = merge_zones(all_zones)

    # Count statistics
    with_kp = sum(1 for z in merged_zones if z["kp_start"] > 0)
    need_kp = sum(1 for z in merged_zones if z["kp_start"] == 0.0)
    type_counts = {}
    for z in merged_zones:
        type_counts[z["type"]] = type_counts.get(z["type"], 0) + 1

    print(f"\n═══════════════════════════════════════════")
    print(f"  Results:")
    print(f"    Permits parsed:     {len(all_meta)}")
    print(f"    Zones extracted:    {len(merged_zones)}")
    print(f"    With KP data:       {with_kp}")
    print(f"    Need KP assignment: {need_kp}")
    print(f"\n    By type:")
    for zt in sorted(type_counts.keys()):
        print(f"      {zt + ':':22s}{type_counts[zt]}")

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

    print(f"\n  Output: {OUTPUT_FILE}")
    print(f"═══════════════════════════════════════════")


if __name__ == "__main__":
    main()
