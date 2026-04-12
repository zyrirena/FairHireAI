/**
 * Claude Evaluator - Uses Anthropic Claude API for bias-aware resume screening
 * Includes token tracking and budget enforcement
 */

const Anthropic = require('@anthropic-ai/sdk');
const { checkBudget, recordUsage } = require('./usageTracker');
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
  "experience_years_estimated": <number>,
  "education_level_detected": "<level>"
}`;

/**
 * Evaluate a resume against a job description using Claude
 */
async function evaluateResume(anonymizedResumeText, jobDescription) {
  const isMock = process.env.MOCK_MODE === 'true' || !getClient();

  if (isMock) {
    return generateMockEvaluation(anonymizedResumeText, jobDescription);
  }

  // Check budget before making API call
  const budget = await checkBudget();
  if (!budget.allowed) {
    return {
      ...generateMockEvaluation(anonymizedResumeText, jobDescription),
      is_mock: true,
      budget_exceeded: true,
      explanation: `[BUDGET LIMIT] AI usage limit of $${budget.limit.toFixed(2)}/month reached (current: $${budget.current_cost.toFixed(4)}). Using mock evaluation. Contact admin to reset.`,
    };
  }

  const userPrompt = `Evaluate this resume against the job description.

JOB DESCRIPTION:
Title: ${jobDescription.title}
Requirements: ${jobDescription.requirements || jobDescription.description}
Minimum Education: ${jobDescription.min_education || 'Not specified'}
Minimum Experience: ${jobDescription.min_experience_years || 0} years
Required Skills: ${jobDescription.required_skills || 'Not specified'}

ANONYMIZED RESUME:
${anonymizedResumeText}

Respond with ONLY valid JSON matching the required schema. No markdown formatting.`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Track token usage
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    await recordUsage(inputTokens, outputTokens);

    const text = response.content[0].text.trim();

    let jsonStr = text;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const result = JSON.parse(jsonStr);
    result.is_mock = false;
    result.tokens_used = { input: inputTokens, output: outputTokens };
    return result;
  } catch (error) {
    console.error('Claude evaluation error:', error.message);
    const mock = generateMockEvaluation(anonymizedResumeText, jobDescription);
    mock.error = error.message;
    mock.is_mock = true;
    return mock;
  }
}

/**
 * Generate mock evaluation for testing without API key
 */
function generateMockEvaluation(resumeText, jobDescription) {
  const text = (resumeText || '').toLowerCase();
  const reqSkills = (jobDescription.required_skills || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  let skillsScore = 5;
  const matched = [];
  const missing = [];

  for (const skill of reqSkills) {
    if (text.includes(skill.toLowerCase())) {
      matched.push(skill);
      skillsScore = Math.min(10, skillsScore + 1);
    } else {
      missing.push(skill);
    }
  }

  // Experience estimation (look for year ranges)
  const yearMatches = text.match(/\b(20\d{2}|19\d{2})\b/g) || [];
  const years = yearMatches.map(Number).filter(y => y >= 1990 && y <= 2026);
  const expYears = years.length >= 2 ? Math.max(...years) - Math.min(...years) : 2;

  const expScore = Math.min(10, Math.round((expYears / Math.max(jobDescription.min_experience_years || 1, 1)) * 7));

  // Education check
  const eduKeywords = { 'phd': 10, 'doctorate': 10, 'master': 9, 'mba': 9, 'bachelor': 7, 'associate': 5, 'diploma': 4 };
  let eduScore = 5;
  let eduLevel = 'Not detected';
  for (const [keyword, score] of Object.entries(eduKeywords)) {
    if (text.includes(keyword)) {
      eduScore = Math.max(eduScore, score);
      eduLevel = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }

  const certScore = text.includes('certif') ? 7 : 4;
  const overall = (skillsScore + expScore + eduScore + certScore) / 4;

  let qualification;
  if (overall >= 7) qualification = 'Meets requirements';
  else if (overall >= 5) qualification = 'Partially meets requirements';
  else qualification = 'Does not meet requirements';

  return {
    qualification,
    score_breakdown: {
      skills_match: skillsScore,
      experience: expScore,
      education: eduScore,
      certifications: certScore,
    },
    explanation: `[MOCK MODE] Candidate scored ${overall.toFixed(1)}/10 overall. Matched ${matched.length}/${reqSkills.length} required skills. Estimated ${expYears} years of experience. Education level: ${eduLevel}.`,
    matched_skills: matched,
    missing_skills: missing,
    experience_years_estimated: expYears,
    education_level_detected: eduLevel,
    is_mock: true,
  };
}

module.exports = { evaluateResume };
