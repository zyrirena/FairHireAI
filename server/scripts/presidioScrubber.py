#!/usr/bin/env python3
"""
FairHire AI - Presidio PII Scrubber
Uses Microsoft Presidio for enterprise-grade PII detection and anonymization.
Called from Node.js: python3 presidioScrubber.py <input.json> <output.json>

Input JSON:  { "text": "resume text here" }
Output JSON: { "scrubbed": "anonymized text", "removals": [...], "entities_found": [...] }
"""
import json
import sys
import os

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig
    PRESIDIO_AVAILABLE = True
except ImportError:
    PRESIDIO_AVAILABLE = False


# Entities relevant to resume/hiring PII scrubbing
ENTITIES_TO_DETECT = [
    "PERSON",           # Names
    "EMAIL_ADDRESS",    # Email
    "PHONE_NUMBER",     # Phone
    "LOCATION",         # Addresses, cities
    "DATE_TIME",        # Dates (could reveal age)
    "NRP",              # Nationality, religious, political group
    "US_SSN",           # Social security numbers
    "US_DRIVER_LICENSE", # Driver license
    "CREDIT_CARD",      # Credit cards
    "US_PASSPORT",      # Passport numbers
    "IP_ADDRESS",       # IP addresses
    "URL",              # Personal URLs
    "AGE",              # Age indicators
]

# Map entity types to replacement tags
REPLACEMENT_MAP = {
    "PERSON":            "[NAME_REMOVED]",
    "EMAIL_ADDRESS":     "[EMAIL_REMOVED]",
    "PHONE_NUMBER":      "[PHONE_REMOVED]",
    "LOCATION":          "[LOCATION_REMOVED]",
    "DATE_TIME":         "[DATE_REMOVED]",
    "NRP":               "[NRP_REMOVED]",
    "US_SSN":            "[SSN_REMOVED]",
    "US_DRIVER_LICENSE": "[LICENSE_REMOVED]",
    "CREDIT_CARD":       "[CC_REMOVED]",
    "US_PASSPORT":       "[PASSPORT_REMOVED]",
    "IP_ADDRESS":        "[IP_REMOVED]",
    "URL":               "[URL_REMOVED]",
    "AGE":               "[AGE_REMOVED]",
}


def scrub_with_presidio(text):
    """Use Microsoft Presidio to detect and anonymize PII."""
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()

    # Analyze text for PII entities
    results = analyzer.analyze(
        text=text,
        entities=ENTITIES_TO_DETECT,
        language="en",
        score_threshold=0.4,  # Lower threshold to catch more PII
    )

    # Build operator config for each detected entity type
    operators = {}
    for entity_type, replacement in REPLACEMENT_MAP.items():
        operators[entity_type] = OperatorConfig(
            "replace",
            {"new_value": replacement}
        )
    # Default for any other detected entity
    operators["DEFAULT"] = OperatorConfig(
        "replace",
        {"new_value": "[PII_REMOVED]"}
    )

    # Anonymize
    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=operators,
    )

    # Build removal log
    removals = []
    entities_found = []
    for result in results:
        original_text = text[result.start:result.end]
        removals.append({
            "type": result.entity_type,
            "original": original_text,
            "score": round(result.score, 3),
            "start": result.start,
            "end": result.end,
        })
        if result.entity_type not in entities_found:
            entities_found.append(result.entity_type)

    return {
        "scrubbed": anonymized.text,
        "removals": removals,
        "entities_found": entities_found,
        "engine": "presidio",
    }


def scrub_with_regex_fallback(text):
    """Fallback regex scrubber when Presidio is not installed."""
    import re

    removals = []
    scrubbed = text

    patterns = [
        (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL_REMOVED]', 'EMAIL_ADDRESS'),
        (r'(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})', '[PHONE_REMOVED]', 'PHONE_NUMBER'),
        (r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b', '[SSN_REMOVED]', 'US_SSN'),
        (r'\b(age|aged)\s*[:.]?\s*\d{1,3}\b', '[AGE_REMOVED]', 'AGE'),
        (r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b', '[DATE_REMOVED]', 'DATE_TIME'),
        (r'\b(married|single|divorced|widowed)\b', '[NRP_REMOVED]', 'NRP'),
    ]

    # Scrub first line if it looks like a name
    lines = scrubbed.split('\n')
    if lines:
        first = lines[0].strip()
        words = first.split()
        if 1 <= len(words) <= 4 and all(w[0].isupper() for w in words if w):
            removals.append({"type": "PERSON", "original": first, "score": 0.7, "start": 0, "end": len(first)})
            lines[0] = "[NAME_REMOVED]"
            scrubbed = '\n'.join(lines)

    for pattern, replacement, entity_type in patterns:
        matches = re.findall(pattern, scrubbed, re.IGNORECASE)
        if matches:
            for m in matches:
                match_text = m if isinstance(m, str) else m[0] if m else ''
                removals.append({"type": entity_type, "original": match_text, "score": 0.5, "start": 0, "end": 0})
            scrubbed = re.sub(pattern, replacement, scrubbed, flags=re.IGNORECASE)

    entities_found = list(set(r["type"] for r in removals))
    return {
        "scrubbed": scrubbed,
        "removals": removals,
        "entities_found": entities_found,
        "engine": "regex_fallback",
    }


def main():
    input_path = sys.argv[1] if len(sys.argv) > 1 else None
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not input_path:
        print(json.dumps({"error": "Usage: presidioScrubber.py <input.json> <output.json>"}))
        sys.exit(1)

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    text = data.get('text', '')
    if not text:
        result = {"scrubbed": "", "removals": [], "entities_found": [], "engine": "none"}
    elif PRESIDIO_AVAILABLE:
        result = scrub_with_presidio(text)
    else:
        result = scrub_with_regex_fallback(text)

    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
    else:
        print(json.dumps(result))


if __name__ == '__main__':
    main()
