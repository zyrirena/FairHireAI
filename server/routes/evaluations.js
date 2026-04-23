const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { logOverride, getAuditLog, exportAuditLog, getEvaluationStats } = require('../modules/auditLogger');
const { runBiasTest } = require('../modules/biasTester');
const { logActivity } = require('../modules/userActivityLogger');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { isFairlearnAvailable, analyzeStoredBiasResults, analyzeLiveEvaluations, runFairlearnAnalysis } = require('../modules/fairlearnRunner');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT e.*, c.original_filename, j.title as job_title, (SELECT COUNT(*) FROM recruiter_overrides ro WHERE ro.evaluation_id = e.id) as has_override FROM evaluations e LEFT JOIN candidates c ON e.candidate_id = c.id LEFT JOIN job_descriptions j ON e.job_id = j.id ORDER BY e.created_at DESC').all());
});

router.get('/compliance/stats', async (req, res) => {
  try { res.json(await getEvaluationStats()); }
  catch { res.json({ total_evaluations: 0, by_qualification: [], average_scores: {}, total_overrides: 0, recent_activity: [] }); }
});

router.get('/compliance/audit-log', async (req, res) => {
  res.json(await getAuditLog(parseInt(req.query.limit) || 100, parseInt(req.query.offset) || 0));
});

router.get('/compliance/audit-export', async (req, res) => {
  res.json(await exportAuditLog(req.query.start, req.query.end));
});

router.get('/compliance/bias-results', async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT * FROM bias_test_results ORDER BY created_at DESC').all());
});

