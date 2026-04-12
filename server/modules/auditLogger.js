const { getDB } = require('../database');

async function logAction(action, entityType, entityId, details = {}) {
  const db = await getDB();
  db.prepare('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)').run(action, entityType, entityId, JSON.stringify(details));
}
const logUpload = (cid, fn) => logAction('RESUME_UPLOADED', 'candidate', cid, { filename: fn });
const logPIIScrub = (cid, n) => logAction('PII_SCRUBBED', 'candidate', cid, { items_removed: n });
const logEvaluation = (eid, cid, jid, r) => logAction('AI_EVALUATION', 'evaluation', eid, { candidate_id: cid, job_id: jid, qualification: r.qualification, is_mock: r.is_mock || false });
const logOverride = (oid, eid, orig, upd, notes) => logAction('RECRUITER_OVERRIDE', 'override', oid, { evaluation_id: eid, from: orig, to: upd, notes });
const logDeletion = (et, eid, reason) => logAction('DATA_DELETED', et, eid, { reason });

async function getAuditLog(limit = 100, offset = 0) {
  const db = await getDB();
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}
async function exportAuditLog(start, end) {
  const db = await getDB();
  if (start && end) return db.prepare('SELECT * FROM audit_log WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC').all(start, end);
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC').all();
}
async function getEvaluationStats() {
  const db = await getDB();
  return {
    total_evaluations: db.prepare('SELECT COUNT(*) as count FROM evaluations').get().count,
    by_qualification: db.prepare('SELECT qualification, COUNT(*) as count FROM evaluations GROUP BY qualification').all(),
    average_scores: db.prepare('SELECT AVG(skills_match_score) as avg_skills, AVG(experience_score) as avg_experience, AVG(education_score) as avg_education, AVG(overall_score) as avg_overall FROM evaluations').get(),
    total_overrides: db.prepare('SELECT COUNT(*) as count FROM recruiter_overrides').get().count,
    recent_activity: db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20').all(),
  };
}

module.exports = { logAction, logUpload, logPIIScrub, logEvaluation, logOverride, logDeletion, getAuditLog, exportAuditLog, getEvaluationStats };
