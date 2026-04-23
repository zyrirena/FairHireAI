/**
 * FairHire AI — Fairlearn Integration Module
 * Runs the Python fairlearn analysis script and returns structured results.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');

let _fairlearnAvailable = null;

function isFairlearnAvailable() {
  if (_fairlearnAvailable !== null) return _fairlearnAvailable;
  try {
    execSync('python3 -c "from fairlearn.metrics import MetricFrame"', { stdio: 'pipe', timeout: 10000 });
    _fairlearnAvailable = true;
    console.log('✓ Microsoft Fairlearn available for bias analysis');
  } catch {
    _fairlearnAvailable = false;
    console.log('⚠ Fairlearn not installed — using fallback bias metrics');
  }
  return _fairlearnAvailable;
}

/**
 * Build evaluation records for Fairlearn from DB bias test results.
 * Runs the same synthetic resume groups as biasTester.js and
 * feeds the results into the Fairlearn script.
 */
async function runFairlearnAnalysis(options = {}) {
  const { evaluations, testName, groupALabel, groupBLabel } = options;

  if (!evaluations || evaluations.length === 0) {
    return { error: 'No evaluation data provided' };
  }

  const script = path.join(__dirname, '..', 'scripts', 'fairlearnAnalysis.py');
  const tmpIn = path.join(os.tmpdir(), `fl_in_${Date.now()}.json`);
  const tmpOut = path.join(os.tmpdir(), `fl_out_${Date.now()}.json`);

  try {
    const payload = {
      evaluations,
      test_name: testName || 'Fairness Analysis',
      group_a_label: groupALabel || 'Group A',
      group_b_label: groupBLabel || 'Group B',
    };

    fs.writeFileSync(tmpIn, JSON.stringify(payload), 'utf-8');
    execSync(`python3 "${script}" "${tmpIn}" "${tmpOut}"`, { stdio: 'pipe', timeout: 60000 });
    const result = JSON.parse(fs.readFileSync(tmpOut, 'utf-8'));
    return result;
  } catch (err) {
    console.error('Fairlearn analysis error:', err.message);
    return { error: err.message, fairlearn_available: false };
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

/**
 * Run Fairlearn analysis on stored bias test results from the DB.
 * Groups evaluations by their group_a/b labels from the most recent run.
 */
async function analyzeStoredBiasResults() {
  const db = await getDB();

  // Get the most recent bias test results
  const biasResults = db.prepare('SELECT * FROM bias_test_results ORDER BY created_at DESC LIMIT 10').all();

  if (!biasResults || biasResults.length === 0) {
    return { error: 'No bias test results found. Run a bias test first.' };
  }

  const analyses = [];

  for (const result of biasResults) {
    let details = {};
    try { details = JSON.parse(result.details || '{}'); } catch {}

    // Reconstruct per-group evaluation arrays from stored summary data
    const sampleSize = details.sample_size || result.sample_size || 10;
    const rateA = result.group_a_pass_rate || 0;
    const rateB = result.group_b_pass_rate || 0;

    // Reconstruct synthetic evaluation records from pass rates
    const evaluations = [];
    const countA = Math.round(sampleSize * rateA);
    for (let i = 0; i < sampleSize; i++) {
      evaluations.push({
        qualification: i < countA ? 'Meets requirements' : 'Does not meet requirements',
        overall_score: i < countA ? 7.5 : 4.5,
        group: result.group_a_label,
        recruiter_override: null,
      });
    }
    const countB = Math.round(sampleSize * rateB);
    for (let i = 0; i < sampleSize; i++) {
      evaluations.push({
        qualification: i < countB ? 'Meets requirements' : 'Does not meet requirements',
        overall_score: i < countB ? 7.5 : 4.5,
        group: result.group_b_label,
        recruiter_override: null,
      });
    }

    const analysis = await runFairlearnAnalysis({
      evaluations,
      testName: result.test_name,
      groupALabel: result.group_a_label,
      groupBLabel: result.group_b_label,
    });

    analyses.push({
      bias_test_id: result.id,
      test_name: result.test_name,
      created_at: result.created_at,
      ...analysis,
    });
  }

  return {
    fairlearn_available: isFairlearnAvailable(),
    analyses,
    summary: {
      total_tests: analyses.length,
      all_passed: analyses.every(a => a.overall?.passes),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Run Fairlearn analysis on LIVE evaluations from the database.
 * Uses actual recruiter data with group tags from bias test runs.
 */
async function analyzeLiveEvaluations(jobId) {
  const db = await getDB();

  const query = jobId
    ? 'SELECT e.*, j.title as job_title FROM evaluations e LEFT JOIN job_descriptions j ON e.job_id = j.id WHERE e.job_id = ? ORDER BY e.created_at DESC'
    : 'SELECT e.*, j.title as job_title FROM evaluations e LEFT JOIN job_descriptions j ON e.job_id = j.id ORDER BY e.created_at DESC LIMIT 500';

  const rows = jobId
    ? db.prepare(query).all(jobId)
    : db.prepare(query).all();

  if (!rows || rows.length === 0) {
    return { error: 'No evaluations found' };
  }

  // Group by job title for fairness analysis
  const byJob = {};
  for (const row of rows) {
    const job = row.job_title || 'Unknown';
    if (!byJob[job]) byJob[job] = [];
    byJob[job].push(row);
  }

  // Check for override data to use as ground truth
  const overrides = db.prepare('SELECT evaluation_id, new_qualification FROM recruiter_overrides').all();
  const overrideMap = {};
  for (const o of overrides) overrideMap[o.evaluation_id] = o.new_qualification;

  // Build evaluation objects with group = job title (as sensitive feature)
  const evaluations = rows.map(row => ({
    qualification: row.qualification,
    overall_score: row.overall_score,
    skills_match_score: row.skills_match_score,
    experience_score: row.experience_score,
    education_score: row.education_score,
    group: row.job_title || 'Unknown Job',
    recruiter_override: overrideMap[row.id] || null,
    is_mock: row.is_mock,
  }));

  const result = await runFairlearnAnalysis({
    evaluations,
    testName: 'Live Evaluations — Across Jobs',
    groupALabel: 'All job positions',
    groupBLabel: 'By position',
  });

  return {
    source: 'live_evaluations',
    total_evaluations: rows.length,
    jobs_analyzed: Object.keys(byJob),
    fairlearn_available: isFairlearnAvailable(),
    ...result,
  };
}

module.exports = {
  isFairlearnAvailable,
  runFairlearnAnalysis,
  analyzeStoredBiasResults,
  analyzeLiveEvaluations,
};
