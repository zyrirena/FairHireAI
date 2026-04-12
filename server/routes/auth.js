const express = require('express');
const router = express.Router();
const { login } = require('../modules/authController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { getAllUsers } = require('../modules/userModel');
const { logActivity, getActivityLogs, exportActivityLogs } = require('../modules/userActivityLogger');
const { checkBudget, getUsageHistory, resetMonthlyUsage } = require('../modules/usageTracker');

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: 'Invalid email or password' });
  res.json(result);
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Logout (client-side token removal, but log it)
router.post('/logout', requireAuth, async (req, res) => {
  await logActivity(req.user.id, req.user.email, req.user.role, 'LOGOUT', {});
  res.json({ success: true });
});

// ── ADMIN ONLY ──

// Get all users
router.get('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  res.json(await getAllUsers());
});

// Get user activity logs
router.get('/activity-logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const logs = await getActivityLogs({
    user_id: req.query.user_id,
    action: req.query.action,
    date_from: req.query.date_from,
    date_to: req.query.date_to,
    limit: parseInt(req.query.limit) || 200,
    offset: parseInt(req.query.offset) || 0,
  });
  res.json(logs);
});

// Export activity logs
router.get('/activity-logs/export', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const logs = await exportActivityLogs({
    user_id: req.query.user_id,
    date_from: req.query.date_from,
    date_to: req.query.date_to,
  });
  res.json(logs);
});

// Get AI usage / budget
router.get('/usage', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const budget = await checkBudget();
  const history = await getUsageHistory();
  res.json({ budget, history });
});

// Reset monthly usage
router.post('/usage/reset', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const result = await resetMonthlyUsage(req.body.month);
  await logActivity(req.user.id, req.user.email, req.user.role, 'USAGE_RESET', result);
  res.json(result);
});

module.exports = router;
