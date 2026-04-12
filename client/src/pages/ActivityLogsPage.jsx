import React, { useState, useEffect } from 'react';
import { api } from '../api';

function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user_id: '', action: '', date_from: '', date_to: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
    loadLogs();
  }, []);

  const loadLogs = (f) => {
    setLoading(true);
    const params = f || filters;
    const clean = {};
    for (const [k, v] of Object.entries(params)) { if (v) clean[k] = v; }
    api.getActivityLogs(clean).then(setLogs).catch(console.error).finally(() => setLoading(false));
  };

  const handleFilter = () => loadLogs();

  const handleExport = async () => {
    try {
      const data = await api.exportActivityLogs(filters);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `activity_logs_${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      setToast({ msg: 'Activity logs exported', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ msg: err.message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const actionColor = (action) => {
    if (action?.includes('LOGIN')) return 'var(--green)';
    if (action?.includes('UPLOAD')) return 'var(--accent)';
    if (action?.includes('DELETE')) return 'var(--red)';
    if (action?.includes('OVERRIDE')) return 'var(--orange)';
    if (action?.includes('EVALUATION')) return 'var(--accent)';
    return 'var(--text-secondary)';
  };

  return (
    <div>
      <div className="page-header">
        <h2>User Activity Logs</h2>
        <p>Track all user actions across the system. Admin only.</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: '160px' }}>
            <label>User</label>
            <select value={filters.user_id} onChange={e => setFilters(p => ({...p, user_id: e.target.value}))}>
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.role})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: '140px' }}>
            <label>Action</label>
            <input value={filters.action} onChange={e => setFilters(p => ({...p, action: e.target.value}))} placeholder="e.g. LOGIN" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From</label>
            <input type="date" value={filters.date_from} onChange={e => setFilters(p => ({...p, date_from: e.target.value}))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To</label>
            <input type="date" value={filters.date_to} onChange={e => setFilters(p => ({...p, date_to: e.target.value}))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleFilter} style={{ height: '38px' }}>Filter</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} style={{ height: '38px' }}>Export JSON</button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="card-header">
          <h3>Activity Trail ({logs.length} entries)</h3>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
        ) : logs.length === 0 ? (
          <div className="empty-state"><div className="icon">📝</div><h3>No activity logs</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Role</th><th>Action</th><th>Details</th><th>Time</th></tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  let meta = {};
                  try { meta = JSON.parse(log.metadata || '{}'); } catch {}
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{log.user_email || '—'}</td>
                      <td><span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: log.role === 'ADMIN' ? 'var(--accent-soft)' : 'var(--green-soft)', color: log.role === 'ADMIN' ? 'var(--accent)' : 'var(--green)', fontWeight: 600 }}>{log.role}</span></td>
                      <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: 'var(--bg-input)', color: actionColor(log.action) }}>{log.action}</span></td>
                      <td style={{ fontSize: '11px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{Object.entries(meta).map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')}</td>
                      <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
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

export default ActivityLogsPage;
