const express = require('express');
const router = express.Router();
const { login } = require('../modules/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { getAllUsers, disableUser, enableUser, updateUserRole } = require('../modules/userModel');
const { logActivity, getActivityLogs, exportActivityLogs } = require('../modules/userActivityLogger');
const { checkBudget, getUsageHistory, resetMonthlyUsage } = require('../modules/usageTracker');
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  if (result.error === 'disabled') return res.status(403).json({ error: 'Your account has been disabled. Contact your administrator.' });
  res.json(result);
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Logout
router.post('/logout', requireAuth, async (req, res) => {
  await logActivity(req.user.id, req.user.email, req.user.role, 'LOGOUT', {});
  res.json({ success: true });
});

// ── PROBLEM REPORT (any logged-in user) ──
router.post('/report-problem', requireAuth, async (req, res) => {
  const { description, page } = req.body;
  if (!description) return res.status(400).json({ error: 'Description required' });

  const db = await getDB();
  const id = uuidv4();
  const subject = 'Oh Snap FairHireAI Issue';

  db.prepare('INSERT INTO problem_reports (id, user_id, user_email, subject, description, page) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, req.user.id, req.user.email, subject, description, page || ''
  );

  await logActivity(req.user.id, req.user.email, req.user.role, 'PROBLEM_REPORT', { report_id: id, page });

  // Compose mailto link for the frontend to open
  const mailto = `mailto:iaustin@gmu.edu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    `Problem Report from FairHire AI\n\n` +
    `Reporter: ${req.user.email} (${req.user.role})\n` +
    `Page: ${page || 'N/A'}\n` +
    `Date: ${new Date().toISOString()}\n` +
    `Report ID: ${id}\n\n` +
    `Description:\n${description}`
  )}`;

  res.json({ id, success: true, mailto });
});

// ── ADMIN ONLY ──

// Get all users
router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await getAllUsers());
});

// Disable a user account
router.post('/users/:id/disable', requireAuth, requireRole('ADMIN'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot disable your own account' });
  await disableUser(req.params.id);
  await logActivity(req.user.id, req.user.email, req.user.role, 'USER_DISABLED', { target_user_id: req.params.id });
  res.json({ success: true });
});

// Enable a user account
router.post('/users/:id/enable', requireAuth, requireRole('ADMIN'), async (req, res) => {
  await enableUser(req.params.id);
  await logActivity(req.user.id, req.user.email, req.user.role, 'USER_ENABLED', { target_user_id: req.params.id });
  res.json({ success: true });
});

// Change user role
router.post('/users/:id/role', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { role } = req.body;
  if (!['ADMIN', 'HR_RECRUITER', 'HIRING_MANAGER'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
  await updateUserRole(req.params.id, role);
  await logActivity(req.user.id, req.user.email, req.user.role, 'USER_ROLE_CHANGED', { target_user_id: req.params.id, new_role: role });
  res.json({ success: true });
});

// Get problem reports (admin)
router.get('/problem-reports', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const db = await getDB();
  res.json(db.prepare('SELECT * FROM problem_reports ORDER BY created_at DESC LIMIT 100').all());
});

// Activity logs
router.get('/activity-logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await getActivityLogs({
    user_id: req.query.user_id, action: req.query.action,
    date_from: req.query.date_from, date_to: req.query.date_to,
    limit: parseInt(req.query.limit) || 200, offset: parseInt(req.query.offset) || 0,
  }));
});

router.get('/activity-logs/export', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await exportActivityLogs({ user_id: req.query.user_id, date_from: req.query.date_from, date_to: req.query.date_to }));
});

// AI usage
router.get('/usage', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const budget = await checkBudget();
  const history = await getUsageHistory();
  res.json({ budget, history });
});

router.post('/usage/reset', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const result = await resetMonthlyUsage(req.body.month);
  await logActivity(req.user.id, req.user.email, req.user.role, 'USAGE_RESET', result);
  res.json(result);
});

module.exports = router;
