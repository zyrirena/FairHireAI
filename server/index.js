require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDB } = require('./database');
const { downloadDataset, loadDatasetIntoDB } = require('./modules/kaggleDownloader');
const { logAction } = require('./modules/auditLogger');
const { createUser } = require('./modules/userModel');

const { isPresidioAvailable } = require('./modules/piiScrubber');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth routes (public - no auth required for login)
app.use('/api/auth', require('./routes/auth'));

// Protected routes
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/evaluations', require('./routes/evaluations'));

app.get('/api/health', (req, res) => {
  const isMock = process.env.MOCK_MODE === 'true' || !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here';
  res.json({
    status: 'ok',
    mode: isMock ? 'mock' : 'live',
    pii_engine: isPresidioAvailable() ? 'presidio' : 'regex',
    timestamp: new Date().toISOString(),
    label: 'Local Bias-Aware AI Hiring Assistant (Secure Testing Version)',
  });
});

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// In production, serve the built React frontend
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Auto-delete expired data (check every hour)
setInterval(async () => {
  try {
    const db = await getDB();
    const expired = db.prepare("SELECT id, file_path FROM candidates WHERE delete_after < datetime('now')").all();
    for (const c of expired) {
      if (c.file_path && fs.existsSync(c.file_path)) fs.unlinkSync(c.file_path);
      db.prepare('DELETE FROM recruiter_overrides WHERE evaluation_id IN (SELECT id FROM evaluations WHERE candidate_id = ?)').run(c.id);
      db.prepare('DELETE FROM evaluations WHERE candidate_id = ?').run(c.id);
      db.prepare('DELETE FROM candidates WHERE id = ?').run(c.id);
      await logAction('AUTO_DELETE', 'candidate', c.id, { reason: 'retention_expired' });
    }
    if (expired.length) console.log(`Cleaned up ${expired.length} expired records`);
  } catch {}
}, 3600000);

async function seedDefaultUsers() {
  await createUser('admin@fairhire.local', 'Admin123!', 'ADMIN', 'Admin');
  await createUser('recruiter@fairhire.local', 'Recruiter123!', 'HR_RECRUITER', 'Recruiter');
  console.log('✓ Default users ready (admin@fairhire.local / recruiter@fairhire.local)');
}

async function start() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   FairHire AI – Bias-Aware Resume Screening     ║');
  console.log('║   Secure Testing Version                         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  await getDB();
  console.log('✓ Database initialized');

  await seedDefaultUsers();

  await downloadDataset();
  const loaded = await loadDatasetIntoDB();
  if (loaded > 0) console.log(`✓ ${loaded} dataset records available`);

  const isMock = process.env.MOCK_MODE === 'true' || !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here';
  console.log(isMock ? '⚠ Running in MOCK MODE (no Claude API)\n  Set ANTHROPIC_API_KEY in .env for live evaluation\n' : '✓ Claude API configured\n');

  app.listen(PORT, () => {
    console.log(`✓ Server running at http://localhost:${PORT}`);
    console.log(`  Open: http://localhost:3000\n`);
  });
}

start().catch(console.error);
