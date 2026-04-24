const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'fairhire.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'HR_RECRUITER', display_name TEXT,
  disabled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS problem_reports (
  id TEXT PRIMARY KEY, user_id TEXT, user_email TEXT,
  subject TEXT, description TEXT, page TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, user_email TEXT,
  role TEXT, action TEXT NOT NULL, metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0, estimated_cost REAL DEFAULT 0,
  request_count INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS job_descriptions (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
  department TEXT DEFAULT '', requirements TEXT,
  min_education TEXT, min_experience_years INTEGER DEFAULT 0,
  required_skills TEXT, preferred_skills TEXT DEFAULT '',
  scoring_weights TEXT DEFAULT '{"skills":0.4,"experience":0.3,"education":0.1,"certifications":0.2}',
  created_by TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY, original_filename TEXT, anonymized_text TEXT, raw_text TEXT,
  file_path TEXT, consent_given INTEGER DEFAULT 0, uploaded_by TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP, delete_after DATETIME
);
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, job_id TEXT NOT NULL,
  qualification TEXT, skills_match_score REAL, experience_score REAL,
  education_score REAL, overall_score REAL, explanation TEXT, full_response TEXT,
  is_mock INTEGER DEFAULT 0, triggered_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recruiter_overrides (
  id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL, original_qualification TEXT,
  new_qualification TEXT, notes TEXT, recruiter_name TEXT DEFAULT 'Recruiter',
  user_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hr_certifications (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, certified_by TEXT NOT NULL,
  certified_by_email TEXT, certified_by_name TEXT,
  total_candidates INTEGER DEFAULT 0, candidates_reviewed INTEGER DEFAULT 0,
  notes TEXT, certified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_type TEXT,
  entity_id TEXT, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS crypto_audit_log (
  sequence_num INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id TEXT UNIQUE NOT NULL, timestamp TEXT NOT NULL,
  user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
  input_data TEXT, output_data TEXT,
  previous_hash TEXT NOT NULL, current_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bias_test_results (
  id TEXT PRIMARY KEY, test_name TEXT, job_id TEXT, disparate_impact_ratio REAL,
  group_a_label TEXT, group_b_label TEXT, group_a_pass_rate REAL,
  group_b_pass_rate REAL, passed_80_rule INTEGER, details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dataset_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, resume_text TEXT,
  source TEXT DEFAULT 'direct_upload', ingestion_method TEXT DEFAULT 'manual_upload',
  consent_flag INTEGER DEFAULT 1, preprocessing_notes TEXT DEFAULT '',
  loaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS risk_register (
  id TEXT PRIMARY KEY, risk_name TEXT NOT NULL, description TEXT,
  severity TEXT DEFAULT 'medium', likelihood TEXT DEFAULT 'medium',
  mitigation_strategy TEXT, identified_by TEXT, identified_by_email TEXT,
  status TEXT DEFAULT 'open', resolved_at DATETIME,
  identified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS safety_logs (
  id TEXT PRIMARY KEY, user_id TEXT, response TEXT, context TEXT,
  score REAL DEFAULT 0.5, risk_level TEXT DEFAULT 'medium',
  allowed INTEGER DEFAULT 1, confidence TEXT DEFAULT 'unknown',
  details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hiring_decisions (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, hiring_manager_id TEXT NOT NULL,
  hiring_manager_email TEXT, selected_candidate_id TEXT,
  alternates TEXT, notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

let db = null;
let _ready = null;

function createBetterSqlite3() {
  const Database = require('better-sqlite3');
  const raw = new Database(DB_PATH);
  raw.pragma('journal_mode = WAL');
  for (const stmt of SCHEMA.split(';').filter(s => s.trim())) {
    try { raw.exec(stmt + ';'); } catch {}
  }
  return raw;
}

function createSqlJsWrapper(SQL) {
  let sqldb;
  if (fs.existsSync(DB_PATH)) {
    sqldb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqldb = new SQL.Database();
  }
  for (const stmt of SCHEMA.split(';').filter(s => s.trim())) {
    try { sqldb.run(stmt + ';'); } catch {}
  }
  const save = () => { fs.writeFileSync(DB_PATH, Buffer.from(sqldb.export())); };
  save();

  return {
    _engine: 'sql.js',
    exec(sql) { sqldb.run(sql); save(); },
    prepare(sql) {
      return {
        run(...params) { sqldb.run(sql, params); save(); return { changes: sqldb.getRowsModified() }; },
        get(...params) {
          const s = sqldb.prepare(sql);
          if (params.length) s.bind(params);
          if (s.step()) { const r = s.getAsObject(); s.free(); return r; }
          s.free(); return undefined;
        },
        all(...params) {
          const res = []; const s = sqldb.prepare(sql);
          if (params.length) s.bind(params);
          while (s.step()) res.push(s.getAsObject());
          s.free(); return res;
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        sqldb.run('BEGIN'); try { fn(...args); sqldb.run('COMMIT'); save(); } catch (e) { sqldb.run('ROLLBACK'); throw e; }
      };
    },
    pragma() {}
  };
}

async function getDB() {
  if (db) return db;
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      db = createBetterSqlite3();
      db._engine = 'better-sqlite3';
    } catch {
      const initSqlJs = require('sql.js');
      const SQL = await initSqlJs();
      db = createSqlJsWrapper(SQL);
    }
    return db;
  })();
  return _ready;
}

module.exports = { getDB };
