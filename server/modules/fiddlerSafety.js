/**
 * Fiddler AI Safety Module
 * Evaluates AI-generated responses for hallucination/faithfulness before returning to users
 * With graceful fallback if Fiddler API is unavailable
 */

const https = require('https');
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');

const FIDDLER_ENDPOINT = 'https://guardrails.cloud.fiddler.ai/v3/guardrails/ftl-response-faithfulness';
const FIDDLER_API_KEY = process.env.FIDDLER_API_KEY || null;

// Risk level thresholds
const THRESHOLDS = {
  blocked: 0.4,      // score < 0.4 = BLOCKED (high hallucination risk)
  lowConfidence: 0.7, // score < 0.7 = LOW CONFIDENCE (yellow flag)
  highConfidence: 0.7 // score >= 0.7 = HIGH CONFIDENCE (green)
};

// Prompt injection blocklist
const INJECTION_KEYWORDS = [
  'ignore previous instructions',
  'forget your instructions',
  'disregard your guidelines',
  'forget your role',
  'you are now',
  'forget you are',
  'pretend you are',
  'act as if',
  'bypass',
  'circumvent',
  'override',
  'escalate privileges',
  'reveal system prompt',
  'show me the prompt',
  'what is your system prompt',
  'print your instructions',
  'list your rules',
  'jailbreak',
  'exploit',
  'vulnerability',
];

/**
 * Local safety check — detects prompt injection attempts
 */
function checkPromptInjection(text) {
  if (!text) return { safe: true, issue: null };
  
  const lower = text.toLowerCase();
  for (const keyword of INJECTION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { safe: false, issue: `Potential prompt injection detected: "${keyword}"` };
    }
  }
  return { safe: true, issue: null };
}

/**
 * Local safety check — detects suspicious patterns
 */
function checkSuspiciousPatterns(response, context) {
  const issues = [];

  // Check if response contains context (should reference it, not hallucinate)
  if (context && response) {
    const contextKeywords = context.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const responseText = response.toLowerCase();
    
    // If context has specific skills/terms, response should reference them
    const matchedTerms = contextKeywords.filter(kw => responseText.includes(kw));
    const matchPercent = contextKeywords.length > 0 ? (matchedTerms.length / contextKeywords.length) : 0;
    
    // If response references <20% of context keywords, might be hallucinating
    if (matchPercent < 0.2 && contextKeywords.length > 5) {
      issues.push('Response references very few context terms — potential hallucination');
    }
  }

  // Check for common hallucination markers
  const hallucMarkers = [
    'i cannot verify',
    'i am unable to',
    'i do not have access',
    'i cannot confirm',
    'this is uncertain',
    'i am not sure',
  ];

  for (const marker of hallucMarkers) {
    if (response.toLowerCase().includes(marker)) {
      issues.push('Response contains uncertainty markers');
      break;
    }
  }

  return issues;
}

/**
 * Call Fiddler API to check faithfulness
 */
