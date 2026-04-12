#!/usr/bin/env python3
"""
FairHire AI - Bias Audit Report PDF Generator
Generates a detailed PDF showing exactly how bias was calculated.
"""
import json
import sys
import os
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Brand colors from logo
TEAL = HexColor('#1a9e8f')
TEAL_DARK = HexColor('#0d5e6b')
GREEN = HexColor('#2bb673')
NAVY = HexColor('#163352')
NAVY_DARK = HexColor('#0a1520')
LIGHT_BG = HexColor('#f0f6f5')
WHITE = HexColor('#ffffff')
GRAY = HexColor('#6b7f8e')
RED = HexColor('#e05858')
PASS_GREEN = HexColor('#d4edda')
FAIL_RED = HexColor('#f8d7da')


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle('BrandTitle', parent=styles['Title'],
        fontSize=24, textColor=NAVY, spaceAfter=4, fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('BrandSub', parent=styles['Normal'],
        fontSize=11, textColor=TEAL, spaceAfter=20, fontName='Helvetica'))
    styles.add(ParagraphStyle('SectionHead', parent=styles['Heading2'],
        fontSize=14, textColor=TEAL_DARK, spaceBefore=20, spaceAfter=10,
        fontName='Helvetica-Bold', borderWidth=0, borderPadding=0))
    styles.add(ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=10, textColor=NAVY, leading=15, fontName='Helvetica'))
    styles.add(ParagraphStyle('BodySmall', parent=styles['Normal'],
        fontSize=9, textColor=GRAY, leading=13, fontName='Helvetica'))
    styles.add(ParagraphStyle('FormulaText', parent=styles['Normal'],
        fontSize=10, textColor=NAVY_DARK, leading=16, fontName='Courier',
        backColor=LIGHT_BG, borderWidth=1, borderColor=HexColor('#d0e0dd'),
        borderPadding=8, spaceBefore=8, spaceAfter=8))
    styles.add(ParagraphStyle('CellText', parent=styles['Normal'],
        fontSize=9, textColor=NAVY, fontName='Helvetica'))
    styles.add(ParagraphStyle('CellBold', parent=styles['Normal'],
        fontSize=9, textColor=NAVY, fontName='Helvetica-Bold'))
    styles.add(ParagraphStyle('PassLabel', parent=styles['Normal'],
        fontSize=11, textColor=HexColor('#155724'), fontName='Helvetica-Bold', alignment=TA_CENTER))
    styles.add(ParagraphStyle('FailLabel', parent=styles['Normal'],
        fontSize=11, textColor=HexColor('#721c24'), fontName='Helvetica-Bold', alignment=TA_CENTER))
    styles.add(ParagraphStyle('Footer', parent=styles['Normal'],
        fontSize=8, textColor=GRAY, alignment=TA_CENTER))
    return styles


