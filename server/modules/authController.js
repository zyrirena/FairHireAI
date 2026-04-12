const jwt = require('jsonwebtoken');
const { authenticateUser, getAllUsers, getUserById } = require('./userModel');
const { logActivity } = require('./userActivityLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'fairhire-local-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, display_name: user.display_name }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

async function login(email, password) {
  const user = await authenticateUser(email, password);
  if (!user) return null;
  const token = generateToken(user);
  await logActivity(user.id, user.email, user.role, 'LOGIN', { method: 'password' });
  return { token, user };
}

module.exports = { generateToken, verifyToken, login, JWT_SECRET };
