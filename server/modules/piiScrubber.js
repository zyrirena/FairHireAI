/**
 * PII Scrubber - Removes personally identifiable information from resume text
 * Uses Microsoft Presidio (Python) when available, falls back to built-in regex.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let _presidioAvailable = null;

/**
 * Check if Presidio is installed
 */
function isPresidioAvailable() {
  if (_presidioAvailable !== null) return _presidioAvailable;
  try {
    execSync('python3 -c "from presidio_analyzer import AnalyzerEngine"', { stdio: 'pipe', timeout: 10000 });
    _presidioAvailable = true;
    console.log('✓ Microsoft Presidio available for PII scrubbing');
  } catch {
    _presidioAvailable = false;
    console.log('⚠ Presidio not installed — using regex PII scrubber (run: pip install presidio-analyzer presidio-anonymizer && python3 -m spacy download en_core_web_lg)');
  }
  return _presidioAvailable;
}

/**
 * Scrub PII using Microsoft Presidio (Python subprocess)
 */
function scrubWithPresidio(text) {
  const tmpDir = os.tmpdir();
  const inputFile = path.join(tmpDir, `presidio_in_${Date.now()}.json`);
  const outputFile = path.join(tmpDir, `presidio_out_${Date.now()}.json`);
  const script = path.join(__dirname, '..', 'scripts', 'presidioScrubber.py');

  try {
    fs.writeFileSync(inputFile, JSON.stringify({ text }), 'utf-8');
    execSync(`python3 "${script}" "${inputFile}" "${outputFile}"`, { stdio: 'pipe', timeout: 30000 });
    const result = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    return {
      scrubbed: result.scrubbed,
      removals: result.removals || [],
      engine: result.engine || 'presidio',
      entities_found: result.entities_found || [],
    };
  } catch (error) {
    console.error('Presidio scrub failed, falling back to regex:', error.message);
    return null; // triggers fallback
  } finally {
    try { fs.unlinkSync(inputFile); } catch {}
    try { fs.unlinkSync(outputFile); } catch {}
  }
}

// ── Regex fallback (original implementation) ──

const PII_PATTERNS = [
  { pattern: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/g, replacement: '[NAME_REMOVED]' },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REMOVED]' },
  { pattern: /(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, replacement: '[PHONE_REMOVED]' },
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, replacement: '[SSN_REMOVED]' },
  { pattern: /\b(date of birth|dob|born|birthday|age)\s*[:.]?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, replacement: '[DOB_REMOVED]' },
  { pattern: /\b(age|aged)\s*[:.]?\s*\d{1,3}\b/gi, replacement: '[AGE_REMOVED]' },
  { pattern: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, replacement: '[DATE_REMOVED]' },
  { pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g, replacement: '[DATE_REMOVED]' },
  { pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Way|Place|Pl)\.?,?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+)?\s*,?\s*[A-Z][a-zA-Z\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/gi, replacement: '[ADDRESS_REMOVED]' },
  { pattern: /\b(he|she|him|her|his|hers|himself|herself|male|female|man|woman|gentleman|lady|father|mother|husband|wife)\b/gi, replacement: '[GENDER_REMOVED]' },
  { pattern: /\b(photo|photograph|picture|headshot|portrait)\b/gi, replacement: '[PHOTO_REF_REMOVED]' },
  { pattern: /\b(married|single|divorced|widowed|domestic partner|marital status)\b/gi, replacement: '[MARITAL_REMOVED]' },
  { pattern: /\b(disability|disabled|handicap|impairment|ada accommodation)\b/gi, replacement: '[DISABILITY_REMOVED]' },
];

function scrubFirstLineName(text) {
  const lines = text.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const words = firstLine.split(/\s+/);
    if (words.length >= 1 && words.length <= 4) {
      if (words.every(w => /^[A-Z][a-zA-Z'-]*$/.test(w))) {
        lines[0] = '[NAME_REMOVED]';
      }
    }
  }
  return lines.join('\n');
}

function scrubWithRegex(text) {
  if (!text) return { scrubbed: '', removals: [], engine: 'regex', entities_found: [] };

  const removals = [];
  let scrubbed = scrubFirstLineName(text);

  for (const { pattern, replacement } of PII_PATTERNS) {
    const matches = scrubbed.match(pattern);
    if (matches) {
      removals.push(...matches.map(m => ({ type: replacement, original: m, score: 0.5 })));
      scrubbed = scrubbed.replace(pattern, replacement);
    }
  }

  const entities_found = [...new Set(removals.map(r => r.type))];
  return { scrubbed, removals, engine: 'regex', entities_found };
}

// ── Public API ──

/**
 * Scrub all PII from resume text.
 * Uses Presidio if available, otherwise regex fallback.
 */
function scrubPII(text) {
  if (!text) return { scrubbed: '', removals: [], engine: 'none', entities_found: [] };

  // Try Presidio first
  if (isPresidioAvailable()) {
    const result = scrubWithPresidio(text);
    if (result) return result;
  }

  // Fallback to regex
  return scrubWithRegex(text);
}

/**
 * Check if text still contains potential PII (audit function)
 */
function auditForPII(text) {
  const issues = [];
  for (const { pattern, replacement } of PII_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({ type: replacement, found: true });
    }
    pattern.lastIndex = 0;
  }
  return issues;
}

module.exports = { scrubPII, auditForPII, isPresidioAvailable };
