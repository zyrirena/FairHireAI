const { getDB } = require('../database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function createUser(email, password, role = 'HR_RECRUITER', displayName = '') {
  const db = await getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing;
  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, role, display_name, disabled) VALUES (?, ?, ?, ?, ?, 0)').run(id, email, password_hash, role, displayName || email.split('@')[0]);
  return { id, email, role };
}

async function authenticateUser(email, password) {
  const db = await getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return null;
  if (user.disabled) return { error: 'disabled' };
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, email: user.email, role: user.role, display_name: user.display_name };
}

async function getAllUsers() {
  const db = await getDB();
  return db.prepare('SELECT id, email, role, display_name, disabled, created_at FROM users ORDER BY created_at').all();
}

async function getUserById(id) {
  const db = await getDB();
  return db.prepare('SELECT id, email, role, display_name, disabled, created_at FROM users WHERE id = ?').get(id);
}

async function disableUser(id) {
  const db = await getDB();
  db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(id);
}

async function enableUser(id) {
  const db = await getDB();
  db.prepare('UPDATE users SET disabled = 0 WHERE id = ?').run(id);
}

async function updateUserRole(id, role) {
  const db = await getDB();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

module.exports = { createUser, authenticateUser, getAllUsers, getUserById, disableUser, enableUser, updateUserRole };