def header_footer(canvas, doc):
    canvas.saveState()
    # Top line
    canvas.setStrokeColor(TEAL)
    canvas.setLineWidth(3)
    canvas.line(40, letter[1] - 30, letter[0] - 40, letter[1] - 30)
    # Footer
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(40, 25, f"FairHire AI - Bias Audit Report")
    canvas.drawRightString(letter[0] - 40, 25, f"Page {doc.page}")
    canvas.drawCentredString(letter[0] / 2, 25,
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    canvas.restoreState()


def generate_pdf(data, output_path):
    doc = SimpleDocTemplate(output_path, pagesize=letter,
        topMargin=50, bottomMargin=50, leftMargin=50, rightMargin=50)
    styles = build_styles()
    story = []

    # Title page
    story.append(Spacer(1, 40))
    story.append(Paragraph("FairHire AI", styles['BrandTitle']))
    story.append(Paragraph("Bias Audit Report — Disparate Impact Analysis", styles['BrandSub']))
    story.append(HRFlowable(width="100%", thickness=1, color=TEAL, spaceAfter=20))

    story.append(Paragraph(
        f"<b>Report ID:</b> {data.get('id', 'N/A')}<br/>"
        f"<b>Generated:</b> {datetime.now().strftime('%B %d, %Y at %I:%M %p')}<br/>"
        f"<b>Tests Run:</b> {len(data.get('tests', []))}<br/>"
        f"<b>Overall Result:</b> {'ALL TESTS PASSED' if all(t.get('passed') for t in data.get('tests', [])) else 'SOME TESTS FAILED'}",
        styles['Body']
    ))
    story.append(Spacer(1, 20))

    # Methodology section
    story.append(Paragraph("1. Methodology", styles['SectionHead']))
    story.append(Paragraph(
        "This report documents the bias testing methodology used by FairHire AI to evaluate "
        "whether the AI resume screening system produces disparate impact across protected groups. "
        "Testing follows EEOC Uniform Guidelines on Employee Selection Procedures (29 CFR Part 1607).",
        styles['Body']))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Disparate Impact Ratio (Four-Fifths Rule)", styles['SectionHead']))
    story.append(Paragraph(
        "The Disparate Impact Ratio compares the selection rate of the group with the lower pass rate "
        "to the group with the higher pass rate. The EEOC considers a ratio below 0.80 (80%) as "
        "evidence of potential adverse impact.",
        styles['Body']))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Formula:  DI Ratio = (Lower Group Pass Rate) / (Higher Group Pass Rate)\n"
        "Threshold:  DI Ratio >= 0.80  =>  PASS  (no adverse impact)\n"
        "            DI Ratio <  0.80  =>  FAIL  (potential adverse impact)",
        styles['FormulaText']))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Where Pass Rate = (Number of candidates rated 'Meets requirements') / (Total candidates in group)",
        styles['BodySmall']))
    story.append(Spacer(1, 16))

    story.append(Paragraph("Testing Approach", styles['SectionHead']))
    story.append(Paragraph(
        "Each test uses identical resume content with only the variable under test changed "
        "(e.g., candidate name or school name). Resumes are processed through the same PII scrubber "
        "and AI evaluator pipeline. This isolates whether the variable affects scoring.",
        styles['Body']))
    story.append(Spacer(1, 8))

    steps_data = [
        ['Step', 'Description'],
        ['1', 'Generate synthetic resumes with identical qualifications'],
        ['2', 'Vary only the test variable (name, school, etc.)'],
        ['3', 'Run PII scrubber to anonymize each resume'],
        ['4', 'Send anonymized text to Claude AI for evaluation'],
        ['5', 'Record qualification result and scores per candidate'],
        ['6', 'Calculate pass rates for each group'],
        ['7', 'Compute Disparate Impact Ratio'],
        ['8', 'Compare ratio against 0.80 threshold'],
    ]
    t = Table(steps_data, colWidths=[0.5*inch, 5.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('BACKGROUND', (0, 1), (-1, -1), LIGHT_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#c0d8d5')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)
    story.append(PageBreak())

    # Individual test results
    for idx, test in enumerate(data.get('tests', []), 1):
        story.append(Paragraph(f"2.{idx}. Test: {test.get('test_name', 'Unknown')}", styles['SectionHead']))

        passed = test.get('passed', False)
        result_bg = PASS_GREEN if passed else FAIL_RED
        result_style = styles['PassLabel'] if passed else styles['FailLabel']
        result_text = "PASS — No adverse impact detected" if passed else "FAIL — Potential adverse impact detected"

        result_table = Table([[Paragraph(result_text, result_style)]],
            colWidths=[5.5*inch])
        result_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), result_bg),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ]))
        story.append(result_table)
        story.append(Spacer(1, 12))

        # Group comparison table
        ga = test.get('group_a_label', 'Group A')
        gb = test.get('group_b_label', 'Group B')
        ra = test.get('group_a_pass_rate', 0)
        rb = test.get('group_b_pass_rate', 0)
        di = test.get('disparate_impact_ratio', 0)

        comp_data = [
            ['Metric', ga, gb],
            ['Pass Rate', f"{ra * 100:.1f}%", f"{rb * 100:.1f}%"],
            ['Candidates Tested', '5', '5'],
            ['Rated "Meets Requirements"', f"{int(ra * 5)}", f"{int(rb * 5)}"],
        ]
        ct = Table(comp_data, colWidths=[2.2*inch, 2*inch, 2*inch])
        ct.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), NAVY),
            ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, 1), (-1, -1), WHITE),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#c0d0de')),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ]))
        story.append(ct)
        story.append(Spacer(1, 12))

        # Calculation walkthrough
        story.append(Paragraph("Calculation Walkthrough:", styles['Body']))
        higher = max(ra, rb)
        lower = min(ra, rb)
        higher_label = ga if ra >= rb else gb
        lower_label = ga if ra < rb else gb

        story.append(Paragraph(
            f"Higher pass rate: {higher_label} = {higher * 100:.1f}%\n"
            f"Lower pass rate:  {lower_label} = {lower * 100:.1f}%\n"
            f"\n"
            f"DI Ratio = {lower * 100:.1f}% / {higher * 100:.1f}% = {di:.4f}\n"
            f"\n"
            f"Threshold check: {di:.4f} {'&gt;=' if di >= 0.8 else '&lt;'} 0.8000  =>  {'PASS' if di >= 0.8 else 'FAIL'}",
            styles['FormulaText']))
        story.append(Spacer(1, 10))

        # Score parity if available
        parity = test.get('score_parity')
        if parity:
            story.append(Paragraph("Score Parity Analysis:", styles['Body']))
            story.append(Paragraph(
                f"Average score {ga}: {parity.get('group_a_avg', 0):.2f}/10\n"
                f"Average score {gb}: {parity.get('group_b_avg', 0):.2f}/10\n"
                f"Score difference: {parity.get('diff', 0):.2f}\n"
                f"Threshold: <= 1.0 point difference\n"
                f"Result: {'PASS' if parity.get('passes') else 'FAIL'}",
                styles['FormulaText']))

        story.append(Spacer(1, 20))

    # Summary
    story.append(Paragraph("3. Summary & Recommendations", styles['SectionHead']))
    all_passed = all(t.get('passed') for t in data.get('tests', []))
    if all_passed:
        story.append(Paragraph(
            "All bias tests passed the EEOC four-fifths rule threshold. The AI screening system "
            "does not show evidence of disparate impact for the tested variables. "
            "It is recommended to run these tests regularly, especially after any changes to "
            "the AI model, prompts, or evaluation criteria.",
            styles['Body']))
    else:
        story.append(Paragraph(
            "One or more bias tests failed the EEOC four-fifths rule threshold. This indicates "
            "potential adverse impact in the AI screening system. Recommended actions: "
            "review AI prompt guardrails, examine PII scrubber effectiveness, retrain or adjust "
            "evaluation criteria, and consult legal counsel regarding EEOC compliance.",
            styles['Body']))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY, spaceAfter=10))
    story.append(Paragraph(
        "This report was generated by FairHire AI — Equitable Recruitment Agent. "
        "It is intended for internal compliance review and bias audit documentation. "
        "This automated analysis does not constitute legal advice.",
        styles['Footer']))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return output_path


if __name__ == '__main__':
    input_path = sys.argv[1] if len(sys.argv) > 1 else '/dev/stdin'
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'bias_report.pdf'

    with open(input_path, 'r') as f:
        data = json.load(f)

    generate_pdf(data, output_path)
    print(f"PDF generated: {output_path}")
