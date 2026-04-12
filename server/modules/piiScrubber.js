/**
 * PII Scrubber - Removes personally identifiable information from resume text
 * before sending to Claude for evaluation.
 */

const PII_PATTERNS = [
  // Names - common patterns (Mr./Mrs./Ms./Dr. followed by capitalized words)
  { pattern: /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/g, replacement: '[NAME_REMOVED]' },

  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REMOVED]' },

  // Phone numbers (various formats)
  { pattern: /(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, replacement: '[PHONE_REMOVED]' },

  // Social Security Numbers
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, replacement: '[SSN_REMOVED]' },

  // Dates of birth / age indicators
  { pattern: /\b(date of birth|dob|born|birthday|age)\s*[:.]?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/gi, replacement: '[DOB_REMOVED]' },
  { pattern: /\b(age|aged)\s*[:.]?\s*\d{1,3}\b/gi, replacement: '[AGE_REMOVED]' },

  // Full dates that might indicate age (but keep year-only for experience)
  { pattern: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, replacement: '[DATE_REMOVED]' },
  { pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g, replacement: '[DATE_REMOVED]' },

  // Physical addresses (street address patterns)
  { pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Road|Rd|Court|Ct|Way|Place|Pl)\.?,?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+)?\s*,?\s*[A-Z][a-zA-Z\s]+,?\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/gi, replacement: '[ADDRESS_REMOVED]' },

  // ZIP codes alone
  { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[ZIP_REMOVED]' },

  // Gender indicators
  { pattern: /\b(he|she|him|her|his|hers|himself|herself|male|female|man|woman|boy|girl|gentleman|lady|father|mother|husband|wife|son|daughter|brother|sister)\b/gi, replacement: '[GENDER_REMOVED]' },

  // Photos reference
  { pattern: /\b(photo|photograph|picture|headshot|portrait)\b/gi, replacement: '[PHOTO_REF_REMOVED]' },

  // Marital status
  { pattern: /\b(married|single|divorced|widowed|domestic partner|marital status)\b/gi, replacement: '[MARITAL_REMOVED]' },

  // Religion
  { pattern: /\b(christian|muslim|jewish|hindu|buddhist|sikh|catholic|protestant|evangelical|mormon|atheist|agnostic|religion|religious)\b/gi, replacement: '[RELIGION_REMOVED]' },

  // National origin indicators (keep nationality-neutral)
  { pattern: /\b(citizenship|visa status|green card|work permit|national origin|nationality|immigrant|native)\b/gi, replacement: '[NATIONALITY_REMOVED]' },

  // Disability
  { pattern: /\b(disability|disabled|handicap|impairment|ada accommodation)\b/gi, replacement: '[DISABILITY_REMOVED]' },
];

// Name detection heuristic: first line(s) of resume are often the name
function scrubFirstLineName(text) {
  const lines = text.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // If first line is 1-4 words, all capitalized or title case, likely a name
    const words = firstLine.split(/\s+/);
    if (words.length >= 1 && words.length <= 4) {
      const looksLikeName = words.every(w => /^[A-Z][a-zA-Z'-]*$/.test(w));
      if (looksLikeName) {
        lines[0] = '[NAME_REMOVED]';
      }
    }
  }
  return lines.join('\n');
}

/**
 * Scrub all PII from resume text
 * @param {string} text - Raw resume text
 * @returns {{ scrubbed: string, removals: Array }} Scrubbed text and list of removals
 */
function scrubPII(text) {
  if (!text) return { scrubbed: '', removals: [] };

  const removals = [];
  let scrubbed = text;

  // First pass: scrub name from first line
  scrubbed = scrubFirstLineName(scrubbed);

  // Second pass: apply all regex patterns
  for (const { pattern, replacement } of PII_PATTERNS) {
    const matches = scrubbed.match(pattern);
    if (matches) {
      removals.push(...matches.map(m => ({ type: replacement, original: m })));
      scrubbed = scrubbed.replace(pattern, replacement);
    }
  }

  return { scrubbed, removals };
}

/**
 * Check if text still contains potential PII
 */
function auditForPII(text) {
  const issues = [];
  for (const { pattern, replacement } of PII_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({ type: replacement, found: true });
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
  }
  return issues;
}

module.exports = { scrubPII, auditForPII };
