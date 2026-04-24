/**
 * AIF360 Bias Runner — calls IBM AIF360 Python service
 * Falls back to manual disparate impact if AIF360 not installed
 */

const { execSync } = require('child_process');
const path = require('path');
const { getDB } = require('../database');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'aif360Analysis.py');

/**
 * Run AIF360 bias analysis on evaluation data
 * @param {Array} evaluations - Array of evaluation objects with scores and group labels
 * @param {string} protectedAttribute - Name of the protected attribute field (default: 'group')
 * @param {number} qualificationThreshold - Score threshold for "qualified" (default: 7.0)
 */
async function runAIF360Analysis(evaluations, protectedAttribute = 'group', qualificationThreshold = 7.0) {
  const input = JSON.stringify({
    evaluations,
    protected_attribute: protectedAttribute,
    qualification_threshold: qualificationThreshold,
    favorable_label: 1,
    threshold: 0.8,
  });

  try {
    const result = execSync(
      `python3 "${SCRIPT_PATH}" '${input.replace(/'/g, "'\\''")}'`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(result.toString().trim());
  } catch (error) {
    console.error('AIF360 analysis error:', error.message);
    return { error: error.message, aif360_available: false, metrics: null };
  }
}

/**
 * Run AIF360 analysis on stored evaluation data from the database
 * Groups candidates by a proxy attribute for bias testing
 */
async function runLiveAIF360Analysis(jobId = null) {
  const db = await getDB();

  let query = 'SELECT e.*, c.original_filename FROM evaluations e JOIN candidates c ON e.candidate_id = c.id';
  const params = [];
  if (jobId) {
    query += ' WHERE e.job_id = ?';
    params.push(jobId);
  }

  const evaluations = db.prepare(query).all(...params);

  if (evaluations.length < 4) {
    return {
      error: null,
      message: 'Need at least 4 evaluations for bias analysis',
      metrics: null,
    };
  }

  // Assign groups based on candidate index (even/odd split for demo)
  // In production, this would use actual demographic data or name-based proxies
  const grouped = evaluations.map((ev, i) => ({
    overall_score: ev.overall_score || 0,
    group: i % 2, // Alternating group assignment for testing
  }));

  return runAIF360Analysis(grouped);
}

/**
 * Check if AIF360 is installed
 */
function checkAIF360Available() {
  try {
    execSync('python3 -c "import aif360; print(aif360.__version__)"', { timeout: 10000 });
    return { available: true };
  } catch {
    return { available: false, message: 'Install with: pip install aif360 --break-system-packages' };
  }
}

module.exports = { runAIF360Analysis, runLiveAIF360Analysis, checkAIF360Available };
