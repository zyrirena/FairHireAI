const express = require('express');
const router = express.Router();
const { getSafetyStats, getSafetyLogs } = require('../modules/fiddlerSafety');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

// All safety endpoints require admin role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// GET /api/safety/stats — Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getSafetyStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/safety/logs — List safety logs with filters
router.get('/logs', async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId,
      riskLevel: req.query.riskLevel,
      allowed: req.query.allowed !== undefined ? req.query.allowed === '1' : undefined,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };
    const logs = await getSafetyLogs(filters);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
