const fs = require('fs');
const path = require('path');
const { getDB } = require('../database');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATASET_FILE = path.join(DATA_DIR, 'UpdatedResumeDataSet.csv');
const MARKER_FILE = path.join(DATA_DIR, '.kaggle_downloaded');

function checkIfDatasetExists() {
  return fs.existsSync(MARKER_FILE) && fs.existsSync(DATASET_FILE);
}

async function downloadDataset() {
  if (checkIfDatasetExists()) { console.log('✓ Kaggle dataset already cached locally'); return true; }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const username = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!username || !key || username === 'your_kaggle_username') {
    console.log('⚠ Kaggle credentials not set. Using built-in sample data.');
    await createFallbackData();
    return false;
  }

  try {
    const kaggleDir = path.join(require('os').homedir(), '.kaggle');
    fs.mkdirSync(kaggleDir, { recursive: true });
    fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify({ username, key }), { mode: 0o600 });
    console.log('⬇ Downloading Kaggle dataset...');
    const { execSync } = require('child_process');
    execSync(`kaggle datasets download -d gauravduttakiit/resume-dataset -p "${DATA_DIR}" --force`, { stdio: 'inherit', timeout: 120000 });
    const AdmZip = require('adm-zip');
    for (const f of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.zip'))) {
      const zip = new AdmZip(path.join(DATA_DIR, f));
      zip.extractAllTo(DATA_DIR, true);
      fs.unlinkSync(path.join(DATA_DIR, f));
    }
    fs.writeFileSync(MARKER_FILE, new Date().toISOString());
    console.log('✓ Dataset downloaded and extracted');
    return true;
  } catch (error) {
    console.log(`⚠ Kaggle download failed: ${error.message}`);
    await createFallbackData();
    return false;
  }
}

async function createFallbackData() {
  const sampleData = `Category,Resume
"Data Science","Skills: Python, R, Machine Learning, TensorFlow, SQL, Pandas, NumPy, Scikit-learn. Experience: 5 years as Data Scientist at tech companies. Built ML models for customer segmentation. Education: Master's in Computer Science, Stanford University. Certifications: AWS ML Specialty, Google Data Analytics."
"Web Development","Skills: JavaScript, React, Node.js, HTML, CSS, TypeScript, MongoDB, PostgreSQL. Experience: 4 years as Full Stack Developer. Built scalable web applications for e-commerce platforms. Education: Bachelor's in Software Engineering, MIT. Certifications: AWS Solutions Architect."
"Java Developer","Skills: Java, Spring Boot, Microservices, Docker, Kubernetes, AWS, SQL, REST APIs. Experience: 6 years as Senior Java Developer. Led team of 5 developers. Education: Bachelor's in Computer Science, UC Berkeley. Certifications: Oracle Certified Java Programmer."
"Project Manager","Skills: Agile, Scrum, JIRA, Project Planning, Stakeholder Management, Budgeting, Risk Management. Experience: 8 years managing software development projects. Managed budgets up to 2M. Education: MBA, Harvard Business School. Certifications: PMP, CSM."
"DevOps Engineer","Skills: AWS, Docker, Kubernetes, Terraform, CI/CD, Jenkins, Linux, Python, Ansible. Experience: 4 years as DevOps Engineer. Reduced deployment time by 60%. Education: Bachelor's in Information Technology. Certifications: AWS DevOps Professional, CKA."
"Data Science","Skills: Python, SQL, Tableau, Statistics, Deep Learning, NLP, PyTorch, Spark. Experience: 3 years as Junior Data Scientist. Developed NLP pipelines. Education: Bachelor's in Mathematics, Columbia University."
"Web Development","Skills: Vue.js, Python, Django, REST APIs, PostgreSQL, Docker, Git. Experience: 2 years as Frontend Developer. Built customer-facing dashboards. Education: Bootcamp Certificate in Web Development."
"Mechanical Engineer","Skills: AutoCAD, SolidWorks, MATLAB, FEA, Thermodynamics, Manufacturing. Experience: 7 years in automotive industry. Led design of engine components. Education: Master's in Mechanical Engineering, University of Michigan."
"HR Manager","Skills: Talent Acquisition, Employee Relations, HRIS, Benefits Administration, Compliance, Training. Experience: 10 years in Human Resources. Managed HR for 500+ employee organization. Education: Bachelor's in Human Resources Management. Certifications: SHRM-SCP, PHR."
"Data Science","Skills: Python, R, SQL, Machine Learning, Statistics, Data Visualization, Keras. Experience: 1 year as Data Analyst. Transitioned from academia. Education: PhD in Physics, Caltech."`;
  fs.writeFileSync(DATASET_FILE, sampleData);
  fs.writeFileSync(MARKER_FILE, 'fallback-' + new Date().toISOString());
  console.log('✓ Fallback sample dataset created');
}

function loadDataset() {
  if (!fs.existsSync(DATASET_FILE)) return [];
  const raw = fs.readFileSync(DATASET_FILE, 'utf-8');
  const records = [];
  for (const line of raw.split('\n').slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^"([^"]*?)","([\s\S]*?)"$/);
    if (match) records.push({ category: match[1], resume: match[2] });
    else { const idx = trimmed.indexOf(','); if (idx > -1) records.push({ category: trimmed.substring(0, idx).replace(/"/g, ''), resume: trimmed.substring(idx + 1).replace(/"/g, '') }); }
  }
  return records;
}

async function loadDatasetIntoDB() {
  const db = await getDB();
  const records = loadDataset();
  if (!records.length) return 0;
  const existing = db.prepare('SELECT COUNT(*) as count FROM dataset_records').get();
  if (existing.count > 0) return existing.count;
  const insert = db.prepare('INSERT INTO dataset_records (category, resume_text, source) VALUES (?, ?, ?)');
  for (const rec of records) insert.run(rec.category, rec.resume, 'kaggle');
  return records.length;
}

module.exports = { checkIfDatasetExists, downloadDataset, loadDataset, loadDatasetIntoDB };
