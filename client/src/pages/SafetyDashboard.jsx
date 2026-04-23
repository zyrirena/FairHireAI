import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function SafetyDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ riskLevel: '', allowed: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const s = await api.getSafetyStats();
      setStats(s);
      const l = await api.getSafetyLogs(filters);
      setLogs(l);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const riskColors = {
    low: 'var(--green)',
    medium: 'var(--yellow)',
    high: 'var(--red)',
  };

  return (
    <div>
      <div className="page-header">
        <h2>AI Safety Dashboard</h2>
        <p>Monitor AI response safety, hallucination risk, and Fiddler guardrail effectiveness.</p>
      </div>

      {/* Stats Cards */}
      {stats && !loading && (
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total Responses</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Blocked (High Risk)</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>{stats.blocked}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Allowed Rate</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.allowedPercentage}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Confidence</div>
            <div className="stat-value">{stats.averageScore}</div>
          </div>
        </div>
      )}

      {/* Risk Distribution */}
      {stats && stats.byRiskLevel && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>Risk Distribution</h3></div>
          <div className="grid-3">
            {stats.byRiskLevel.map(r => (
              <div key={r.level} style={{
                padding: 16,
                background: `${riskColors[r.level]}11`,
                borderLeft: `4px solid ${riskColors[r.level]}`,
                borderRadius: 'var(--radius-sm)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: riskColors[r.level], textTransform: 'uppercase' }}>
                  {r.level}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: riskColors[r.level] }}>
                  {r.count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="card">
        <div className="card-header">
          <h3>Recent Safety Checks ({logs.length})</h3>
          <button className="btn btn-secondary" onClick={loadData}>Refresh</button>
        </div>

        <div className="grid-2" style={{ marginBottom: 12, padding: '0 16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Filter by Risk Level</label>
            <select
              value={filters.riskLevel}
              onChange={e => setFilters(p => ({ ...p, riskLevel: e.target.value }))}
              style={{ fontSize: 12 }}
            >
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 11 }}>Filter by Status</label>
            <select
              value={filters.allowed}
              onChange={e => setFilters(p => ({ ...p, allowed: e.target.value }))}
              style={{ fontSize: 12 }}
            >
              <option value="">All</option>
              <option value="1">Allowed</option>
              <option value="0">Blocked</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🛡️</div>
            <h3>No safety checks yet</h3>
            <p>Safety checks will appear here as AI evaluations run.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Confidence</th>
                  <th>Risk Level</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Context</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 11, fontWeight: 600 }}>{log.user_id?.substring(0, 20)}</td>
                    <td style={{ fontSize: 10 }}>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: 2,
                        background: 'var(--bg-input)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {log.confidence}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        background: `${riskColors[log.risk_level]}22`,
                        color: riskColors[log.risk_level],
                      }}>
                        {log.risk_level?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {(log.score * 100).toFixed(0)}%
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        background: log.allowed ? 'var(--green-soft)' : 'var(--red-soft)',
                        color: log.allowed ? 'var(--green)' : 'var(--red)',
                      }}>
                        {log.allowed ? '✓ Allowed' : '✗ Blocked'}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.context?.substring(0, 50) || '—'}
                    </td>
                    <td style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div style={{ marginTop: 16, padding: 12, background: 'var(--info-soft)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--info)' }}>Fiddler AI Integration:</strong> Every AI-generated evaluation is checked for hallucinations and safety issues. Scores below 0.4 (40%) are automatically blocked. Scores 0.4-0.7 (40-70%) are flagged for review. Scores above 0.7 (70%) are allowed.
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
