import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

function UploadPage() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef();

  const [jobForm, setJobForm] = useState({
    title: '', description: '', requirements: '',
    min_education: '', min_experience_years: 0, required_skills: '',
  });

  useEffect(() => {
    api.getJobs().then(setJobs).catch(console.error);
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleUpload = async (files) => {
    if (!selectedJob) return showToast('Please select a job description first', 'error');
    if (!consent) return showToast('Please provide consent before uploading', 'error');

    setUploading(true);
    const newResults = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('resume', file);
        formData.append('consent', 'true');

        const uploadRes = await api.uploadResume(formData);
        showToast(`Uploaded: ${file.name} (${uploadRes.pii_items_removed} PII items removed via ${uploadRes.pii_engine === 'presidio' ? 'Presidio' : 'Regex'})`);

        // Auto-evaluate
        const evalRes = await api.evaluateCandidate(uploadRes.id, selectedJob);
        newResults.push({
          filename: file.name, candidateId: uploadRes.id,
          pii_engine: uploadRes.pii_engine,
          pii_items_removed: uploadRes.pii_items_removed,
          pii_entities_found: uploadRes.pii_entities_found,
          pii_removals: uploadRes.pii_removals,
          ...evalRes,
        });
      } catch (err) {
        showToast(`Failed: ${file.name} – ${err.message}`, 'error');
      }
    }

    setResults(prev => [...newResults, ...prev]);
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) handleUpload(Array.from(e.dataTransfer.files));
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      const job = await api.createJob(jobForm);
      setJobs(prev => [job, ...prev]);
      setSelectedJob(job.id);
      setShowJobForm(false);
      setJobForm({ title: '', description: '', requirements: '', min_education: '', min_experience_years: 0, required_skills: '' });
      showToast('Job description created');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const getStatusClass = (qualification) => {
    if (!qualification) return '';
    if (qualification.includes('Meets')) return 'status-meets';
    if (qualification.includes('Partially')) return 'status-partial';
    return 'status-not';
  };

  return (
    <div>
      <div className="page-header">
        <h2>Upload & Screen Resumes</h2>
        <p>Upload resumes to screen against a job description. PII is automatically removed before AI evaluation.</p>
      </div>

      {/* Job Selection */}
      <div className="card">
        <div className="card-header">
          <h3>1. Select Job Description</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowJobForm(true)}>+ New Job</button>
        </div>
        <div className="form-group">
          <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)}>
            <option value="">-- Select a job --</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
        {selectedJob && jobs.find(j => j.id === selectedJob) && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <strong>Required Skills:</strong> {jobs.find(j => j.id === selectedJob)?.required_skills || 'N/A'}
            <br/>
            <strong>Min Experience:</strong> {jobs.find(j => j.id === selectedJob)?.min_experience_years || 0} years
            <br/>
            <strong>Min Education:</strong> {jobs.find(j => j.id === selectedJob)?.min_education || 'N/A'}
          </div>
        )}
      </div>

      {/* Consent */}
      <div className="card">
        <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>2. Provide Consent</h3>
        <div className="consent-box">
          <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <label htmlFor="consent">
            I confirm that I have obtained the candidate's consent to process their resume data. The data will be anonymized (PII removed) before AI screening and stored for a maximum of {120} days. Candidates can request deletion at any time.
          </label>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="card">
        <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>3. Upload Resumes</h3>
        <div
          className={`upload-zone ${dragActive ? 'active' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
              <p>Uploading & screening...</p>
            </>
          ) : (
            <>
              <div className="icon">📄</div>
              <p>Drop PDF, DOCX, or TXT files here, or click to browse</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Max 10MB per file</p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt"
          multiple
          style={{ display: 'none' }}
          onChange={e => handleUpload(Array.from(e.target.files))}
        />
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Screening Results</h3>
            <span className="ai-label">AI-Assisted Recommendation</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Qualification</th>
                  <th>Skills</th>
                  <th>Experience</th>
                  <th>Education</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const sb = r.score_breakdown || {};
                  const overall = ((sb.skills_match || 0) + (sb.experience || 0) + (sb.education || 0)) / 3;
                  return (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.filename}</td>
                      <td><span className={`status-badge ${getStatusClass(r.qualification)}`}>{r.qualification}</span></td>
                      <td><ScoreBar value={sb.skills_match} /></td>
                      <td><ScoreBar value={sb.experience} /></td>
                      <td><ScoreBar value={sb.education} /></td>
                      <td><ScoreBar value={overall} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {results[0]?.explanation && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Latest Explanation:</strong><br/>
              {results[0].explanation}
            </div>
          )}

          {/* PII Scrubbing Details */}
          {results[0]?.pii_engine && (
            <div style={{ marginTop: '12px', padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={results[0].pii_engine === 'presidio' ? 'var(--green)' : 'var(--yellow)'} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>PII Scrubbing Report</strong>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                  background: results[0].pii_engine === 'presidio' ? 'var(--green-soft)' : 'var(--yellow-soft)',
                  color: results[0].pii_engine === 'presidio' ? 'var(--green)' : 'var(--yellow)',
                }}>
                  {results[0].pii_engine === 'presidio' ? 'Microsoft Presidio' : 'Regex Fallback'}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {results[0].pii_items_removed || 0} PII item(s) detected and removed
              </div>

              {results[0].pii_entities_found?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                  {results[0].pii_entities_found.map(entity => (
                    <span key={entity} style={{
                      fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '2px 8px',
                      borderRadius: '4px', background: 'var(--accent-soft)', color: 'var(--accent)',
                    }}>
                      {entity}
                    </span>
                  ))}
                </div>
              )}

              {results[0].pii_removals?.length > 0 && (
                <details style={{ fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>View all {results[0].pii_removals.length} detections</summary>
                  <div style={{ marginTop: '8px', maxHeight: '150px', overflow: 'auto' }}>
                    {results[0].pii_removals.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', padding: '3px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', minWidth: '120px', color: 'var(--accent)' }}>{r.type}</span>
                        <span style={{ fontSize: '11px' }}>confidence: {(r.score || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {results[0].pii_engine !== 'presidio' && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--yellow)', fontStyle: 'italic' }}>
                  Tip: Install Microsoft Presidio for more accurate PII detection (NLP-based name, address, and entity recognition)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Job Modal */}
      {showJobForm && (
        <div className="modal-overlay" onClick={() => setShowJobForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create Job Description</h3>
            <form onSubmit={handleCreateJob}>
              <div className="form-group">
                <label>Job Title *</label>
                <input required value={jobForm.title} onChange={e => setJobForm(p => ({...p, title: e.target.value}))} placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea required value={jobForm.description} onChange={e => setJobForm(p => ({...p, description: e.target.value}))} placeholder="Full job description..." />
              </div>
              <div className="form-group">
                <label>Requirements</label>
                <textarea value={jobForm.requirements} onChange={e => setJobForm(p => ({...p, requirements: e.target.value}))} placeholder="Specific requirements..." />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label>Min Education</label>
                  <input value={jobForm.min_education} onChange={e => setJobForm(p => ({...p, min_education: e.target.value}))} placeholder="e.g. Bachelor's" />
                </div>
                <div className="form-group">
                  <label>Min Experience (years)</label>
                  <input type="number" min="0" value={jobForm.min_experience_years} onChange={e => setJobForm(p => ({...p, min_experience_years: parseInt(e.target.value) || 0}))} />
                </div>
              </div>
              <div className="form-group">
                <label>Required Skills (comma-separated)</label>
                <input value={jobForm.required_skills} onChange={e => setJobForm(p => ({...p, required_skills: e.target.value}))} placeholder="e.g. JavaScript, React, Node.js" />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowJobForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

function ScoreBar({ value }) {
  const v = Number(value) || 0;
  const cls = v >= 7 ? 'high' : v >= 5 ? 'mid' : 'low';
  return (
    <div className="score-bar-container">
      <div className="score-bar">
        <div className={`score-bar-fill ${cls}`} style={{ width: `${v * 10}%` }} />
      </div>
      <span className="score-value">{v.toFixed(1)}</span>
    </div>
  );
}

export default UploadPage;
