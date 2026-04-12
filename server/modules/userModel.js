const { getDB } = require('../database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createUser(email, password, role = 'HR_RECRUITER', displayName = '') {
  const db = await getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing;
  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)').run(id, email, password_hash, role, displayName || email.split('@')[0]);
  return { id, email, role };
}

async function authenticateUser(email, password) {
  const db = await getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, email: user.email, role: user.role, display_name: user.display_name };
}

async function getAllUsers() {
  const db = await getDB();
  return db.prepare('SELECT id, email, role, display_name, created_at FROM users ORDER BY created_at').all();
}

async function getUserById(id) {
  const db = await getDB();
  return db.prepare('SELECT id, email, role, display_name, created_at FROM users WHERE id = ?').get(id);
}

module.exports = { createUser, authenticateUser, getAllUsers, getUserById };
