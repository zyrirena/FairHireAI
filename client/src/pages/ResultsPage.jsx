import React, { useState, useEffect } from 'react';
import { api } from '../api';

function ResultsPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEvaluations().then(setEvaluations).catch(console.error).finally(() => setLoading(false));
  }, []);

  const viewDetail = async (id) => {
    try {
      const data = await api.getEvaluation(id);
      setDetail(data);
      setSelected(id);
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusClass = (q) => {
    if (!q) return '';
    if (q.includes('Meets') && !q.includes('Partially')) return 'status-meets';
    if (q.includes('Partially')) return 'status-partial';
    return 'status-not';
  };

  return (
    <div>
      <div className="page-header">
        <h2>Candidate Results</h2>
        <p>Detailed view of all candidate evaluations with full transparency into scoring.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
      ) : evaluations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">📄</div>
            <h3>No results yet</h3>
            <p>Upload and evaluate some resumes first.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {evaluations.map(ev => (
            <div
              key={ev.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'border-color 0.15s', borderColor: selected === ev.id ? 'var(--accent)' : undefined }}
              onClick={() => viewDetail(ev.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {ev.original_filename || 'Candidate'}
                    {ev.is_mock ? <span style={{ fontSize: '10px', color: 'var(--yellow)', marginLeft: '8px' }}>(mock)</span> : null}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {ev.job_title} · {new Date(ev.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span className={`status-badge ${getStatusClass(ev.qualification)}`}>{ev.qualification}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700 }}>
                    {(ev.overall_score || 0).toFixed(1)}
                  </span>
                </div>
              </div>

              {selected === ev.id && detail && (
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }} onClick={e => e.stopPropagation()}>
                  <div className="ai-label" style={{ marginBottom: '16px' }}>AI-Assisted Recommendation</div>

                  <div className="grid-4" style={{ marginBottom: '16px' }}>
                    {[
                      { label: 'Skills Match', value: detail.skills_match_score },
                      { label: 'Experience', value: detail.experience_score },
                      { label: 'Education', value: detail.education_score },
                      { label: 'Overall', value: detail.overall_score },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{s.label}</div>
                        <ScoreBar value={s.value} />
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Explanation:</strong><br/>
                    {detail.explanation}
                  </div>

                  {detail.full_response && (() => {
                    try {
                      const full = JSON.parse(detail.full_response);
                      return (
                        <div className="grid-2" style={{ marginBottom: '12px' }}>
                          {full.matched_skills?.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Matched Skills</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {full.matched_skills.map(s => (
                                  <span key={s} style={{ padding: '2px 8px', background: 'var(--green-soft)', color: 'var(--green)', borderRadius: '4px', fontSize: '12px' }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {full.missing_skills?.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Missing Skills</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {full.missing_skills.map(s => (
                                  <span key={s} style={{ padding: '2px 8px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: '4px', fontSize: '12px' }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } catch { return null; }
                  })()}

                  {detail.overrides?.length > 0 && (
                    <div style={{ padding: '12px', background: 'var(--orange-soft)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
                      <strong style={{ color: 'var(--orange)' }}>Recruiter Override:</strong><br/>
                      {detail.overrides.map(o => (
                        <div key={o.id} style={{ marginTop: '6px', color: 'var(--text-secondary)' }}>
                          Changed from "{o.original_qualification}" to "{o.new_qualification}"
                          {o.notes && <> — {o.notes}</>}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}> by {o.recruiter_name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.anonymized_text && (
                    <details style={{ marginTop: '12px' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--accent)' }}>View Anonymized Resume Text</summary>
                      <pre style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto' }}>
                        {detail.anonymized_text}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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

export default ResultsPage;
