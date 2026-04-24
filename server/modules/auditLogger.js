/**
 * Cryptographic Audit Logger — SHA-256 Tamper-Evident Chain
 * 
 * Every audit entry is hashed with SHA-256 including the previous entry's hash,
 * creating a blockchain-style chain. If anyone modifies a log entry, the chain
 * breaks and verification detects it.
 * 
 * Complies with: EU AI Act (logging/traceability), NYC LL144 (audit retention),
 * EEOC (decision documentation)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');

const AUDIT_LOG_FILE = path.join(__dirname, '..', '..', 'data', 'audit_log.json');

/**
 * Compute SHA-256 hash of all fields + previous hash
 */
function computeHash(entry) {
  const payload = [
    entry.log_id,
    entry.timestamp,
    entry.user_id || '',
    entry.action || '',
    entry.entity_type || '',
    entry.entity_id || '',
    JSON.stringify(entry.input_data || {}),
    JSON.stringify(entry.output_data || {}),
    entry.previous_hash || 'GENESIS',
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Get the most recent hash from the chain
 */
async function getLastHash() {
  try {
    const db = await getDB();
    const last = db.prepare('SELECT current_hash FROM crypto_audit_log ORDER BY sequence_num DESC LIMIT 1').get();
    return last ? last.current_hash : 'GENESIS';
  } catch {
    return 'GENESIS';
  }
}

/**
 * Log an action with SHA-256 hash chain
 */
async function logAction(action, entityType, entityId, details = {}, userId = null) {
  const db = await getDB();
  const previousHash = await getLastHash();
  const logId = uuidv4();
  const timestamp = new Date().toISOString();

  const inputData = details.input_data || details;
  const outputData = details.output_data || {};

  const entry = {
    log_id: logId,
    timestamp,
    user_id: userId || details.user_id || 'system',
    action,
    entity_type: entityType || '',
    entity_id: entityId || '',
    input_data: inputData,
    output_data: outputData,
    previous_hash: previousHash,
  };

  entry.current_hash = computeHash(entry);

  // Store in crypto audit table
  try {
    db.prepare(`INSERT INTO crypto_audit_log 
      (log_id, timestamp, user_id, action, entity_type, entity_id, input_data, output_data, previous_hash, current_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.log_id, entry.timestamp, entry.user_id, entry.action,
      entry.entity_type, entry.entity_id,
      JSON.stringify(entry.input_data), JSON.stringify(entry.output_data),
      entry.previous_hash, entry.current_hash
    );
  } catch (err) {
    console.error('Crypto audit log DB error:', err.message);
  }

  // Backward compatible: also write to legacy audit_log table
  try {
    db.prepare('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)').run(
      action, entityType, entityId, JSON.stringify(details)
    );
  } catch {}

  // Append to JSON file
  appendToJsonFile(entry);

  return entry;
}

/**
 * Append entry to JSON audit log file
 */
function appendToJsonFile(entry) {
  try {
    let logs = [];
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      try { logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch { logs = []; }
    }
    logs.push(entry);
    if (logs.length > 10000) logs = logs.slice(-10000);
    fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Audit JSON file write error:', err.message);
  }
}

/**
 * Verify the integrity of the entire audit chain
 * Recomputes every hash and checks the chain is unbroken
 */
async function verifyLogIntegrity() {
  const db = await getDB();
  const logs = db.prepare('SELECT * FROM crypto_audit_log ORDER BY sequence_num ASC').all();

  if (logs.length === 0) {
    return { valid: true, total: 0, verified: 0, broken_at: null, details: 'No logs to verify' };
  }

  let previousHash = 'GENESIS';
  let verified = 0;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // Check chain continuity
    if (log.previous_hash !== previousHash) {
      await logTamperingIncident(i, log.log_id, 'Previous hash mismatch');
      return {
        valid: false, total: logs.length, verified: i, broken_at: i,
        details: `Chain broken at entry ${i} (log_id: ${log.log_id}). Previous hash mismatch.`,
      };
    }

    // Recompute hash
    let inputData, outputData;
    try { inputData = JSON.parse(log.input_data || '{}'); } catch { inputData = {}; }
    try { outputData = JSON.parse(log.output_data || '{}'); } catch { outputData = {}; }

    const recomputedHash = computeHash({
      log_id: log.log_id, timestamp: log.timestamp, user_id: log.user_id,
      action: log.action, entity_type: log.entity_type, entity_id: log.entity_id,
      input_data: inputData, output_data: outputData, previous_hash: log.previous_hash,
    });

    if (recomputedHash !== log.current_hash) {
      await logTamperingIncident(i, log.log_id, 'Hash mismatch — data tampered');
      return {
        valid: false, total: logs.length, verified: i, broken_at: i,
        details: `Tampering detected at entry ${i} (log_id: ${log.log_id}). Hash mismatch.`,
      };
    }

    previousHash = log.current_hash;
    verified++;
  }

  return { valid: true, total: logs.length, verified, broken_at: null, details: `All ${verified} entries verified. Chain intact.` };
}

/**
 * Log tampering to risk register as HIGH severity
 */
async function logTamperingIncident(position, logId, reason) {
  console.error(`[SECURITY ALERT] Audit log tampering at position ${position}, log: ${logId}. ${reason}`);
  try {
    const db = await getDB();
    db.prepare(`INSERT INTO risk_register (id, risk_name, description, severity, likelihood, mitigation_strategy, identified_by, identified_by_email, status)
      VALUES (?, ?, ?, 'high', 'high', ?, 'system', 'system@fairhire.ai', 'open')`
    ).run(uuidv4(), 'AUDIT LOG TAMPERING DETECTED',
      `Tampering at position ${position}, log_id: ${logId}. ${reason}`,
      'Investigate immediately. Restore from backup. Review access controls.'
    );
  } catch {}
}

// Get/export crypto logs
async function getCryptoAuditLog(limit = 100, offset = 0) {
  const db = await getDB();
  return db.prepare('SELECT * FROM crypto_audit_log ORDER BY sequence_num DESC LIMIT ? OFFSET ?').all(limit, offset);
}
async function exportCryptoAuditLog(startDate, endDate) {
  const db = await getDB();
  if (startDate && endDate) return db.prepare('SELECT * FROM crypto_audit_log WHERE timestamp BETWEEN ? AND ? ORDER BY sequence_num ASC').all(startDate, endDate);
  return db.prepare('SELECT * FROM crypto_audit_log ORDER BY sequence_num ASC').all();
}

// Backward-compatible convenience wrappers
const logUpload = (cid, fn, userId) => logAction('RESUME_UPLOADED', 'candidate', cid, { filename: fn }, userId);
const logPIIScrub = (cid, n) => logAction('PII_SCRUBBED', 'candidate', cid, { items_removed: n });
const logEvaluation = (eid, cid, jid, r) => logAction('AI_EVALUATION', 'evaluation', eid, {
  input_data: { candidate_id: cid, job_id: jid },
  output_data: { qualification: r.qualification, is_mock: r.is_mock || false, match_score: r.match_score_100 || 0 },
});
const logOverride = (oid, eid, orig, upd, notes) => logAction('RECRUITER_OVERRIDE', 'override', oid, {
  input_data: { evaluation_id: eid, from: orig },
  output_data: { to: upd, notes },
});
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

module.exports = {
  logAction, logUpload, logPIIScrub, logEvaluation, logOverride, logDeletion,
  getAuditLog, exportAuditLog, getEvaluationStats,
  getCryptoAuditLog, exportCryptoAuditLog,
  verifyLogIntegrity, computeHash,
};
