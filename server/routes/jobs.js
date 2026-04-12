const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { logAction } = require('../modules/auditLogger');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT * FROM job_descriptions ORDER BY created_at DESC').all());
});

router.get('/:id', async (req, res) => {
  const db = await getDB();
  const job = db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.post('/', async (req, res) => {
  const { title, description, requirements, min_education, min_experience_years, required_skills } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  const db = await getDB();
  const id = uuidv4();
  db.prepare('INSERT INTO job_descriptions (id, title, description, requirements, min_education, min_experience_years, required_skills) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, title, description, requirements || description, min_education || '', min_experience_years || 0, required_skills || '');
  await logAction('JOB_CREATED', 'job', id, { title });
  res.status(201).json(db.prepare('SELECT * FROM job_descriptions WHERE id = ?').get(id));
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  db.prepare('DELETE FROM job_descriptions WHERE id = ?').run(req.params.id);
  await logAction('JOB_DELETED', 'job', req.params.id, {});
  res.json({ success: true });
});

module.exports = router;
