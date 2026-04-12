/**
 * Resume Parser - Extracts text from PDF and DOCX files
 */

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

/**
 * Parse a resume file and extract text
 * @param {string} filePath - Path to the resume file
 * @returns {Promise<string>} Extracted text
 */
async function parseResume(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return parsePDF(filePath);
  } else if (ext === '.docx') {
    return parseDOCX(filePath);
  } else if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error(`Unsupported file format: ${ext}. Please upload PDF, DOCX, or TXT.`);
  }
}

async function parsePDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function parseDOCX(filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/**
 * Extract structured sections from resume text (best-effort)
 */
function extractSections(text) {
  const sections = {
    education: '',
    experience: '',
    skills: '',
    certifications: '',
    other: ''
  };

  const sectionHeaders = {
    education: /\b(education|academic|degree|university|college|school)\b/i,
    experience: /\b(experience|employment|work history|professional|career)\b/i,
    skills: /\b(skills|technical skills|competencies|proficiencies|technologies)\b/i,
    certifications: /\b(certifications?|licenses?|credentials?|accreditations?)\b/i,
  };

  const lines = text.split('\n');
  let currentSection = 'other';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line is a section header
    let foundSection = false;
    for (const [section, pattern] of Object.entries(sectionHeaders)) {
      if (pattern.test(trimmed) && trimmed.length < 60) {
        currentSection = section;
        foundSection = true;
        break;
      }
    }

    sections[currentSection] += trimmed + '\n';
  }

  return sections;
}

module.exports = { parseResume, extractSections };
