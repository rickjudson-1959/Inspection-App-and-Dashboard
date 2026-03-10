#!/usr/bin/env python3
"""
Generate Demo_LEM_Package.pdf from Corrine's real inspector report data.

10 reports -> 10 LEM/ticket pairs (20 pages).
Uses exact dates, contractor names, labour, and equipment from the reports.
Pairs 2, 5, 7 are inflated with discrepancies for variance demo.
"""

import json
import os
import copy

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

with open(os.path.join(SCRIPT_DIR, "demo-report-data.json")) as f:
    reports = json.load(f)

with open(os.path.join(SCRIPT_DIR, "demo-rates.json")) as f:
    rates_data = json.load(f)

labour_rate_map = {}
for r in rates_data["labour_rates"]["data"]:
    labour_rate_map[r["classification"].lower()] = {
        "st": float(r["rate_st"] or 0),
        "ot": float(r["rate_ot"] or 0),
        "dt": float(r["rate_dt"] or 0),
    }

equip_rate_map = {}
for r in rates_data["equipment_rates"]["data"]:
    equip_rate_map[r["equipment_type"].lower()] = float(r["rate_hourly"] or 0)

PO_NUMBER = "PO-4410"
INFLATE_INDICES = {1, 4, 6}  # 0-indexed -> pairs 2, 5, 7

styles = getSampleStyleSheet()
title_style = ParagraphStyle("Title2", parent=styles["Title"], fontSize=16, spaceAfter=6)
subtitle_style = ParagraphStyle("Subtitle2", parent=styles["Normal"], fontSize=11,
                                 textColor=colors.HexColor("#374151"), spaceAfter=4)
header_style = ParagraphStyle("Header2", parent=styles["Normal"], fontSize=9,
                               fontName="Helvetica-Bold", textColor=colors.white)
cell_style = ParagraphStyle("Cell2", parent=styles["Normal"], fontSize=8, leading=10)
cell_right = ParagraphStyle("CellR2", parent=cell_style, alignment=TA_RIGHT)
cell_center = ParagraphStyle("CellC2", parent=cell_style, alignment=TA_CENTER)
total_style = ParagraphStyle("Total2", parent=styles["Normal"], fontSize=10,
                              fontName="Helvetica-Bold", alignment=TA_RIGHT)
section_style = ParagraphStyle("Section2", parent=styles["Normal"], fontSize=11,
                                fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4,
                                textColor=colors.HexColor("#1e40af"))
footer_style = ParagraphStyle("Footer2", parent=styles["Normal"], fontSize=8,
                               textColor=colors.HexColor("#6b7280"), alignment=TA_CENTER)
sig_style = ParagraphStyle("Sig2", parent=styles["Normal"], fontSize=9, spaceBefore=20)


def get_labour_rate(classification, hour_type="st"):
    key = (classification or "").lower().strip()
    if key in labour_rate_map:
        return labour_rate_map[key][hour_type]
    for k, v in labour_rate_map.items():
        if key in k or k in key:
            return v[hour_type]
    return 65.0


def get_equip_rate(equip_type):
    key = (equip_type or "").lower().strip()
    if key in equip_rate_map:
        return equip_rate_map[key]
    for k, v in equip_rate_map.items():
        if key in k or k in key:
            return v
    return 45.0


def extract_pair_data(report, pair_index):
    blocks = [b for b in report.get("activity_blocks", [])
              if b.get("labourEntries") and len(b["labourEntries"]) > 0
              and (b.get("ticketPhoto") or (b.get("ticketPhotos") and len(b["ticketPhotos"]) > 0))]
    if not blocks:
        return None

    block = blocks[0]
    labour = copy.deepcopy(block.get("labourEntries", []))
    equipment = copy.deepcopy(block.get("equipmentEntries", []))
    ticket_num = block.get("ticketNumber") or f"T-{pair_index + 1:03d}"
    contractor = block.get("contractor") or "Somerville Aecon JV"
    activity = block.get("activityType") or block.get("activity") or "General"
    date_str = report.get("date", "2026-03-01")

    # Cap equipment to 20 for readability
    if len(equipment) > 20:
        equipment = equipment[:20]

    return {
        "date": date_str,
        "contractor": contractor,
        "activity": activity,
        "ticket_number": ticket_num,
        "labour": labour,
        "equipment": equipment,
        "report_id": report.get("id"),
    }


def inflate_pair(pair_data):
    labour = pair_data["labour"]
    equipment = pair_data["equipment"]

    # 1. Ghost worker
    ghost = {
        "employeeName": "R. Phantom",
        "classification": "Pipe Fitter" if labour else "General Labourer",
        "rt": 10, "ot": 2, "jh": 0, "hours": 12, "count": 1,
    }
    labour.append(ghost)

    # 2. Bump OT +1 hour on every worker
    for entry in labour[:-1]:  # skip the ghost we just added
        entry["ot"] = float(entry.get("ot") or 0) + 1

    # 3. Add 2 hours to first sideboom, or first equipment
    sideboom = next((e for e in equipment if "sideboom" in (e.get("type") or "").lower()), None)
    target = sideboom or (equipment[0] if equipment else None)
    if target:
        target["hours"] = float(target.get("hours") or 0) + 2

    return pair_data


