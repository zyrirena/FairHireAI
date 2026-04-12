const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { parseResume } = require('../modules/resumeParser');
const { scrubPII } = require('../modules/piiScrubber');
const { evaluateResume } = require('../modules/claudeEvaluator');
const { logUpload, logPIIScrub, logEvaluation, logDeletion } = require('../modules/auditLogger');
const { logActivity } = require('../modules/userActivityLogger');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['.pdf', '.docx', '.txt'].includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, DOCX, and TXT files allowed'));
  },
});

router.get('/', async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT c.*, (SELECT COUNT(*) FROM evaluations e WHERE e.candidate_id = c.id) as evaluation_count FROM candidates c ORDER BY c.uploaded_at DESC').all());
});

router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (req.body.consent !== 'true') { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Consent required' }); }

    const db = await getDB();
    const id = uuidv4();
    const rawText = await parseResume(req.file.path);
    const { scrubbed, removals, engine, entities_found } = scrubPII(rawText);
    const deleteAfter = new Date(Date.now() + parseInt(process.env.DATA_RETENTION_DAYS || '120') * 86400000).toISOString();

    db.prepare('INSERT INTO candidates (id, original_filename, anonymized_text, raw_text, file_path, consent_given, uploaded_by, delete_after) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(id, req.file.originalname, scrubbed, rawText, req.file.path, req.user.id, deleteAfter);
    await logUpload(id, req.file.originalname);
    await logPIIScrub(id, removals.length);
    await logActivity(req.user.id, req.user.email, req.user.role, 'UPLOAD_RESUME', { candidate_id: id, filename: req.file.originalname, pii_removed: removals.length, pii_engine: engine });

    res.status(201).json({
      id,
      filename: req.file.originalname,
      pii_items_removed: removals.length,
      pii_engine: engine || 'regex',
      pii_entities_found: entities_found || [],
      pii_removals: removals.map(r => ({ type: r.type, score: r.score })),
      text_preview: scrubbed.substring(0, 300) + '...',
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/evaluate', async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id required' });
    const db = await getDB();
    const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(job_id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const result = await evaluateResume(candidate.anonymized_text, job);
    const evalId = uuidv4();
    const overall = ((result.score_breakdown.skills_match || 0) + (result.score_breakdown.experience || 0) + (result.score_breakdown.education || 0) + (result.score_breakdown.certifications || 5)) / 4;

    db.prepare('INSERT INTO evaluations (id, candidate_id, job_id, qualification, skills_match_score, experience_score, education_score, overall_score, explanation, full_response, is_mock, triggered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(evalId, candidate.id, job_id, result.qualification, result.score_breakdown.skills_match, result.score_breakdown.experience, result.score_breakdown.education, overall, result.explanation, JSON.stringify(result), result.is_mock ? 1 : 0, req.user.id);
    await logEvaluation(evalId, candidate.id, job_id, result);
    await logActivity(req.user.id, req.user.email, req.user.role, 'AI_EVALUATION', { evaluation_id: evalId, candidate_id: candidate.id, job_id, qualification: result.qualification, is_mock: result.is_mock, budget_exceeded: result.budget_exceeded || false });
    res.json({ evaluation_id: evalId, ...result });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (candidate.file_path && fs.existsSync(candidate.file_path)) fs.unlinkSync(candidate.file_path);
  db.prepare('DELETE FROM recruiter_overrides WHERE evaluation_id IN (SELECT id FROM evaluations WHERE candidate_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM evaluations WHERE candidate_id = ?').run(req.params.id);
  db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id);
  await logDeletion('candidate', req.params.id, 'User requested deletion');
  await logActivity(req.user.id, req.user.email, req.user.role, 'DATA_DELETED', { candidate_id: req.params.id });
  res.json({ success: true });
});

module.exports = router;
