require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { getDB } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { downloadDataset, loadDatasetIntoDB } = require('../modules/kaggleDownloader');
const { scrubPII } = require('../modules/piiScrubber');
const { evaluateResume } = require('../modules/claudeEvaluator');
const { createUser } = require('../modules/userModel');

const JOBS = [
  { title: 'Senior Software Engineer', description: 'Seeking a Senior Software Engineer to build scalable web applications.', requirements: 'Strong JavaScript/TypeScript, React, Node.js, AWS experience.', min_education: "Bachelor's in CS", min_experience_years: 5, required_skills: 'JavaScript,TypeScript,React,Node.js,AWS,SQL,Git' },
  { title: 'Data Scientist', description: 'Data Scientist to develop ML models for recommendation engine.', requirements: 'Python, SQL, ML frameworks, data pipelines, A/B testing.', min_education: "Master's in Data Science", min_experience_years: 3, required_skills: 'Python,SQL,Machine Learning,TensorFlow,Statistics,Pandas' },
  { title: 'Project Manager - IT', description: 'Project Manager to lead cross-functional software teams.', requirements: 'PMP/CSM, agile experience, $500K+ budget management.', min_education: "Bachelor's degree", min_experience_years: 5, required_skills: 'Agile,Scrum,JIRA,Project Planning,Budgeting,Stakeholder Management' },
];

const RESUMES = [
  { filename: 'candidate_software.txt', text: 'Alex Martinez\n\nSoftware Developer with 6 years experience.\n\nSkills: JavaScript, TypeScript, React, Node.js, Python, AWS, Docker, PostgreSQL, MongoDB, Git\n\nExperience:\nSenior Developer - TechCorp (2020-2024)\n- Led React application for 200K users\n- Microservices with Node.js and Docker\n\nDeveloper - StartupXYZ (2018-2020)\n- Full-stack React and Express\n\nEducation: BS Computer Science, University of Washington (2018)\nCertifications: AWS Certified Developer' },
  { filename: 'candidate_datascience.txt', text: 'Jordan Smith\n\nData Scientist.\n\nSkills: Python, R, SQL, TensorFlow, PyTorch, Scikit-learn, Pandas, Spark, Tableau, NLP\n\nExperience:\nData Scientist - Analytics Corp (2021-2024)\n- Recommendation engine +35% engagement\n- ML pipelines 10M records/day\n\nData Analyst - DataFirm (2019-2021)\n- Dashboards and statistical analysis\n\nEducation: MS Data Science, Columbia (2019), BS Mathematics, UCLA (2017)' },
  { filename: 'candidate_pm.txt', text: 'Casey Johnson\n\nIT Project Manager, 8 years experience.\n\nSkills: Agile, Scrum, SAFe, JIRA, Confluence, Risk Management, Budgeting, Stakeholder Management\n\nExperience:\nSenior PM - Enterprise Solutions (2019-2024)\n- Portfolio of 5 projects, $2.5M combined\n- 95% on-time delivery\n\nPM - TechServices (2016-2019)\n- Led Agile transformation, 25 engineers\n\nEducation: MBA, Boston University (2016)\nCertifications: PMP, CSM' },
];

async function seed() {
  console.log('\n🌱 Seeding FairHire AI database...\n');
  const db = await getDB();

  // Create default users
  console.log('Creating default users...');
  await createUser('admin@fairhire.local', 'Admin123!', 'ADMIN', 'Admin');
  await createUser('recruiter@fairhire.local', 'Recruiter123!', 'HR_RECRUITER', 'Recruiter');
  console.log('  ✓ admin@fairhire.local (password: Admin123!)');
  console.log('  ✓ recruiter@fairhire.local (password: Recruiter123!)');

  await downloadDataset();
  const dataCount = await loadDatasetIntoDB();
  console.log(`  ✓ ${dataCount} dataset records\n`);

  console.log('Creating sample jobs...');
  const jobIds = [];
  for (const job of JOBS) {
    const id = uuidv4();
    jobIds.push(id);
    db.prepare('INSERT INTO job_descriptions (id, title, description, requirements, min_education, min_experience_years, required_skills) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, job.title, job.description, job.requirements, job.min_education, job.min_experience_years, job.required_skills);
    console.log(`  ✓ ${job.title}`);
  }

  console.log('\nProcessing sample candidates...');
  for (let i = 0; i < RESUMES.length; i++) {
    const r = RESUMES[i];
    const { scrubbed, removals } = scrubPII(r.text);
    const cid = uuidv4();
    db.prepare("INSERT INTO candidates (id, original_filename, anonymized_text, raw_text, consent_given, delete_after) VALUES (?, ?, ?, ?, 1, datetime('now', '+120 days'))").run(cid, r.filename, scrubbed, r.text);
    console.log(`  ✓ ${r.filename} (${removals.length} PII removed)`);

    const job = JOBS[i];
    const result = await evaluateResume(scrubbed, job);
    const eid = uuidv4();
    const overall = ((result.score_breakdown.skills_match || 0) + (result.score_breakdown.experience || 0) + (result.score_breakdown.education || 0) + (result.score_breakdown.certifications || 5)) / 4;
    db.prepare('INSERT INTO evaluations (id, candidate_id, job_id, qualification, skills_match_score, experience_score, education_score, overall_score, explanation, full_response, is_mock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(eid, cid, jobIds[i], result.qualification, result.score_breakdown.skills_match, result.score_breakdown.experience, result.score_breakdown.education, overall, result.explanation, JSON.stringify(result), result.is_mock ? 1 : 0);
    console.log(`    → ${result.qualification} (${overall.toFixed(1)}/10)`);
  }

  console.log('\n✅ Seed complete!\n');
}

seed().catch(console.error);
