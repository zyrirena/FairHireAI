import React, { useState, useEffect } from 'react';
import { api } from '../api';

function UsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    setLoading(true);
    api.getUsage().then(setData).catch(console.error).finally(() => setLoading(false));
  };

  const handleReset = async () => {
    if (!confirm('Reset usage for the current month? This cannot be undone.')) return;
    try {
      await api.resetUsage();
      setToast({ msg: 'Monthly usage reset', type: 'success' });
      loadData();
    } catch (err) { setToast({ msg: err.message, type: 'error' }); }
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>;

  const budget = data?.budget || {};
  const history = data?.history || [];
  const pct = budget.limit > 0 ? (budget.current_cost / budget.limit) * 100 : 0;
  const barColor = pct >= 90 ? 'var(--red)' : pct >= 60 ? 'var(--yellow)' : 'var(--green)';

  return (
    <div>
      <div className="page-header">
        <h2>AI Usage & Cost Control</h2>
        <p>Monitor Anthropic API usage and enforce monthly spending limits. Admin only.</p>
      </div>

      {/* Budget Overview */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <h3>Current Month: {budget.month}</h3>
          <button className="btn btn-danger btn-sm" onClick={handleReset}>Reset Usage</button>
        </div>

        <div className="grid-4" style={{ marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-label">Spent</div>
            <div className="stat-value" style={{ color: pct >= 90 ? 'var(--red)' : 'var(--text-primary)' }}>${(budget.current_cost || 0).toFixed(4)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Limit</div>
            <div className="stat-value">${(budget.limit || 5).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Remaining</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>${(budget.remaining || 0).toFixed(4)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">API Calls</div>
            <div className="stat-value">{budget.request_count || 0}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>Budget used</span>
            <span>{Math.min(pct, 100).toFixed(1)}%</span>
          </div>
          <div style={{ height: '10px', background: 'var(--bg-input)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: '5px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {!budget.allowed && (
          <div style={{ padding: '12px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', fontSize: '13px', border: '1px solid var(--red)' }}>
            AI usage limit reached for this month. All new evaluations will use mock mode. Reset usage or wait for next month.
          </div>
        )}

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>
          Total tokens used: {(budget.total_tokens || 0).toLocaleString()} · Pricing: $0.25/1M input, $1.25/1M output (claude-3-haiku)
        </div>
      </div>

      {/* Usage History */}
      <div className="card">
        <h3 style={{ fontSize: '15px', marginBottom: '16px' }}>Monthly History</h3>
        {history.length === 0 ? (
          <div className="empty-state"><h3>No usage data</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th>Requests</th><th>Input Tokens</th><th>Output Tokens</th><th>Total Tokens</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.month}>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{h.month}</td>
                    <td>{h.request_count}</td>
                    <td>{(h.input_tokens || 0).toLocaleString()}</td>
                    <td>{(h.output_tokens || 0).toLocaleString()}</td>
                    <td>{(h.total_tokens || 0).toLocaleString()}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${(h.estimated_cost || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

export default UsagePage;
