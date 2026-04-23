/**
 * Claude Evaluator - Uses Anthropic Claude API for bias-aware resume screening
 * Supports job-specific weighted scoring from Job Profiles
 */

const Anthropic = require('@anthropic-ai/sdk');
const { checkBudget, recordUsage } = require('./usageTracker');
const { evaluateResponse } = require('./fiddlerSafety');
require('dotenv').config();

let client = null;

function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are FairHire AI, a bias-aware resume screening assistant. You evaluate candidates STRICTLY based on job-related criteria only.

MANDATORY RULES:
1. ONLY evaluate: Skills, Experience, Education, Certifications
2. NEVER infer or consider: Gender, Race, Age, Personality, Culture fit, National origin, Religion, Disability, Marital status
3. NEVER use language that implies bias (e.g., "young and energetic", "seasoned professional")
4. If PII remnants appear (names, dates suggesting age), IGNORE them completely
5. Base ALL scores on objective, job-related criteria from the job description
6. Provide clear, specific reasoning for every score

OUTPUT FORMAT: You MUST respond with ONLY valid JSON, no markdown, no extra text.

JSON SCHEMA:
{
  "qualification": "Meets requirements" | "Partially meets requirements" | "Does not meet requirements",
  "score_breakdown": {
    "skills_match": <number 1-10>,
    "experience": <number 1-10>,
    "education": <number 1-10>,
    "certifications": <number 1-10>
  },
  "explanation": "<specific, objective reasoning referencing job requirements>",
  "matched_skills": ["<skill1>", "<skill2>"],
  "missing_skills": ["<skill1>", "<skill2>"],
  "matched_preferred": ["<skill1>"],
  "experience_years_estimated": <number>,
  "education_level_detected": "<level>"
}`;

/**
 * Parse scoring weights from job description, with defaults
 */
function getWeights(jobDescription) {
  const defaults = { skills: 0.4, experience: 0.3, education: 0.1, certifications: 0.2 };
  try {
    if (jobDescription.scoring_weights) {
      const w = typeof jobDescription.scoring_weights === 'string'
        ? JSON.parse(jobDescription.scoring_weights)
        : jobDescription.scoring_weights;
      return { ...defaults, ...w };
    }
  } catch {}
  return defaults;
}

/**
 * Apply weighted scoring to get a 0-100 match score
 */
function applyWeightedScore(scoreBreakdown, weights) {
  const s = scoreBreakdown;
  const raw = (
    (s.skills_match || 5) * (weights.skills || 0.4) +
    (s.experience || 5) * (weights.experience || 0.3) +
    (s.education || 5) * (weights.education || 0.1) +
    (s.certifications || 5) * (weights.certifications || 0.2)
  );
  // Convert from 1-10 weighted to 0-100
  return Math.round(raw * 10);
}

/**
 * Build the user prompt with full job profile injection
 */
function buildUserPrompt(anonymizedResumeText, jobDescription) {
  const preferredSkills = jobDescription.preferred_skills || '';
  const weights = getWeights(jobDescription);

  return `Evaluate this resume against the specific job profile below.

JOB PROFILE:
Title: ${jobDescription.title}
${jobDescription.department ? `Department: ${jobDescription.department}` : ''}
Description: ${jobDescription.requirements || jobDescription.description}
Minimum Education: ${jobDescription.min_education || 'Not specified'}
Minimum Experience: ${jobDescription.min_experience_years || 0} years
Required Skills: ${jobDescription.required_skills || 'Not specified'}
${preferredSkills ? `Preferred Skills (bonus): ${preferredSkills}` : ''}

SCORING WEIGHTS (how important each criterion is):
- Skills match: ${(weights.skills * 100).toFixed(0)}%
- Experience: ${(weights.experience * 100).toFixed(0)}%
- Education: ${(weights.education * 100).toFixed(0)}%
- Certifications: ${(weights.certifications * 100).toFixed(0)}%