router.post('/compliance/run-bias-test', async (req, res) => {
  try {
    const sampleSize = parseInt(req.body.sampleSize) || undefined;
    res.json(await runBiasTest({ sampleSize }));
  }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// ── FAIRLEARN ENDPOINTS ──

// Fairlearn status check
router.get('/fairlearn/status', (req, res) => {
  res.json({
    available: isFairlearnAvailable(),
    message: isFairlearnAvailable()
      ? 'Microsoft Fairlearn is installed and ready'
      : 'Fairlearn not installed. Install with: pip install fairlearn scikit-learn',
  });
});

// Analyze stored bias test results with Fairlearn
router.get('/fairlearn/bias-analysis', async (req, res) => {
  try {
    const result = await analyzeStoredBiasResults();
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Analyze live evaluations from the database
router.get('/fairlearn/live-analysis', async (req, res) => {
  try {
    const result = await analyzeLiveEvaluations(req.query.job_id || null);
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Run custom Fairlearn analysis with provided data
router.post('/fairlearn/analyze', async (req, res) => {
  try {
    const { evaluations, test_name, group_a_label, group_b_label } = req.body;
    if (!evaluations || !Array.isArray(evaluations)) {
      return res.status(400).json({ error: 'evaluations array required' });
    }
    const result = await runFairlearnAnalysis({
      evaluations,
      testName: test_name,
      groupALabel: group_a_label,
      groupBLabel: group_b_label,
    });
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Generate bias audit PDF report
router.post('/compliance/bias-report-pdf', async (req, res) => {
  try {
    const db = await getDB();
    const results = db.prepare('SELECT * FROM bias_test_results ORDER BY created_at DESC').all();
    if (results.length === 0) return res.status(400).json({ error: 'No bias test results. Run a bias test first.' });

    // Build data structure for PDF
    const tests = results.map(r => {
      let details = {};
      try { details = JSON.parse(r.details || '{}'); } catch {}
      return {
        test_name: r.test_name,
        group_a_label: r.group_a_label,
        group_b_label: r.group_b_label,
        group_a_pass_rate: r.group_a_pass_rate,
        group_b_pass_rate: r.group_b_pass_rate,
        disparate_impact_ratio: r.disparate_impact_ratio,
        passed: r.passed_80_rule === 1,
        score_parity: details.score_parity || null,
      };
    });
    const reportData = { id: uuidv4(), timestamp: new Date().toISOString(), tests };

    const tmpJson = path.join(__dirname, '..', '..', 'data', '_tmp_bias_report.json');
    const outPdf = path.join(__dirname, '..', '..', 'data', `bias_audit_${Date.now()}.pdf`);
    const script = path.join(__dirname, '..', 'scripts', 'generateBiasReport.py');

    fs.writeFileSync(tmpJson, JSON.stringify(reportData, null, 2));
    execSync(`python3 "${script}" "${tmpJson}" "${outPdf}"`, { timeout: 30000, stdio: 'pipe' });
    fs.unlinkSync(tmpJson);

    res.download(outPdf, `FairHire_Bias_Audit_${new Date().toISOString().split('T')[0]}.pdf`, (err) => {
      // Clean up after download
      try { fs.unlinkSync(outPdf); } catch {}
    });
  } catch (error) {
    console.error('PDF generation error:', error.message);
    res.status(500).json({ error: 'PDF generation failed: ' + error.message });
  }
});

// Generate hiring manager candidate review PDF
router.post('/hiring-report-pdf', async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id is required' });

    const db = await getDB();
    const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Get all evaluations for this job, sorted by score desc
    const evals = db.prepare(`
      SELECT e.*, c.original_filename, c.raw_text, c.anonymized_text
      FROM evaluations e
      LEFT JOIN candidates c ON e.candidate_id = c.id
      WHERE e.job_id = ?
      ORDER BY e.overall_score DESC
    `).all(job_id);

    if (evals.length === 0) return res.status(400).json({ error: 'No evaluations found for this job.' });

    // Build candidate data with contact info extracted from raw text
    const candidates = evals.map(ev => {
      const raw = ev.raw_text || ev.anonymized_text || '';
      // Extract name (first line)
      const lines = raw.split('\n').filter(l => l.trim());
      let name = 'Unknown Candidate';
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        const words = firstLine.split(/\s+/);
        if (words.length >= 1 && words.length <= 5 && words.every(w => /^[A-Z]/.test(w))) {
          name = firstLine;
        }
      }
      // Extract email
      const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : '';
      // Extract phone
      const phoneMatch = raw.match(/(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
      const phone = phoneMatch ? phoneMatch[0] : '';

      return {
        name: name || ev.original_filename || 'Candidate',
        email,
        phone,
        qualification: ev.qualification,
        skills_match_score: ev.skills_match_score,
        experience_score: ev.experience_score,
        education_score: ev.education_score,
        overall_score: ev.overall_score,
        explanation: ev.explanation,
        full_response: ev.full_response,
        raw_text: raw,
      };
    });

    const reportData = { job, candidates };
    const tmpJson = path.join(__dirname, '..', '..', 'data', '_tmp_hiring_report.json');
    const outPdf = path.join(__dirname, '..', '..', 'data', `hiring_report_${Date.now()}.pdf`);
    const script = path.join(__dirname, '..', 'scripts', 'generateHiringReport.py');

    fs.writeFileSync(tmpJson, JSON.stringify(reportData, null, 2));
    execSync(`python3 "${script}" "${tmpJson}" "${outPdf}"`, { timeout: 60000, stdio: 'pipe' });
    fs.unlinkSync(tmpJson);

    const safeName = job.title.replace(/[^a-zA-Z0-9]/g, '_');
    res.download(outPdf, `FairHire_Candidates_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`, () => {
      try { fs.unlinkSync(outPdf); } catch {}
    });
  } catch (error) {
    console.error('Hiring report error:', error.message);
    res.status(500).json({ error: 'Report generation failed: ' + error.message });
  }
});

// ── HR CERTIFICATION ──

// Get certification status for a job
router.get('/certification/:job_id', async (req, res) => {
  const db = await getDB();
  const cert = db.prepare('SELECT * FROM hr_certifications WHERE job_id = ? ORDER BY certified_at DESC LIMIT 1').get(req.params.job_id);
  const totalEvals = db.prepare('SELECT COUNT(*) as count FROM evaluations WHERE job_id = ?').get(req.params.job_id);
  res.json({ certification: cert || null, total_candidates: totalEvals.count });
});

// Certify that all resumes have been reviewed
router.post('/certification', async (req, res) => {
  const { job_id, notes } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id is required' });

  const db = await getDB();
  const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(job_id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const totalEvals = db.prepare('SELECT COUNT(*) as count FROM evaluations WHERE job_id = ?').get(job_id);
  if (totalEvals.count === 0) return res.status(400).json({ error: 'No candidates have been evaluated for this job yet' });

  const id = uuidv4();
  db.prepare('INSERT INTO hr_certifications (id, job_id, certified_by, certified_by_email, certified_by_name, total_candidates, candidates_reviewed, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, job_id, req.user.id, req.user.email, req.user.display_name || req.user.email,
    totalEvals.count, totalEvals.count, notes || ''
  );

  await logActivity(req.user.id, req.user.email, req.user.role, 'HR_CERTIFICATION', {
    job_id, job_title: job.title, candidates_certified: totalEvals.count, notes
  });

  res.status(201).json({ id, job_id, candidates_certified: totalEvals.count });
});

// Generate certified hiring report PDF (only if certified)
router.post('/certified-report-pdf', async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id is required' });

    const db = await getDB();
    const cert = db.prepare('SELECT * FROM hr_certifications WHERE job_id = ? ORDER BY certified_at DESC LIMIT 1').get(job_id);
    if (!cert) return res.status(400).json({ error: 'This job has not been certified yet. Review all candidates and certify before generating the report.' });

    const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const evals = db.prepare('SELECT e.*, c.original_filename, c.raw_text, c.anonymized_text FROM evaluations e LEFT JOIN candidates c ON e.candidate_id = c.id WHERE e.job_id = ? ORDER BY e.overall_score DESC').all(job_id);

    const candidates = evals.map(ev => {
      const raw = ev.raw_text || ev.anonymized_text || '';
      const lines = raw.split('\n').filter(l => l.trim());
      let name = ev.original_filename || 'Candidate';
      if (lines.length > 0) { const fl = lines[0].trim(); const w = fl.split(/\s+/); if (w.length >= 1 && w.length <= 5 && w.every(x => /^[A-Z]/.test(x))) name = fl; }
      const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const phoneMatch = raw.match(/(\+?1?\s*[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
      return {
        name, email: emailMatch?.[0] || '', phone: phoneMatch?.[0] || '',
        qualification: ev.qualification, skills_match_score: ev.skills_match_score,
        experience_score: ev.experience_score, education_score: ev.education_score,
        overall_score: ev.overall_score, explanation: ev.explanation,
        full_response: ev.full_response, raw_text: raw,
      };
    });

    const reportData = {
      job, candidates,
      certification: {
        certified_by_name: cert.certified_by_name,
        certified_by_email: cert.certified_by_email,
        certified_at: cert.certified_at,
        candidates_reviewed: cert.candidates_reviewed,
        notes: cert.notes,
      }
    };

    const tmpJson = path.join(__dirname, '..', '..', 'data', '_tmp_cert_report.json');
    const outPdf = path.join(__dirname, '..', '..', 'data', `certified_report_${Date.now()}.pdf`);
    const script = path.join(__dirname, '..', 'scripts', 'generateHiringReport.py');

    fs.writeFileSync(tmpJson, JSON.stringify(reportData, null, 2));
    execSync(`python3 "${script}" "${tmpJson}" "${outPdf}"`, { timeout: 60000, stdio: 'pipe' });
    fs.unlinkSync(tmpJson);

    const safeName = job.title.replace(/[^a-zA-Z0-9]/g, '_');
    res.download(outPdf, `FairHire_CERTIFIED_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`, () => {
      try { fs.unlinkSync(outPdf); } catch {}
    });
  } catch (error) {
    res.status(500).json({ error: 'Report generation failed: ' + error.message });
  }
});

router.get('/dataset/records', async (req, res) => {
  const db = await getDB();
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const category = req.query.category;
  let records, total;
  if (category) {
    records = db.prepare('SELECT * FROM dataset_records WHERE category = ? ORDER BY id LIMIT ? OFFSET ?').all(category, limit, offset);
    total = db.prepare('SELECT COUNT(*) as count FROM dataset_records WHERE category = ?').get(category);
  } else {
    records = db.prepare('SELECT * FROM dataset_records ORDER BY id LIMIT ? OFFSET ?').all(limit, offset);
    total = db.prepare('SELECT COUNT(*) as count FROM dataset_records').get();
  }
  const categories = db.prepare('SELECT DISTINCT category, COUNT(*) as count FROM dataset_records GROUP BY category').all();
  res.json({ records, total: total.count, categories });
});

router.get('/:id', async (req, res) => {
  const db = await getDB();
  const ev = db.prepare('SELECT e.*, c.original_filename, c.anonymized_text, j.title as job_title, j.description as job_description FROM evaluations e LEFT JOIN candidates c ON e.candidate_id = c.id LEFT JOIN job_descriptions j ON e.job_id = j.id WHERE e.id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evaluation not found' });
  const overrides = db.prepare('SELECT * FROM recruiter_overrides WHERE evaluation_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ ...ev, overrides });
});

router.post('/:id/override', async (req, res) => {
  const { new_qualification, notes, recruiter_name } = req.body;
  if (!new_qualification) return res.status(400).json({ error: 'new_qualification required' });
  const db = await getDB();
  const ev = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evaluation not found' });
  const oid = uuidv4();
  db.prepare('INSERT INTO recruiter_overrides (id, evaluation_id, original_qualification, new_qualification, notes, recruiter_name, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(oid, req.params.id, ev.qualification, new_qualification, notes || '', recruiter_name || req.user.display_name || 'Recruiter', req.user.id);
  await logOverride(oid, req.params.id, ev.qualification, new_qualification, notes);
  await logActivity(req.user.id, req.user.email, req.user.role, 'OVERRIDE_DECISION', { evaluation_id: req.params.id, from: ev.qualification, to: new_qualification, notes });
  res.status(201).json({ id: oid, success: true });
});

// ═══════════════════════════════════════════════════
// HIRING MANAGER ENDPOINTS (certification-gated)
// ═══════════════════════════════════════════════════

// Get certified candidates for a job (HIRING_MANAGER only sees certified + qualified)
router.get('/hiring-manager/candidates/:job_id', requireAuth, async (req, res) => {
  try {
    const db = await getDB();
    const userRole = req.user.role;

    // Check if this job has been certified
    const cert = db.prepare('SELECT * FROM hr_certifications WHERE job_id = ? ORDER BY certified_at DESC LIMIT 1').get(req.params.job_id);

    if (userRole === 'HIRING_MANAGER') {
      if (!cert) return res.status(403).json({ error: 'This job has not been certified by a recruiter yet. You will gain access after certification.' });

      // Only show Meets or Partially Meets
      const evals = db.prepare(`
        SELECT e.*, c.original_filename, j.title as job_title
        FROM evaluations e
        LEFT JOIN candidates c ON e.candidate_id = c.id
        LEFT JOIN job_descriptions j ON e.job_id = j.id
        WHERE e.job_id = ? AND e.qualification IN ('Meets requirements', 'Partially meets requirements')
        ORDER BY e.overall_score DESC
      `).all(req.params.job_id);

      // Check for existing decisions
      const decision = db.prepare('SELECT * FROM hiring_decisions WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.job_id);

      return res.json({ candidates: evals, certification: cert, decision: decision || null });
    }

    // ADMIN and HR_RECRUITER see everything
    const evals = db.prepare(`
      SELECT e.*, c.original_filename, j.title as job_title
      FROM evaluations e
      LEFT JOIN candidates c ON e.candidate_id = c.id
      LEFT JOIN job_descriptions j ON e.job_id = j.id
      WHERE e.job_id = ?
      ORDER BY e.overall_score DESC
    `).all(req.params.job_id);

    const decision = db.prepare('SELECT * FROM hiring_decisions WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.job_id);

    res.json({ candidates: evals, certification: cert || null, decision: decision || null });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get all certified jobs (for hiring manager job list)
router.get('/hiring-manager/certified-jobs', requireAuth, async (req, res) => {
  try {
    const db = await getDB();
    const certifiedJobs = db.prepare(`
      SELECT j.*, hc.certified_at, hc.certified_by_name, hc.candidates_reviewed,
        (SELECT COUNT(*) FROM evaluations e WHERE e.job_id = j.id AND e.qualification IN ('Meets requirements', 'Partially meets requirements')) as qualified_count,
        (SELECT COUNT(*) FROM hiring_decisions hd WHERE hd.job_id = j.id) as has_decision
      FROM job_descriptions j
      INNER JOIN hr_certifications hc ON j.id = hc.job_id
      GROUP BY j.id
      ORDER BY hc.certified_at DESC
    `).all();
    res.json(certifiedJobs);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Submit hiring decision (HIRING_MANAGER or ADMIN)
router.post('/hiring-manager/decision', requireAuth, async (req, res) => {
  try {
    const { job_id, selected_candidate_id, alternates, notes } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });
    if (!selected_candidate_id) return res.status(400).json({ error: 'selected_candidate_id required' });

    const db = await getDB();

    // Verify job is certified
    const cert = db.prepare('SELECT * FROM hr_certifications WHERE job_id = ? ORDER BY certified_at DESC LIMIT 1').get(job_id);
    if (!cert) return res.status(400).json({ error: 'Job must be certified before a decision can be made' });

    // Verify selected candidate has a qualifying evaluation
    const selEval = db.prepare("SELECT * FROM evaluations WHERE candidate_id = ? AND job_id = ? AND qualification IN ('Meets requirements', 'Partially meets requirements')").get(selected_candidate_id, job_id);
    if (!selEval) return res.status(400).json({ error: 'Selected candidate must have a qualifying evaluation' });

    const id = uuidv4();
    db.prepare('INSERT INTO hiring_decisions (id, job_id, hiring_manager_id, hiring_manager_email, selected_candidate_id, alternates, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, job_id, req.user.id, req.user.email, selected_candidate_id,
      JSON.stringify(alternates || []), notes || ''
    );

    await logActivity(req.user.id, req.user.email, req.user.role, 'HIRING_DECISION', {
      job_id, selected_candidate_id, alternates_count: (alternates || []).length, notes
    });

    res.status(201).json({ id, success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get hiring decision for a job
router.get('/hiring-manager/decision/:job_id', requireAuth, async (req, res) => {
  const db = await getDB();
  const decision = db.prepare('SELECT * FROM hiring_decisions WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.job_id);
  res.json(decision || null);
});

module.exports = router;