def fmt(val):
    return f"${val:,.2f}"


def build_lem_page(story, pair_data, pair_index, total_pairs):
    contractor = pair_data["contractor"]
    story.append(Paragraph("LABOUR &amp; EQUIPMENT MANIFEST", title_style))
    story.append(Paragraph(contractor, subtitle_style))
    story.append(Paragraph(
        f"PO: {PO_NUMBER} &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"Date: {pair_data['date']} &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"Ticket: {pair_data['ticket_number']} &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"Pair: {pair_index + 1}/{total_pairs}",
        subtitle_style))
    story.append(Spacer(1, 8))

    # Labour
    story.append(Paragraph("LABOUR", section_style))
    labour_header = [
        Paragraph("Name", header_style),
        Paragraph("Classification", header_style),
        Paragraph("RT Hrs", header_style),
        Paragraph("OT Hrs", header_style),
        Paragraph("RT Rate", header_style),
        Paragraph("OT Rate", header_style),
        Paragraph("Line Total", header_style),
    ]
    labour_rows = [labour_header]
    labour_total = 0.0

    for entry in pair_data["labour"]:
        name = entry.get("employeeName", "Worker")
        cls = entry.get("classification", "General Labourer")
        rt = float(entry.get("rt") or 0)
        ot = float(entry.get("ot") or 0)
        rt_rate = get_labour_rate(cls, "st")
        ot_rate = get_labour_rate(cls, "ot")
        line_total = rt * rt_rate + ot * ot_rate
        labour_total += line_total

        labour_rows.append([
            Paragraph(name[:20], cell_style),
            Paragraph(cls[:22], cell_style),
            Paragraph(f"{rt:.1f}", cell_center),
            Paragraph(f"{ot:.1f}", cell_center),
            Paragraph(fmt(rt_rate), cell_right),
            Paragraph(fmt(ot_rate), cell_right),
            Paragraph(fmt(line_total), cell_right),
        ])

    labour_rows.append([
        "", "", "", "", "", Paragraph("Labour Total:", total_style),
        Paragraph(fmt(labour_total), total_style),
    ])

    col_widths = [1.1*inch, 1.3*inch, 0.6*inch, 0.6*inch, 0.75*inch, 0.75*inch, 0.9*inch]
    t = Table(labour_rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f0f4ff")]),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#d1d5db")),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#1e40af")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # Equipment
    story.append(Paragraph("EQUIPMENT", section_style))
    equip_header = [
        Paragraph("Equipment Type", header_style),
        Paragraph("Unit #", header_style),
        Paragraph("Hours", header_style),
        Paragraph("Rate/Hr", header_style),
        Paragraph("Line Total", header_style),
    ]
    equip_rows = [equip_header]
    equip_total = 0.0

    for entry in pair_data["equipment"]:
        etype = entry.get("type", "Equipment")
        unit = entry.get("unitNumber", "-")
        hrs = float(entry.get("hours") or 0)
        rate = get_equip_rate(etype)
        line_total = hrs * rate
        equip_total += line_total

        equip_rows.append([
            Paragraph(etype[:25], cell_style),
            Paragraph(str(unit)[:10], cell_center),
            Paragraph(f"{hrs:.1f}", cell_center),
            Paragraph(fmt(rate), cell_right),
            Paragraph(fmt(line_total), cell_right),
        ])

    equip_rows.append([
        "", "", "", Paragraph("Equipment Total:", total_style),
        Paragraph(fmt(equip_total), total_style),
    ])

    eq_widths = [2.0*inch, 0.9*inch, 0.7*inch, 0.9*inch, 1.0*inch]
    t2 = Table(equip_rows, colWidths=eq_widths, repeatRows=1)
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f0f4ff")]),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#d1d5db")),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#1e40af")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t2)
    story.append(Spacer(1, 12))

    # Grand total
    grand_total = labour_total + equip_total
    gt_data = [["", Paragraph("GRAND TOTAL:", total_style), Paragraph(fmt(grand_total), total_style)]]
    gt = Table(gt_data, colWidths=[3.5*inch, 1.5*inch, 1.0*inch])
    gt.setStyle(TableStyle([
        ("LINEABOVE", (1, 0), (-1, 0), 2, colors.HexColor("#1e40af")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(gt)

    story.append(Spacer(1, 16))
    inflated = pair_index in INFLATE_INDICES
    tag = " [INFLATED FOR DEMO]" if inflated else ""
    story.append(Paragraph(
        f"Report #{pair_data['report_id']} | {pair_data['activity']} | {contractor}{tag}",
        footer_style))


def build_ticket_page(story, pair_data, pair_index, total_pairs):
    contractor = pair_data["contractor"]
    story.append(Paragraph("DAILY FIELD TICKET", title_style))
    story.append(Spacer(1, 4))

    info_data = [
        [Paragraph("<b>Contractor:</b>", cell_style), Paragraph(contractor, cell_style),
         Paragraph("<b>Date:</b>", cell_style), Paragraph(pair_data["date"], cell_style)],
        [Paragraph("<b>Ticket #:</b>", cell_style), Paragraph(pair_data["ticket_number"], cell_style),
         Paragraph("<b>PO #:</b>", cell_style), Paragraph(PO_NUMBER, cell_style)],
        [Paragraph("<b>Activity:</b>", cell_style), Paragraph(pair_data["activity"], cell_style),
         Paragraph("<b>Pair:</b>", cell_style), Paragraph(f"{pair_index + 1}/{total_pairs}", cell_style)],
    ]
    info_t = Table(info_data, colWidths=[1.0*inch, 2.2*inch, 0.7*inch, 2.1*inch])
    info_t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#374151")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f3f4f6")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(info_t)
    story.append(Spacer(1, 10))

    # Manpower
    story.append(Paragraph("MANPOWER", section_style))
    labour_header = [
        Paragraph("Name", header_style),
        Paragraph("Classification", header_style),
        Paragraph("RT", header_style),
        Paragraph("OT", header_style),
        Paragraph("Total Hrs", header_style),
    ]
    rows = [labour_header]
    for entry in pair_data["labour"]:
        name = entry.get("employeeName", "Worker")
        cls = entry.get("classification", "")
        rt = float(entry.get("rt") or 0)
        ot = float(entry.get("ot") or 0)
        total = rt + ot
        rows.append([
            Paragraph(name[:22], cell_style),
            Paragraph(cls[:24], cell_style),
            Paragraph(f"{rt:.1f}", cell_center),
            Paragraph(f"{ot:.1f}", cell_center),
            Paragraph(f"{total:.1f}", cell_center),
        ])

    tw = [1.4*inch, 1.6*inch, 0.7*inch, 0.7*inch, 0.8*inch]
    t = Table(rows, colWidths=tw, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    # Equipment
    story.append(Paragraph("EQUIPMENT", section_style))
    equip_header = [
        Paragraph("Type", header_style),
        Paragraph("Unit #", header_style),
        Paragraph("Hours", header_style),
    ]
    eq_rows = [equip_header]
    for entry in pair_data["equipment"]:
        etype = entry.get("type", "Equipment")
        unit = entry.get("unitNumber", "-")
        hrs = float(entry.get("hours") or 0)
        eq_rows.append([
            Paragraph(etype[:28], cell_style),
            Paragraph(str(unit)[:10], cell_center),
            Paragraph(f"{hrs:.1f}", cell_center),
        ])

    eq_t = Table(eq_rows, colWidths=[2.5*inch, 1.0*inch, 0.8*inch], repeatRows=1)
    eq_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(eq_t)
    story.append(Spacer(1, 24))

    # Signatures
    sig_data = [
        [Paragraph("Foreman: ________________________", sig_style),
         Paragraph("Inspector: ________________________", sig_style)],
        [Paragraph("Print Name: _____________________", cell_style),
         Paragraph("Print Name: _____________________", cell_style)],
    ]
    sig_t = Table(sig_data, colWidths=[3.0*inch, 3.0*inch])
    story.append(sig_t)

    story.append(Spacer(1, 12))
    inflated = pair_index in INFLATE_INDICES
    tag = " [INFLATED]" if inflated else ""
    story.append(Paragraph(
        f"Report #{pair_data['report_id']} | {pair_data['date']} | {contractor}{tag}",
        footer_style))


def main():
    output_path = os.path.join(PROJECT_DIR, "Demo_LEM_Package.pdf")

    pairs = []
    for i, report in enumerate(reports[:10]):
        pair = extract_pair_data(report, i)
        if not pair:
            print(f"  Skipping report {report.get('id')} - no qualifying block")
            continue
        pairs.append(pair)

    total = len(pairs)
    print(f"Building {total} LEM/ticket pairs from Corrine's reports...")
    for i, p in enumerate(pairs):
        tag = " ** WILL INFLATE **" if i in INFLATE_INDICES else ""
        print(f"  Pair {i+1}: Report #{p['report_id']} | {p['date']} | {p['contractor']} | "
              f"{len(p['labour'])} labour, {len(p['equipment'])} equip{tag}")

    for i in INFLATE_INDICES:
        if i < total:
            pairs[i] = inflate_pair(pairs[i])
            p = pairs[i]
            print(f"  Inflated pair {i+1}: +1 ghost worker, +1 OT/person, +2 hrs equip -> "
                  f"{len(p['labour'])} labour, {len(p['equipment'])} equip")

    doc = SimpleDocTemplate(output_path, pagesize=letter,
                            topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.6*inch, rightMargin=0.6*inch)
    story = []

    for i, pair in enumerate(pairs):
        build_lem_page(story, pair, i, total)
        story.append(PageBreak())
        build_ticket_page(story, pair, i, total)
        if i < total - 1:
            story.append(PageBreak())

    doc.build(story)
    print(f"\nGenerated: {output_path}")
    print(f"  {total} pairs = {total * 2} pages")
    print(f"  Inflated pairs: {sorted(i+1 for i in INFLATE_INDICES if i < total)}")
    print(f"  Dates: {pairs[0]['date']} to {pairs[-1]['date']}")


if __name__ == "__main__":
    main()
