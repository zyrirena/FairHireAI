import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../components/AuthContext';

const DEFAULT_WEIGHTS = { skills: 0.4, experience: 0.3, education: 0.1, certifications: 0.2 };

export default function JobManagementPage() {
  const { user, isAdmin } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [editing, setEditing] = useState(null); // null = list, 'new' = create, job object = edit
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function emptyForm() {
    return {
      title: '', description: '', department: '', requirements: '',
      min_education: '', min_experience_years: 0,
      required_skills: '', preferred_skills: '',
      scoring_weights: { ...DEFAULT_WEIGHTS },
    };
  }

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = () => {
    setLoading(true);
    api.getJobs().then(setJobs).catch(console.error).finally(() => setLoading(false));
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const startEdit = (job) => {
    let weights = DEFAULT_WEIGHTS;
    try { weights = typeof job.scoring_weights === 'string' ? JSON.parse(job.scoring_weights) : job.scoring_weights; } catch {}
    setForm({
      title: job.title, description: job.description, department: job.department || '',
      requirements: job.requirements || '', min_education: job.min_education || '',
      min_experience_years: job.min_experience_years || 0,
      required_skills: job.required_skills || '', preferred_skills: job.preferred_skills || '',
      scoring_weights: { ...DEFAULT_WEIGHTS, ...weights },
    });
    setEditing(job);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, scoring_weights: form.scoring_weights };
      if (editing === 'new') {
        await api.createJob(payload);
        showToast('Job profile created');
      } else {
        await api.updateJob(editing.id, payload);
        showToast('Job profile updated');
      }
      setEditing(null);
      setForm(emptyForm());
      loadJobs();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this job profile?')) return;
    try { await api.deleteJob(id); showToast('Job deleted'); loadJobs(); } catch (e) { showToast(e.message, 'error'); }
  };

  const updateWeight = (key, val) => {
    const num = parseFloat(val) || 0;
    setForm(p => ({ ...p, scoring_weights: { ...p.scoring_weights, [key]: Math.round(num * 100) / 100 } }));
  };

  const weightsSum = Object.values(form.scoring_weights).reduce((s, v) => s + v, 0);
  const weightsValid = Math.abs(weightsSum - 1.0) < 0.02;

  // Job list view
  if (!editing) {
    return (
      <div>
        <div className="page-header">
          <h2>Job Profiles</h2>
          <p>Create and manage job configurations with custom scoring criteria. Recruiters will screen resumes against these profiles.</p>
        </div>

        <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setEditing('new'); }} style={{ marginBottom: 16 }}>
          + Create Job Profile
        </button>

        <div className="card">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : jobs.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div><h3>No job profiles</h3><p>Create your first job profile to start screening resumes.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Dept</th><th>Required Skills</th><th>Min Exp</th><th>Weights</th><th>Actions</th></tr></thead>
                <tbody>
                  {jobs.map(j => {
                    let w = DEFAULT_WEIGHTS;
                    try { w = typeof j.scoring_weights === 'string' ? JSON.parse(j.scoring_weights) : j.scoring_weights || DEFAULT_WEIGHTS; } catch {}
                    const canEdit = isAdmin || j.created_by === user.id;
                    return (
                      <tr key={j.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{j.title}</td>
                        <td style={{ fontSize: 12 }}>{j.department || '—'}</td>
                        <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.required_skills || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{j.min_experience_years || 0}y</td>
                        <td style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                          S:{(w.skills*100).toFixed(0)} E:{(w.experience*100).toFixed(0)} Ed:{(w.education*100).toFixed(0)} C:{(w.certifications*100).toFixed(0)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => startEdit(j)}>Edit</button>}
                            {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(j.id)}>Delete</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    );
  }

  // Create / Edit form
  return (
    <div>
      <button className="btn btn-secondary" onClick={() => setEditing(null)} style={{ marginBottom: 16, fontSize: 12 }}>← Back to job list</button>

      <div className="card">
        <div className="card-header"><h3>{editing === 'new' ? 'Create Job Profile' : 'Edit Job Profile'}</h3></div>

        <form onSubmit={handleSave}>
          <div className="grid-2">
            <div className="form-group">
              <label>Job Title *</label>
              <input required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))} placeholder="e.g. Engineering" />
            </div>
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea required value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Full job description..." rows={4} />
          </div>

          <div className="form-group">
            <label>Requirements</label>
            <textarea value={form.requirements} onChange={e => setForm(p => ({...p, requirements: e.target.value}))} placeholder="Specific requirements, responsibilities..." rows={3} />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label>Required Skills (comma-separated) *</label>
              <input value={form.required_skills} onChange={e => setForm(p => ({...p, required_skills: e.target.value}))} placeholder="JavaScript, React, Node.js, AWS" />
            </div>
            <div className="form-group">
              <label>Preferred Skills (comma-separated, bonus)</label>
              <input value={form.preferred_skills} onChange={e => setForm(p => ({...p, preferred_skills: e.target.value}))} placeholder="Docker, Kubernetes, GraphQL" />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label>Minimum Education</label>
              <select value={form.min_education} onChange={e => setForm(p => ({...p, min_education: e.target.value}))}>
                <option value="">Not required</option>
                <option value="High School">High School</option>
                <option value="Associate's">Associate's</option>
                <option value="Bachelor's">Bachelor's</option>
                <option value="Master's">Master's</option>
                <option value="PhD">PhD</option>
              </select>
            </div>
            <div className="form-group">
              <label>Minimum Experience (years)</label>
              <input type="number" min="0" max="30" value={form.min_experience_years} onChange={e => setForm(p => ({...p, min_experience_years: parseInt(e.target.value) || 0}))} />
            </div>
          </div>

          {/* Scoring Weights */}
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Scoring Weights (must sum to 1.0)
            </div>
            <div className="grid-4">
              {Object.entries(form.scoring_weights).map(([key, val]) => (
                <div className="form-group" key={key} style={{ margin: 0 }}>
                  <label style={{ textTransform: 'capitalize' }}>{key} ({(val * 100).toFixed(0)}%)</label>
                  <input type="number" step="0.05" min="0" max="0.7" value={val} onChange={e => updateWeight(key, e.target.value)} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontFamily: 'var(--font-mono)', color: weightsValid ? 'var(--green)' : 'var(--red)' }}>
              Total: {weightsSum.toFixed(2)} {weightsValid ? '✓' : '(must equal 1.00)'}
            </div>
          </div>

          {/* Compliance notice */}
          <div style={{ marginTop: 16, padding: 10, background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--accent)' }}>Compliance:</strong> Job descriptions are validated against discriminatory keyword lists (NYC LL144 / EU AI Act). Scoring weights are capped at 70% per criterion to prevent overfitting.
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !weightsValid}>
              {saving ? 'Saving...' : editing === 'new' ? 'Create Job Profile' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
