const { verifyToken } = require('../modules/authController');

/** Require valid JWT token */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = decoded;
  next();
}

/** Require specific role(s) */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
