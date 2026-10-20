"""Generate the two local PCP record fixtures used by the response simulator.

The case intake identifies the patient, clinician, practice, and equipment. All
other clinical and document details below are authored for this local scenario.
"""

from datetime import date
from json import loads
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
INTAKE = loads((ROOT / "data/intake.json").read_text())
OUTPUT = ROOT / "public/demo-documents"
OUTPUT.mkdir(parents=True, exist_ok=True)

PATIENT = INTAKE["patient"]["name"]
CLINICIAN = INTAKE["pcp"]["name"]
CLINICIAN_SIGNATURE = f"{CLINICIAN.removeprefix('Dr. ')}, MD"
PRACTICE = INTAKE["pcp"]["practice"]
PRACTICE_PHONE = INTAKE["pcp"]["phone"]
EQUIPMENT = INTAKE["equipment"]["name"]
HCPCS = INTAKE["equipment"]["hcpcs"]
VISIT_DATE = date(2026, 10, 17)
DATE_TEXT = f"{VISIT_DATE:%B} {VISIT_DATE.day}, {VISIT_DATE.year}"
PATIENT_ID = "SFM-0041827"

INK = colors.HexColor("#19283A")
MUTED = colors.HexColor("#5B6877")
RULE = colors.HexColor("#D5DEE6")
BLUE = colors.HexColor("#136A87")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="DocTitle", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=INK, spaceAfter=9))
styles.add(ParagraphStyle(name="Section", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=BLUE, spaceBefore=14, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyCopy", fontName="Helvetica", fontSize=9, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="SmallCopy", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="TableKey", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="TableValue", fontName="Helvetica", fontSize=8.5, leading=11.5, textColor=INK))


def page_frame(canvas, doc):
    canvas.saveState()
    width, height = doc.pagesize
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(0.72 * inch, height - 0.59 * inch, PRACTICE.upper())
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(0.72 * inch, height - 0.78 * inch, f"{INTAKE['pcp']['location']}  |  {PRACTICE_PHONE}")
    canvas.setStrokeColor(RULE)
    canvas.line(0.72 * inch, height - 0.94 * inch, width - 0.72 * inch, height - 0.94 * inch)
    canvas.line(0.72 * inch, 0.66 * inch, width - 0.72 * inch, 0.66 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(0.72 * inch, 0.46 * inch, f"Patient: {PATIENT}  |  Medical record: {PATIENT_ID}")
    canvas.drawRightString(width - 0.72 * inch, 0.46 * inch, f"Page {doc.page}")
    canvas.restoreState()


def document(path, story):
    doc = BaseDocTemplate(
        str(path),
        pagesize=(8.5 * inch, 11 * inch),
        leftMargin=0.72 * inch,
        rightMargin=0.72 * inch,
        topMargin=1.16 * inch,
        bottomMargin=0.88 * inch,
        title=path.stem.replace("-", " ").title(),
        author=PRACTICE,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id="clinical", frames=[frame], onPage=page_frame))
    doc.build(story)


def fields(items):
    rows = [[Paragraph(key, styles["TableKey"]), Paragraph(str(value), styles["TableValue"])] for key, value in items]
    table = Table(rows, colWidths=[1.46 * inch, 5.58 * inch], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
    ]))
    return table


def section(title, *paragraphs):
    return [Paragraph(title.upper(), styles["Section"]), *[Paragraph(p, styles["BodyCopy"]) for p in paragraphs]]


common = [
    ("Patient", f"{PATIENT}  |  Age {INTAKE['patient']['age']}"),
    ("Medical record", PATIENT_ID),
]

order = [
    Paragraph("Durable Medical Equipment Order", styles["DocTitle"]),
    fields(common + [
        ("Order date", DATE_TEXT),
        ("Ordering clinician", CLINICIAN_SIGNATURE),
        ("Equipment", f"{EQUIPMENT}  |  HCPCS {HCPCS}"),
        ("Quantity / duration", "One wheelchair  |  Length of need: 99 months"),
    ]),
    *section("Directions", "Provide a standard manual wheelchair for use inside the home. Fit and instruct the patient on safe use; include standard footrests and appropriate seating adjustment."),
    *section("Medical necessity", "The patient has a mobility limitation that substantially impairs routine activities within the home. She cannot safely and reliably complete those activities with a cane or walker. A standard manual wheelchair is expected to improve in-home mobility, and the patient can self-propel short distances; a caregiver is available to assist as needed. See the accompanying mobility evaluation for examination findings."),
    Spacer(1, 18),
    Paragraph("ORDERING CLINICIAN", styles["Section"]),
    Paragraph(f"{CLINICIAN_SIGNATURE}  |  {PRACTICE}", styles["BodyCopy"]),
    Paragraph(f"Electronically signed by {CLINICIAN_SIGNATURE} on {DATE_TEXT} at 4:32 PM CT", styles["SmallCopy"]),
]
document(OUTPUT / "signed-wheelchair-order.pdf", order)

record = [
    Paragraph("Office Visit - Mobility Evaluation", styles["DocTitle"]),
    fields(common + [
        ("Encounter date", DATE_TEXT),
        ("Clinician", CLINICIAN_SIGNATURE),
        ("Visit type", "In-person evaluation for mobility equipment"),
    ]),
    *section("Reason for visit", "Increasing difficulty moving safely between the bedroom, bathroom, and kitchen at home. The patient reports bilateral knee pain, leg weakness, and near falls when attempting these activities."),
    *section("History and functional limitations", "Walking is limited to approximately 15-20 feet with a rolling walker before pain and fatigue require a rest. Transfers require use of armrests and occasional caregiver assistance. These limitations interfere with toileting, dressing, and meal preparation on a usual day. The home has sufficient space to use a standard manual wheelchair along the primary route between rooms."),
    *section("Examination", "Alert and able to follow instructions. Upper-extremity strength is sufficient for short-distance manual propulsion. Bilateral lower-extremity strength 4-/5. Gait is slow and unsteady with a rolling walker; turning requires close supervision. No acute cardiopulmonary distress observed."),
    *section("Why cane or walker is insufficient", "A cane does not provide adequate stability. A walker improves balance but does not allow the patient to complete routine in-home mobility-related activities safely or within a reasonable time because of pain, weakness, limited endurance, and fall risk. Continued walker use alone is not adequate for the documented daily needs."),
    *section("Wheelchair use and plan", f"The patient can use a standard manual wheelchair for short distances in the home and understands safe operation after instruction. A caregiver can assist with longer distances and transfers when needed. Order {EQUIPMENT.lower()} ({HCPCS}) for in-home use. Reassess mobility and equipment fit at follow-up."),
    Spacer(1, 7),
    Paragraph(f"Electronically signed by {CLINICIAN_SIGNATURE} on {DATE_TEXT} at 4:28 PM CT", styles["SmallCopy"]),
]
document(OUTPUT / "mobility-clinical-records.pdf", record)
