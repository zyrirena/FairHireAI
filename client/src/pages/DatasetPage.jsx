import React, { useState, useEffect } from 'react';
import { api } from '../api';

function DatasetPage() {
  const [data, setData] = useState({ records: [], total: 0, categories: [] });
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  useEffect(() => {
    loadData();
  }, [category, page]);

  const loadData = () => {
    setLoading(true);
    api.getDatasetRecords(LIMIT, page * LIMIT, category)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const totalPages = Math.ceil(data.total / LIMIT);

  return (
    <div>
      <div className="page-header">
        <h2>Dataset Viewer</h2>
        <p>Browse the resume dataset used for bias testing and demo data. Source: Kaggle.</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: '200px' }}>
            <label>Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}>
              <option value="">All Categories</option>
              {data.categories.map(c => (
                <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '20px' }}>
            {data.total} records total · Page {page + 1} of {Math.max(totalPages, 1)}
          </div>
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
      ) : data.records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📊</div>
            <h3>No dataset records</h3>
            <p>Run "npm run seed" to load sample data, or configure Kaggle credentials for full dataset.</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '10px' }}>
            {data.records.map(rec => (
              <div key={rec.id} className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{
                    padding: '3px 10px',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {rec.category}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    #{rec.id}
                  </span>
                </div>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  maxHeight: '120px',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  {rec.resume_text}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '40px',
                    background: 'linear-gradient(transparent, var(--bg-card))',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {page + 1} / {Math.max(totalPages, 1)}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </>
      )}
    </div>
  );
}

export default DatasetPage;
