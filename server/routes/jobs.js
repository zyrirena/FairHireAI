const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { logAction } = require('../modules/auditLogger');
const { logActivity } = require('../modules/userActivityLogger');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// Discriminatory keyword blocklist for job validation
const BLOCKED_KEYWORDS = [
  'young', 'old', 'male', 'female', 'gender', 'race', 'religion', 'ethnicity',
  'nationality', 'married', 'single', 'pregnant', 'disability', 'disabled',
  'native', 'immigrant', 'citizen', 'complexion', 'attractive', 'handsome',
  'beautiful', 'age', 'veteran status', 'sexual orientation',
];

function validateJobInput(body) {
  const errors = [];
  if (!body.title?.trim()) errors.push('Title is required');
  if (!body.description?.trim()) errors.push('Description is required');

  // Check for discriminatory keywords in all text fields
  const textToCheck = [
    body.title, body.description, body.requirements,
    body.required_skills, body.preferred_skills,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const keyword of BLOCKED_KEYWORDS) {
    if (textToCheck.includes(keyword)) {
      errors.push(`Job description contains potentially discriminatory term: "${keyword}". Remove it to comply with NYC LL144 / EU AI Act.`);
    }
  }

  // Validate scoring weights
  if (body.scoring_weights) {
    let weights;
    try {
      weights = typeof body.scoring_weights === 'string' ? JSON.parse(body.scoring_weights) : body.scoring_weights;
    } catch { errors.push('scoring_weights must be valid JSON'); return errors; }

    const sum = Object.values(weights).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1.0) > 0.01) errors.push(`Scoring weights must sum to 1.0 (currently ${sum.toFixed(2)})`);

    // Prevent extreme weighting (no single weight > 0.7)
    for (const [key, val] of Object.entries(weights)) {
      if (val > 0.7) errors.push(`Weight for "${key}" is ${val} — maximum allowed is 0.7 to prevent overfitting`);
      if (val < 0) errors.push(`Weight for "${key}" cannot be negative`);
    }
  }

  return errors;
}

router.use(requireAuth);

// List all jobs
router.get('/', async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT * FROM job_descriptions ORDER BY created_at DESC').all());
});

// Get single job
router.get('/:id', async (req, res) => {
  const db = await getDB();
  const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Create job — ADMIN + HIRING_MANAGER only
router.post('/', requireRole('ADMIN', 'HIRING_MANAGER'), async (req, res) => {
  const errors = validateJobInput(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  const { title, description, department, requirements, min_education, min_experience_years, required_skills, preferred_skills, scoring_weights } = req.body;

  // Normalize weights
  let weightsStr = '{"skills":0.4,"experience":0.3,"education":0.1,"certifications":0.2}';
  if (scoring_weights) {
    const w = typeof scoring_weights === 'string' ? JSON.parse(scoring_weights) : scoring_weights;
    weightsStr = JSON.stringify(w);
  }

  const db = await getDB();
  const id = uuidv4();
  db.prepare(`INSERT INTO job_descriptions
    (id, title, description, department, requirements, min_education, min_experience_years, required_skills, preferred_skills, scoring_weights, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, description, department || '', requirements || description, min_education || '', min_experience_years || 0, required_skills || '', preferred_skills || '', weightsStr, req.user.id);

  await logAction('JOB_CREATED', 'job', id, { title, created_by: req.user.email });
  await logActivity(req.user.id, req.user.email, req.user.role, 'JOB_CREATED', { job_id: id, title });

  res.status(201).json(db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(id));
});

// Update job — ADMIN + HIRING_MANAGER only
router.put('/:id', requireRole('ADMIN', 'HIRING_MANAGER'), async (req, res) => {
  const errors = validateJobInput(req.body);
  if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

  const db = await getDB();
  const existing = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  // Hiring managers can only edit their own jobs
  if (req.user.role === 'HIRING_MANAGER' && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit jobs you created' });
  }

  const { title, description, department, requirements, min_education, min_experience_years, required_skills, preferred_skills, scoring_weights } = req.body;

  let weightsStr = existing.scoring_weights;
  if (scoring_weights) {
    const w = typeof scoring_weights === 'string' ? JSON.parse(scoring_weights) : scoring_weights;
    weightsStr = JSON.stringify(w);
  }

  db.prepare(`UPDATE job_descriptions SET
    title=?, description=?, department=?, requirements=?, min_education=?,
    min_experience_years=?, required_skills=?, preferred_skills=?, scoring_weights=?
    WHERE id=?`
  ).run(title, description, department || '', requirements || description, min_education || '', min_experience_years || 0, required_skills || '', preferred_skills || '', weightsStr, req.params.id);

  await logAction('JOB_UPDATED', 'job', req.params.id, { title, updated_by: req.user.email });
  await logActivity(req.user.id, req.user.email, req.user.role, 'JOB_UPDATED', { job_id: req.params.id, title });

  res.json(db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id));
});

// Delete job — ADMIN only
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const db = await getDB();
  db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(req.params.id);
  await logAction('JOB_DELETED', 'job', req.params.id, { deleted_by: req.user.email });
  await logActivity(req.user.id, req.user.email, req.user.role, 'JOB_DELETED', { job_id: req.params.id });
  res.json({ success: true });
});

module.exports = router;
