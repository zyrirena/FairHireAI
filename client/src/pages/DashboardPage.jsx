import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../components/AuthContext';

function DashboardPage() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ new_qualification: '', notes: '', recruiter_name: '' });
  const [reportJobId, setReportJobId] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [certJobId, setCertJobId] = useState('');
  const [certNotes, setCertNotes] = useState('');
  const [certStatus, setCertStatus] = useState(null);
  const [certifying, setCertifying] = useState(false);
  const [generatingCertReport, setGeneratingCertReport] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([api.getEvaluations(), api.getJobs()])
      .then(([evals, j]) => { setEvaluations(evals); setJobs(j); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleOverride = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      await api.overrideEvaluation(selected.id, overrideForm);
      showToast('Override saved successfully');
      setSelected(null);
      setOverrideForm({ new_qualification: '', notes: '', recruiter_name: '' });
      loadData();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDelete = async (candidateId) => {
    if (!confirm('Delete this candidate and all associated data?')) return;
    try {
      await api.deleteCandidate(candidateId);
      showToast('Candidate data deleted');
      loadData();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleGenerateReport = async () => {
    if (!reportJobId) return showToast('Select a job description first', 'error');
    setGeneratingReport(true);
    try {
      await api.downloadHiringReportPDF(reportJobId);
      showToast('Hiring manager report downloaded');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setGeneratingReport(false); }
  };

  // Certification
  const loadCertStatus = async (jobId) => {
    if (!jobId) { setCertStatus(null); return; }
    try {
      const status = await api.getCertification(jobId);
      setCertStatus(status);
    } catch { setCertStatus(null); }
  };

  useEffect(() => { if (certJobId) loadCertStatus(certJobId); }, [certJobId]);

  const handleCertify = async () => {
    if (!certJobId) return;
    setCertifying(true);
    try {
      await api.certifyJob(certJobId, certNotes);
      showToast('All resumes certified as reviewed');
      setShowCertModal(false);
      setCertNotes('');
      loadCertStatus(certJobId);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setCertifying(false); }
  };

  const handleCertifiedReport = async () => {
    if (!certJobId) return;
    setGeneratingCertReport(true);
    try {
      await api.downloadCertifiedReportPDF(certJobId);
      showToast('Certified report downloaded');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setGeneratingCertReport(false); }
  };

  const getStatusClass = (q) => {
    if (!q) return '';
    if (q.includes('Meets') && !q.includes('Partially')) return 'status-meets';
    if (q.includes('Partially')) return 'status-partial';
    return 'status-not';
  };

  const total = evaluations.length;
  const meets = evaluations.filter(e => e.qualification === 'Meets requirements').length;
  const partial = evaluations.filter(e => e.qualification === 'Partially meets requirements').length;
  const notMeet = evaluations.filter(e => e.qualification === 'Does not meet requirements').length;
  const jobsWithEvals = jobs.filter(j => evaluations.some(e => e.job_id === j.id));

  return (
    <div>
      <div className="page-header">
        <h2>Recruiter Dashboard</h2>
        <p>Review candidates, certify reviews, and generate reports for hiring managers.</p>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <div className="stat-card"><div className="stat-label">Total Screened</div><div className="stat-value">{total}</div></div>
        <div className="stat-card"><div className="stat-label">Meets Requirements</div><div className="stat-value" style={{ color: 'var(--green)' }}>{meets}</div></div>
        <div className="stat-card"><div className="stat-label">Partial Match</div><div className="stat-value" style={{ color: 'var(--yellow)' }}>{partial}</div></div>
        <div className="stat-card"><div className="stat-label">Does Not Meet</div><div className="stat-value" style={{ color: 'var(--red)' }}>{notMeet}</div></div>
      </div>

      {/* HR Certification & Certified Report */}
      {jobsWithEvals.length > 0 && (
        <div className="card" style={{ marginBottom: '16px', border: '1px solid var(--accent)', borderLeft: '4px solid var(--accent)' }}>
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              HR Specialist Certification
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Certify that all candidate resumes have been reviewed before generating the official report for the hiring manager.
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
              <label>Select position</label>
              <select value={certJobId} onChange={e => setCertJobId(e.target.value)}>
                <option value="">-- Choose a job --</option>
                {jobsWithEvals.map(j => {
                  const count = evaluations.filter(e => e.job_id === j.id).length;
                  return <option key={j.id} value={j.id}>{j.title} ({count} candidates)</option>;
                })}
              </select>
            </div>

            {certJobId && !certStatus?.certification && (
              <button className="btn btn-primary" onClick={() => setShowCertModal(true)} style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Certify All Reviewed
              </button>
            )}

            {certJobId && certStatus?.certification && (
              <button className="btn btn-primary" onClick={handleCertifiedReport} disabled={generatingCertReport} style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {generatingCertReport ? <><div className="spinner" style={{ width: 14, height: 14 }}></div> Generating...</> : (
                  <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Download Certified Report</>
                )}
              </button>
            )}
          </div>

          {/* Certification status */}
          {certJobId && certStatus?.certification && (
            <div style={{ marginTop: '14px', padding: '14px', background: 'var(--green-soft)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '14px' }}>Certified</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Certified by <strong style={{ color: 'var(--text-primary)' }}>{certStatus.certification.certified_by_name}</strong> ({certStatus.certification.certified_by_email})<br/>
                {certStatus.certification.candidates_reviewed} candidates reviewed · {new Date(certStatus.certification.certified_at).toLocaleString()}
                {certStatus.certification.notes && <><br/>Notes: {certStatus.certification.notes}</>}
              </div>
            </div>
          )}

          {certJobId && !certStatus?.certification && certStatus !== null && (
            <div style={{ marginTop: '14px', padding: '12px', background: 'var(--yellow-soft)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--yellow)', border: '1px solid var(--yellow)' }}>
              Not yet certified — review all {certStatus.total_candidates} candidate(s) and click "Certify All Reviewed" before generating the report.
            </div>
          )}
        </div>
      )}

      {/* Uncertified report (draft) */}
      {jobsWithEvals.length > 0 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header"><h3>Draft Report (Uncertified)</h3></div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Generate a draft PDF without certification. Use for internal review before certifying.
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
              <label>Select position</label>
              <select value={reportJobId} onChange={e => setReportJobId(e.target.value)}>
                <option value="">-- Choose a job --</option>
                {jobsWithEvals.map(j => {
                  const count = evaluations.filter(e => e.job_id === j.id).length;
                  return <option key={j.id} value={j.id}>{j.title} ({count} candidates)</option>;
                })}
              </select>
            </div>
            <button className="btn btn-secondary" onClick={handleGenerateReport} disabled={generatingReport || !reportJobId} style={{ height: '40px' }}>
              {generatingReport ? <><div className="spinner" style={{ width: 14, height: 14 }}></div> Generating...</> : 'Download Draft PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Evaluations Table */}
      <div className="card">
        <div className="card-header">
          <h3>All Evaluations</h3>
          <span className="ai-label">AI-Assisted Recommendations</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
        ) : evaluations.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div><h3>No evaluations yet</h3><p>Upload and screen some resumes to see results here.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Candidate</th><th>Job</th><th>Qualification</th><th>Score</th><th>Override</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {evaluations.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {ev.original_filename || 'Unknown'}
                      {ev.is_mock ? <span style={{ fontSize: '10px', color: 'var(--yellow)', marginLeft: '6px' }}>(mock)</span> : null}
                    </td>
                    <td>{ev.job_title || 'N/A'}</td>
                    <td><span className={`status-badge ${getStatusClass(ev.qualification)}`}>{ev.qualification}</span></td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{(ev.overall_score || 0).toFixed(1)}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/10</span></span></td>
                    <td>{ev.has_override > 0 ? <span style={{ color: 'var(--orange)', fontSize: '12px', fontWeight: 600 }}>Overridden</span> : '—'}</td>
                    <td style={{ fontSize: '12px' }}>{new Date(ev.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(ev)}>Review</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ev.candidate_id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certification Modal */}
      {showCertModal && (
        <div className="modal-overlay" onClick={() => setShowCertModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              Certify Resume Review
            </h3>
            <div style={{ margin: '16px 0', padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>You are certifying that:</strong><br/>
              • All {certStatus?.total_candidates || 0} candidate resume(s) for <strong style={{ color: 'var(--text-primary)' }}>{jobs.find(j => j.id === certJobId)?.title}</strong> have been reviewed<br/>
              • All AI-assisted recommendations have been examined<br/>
              • Evaluations are based on job-related criteria only<br/>
              • This report is approved for submission to the hiring manager
            </div>
            <div style={{ margin: '16px 0', padding: '12px', background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              Certifying as: <strong>{user.display_name || user.email}</strong> ({user.email})
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea value={certNotes} onChange={e => setCertNotes(e.target.value)} placeholder="Any additional notes for the certification record..." rows={3} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCertModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCertify} disabled={certifying}>
                {certifying ? <><div className="spinner" style={{ width: 14, height: 14 }}></div> Certifying...</> : 'Certify & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Review & Override</h3>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>File:</strong> {selected.original_filename}<br/>
                <strong>Job:</strong> {selected.job_title}<br/>
                <strong>AI Qualification:</strong> <span className={`status-badge ${getStatusClass(selected.qualification)}`}>{selected.qualification}</span>
              </div>
              <div className="grid-3" style={{ marginTop: '12px' }}>
                <div className="stat-card"><div className="stat-label">Skills</div><div className="stat-value" style={{ fontSize: '20px' }}>{(selected.skills_match_score || 0).toFixed(1)}</div></div>
                <div className="stat-card"><div className="stat-label">Experience</div><div className="stat-value" style={{ fontSize: '20px' }}>{(selected.experience_score || 0).toFixed(1)}</div></div>
                <div className="stat-card"><div className="stat-label">Education</div><div className="stat-value" style={{ fontSize: '20px' }}>{(selected.education_score || 0).toFixed(1)}</div></div>
              </div>
              {selected.explanation && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>AI Explanation:</strong><br/>{selected.explanation}
                </div>
              )}
            </div>
            <form onSubmit={handleOverride}>
              <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--orange)' }}>Override Decision</h4>
              <div className="form-group">
                <label>New Qualification</label>
                <select required value={overrideForm.new_qualification} onChange={e => setOverrideForm(p => ({...p, new_qualification: e.target.value}))}>
                  <option value="">-- Select --</option>
                  <option value="Meets requirements">Meets requirements</option>
                  <option value="Partially meets requirements">Partially meets requirements</option>
                  <option value="Does not meet requirements">Does not meet requirements</option>
                </select>
              </div>
              <div className="form-group"><label>Recruiter Notes</label><textarea value={overrideForm.notes} onChange={e => setOverrideForm(p => ({...p, notes: e.target.value}))} placeholder="Reason for override..." /></div>
              <div className="form-group"><label>Your Name</label><input value={overrideForm.recruiter_name} onChange={e => setOverrideForm(p => ({...p, recruiter_name: e.target.value}))} placeholder="Recruiter name" /></div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
                <button type="submit" className="btn btn-primary">Save Override</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

export default DashboardPage;