async function checkFiddlerFaithfulness(response, context) {
  if (!FIDDLER_API_KEY) {
    return { 
      available: false, 
      score: null,
      error: 'Fiddler API key not configured'
    };
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      response: response || '',
      context: context || '',
    });

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIDDLER_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000, // 5 second timeout
    };

    const req = https.request(FIDDLER_ENDPOINT, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => { data += chunk; });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            available: true,
            score: parsed.fdl_faithful_score || 0.5,
            raw: parsed,
          });
        } catch (e) {
          resolve({ available: false, error: 'Failed to parse Fiddler response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ available: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, error: 'Fiddler API timeout' });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Main evaluation function
 * Returns: { allowed, score, riskLevel, reason, confidence }
 */
async function evaluateResponse(response, context, userId) {
  const id = uuidv4();
  const timestamp = new Date();
  
  // Local safety checks (always run)
  const injectionCheck = checkPromptInjection(response);
  if (!injectionCheck.safe) {
    const result = {
      allowed: false,
      score: 0.0,
      riskLevel: 'high',
      reason: injectionCheck.issue,
      confidence: 'local_check',
      blocked: true,
    };
    await logSafetyCheck(id, userId, response, context, result);
    return result;
  }

  const suspiciousPatterns = checkSuspiciousPatterns(response, context);

  // Try Fiddler API (optional enhancement)
  const fiddlerResult = await checkFiddlerFaithfulness(response, context);
  
  let finalScore = 0.75; // Default safe score if no Fiddler
  let confidence = 'fallback';
  let riskLevel = 'low';

  if (fiddlerResult.available) {
    finalScore = fiddlerResult.score;
    confidence = 'fiddler_api';
  } else if (suspiciousPatterns.length > 0) {
    // Downgrade confidence if we detected suspicious patterns
    finalScore = 0.55;
    confidence = 'local_checks';
  }

  // Apply thresholds
  let allowed = true;
  let reason = '';

  if (finalScore < THRESHOLDS.blocked) {
    allowed = false;
    riskLevel = 'high';
    reason = 'High hallucination risk detected — response confidence too low';
  } else if (finalScore < THRESHOLDS.lowConfidence) {
    allowed = true;
    riskLevel = 'medium';
    reason = 'Low confidence in response — AI may have hallucinated details';
  } else {
    allowed = true;
    riskLevel = 'low';
    reason = 'Response confidence acceptable';
  }

  if (suspiciousPatterns.length > 0 && allowed) {
    reason += ` [Flags: ${suspiciousPatterns.join(', ')}]`;
  }

  const result = {
    allowed,
    score: finalScore,
    riskLevel,
    reason,
    confidence,
    blocked: !allowed,
    fiddlerAvailable: fiddlerResult.available,
    suspiciousPatterns,
  };

  await logSafetyCheck(id, userId, response, context, result);
  return result;
}

/**
 * Log all safety checks to database
 */
async function logSafetyCheck(id, userId, response, context, result) {
  try {
    const db = await getDB();
    db.prepare(`
      INSERT INTO safety_logs 
      (id, user_id, response, context, score, risk_level, allowed, confidence, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId || 'anonymous',
      (response || '').substring(0, 5000), // Limit to 5000 chars
      (context || '').substring(0, 5000),
      result.score || 0,
      result.riskLevel || 'unknown',
      result.allowed ? 1 : 0,
      result.confidence || 'unknown',
      JSON.stringify(result),
      new Date().toISOString()
    );
  } catch (error) {
    console.error('Error logging safety check:', error.message);
    // Don't break the app if logging fails
  }
}

/**
 * Get safety dashboard stats for admin
 */
async function getSafetyStats() {
  try {
    const db = await getDB();
    const total = db.prepare('SELECT COUNT(*) as count FROM safety_logs').get();
    const blocked = db.prepare('SELECT COUNT(*) as count FROM safety_logs WHERE allowed = 0').get();
    const byRiskLevel = db.prepare(`
      SELECT risk_level, COUNT(*) as count FROM safety_logs GROUP BY risk_level
    `).all();
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM safety_logs').get();
    const recent = db.prepare(`
      SELECT * FROM safety_logs ORDER BY created_at DESC LIMIT 20
    `).all();

    return {
      total: total.count,
      blocked: blocked.count,
      allowedPercentage: total.count > 0 ? (((total.count - blocked.count) / total.count) * 100).toFixed(1) : 0,
      averageScore: avgScore.avg ? avgScore.avg.toFixed(2) : 'N/A',
      byRiskLevel: byRiskLevel.map(r => ({ level: r.risk_level, count: r.count })),
      recent,
    };
  } catch (error) {
    console.error('Error getting safety stats:', error);
    return { error: error.message };
  }
}

/**
 * Get safety logs with filters
 */
async function getSafetyLogs(filters = {}) {
  try {
    const db = await getDB();
    let query = 'SELECT * FROM safety_logs WHERE 1=1';
    const params = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.riskLevel) {
      query += ' AND risk_level = ?';
      params.push(filters.riskLevel);
    }
    if (filters.allowed !== undefined) {
      query += ' AND allowed = ?';
      params.push(filters.allowed ? 1 : 0);
    }
    if (filters.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    return db.prepare(query).all(...params);
  } catch (error) {
    console.error('Error getting safety logs:', error);
    return [];
  }
}

module.exports = {
  evaluateResponse,
  getSafetyStats,
  getSafetyLogs,
  checkPromptInjection,
  checkSuspiciousPatterns,
  THRESHOLDS,
};
