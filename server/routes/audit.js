const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { logActivity } = require('../modules/userActivityLogger');

// ══════════════════════════════════════════════
// NYC LOCAL LAW 144 — THIRD-PARTY AUDIT API
// Secured by API key (set AUDIT_API_KEY env var)
// ══════════════════════════════════════════════

function requireAuditApiKey(req, res, next) {
  const key = req.headers['x-audit-api-key'] || req.query.api_key;
  const validKey = process.env.AUDIT_API_KEY;
  if (!validKey) return res.status(503).json({ error: 'Audit API not configured. Set AUDIT_API_KEY environment variable.' });
  if (key !== validKey) return res.status(401).json({ error: 'Invalid audit API key' });
  next();
}

// GET /api/audit/bias-results — external auditor endpoint
router.get('/bias-results', requireAuditApiKey, async (req, res) => {
  try {
    const db = await getDB();

    const biasResults = db.prepare('SELECT * FROM bias_test_results ORDER BY created_at DESC').all();

    // Scoring distribution (aggregated, no PII)
    const scoreDist = db.prepare(`
      SELECT qualification, COUNT(*) as count, AVG(overall_score) as avg_score,
             MIN(overall_score) as min_score, MAX(overall_score) as max_score
      FROM evaluations GROUP BY qualification
    `).all();

    // Selection rates by qualification (aggregated)
    const total = db.prepare('SELECT COUNT(*) as count FROM evaluations').get();
    const selectionRates = scoreDist.map(r => ({
      category: r.qualification,
      count: r.count,
      percentage: total.count > 0 ? ((r.count / total.count) * 100).toFixed(1) : '0.0',
      avg_score: r.avg_score ? r.avg_score.toFixed(2) : null,
    }));

    // Certification records (no PII — just counts)
    const certCount = db.prepare('SELECT COUNT(*) as count FROM hr_certifications').get();

    // Hiring decisions (aggregated)
    const decisionCount = db.prepare('SELECT COUNT(*) as count FROM hiring_decisions').get();

    // Override summary
    const overrideCount = db.prepare('SELECT COUNT(*) as count FROM recruiter_overrides').get();
    const overrideSummary = db.prepare(`
      SELECT original_qualification, new_qualification, COUNT(*) as count
      FROM recruiter_overrides GROUP BY original_qualification, new_qualification
    `).all();

    res.json({
      report_type: 'NYC_LL144_BIAS_AUDIT',
      generated_at: new Date().toISOString(),
      system: 'FairHire AI v2.0',
      bias_test_results: biasResults.map(r => ({
        test_name: r.test_name,
        disparate_impact_ratio: r.disparate_impact_ratio,
        group_a_label: r.group_a_label,
        group_b_label: r.group_b_label,
        group_a_pass_rate: r.group_a_pass_rate,
        group_b_pass_rate: r.group_b_pass_rate,
        passed_80_rule: !!r.passed_80_rule,
        created_at: r.created_at,
      })),
      scoring_distribution: selectionRates,
      total_evaluations: total.count,
      total_certifications: certCount.count,
      total_hiring_decisions: decisionCount.count,
      override_summary: {
        total_overrides: overrideCount.count,
        breakdown: overrideSummary,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════
// RISK REGISTER — EU AI Act risk management
// ══════════════════════════════════════════════

// List all risks (ADMIN only)
router.get('/risks', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const db = await getDB();
  const risks = db.prepare('SELECT * FROM risk_register ORDER BY identified_at DESC').all();
  res.json(risks);
});

// Create a risk entry
router.post('/risks', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { risk_name, description, severity, likelihood, mitigation_strategy } = req.body;
  if (!risk_name) return res.status(400).json({ error: 'risk_name is required' });

  const validSeverity = ['low', 'medium', 'high'];
  const validLikelihood = ['low', 'medium', 'high'];
  if (severity && !validSeverity.includes(severity)) return res.status(400).json({ error: 'severity must be low, medium, or high' });
  if (likelihood && !validLikelihood.includes(likelihood)) return res.status(400).json({ error: 'likelihood must be low, medium, or high' });

  const db = await getDB();
  const id = uuidv4();
  db.prepare(`INSERT INTO risk_register (id, risk_name, description, severity, likelihood, mitigation_strategy, identified_by, identified_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, risk_name, description || '', severity || 'medium', likelihood || 'medium', mitigation_strategy || '', req.user.id, req.user.email);

  await logActivity(req.user.id, req.user.email, req.user.role, 'RISK_CREATED', { risk_id: id, risk_name });
  res.status(201).json(db.prepare('SELECT * FROM risk_register WHERE id = ?').get(id));
});

// Update risk status
router.put('/risks/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { status, mitigation_strategy, severity, likelihood } = req.body;
  const db = await getDB();
  const existing = db.prepare('SELECT * FROM risk_register WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Risk not found' });

  const validStatus = ['open', 'monitoring', 'resolved'];
  if (status && !validStatus.includes(status)) return res.status(400).json({ error: 'status must be open, monitoring, or resolved' });

  db.prepare(`UPDATE risk_register SET
    status = ?, mitigation_strategy = ?, severity = ?, likelihood = ?,
    resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END
    WHERE id = ?`
  ).run(
    status || existing.status,
    mitigation_strategy || existing.mitigation_strategy,
    severity || existing.severity,
    likelihood || existing.likelihood,
    status || existing.status,
    req.params.id,
  );

  await logActivity(req.user.id, req.user.email, req.user.role, 'RISK_UPDATED', { risk_id: req.params.id, new_status: status });
  res.json(db.prepare('SELECT * FROM risk_register WHERE id = ?').get(req.params.id));
});

// Delete risk
router.delete('/risks/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const db = await getDB();
  db.prepare('DELETE FROM risk_register WHERE id = ?').run(req.params.id);
  await logActivity(req.user.id, req.user.email, req.user.role, 'RISK_DELETED', { risk_id: req.params.id });
  res.json({ success: true });
});

// ══════════════════════════════════════════════
// AUTO-LOG RISKS from AI screening issues
// Called by the evaluator when issues are detected
// ══════════════════════════════════════════════

async function logAutoRisk(riskName, description, severity = 'low') {
  try {
    const db = await getDB();
    const id = uuidv4();
    db.prepare(`INSERT INTO risk_register (id, risk_name, description, severity, likelihood, mitigation_strategy, identified_by, identified_by_email, status)
      VALUES (?, ?, ?, ?, 'medium', 'Auto-flagged for review', 'system', 'system@fairhire.ai', 'open')`
    ).run(id, riskName, description, severity);
  } catch {}
}

module.exports = router;
module.exports.logAutoRisk = logAutoRisk;
