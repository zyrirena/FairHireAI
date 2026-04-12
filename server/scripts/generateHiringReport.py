#!/usr/bin/env python3
"""
FairHire AI - Hiring Manager Candidate Review Report
Generates a branded PDF with cover page + one page per candidate,
including name, contact info, scores, AI explanation, and full resume.
"""
import json
import sys
import textwrap
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Flowable
)

# Brand colors
TEAL = HexColor('#1a9e8f')
TEAL_LIGHT = HexColor('#e1f5ee')
TEAL_DARK = HexColor('#0d5e6b')
GREEN = HexColor('#2bb673')
GREEN_LIGHT = HexColor('#d4edda')
NAVY = HexColor('#163352')
NAVY_DARK = HexColor('#0a1520')
LIGHT_BG = HexColor('#f0f6f5')
LIGHT_GRAY = HexColor('#f8faf9')
WHITE = HexColor('#ffffff')
GRAY = HexColor('#6b7f8e')
GRAY_BORDER = HexColor('#d0e0dd')
RED = HexColor('#e05858')
RED_LIGHT = HexColor('#f8d7da')
AMBER = HexColor('#e5a832')
AMBER_LIGHT = HexColor('#faeeda')
AMBER_DARK = HexColor('#854f0b')
GREEN_DARK = HexColor('#0f6e56')
RED_DARK = HexColor('#a32d2d')

W, H = letter


class GradientBar(Flowable):
    """Teal-to-green gradient bar at top of pages."""
    def __init__(self, width, height=6):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        steps = 40
        sw = self.width / steps
        for i in range(steps):
            t = i / steps
            r = int(26 + (43 - 26) * t)
            g = int(158 + (182 - 158) * t)
            b = int(143 + (115 - 143) * t)
            self.canv.setFillColor(HexColor(f'#{r:02x}{g:02x}{b:02x}'))
            self.canv.rect(i * sw, 0, sw + 1, self.height, fill=1, stroke=0)


class ScoreBox(Flowable):
    """Single score box with label, value, and bar."""
    def __init__(self, label, value, width=115, color=TEAL):
        super().__init__()
        self.label = label
        self.value = value
        self.w = width
        self.height = 52
        self.color = color

    def draw(self):
        c = self.canv
        c.setFillColor(LIGHT_GRAY)
        c.roundRect(0, 0, self.w, self.height, 4, fill=1, stroke=0)
        c.setFont('Helvetica', 7)
        c.setFillColor(GRAY)
        c.drawString(8, self.height - 14, self.label.upper())
        c.setFont('Helvetica-Bold', 16)
        c.setFillColor(NAVY)
        c.drawString(8, self.height - 34, f"{self.value:.1f}")
        # bar
        bar_w = self.w - 16
        c.setFillColor(HexColor('#e0e8e6'))
        c.rect(8, 4, bar_w, 3, fill=1, stroke=0)
        fill_w = bar_w * min(self.value / 10.0, 1.0)
        c.setFillColor(self.color)
        c.rect(8, 4, fill_w, 3, fill=1, stroke=0)


