const { getDB } = require('../database');

async function logActivity(userId, userEmail, role, action, metadata = {}) {
  const db = await getDB();
  db.prepare('INSERT INTO user_activity_logs (user_id, user_email, role, action, metadata) VALUES (?, ?, ?, ?, ?)').run(userId || '', userEmail || '', role || '', action, JSON.stringify(metadata));
}

async function getActivityLogs(filters = {}) {
  const db = await getDB();
  let query = 'SELECT * FROM user_activity_logs';
  const conditions = [];
  const params = [];
  if (filters.user_id) { conditions.push('user_id = ?'); params.push(filters.user_id); }
  if (filters.action) { conditions.push('action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.date_from) { conditions.push('created_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push('created_at <= ?'); params.push(filters.date_to); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(filters.limit || 200, filters.offset || 0);
  return db.prepare(query).all(...params);
}

async function exportActivityLogs(filters = {}) {
  const db = await getDB();
  let query = 'SELECT * FROM user_activity_logs';
  const conditions = [];
  const params = [];
  if (filters.user_id) { conditions.push('user_id = ?'); params.push(filters.user_id); }
  if (filters.date_from) { conditions.push('created_at >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { conditions.push('created_at <= ?'); params.push(filters.date_to); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all(...params);
}

module.exports = { logActivity, getActivityLogs, exportActivityLogs };
