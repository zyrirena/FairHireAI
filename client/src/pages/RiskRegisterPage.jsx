import React, { useState, useEffect } from 'react';
import { api } from '../api';

const SEV_COLORS = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' };
const STATUS_COLORS = { open: 'var(--red)', monitoring: 'var(--yellow)', resolved: 'var(--green)' };

export default function RiskRegisterPage() {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ risk_name: '', description: '', severity: 'medium', likelihood: 'medium', mitigation_strategy: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => { load(); }, []);
  const load = () => { setLoading(true); api.getRisks().then(setRisks).catch(console.error).finally(() => setLoading(false)); };
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await api.createRisk(form); showToast('Risk registered'); setShowForm(false); setForm({ risk_name: '', description: '', severity: 'medium', likelihood: 'medium', mitigation_strategy: '' }); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  const handleStatusChange = async (id, status) => {
    try { await api.updateRisk(id, { status }); showToast(`Risk ${status}`); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };

  const open = risks.filter(r => r.status === 'open').length;
  const monitoring = risks.filter(r => r.status === 'monitoring').length;
  const resolved = risks.filter(r => r.status === 'resolved').length;

  return (
    <div>
      <div className="page-header">
        <h2>Risk Register</h2>
        <p>EU AI Act Article 9 — Risk management system for high-risk AI. Track, mitigate, and resolve identified risks.</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">Open Risks</div><div className="stat-value" style={{ color: 'var(--red)' }}>{open}</div></div>
        <div className="stat-card"><div className="stat-label">Monitoring</div><div className="stat-value" style={{ color: 'var(--yellow)' }}>{monitoring}</div></div>
        <div className="stat-card"><div className="stat-label">Resolved</div><div className="stat-value" style={{ color: 'var(--green)' }}>{resolved}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>All Risks ({risks.length})</h3>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Risk</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : risks.length === 0 ? (
          <div className="empty-state"><div className="icon">🛡️</div><h3>No risks registered</h3><p>Run the seed script to populate default risks.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Risk</th><th>Severity</th><th>Likelihood</th><th>Status</th><th>Mitigation</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {risks.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{r.risk_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 250 }}>{r.description?.substring(0, 100)}</div>
                    </td>
                    <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: `${SEV_COLORS[r.severity]}22`, color: SEV_COLORS[r.severity] }}>{r.severity?.toUpperCase()}</span></td>
                    <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: `${SEV_COLORS[r.likelihood]}22`, color: SEV_COLORS[r.likelihood] }}>{r.likelihood?.toUpperCase()}</span></td>
                    <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600, background: `${STATUS_COLORS[r.status]}22`, color: STATUS_COLORS[r.status] }}>{r.status?.toUpperCase()}</span></td>
                    <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.mitigation_strategy}</td>
                    <td style={{ fontSize: 11 }}>{r.identified_at ? new Date(r.identified_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {r.status !== 'monitoring' && <button className="btn btn-secondary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => handleStatusChange(r.id, 'monitoring')}>Monitor</button>}
                        {r.status !== 'resolved' && <button className="btn btn-primary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => handleStatusChange(r.id, 'resolved')}>Resolve</button>}
                        {r.status === 'resolved' && <button className="btn btn-secondary btn-sm" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => handleStatusChange(r.id, 'open')}>Reopen</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Risk Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Register New Risk</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label>Risk Name *</label><input required value={form.risk_name} onChange={e => setForm(p => ({...p, risk_name: e.target.value}))} placeholder="e.g. Bias in keyword matching" /></div>
              <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Detailed risk description..." rows={3} /></div>
              <div className="grid-2">
                <div className="form-group"><label>Severity</label><select value={form.severity} onChange={e => setForm(p => ({...p, severity: e.target.value}))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
                <div className="form-group"><label>Likelihood</label><select value={form.likelihood} onChange={e => setForm(p => ({...p, likelihood: e.target.value}))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
              </div>
              <div className="form-group"><label>Mitigation Strategy</label><textarea value={form.mitigation_strategy} onChange={e => setForm(p => ({...p, mitigation_strategy: e.target.value}))} placeholder="How will this risk be mitigated?" rows={2} /></div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Register Risk</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ padding: 12, background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--accent)' }}>EU AI Act Article 9:</strong> High-risk AI systems require a risk management system established, documented, and maintained throughout the lifecycle. This register tracks identified risks, their severity, and mitigation measures.
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