SCORING RULES:
- If candidate is missing ANY required skill, apply a significant penalty to skills_match
- If candidate has preferred skills, give a bonus to skills_match (but don't exceed 10)
- If experience is below the minimum ${jobDescription.min_experience_years || 0} years, downgrade experience score
- Score each criterion on a 1-10 scale

ANONYMIZED RESUME:
${anonymizedResumeText}

Respond with ONLY valid JSON matching the required schema. No markdown formatting.`;
}

/**
 * Evaluate a resume against a job description using Claude
 */
async function evaluateResume(anonymizedResumeText, jobDescription) {
  const isMock = process.env.MOCK_MODE === 'true' || !getClient();
  const weights = getWeights(jobDescription);

  if (isMock) {
    return generateMockEvaluation(anonymizedResumeText, jobDescription, weights);
  }

  const budget = await checkBudget();
  if (!budget.allowed) {
    return {
      ...generateMockEvaluation(anonymizedResumeText, jobDescription, weights),
      is_mock: true,
      budget_exceeded: true,
      explanation: `[BUDGET LIMIT] AI usage limit of $${budget.limit.toFixed(2)}/month reached. Using mock evaluation.`,
    };
  }

  const userPrompt = buildUserPrompt(anonymizedResumeText, jobDescription);

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    await recordUsage(inputTokens, outputTokens);

    let jsonStr = response.content[0].text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const result = JSON.parse(jsonStr);
    result.is_mock = false;
    result.tokens_used = { input: inputTokens, output: outputTokens };
    result.match_score_100 = applyWeightedScore(result.score_breakdown, weights);
    result.scoring_weights_used = weights;

    // ────── FIDDLER AI SAFETY CHECK ──────
    // Verify Claude's response is faithful to the resume context
    const responseText = JSON.stringify(result);
    const safetyCheck = await evaluateResponse(responseText, resumeText, 'system');
    
    // If safety check failed, replace result with safe fallback
    if (!safetyCheck.allowed) {
      result.safety_blocked = true;
      result.safety_score = safetyCheck.score;
      result.qualification = 'Does not meet requirements'; // Conservative fallback
      result.explanation = 'Safety check blocked this evaluation — potential hallucination detected. Please review manually.';
      result.score_breakdown = { skills_match: 0, experience: 0, education: 0, certifications: 0 };
      result.match_score_100 = 0;
    } else {
      // Add safety info for transparency
      result.safety_check = {
        passed: true,
        score: safetyCheck.score,
        riskLevel: safetyCheck.riskLevel,
        confidence: safetyCheck.confidence,
      };
    }

    return result;
  } catch (error) {
    console.error('Claude evaluation error:', error.message);
    const mock = generateMockEvaluation(anonymizedResumeText, jobDescription, weights);
    mock.error = error.message;
    mock.is_mock = true;
    return mock;
  }
}

/**
 * Generate mock evaluation with weighted scoring
 */
function generateMockEvaluation(resumeText, jobDescription, weights) {
  if (!weights) weights = getWeights(jobDescription);

  const text = (resumeText || '').toLowerCase();
  const reqSkills = (jobDescription.required_skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const prefSkills = (jobDescription.preferred_skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  let skillsScore = 5;
  const matched = [], missing = [], matchedPreferred = [];

  for (const skill of reqSkills) {
    if (text.includes(skill.toLowerCase())) {
      matched.push(skill);
      skillsScore = Math.min(10, skillsScore + 1);
    } else {
      missing.push(skill);
      skillsScore = Math.max(1, skillsScore - 0.5); // Penalty for missing required skills
    }
  }
  for (const skill of prefSkills) {
    if (text.includes(skill.toLowerCase())) {
      matchedPreferred.push(skill);
      skillsScore = Math.min(10, skillsScore + 0.5); // Bonus for preferred
    }
  }

  // Experience estimation
  const yearMatches = text.match(/\b(20\d{2}|19\d{2})\b/g) || [];
  const years = yearMatches.map(Number).filter(y => y >= 1990 && y <= 2026);
  const expYears = years.length >= 2 ? Math.max(...years) - Math.min(...years) : 2;
  let expScore = Math.min(10, Math.round((expYears / Math.max(jobDescription.min_experience_years || 1, 1)) * 7));
  // Downgrade if below minimum
  if (expYears < (jobDescription.min_experience_years || 0)) {
    expScore = Math.max(1, expScore - 2);
  }

  // Education
  const eduKeywords = { 'phd': 10, 'doctorate': 10, 'master': 9, 'mba': 9, 'bachelor': 7, 'associate': 5, 'diploma': 4 };
  let eduScore = 5, eduLevel = 'Not detected';
  for (const [keyword, score] of Object.entries(eduKeywords)) {
    if (text.includes(keyword)) { eduScore = Math.max(eduScore, score); eduLevel = keyword.charAt(0).toUpperCase() + keyword.slice(1); }
  }

  const certScore = text.includes('certif') ? 7 : 4;

  const scoreBreakdown = { skills_match: Math.round(skillsScore * 10) / 10, experience: expScore, education: eduScore, certifications: certScore };
  const overall = (scoreBreakdown.skills_match + scoreBreakdown.experience + scoreBreakdown.education + scoreBreakdown.certifications) / 4;
  const matchScore100 = applyWeightedScore(scoreBreakdown, weights);

  let qualification;
  if (overall >= 7) qualification = 'Meets requirements';
  else if (overall >= 5) qualification = 'Partially meets requirements';
  else qualification = 'Does not meet requirements';

  return {
    qualification,
    score_breakdown: scoreBreakdown,
    explanation: `[MOCK MODE] Candidate scored ${overall.toFixed(1)}/10 overall (weighted: ${matchScore100}/100). Matched ${matched.length}/${reqSkills.length} required skills${matchedPreferred.length > 0 ? `, ${matchedPreferred.length} preferred skills` : ''}. ${expYears} years experience. Education: ${eduLevel}.`,
    matched_skills: matched,
    missing_skills: missing,
    matched_preferred: matchedPreferred,
    experience_years_estimated: expYears,
    education_level_detected: eduLevel,
    match_score_100: matchScore100,
    scoring_weights_used: weights,
    is_mock: true,
  };
}

module.exports = { evaluateResume, getWeights, applyWeightedScore };
