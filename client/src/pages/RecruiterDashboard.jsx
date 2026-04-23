import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../components/AuthContext';

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => { 
    loadJobs(); 
    loadCandidates();
  }, []);

  const loadJobs = async () => {
    try { 
      const data = await api.getJobs();
      setJobs(data); 
      if (data.length > 0) setSelectedJob(data[0].id);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const loadCandidates = async () => {
    setLoading(true);
    try { 
      const data = await api.getCandidates();
      setCandidates(data); 
    } catch (err) { 
      showToast(err.message, 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Filter candidates by selected job
  const jobCandidates = candidates.filter(c => c.job_id === selectedJob);

  // Safety indicator badge
  const SafetyBadge = ({ safetyCheck }) => {
    if (!safetyCheck) return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>;
    
    const colors = {
      low: 'var(--green)',
      medium: 'var(--yellow)',
      high: 'var(--red)',
    };
    
    return (
      <div style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        background: `${colors[safetyCheck.riskLevel]}22`,
        color: colors[safetyCheck.riskLevel],
      }}>
        {safetyCheck.riskLevel === 'low' && '✓ Safe'}
        {safetyCheck.riskLevel === 'medium' && '⚠ Flag'}
        {safetyCheck.riskLevel === 'high' && '✗ Blocked'}
        {' '}({(safetyCheck.score * 100).toFixed(0)}%)
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h2>Recruiter Dashboard</h2>
        <p>Screen resumes using AI-powered evaluation with real-time safety checks.</p>
      </div>

      {/* Job Selection */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Select Job to Screen For</label>
          <select value={selectedJob || ''} onChange={e => setSelectedJob(e.target.value)}>
            <option value="">— Choose a job —</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="card">
        <div className="card-header">
          <h3>Candidates ({jobCandidates.length})</h3>
          <button className="btn btn-primary" onClick={loadCandidates}>Refresh</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : jobCandidates.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📋</div>
            <h3>No candidates</h3>
            <p>Upload resumes to this job to begin screening.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Qualification</th>
                  <th>Match Score</th>
                  <th>Skills</th>
                  <th>Experience</th>
                  <th>Safety Check</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {jobCandidates.map(c => {
                  const eval_result = c.evaluation || {};
                  const safety = eval_result.safety_check;
                  const blocked = eval_result.safety_blocked;

                  return (
                    <tr key={c.id} style={{ opacity: blocked ? 0.6 : 1 }}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: 200 }}>
                        {c.original_filename?.substring(0, 30)}
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: eval_result.qualification === 'Meets requirements' ? 'var(--green-soft)' : 
                                     eval_result.qualification === 'Partially meets requirements' ? 'var(--yellow-soft)' :
                                     'var(--red-soft)',
                          color: eval_result.qualification === 'Meets requirements' ? 'var(--green)' : 
                                eval_result.qualification === 'Partially meets requirements' ? 'var(--yellow)' :
                                'var(--red)',
                        }}>
                          {eval_result.qualification || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>
                        {eval_result.match_score_100 || '—'}/100
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {eval_result.score_breakdown?.skills_match?.toFixed(1) || '—'}/10
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {eval_result.score_breakdown?.experience?.toFixed(1) || '—'}/10
                      </td>
                      <td>
                        {blocked ? (
                          <div style={{ color: 'var(--red)', fontWeight: 600, fontSize: 10 }}>
                            ✗ BLOCKED
                          </div>
                        ) : (
                          <SafetyBadge safetyCheck={safety} />
                        )}
                      </td>
                      <td style={{ fontSize: 10 }}>
                        {safety?.confidence || eval_result.safety_blocked ? 'Safety Check' : 'Normal'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety Info */}
      <div style={{ marginTop: 16, padding: 12, background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--accent)' }}>Safety Checks:</strong> AI responses are evaluated for hallucinations using Fiddler AI. Green badges indicate high confidence. Yellow = review manually. Red = blocked due to safety concerns.
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