def build_styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle('CoverTitle', fontSize=22, fontName='Helvetica-Bold',
        textColor=NAVY_DARK, spaceAfter=4, leading=26))
    s.add(ParagraphStyle('CoverSub', fontSize=11, textColor=GRAY, spaceAfter=20,
        fontName='Helvetica'))
    s.add(ParagraphStyle('SectionLabel', fontSize=8, fontName='Helvetica-Bold',
        textColor=TEAL, spaceAfter=6, spaceBefore=14,
        leading=10))
    s.add(ParagraphStyle('CandName', fontSize=17, fontName='Helvetica-Bold',
        textColor=NAVY_DARK, spaceAfter=2))
    s.add(ParagraphStyle('CandContact', fontSize=10, textColor=GRAY, leading=14,
        spaceAfter=4))
    s.add(ParagraphStyle('CandRank', fontSize=8, fontName='Helvetica-Bold',
        textColor=TEAL, spaceAfter=3, leading=10))
    s.add(ParagraphStyle('Body', fontSize=10, textColor=NAVY, leading=15,
        fontName='Helvetica'))
    s.add(ParagraphStyle('Explanation', fontSize=10, textColor=GRAY, leading=15,
        fontName='Helvetica', borderWidth=0, leftIndent=10, borderLeftWidth=3,
        borderLeftColor=TEAL, borderPadding=8))
    s.add(ParagraphStyle('ResumeText', fontSize=9, textColor=NAVY, leading=13,
        fontName='Courier', backColor=LIGHT_GRAY, borderWidth=0.5,
        borderColor=GRAY_BORDER, borderPadding=10, spaceBefore=4))
    s.add(ParagraphStyle('Footer', fontSize=8, textColor=GRAY, alignment=TA_CENTER))
    s.add(ParagraphStyle('AINote', fontSize=8, fontName='Helvetica',
        textColor=TEAL_DARK, backColor=TEAL_LIGHT, borderPadding=6,
        spaceBefore=10))
    s.add(ParagraphStyle('MetaLabel', fontSize=8, fontName='Helvetica-Bold',
        textColor=GRAY, leading=10))
    s.add(ParagraphStyle('MetaValue', fontSize=12, fontName='Helvetica-Bold',
        textColor=NAVY_DARK, leading=16))
    return s


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(GRAY)
    canvas.drawString(50, 20, "FairHire AI — Candidate Review Report")
    canvas.drawRightString(W - 50, 20, f"Page {doc.page}")
    canvas.drawCentredString(W / 2, 20,
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    canvas.restoreState()


def qual_colors(q):
    if 'Partially' in q:
        return AMBER_LIGHT, AMBER_DARK
    elif 'Meets' in q:
        return GREEN_LIGHT, GREEN_DARK
    else:
        return RED_LIGHT, RED_DARK


def generate_pdf(data, output_path):
    doc = SimpleDocTemplate(output_path, pagesize=letter,
        topMargin=40, bottomMargin=40, leftMargin=50, rightMargin=50)
    styles = build_styles()
    story = []
    usable_w = W - 100

    job = data.get('job', {})
    candidates = data.get('candidates', [])

    # ═══ COVER PAGE ═══
    story.append(GradientBar(usable_w))
    story.append(Spacer(1, 20))

    # Logo area
    logo_data = [
        [Paragraph('<font color="#1a9e8f"><b>FA</b></font>', styles['Body']),
         Paragraph('<font size="14" color="#163352"><b>FairHire AI</b></font>', styles['Body'])]
    ]
    logo_t = Table(logo_data, colWidths=[30, 120])
    logo_t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(logo_t)
    story.append(Spacer(1, 20))

    story.append(Paragraph("Candidate review report", styles['CoverTitle']))
    story.append(Paragraph(
        "Candidates requiring recruiter review, ranked by qualification score",
        styles['CoverSub']))

    # Job metadata grid
    meta_items = [
        ('POSITION', job.get('title', 'N/A')),
        ('REPORT DATE', datetime.now().strftime('%B %d, %Y')),
        ('REQUIRED SKILLS', job.get('required_skills', 'N/A')),
        ('MIN EXPERIENCE', f"{job.get('min_experience_years', 0)} years"),
        ('MIN EDUCATION', job.get('min_education', 'N/A')),
        ('CANDIDATES', str(len(candidates))),
    ]
    meta_rows = []
    for i in range(0, len(meta_items), 2):
        row = []
        for j in range(2):
            if i + j < len(meta_items):
                label, val = meta_items[i + j]
                cell = Paragraph(
                    f'<font size="7" color="#4f6d84"><b>{label}</b></font><br/>'
                    f'<font size="11" color="#0a1520"><b>{val}</b></font>',
                    styles['Body'])
                row.append(cell)
            else:
                row.append('')
        meta_rows.append(row)

    mt = Table(meta_rows, colWidths=[usable_w / 2] * 2, rowHeights=[48] * len(meta_rows))
    mt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
    ]))
    story.append(mt)
    story.append(Spacer(1, 16))

    # Summary counts
    meets = sum(1 for c in candidates if 'Partially' not in c.get('qualification', '') and 'Meets' in c.get('qualification', ''))
    partial = sum(1 for c in candidates if 'Partially' in c.get('qualification', ''))
    not_meet = sum(1 for c in candidates if 'Does not' in c.get('qualification', ''))

    summary_data = [
        ['Total candidates screened', str(len(candidates))],
        ['Meets requirements', str(meets)],
        ['Partially meets', str(partial)],
        ['Does not meet', str(not_meet)],
    ]
    summary_colors = [NAVY_DARK, GREEN_DARK, AMBER_DARK, RED_DARK]
    st = Table(summary_data, colWidths=[usable_w - 60, 60])
    style_cmds = [
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), GRAY),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, GRAY_BORDER),
    ]
    for i, color in enumerate(summary_colors):
        style_cmds.append(('TEXTCOLOR', (1, i), (1, i), color))
        style_cmds.append(('FONTNAME', (1, i), (1, i), 'Helvetica-Bold'))
    st.setStyle(TableStyle(style_cmds))
    story.append(st)
    story.append(Spacer(1, 20))

    # ═══ HR CERTIFICATION BLOCK ═══
    cert = data.get('certification')
    if cert:
        cert_content = Paragraph(
            f'<font size="10" color="#0f6e56"><b>HR SPECIALIST CERTIFICATION</b></font><br/><br/>'
            f'<font size="9" color="#163352">'
            f'I, <b>{cert.get("certified_by_name", "N/A")}</b> ({cert.get("certified_by_email", "")}), '
            f'hereby certify that all <b>{cert.get("candidates_reviewed", 0)}</b> candidate resumes '
            f'for this position have been reviewed in accordance with EEOC-aligned evaluation criteria. '
            f'All AI-assisted recommendations have been examined, and this report is approved for '
            f'submission to the hiring manager.'
            f'</font><br/><br/>'
            f'<font size="8" color="#4f6d84">'
            f'Certified on: {cert.get("certified_at", "N/A")}'
            f'{(" | Notes: " + cert.get("notes")) if cert.get("notes") else ""}'
            f'</font>',
            styles['Body']
        )
        cert_table = Table([[cert_content]], colWidths=[usable_w])
        cert_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), HexColor('#e1f5ee')),
            ('BORDER', (0, 0), (-1, -1), 1, HexColor('#1a9e8f')),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
            ('LEFTPADDING', (0, 0), (-1, -1), 14),
            ('RIGHTPADDING', (0, 0), (-1, -1), 14),
            ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ]))
        story.append(cert_table)
        story.append(Spacer(1, 12))

    story.append(Paragraph(
        "AI-assisted recommendations — human review required before any hiring decision",
        styles['Footer']))

    # ═══ CANDIDATE PAGES ═══
    for idx, cand in enumerate(candidates):
        story.append(PageBreak())
        story.append(GradientBar(usable_w))
        story.append(Spacer(1, 14))

        # Rank + qualification badge
        q = cand.get('qualification', 'N/A')
        bg_color, text_color = qual_colors(q)

        header_left = []
        header_left.append(Paragraph(f"Candidate {idx + 1} of {len(candidates)}", styles['CandRank']))
        header_left.append(Paragraph(cand.get('name', 'Unknown Candidate'), styles['CandName']))

        contact_parts = []
        if cand.get('email'):
            contact_parts.append(cand['email'])
        if cand.get('phone'):
            contact_parts.append(cand['phone'])
        if contact_parts:
            header_left.append(Paragraph(' &bull; '.join(contact_parts), styles['CandContact']))

        badge = Paragraph(
            f'<font color="{text_color.hexval()}">{q}</font>',
            ParagraphStyle('badge', fontSize=9, fontName='Helvetica-Bold',
                backColor=bg_color, borderPadding=6, alignment=TA_CENTER))

        hdr_data = [[header_left, badge]]
        hdr_t = Table(hdr_data, colWidths=[usable_w - 160, 160])
        hdr_t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(hdr_t)
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_BORDER, spaceAfter=12))

        # Score boxes
        skills = cand.get('skills_match_score', 0) or 0
        exp = cand.get('experience_score', 0) or 0
        edu = cand.get('education_score', 0) or 0
        overall = cand.get('overall_score', 0) or 0

        def score_color(v):
            if v >= 7:
                return TEAL
            elif v >= 5:
                return AMBER
            else:
                return RED

        box_w = (usable_w - 24) / 4
        scores_data = [[
            ScoreBox('Skills', skills, box_w, score_color(skills)),
            ScoreBox('Experience', exp, box_w, score_color(exp)),
            ScoreBox('Education', edu, box_w, score_color(edu)),
            ScoreBox('Overall', overall, box_w, score_color(overall)),
        ]]
        scores_t = Table(scores_data, colWidths=[box_w + 6] * 4)
        scores_t.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(scores_t)
        story.append(Spacer(1, 4))

        # AI explanation
        explanation = cand.get('explanation', '')
        if explanation:
            story.append(Paragraph("AI EXPLANATION", styles['SectionLabel']))
            story.append(Paragraph(explanation, styles['Explanation']))

        # Matched / missing skills
        full_resp = cand.get('full_response', '{}')
        try:
            resp = json.loads(full_resp) if isinstance(full_resp, str) else full_resp
        except:
            resp = {}

        matched = resp.get('matched_skills', [])
        missing = resp.get('missing_skills', [])
        if matched or missing:
            story.append(Paragraph("SKILLS ANALYSIS", styles['SectionLabel']))
            skills_parts = []
            if matched:
                skills_parts.append(f'<font color="#0f6e56"><b>Matched:</b></font> {", ".join(matched)}')
            if missing:
                skills_parts.append(f'<font color="#a32d2d"><b>Missing:</b></font> {", ".join(missing)}')
            story.append(Paragraph('<br/>'.join(skills_parts), styles['Body']))

        # Full resume
        resume_text = cand.get('raw_text', cand.get('resume_text', ''))
        if resume_text:
            story.append(Paragraph("FULL RESUME", styles['SectionLabel']))
            # Escape XML chars and preserve newlines
            safe = resume_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            safe = safe.replace('\n', '<br/>')
            story.append(Paragraph(safe, styles['ResumeText']))

        story.append(Paragraph(
            "AI-assisted recommendation — scores based on job-related criteria only",
            styles['AINote']))

    # Build
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return output_path


if __name__ == '__main__':
    input_path = sys.argv[1] if len(sys.argv) > 1 else '/dev/stdin'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'hiring_report.pdf'
    with open(input_path, 'r') as f:
        data = json.load(f)
    generate_pdf(data, output_path)
    print(f"PDF generated: {output_path}")
