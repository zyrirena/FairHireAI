import React, { useState, useEffect } from 'react';
import { api } from '../api';

// ── Score / ratio color helpers ──
const ratioColor = (v) => {
  if (v === null || v === undefined) return 'var(--text-muted)';
  if (v >= 0.9) return 'var(--green)';
  if (v >= 0.8) return 'var(--yellow)';
  return 'var(--red)';
};
const pctColor = (v) => {
  if (v === null || v === undefined) return 'var(--text-muted)';
  if (v <= 0.05) return 'var(--green)';
  if (v <= 0.15) return 'var(--yellow)';
  return 'var(--red)';
};
const PassBadge = ({ passes, label }) => (
  <span className={`status-badge ${passes ? 'status-meets' : 'status-not'}`}>
    {passes ? '✓ ' : '✗ '}{label || (passes ? 'PASS' : 'FAIL')}
  </span>
);

// ── Mini horizontal bar ──
function RatioBar({ value, max = 1 }) {
  const pct = Math.min((value ?? 0) / max, 1) * 100;
  const col = value >= 0.9 ? 'var(--green)' : value >= 0.8 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3, transition: 'width .5s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 42, color: col }}>
        {(value ?? 0).toFixed(3)}
      </span>
    </div>
  );
}

export default function FairnessPage() {
  const [status, setStatus] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [liveAnalysis, setLiveAnalysis] = useState(null);
  const [tab, setTab] = useState('bias');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getFairlearnStatus().then(setStatus).catch(() => setStatus({ available: false }));
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadBiasAnalysis = async () => {
    setLoading(true);
    try {
      const r = await api.getFairlearnBiasAnalysis();
      setAnalysis(r);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const loadLiveAnalysis = async () => {
    setLoading(true);
    try {
      const r = await api.getFairlearnLiveAnalysis();
      setLiveAnalysis(r);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Fairlearn Fairness Analysis</h2>
        <p>Microsoft Fairlearn metrics — demographic parity, equalized odds, selection rates, and EEOC four-fifths rule across all test groups.</p>
      </div>

      {/* Status bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: status?.available ? 'var(--green)' : 'var(--yellow)',
          flexShrink: 0,
        }} />
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Fairlearn: {status?.available ? 'Active' : 'Not installed'}
          </span>
          {!status?.available && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              pip install fairlearn scikit-learn
            </span>
          )}
        </div>
        {!status?.available && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--yellow)', background: 'var(--yellow-soft)', padding: '4px 10px', borderRadius: 4 }}>
            Fallback metrics active
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'bias' ? 'active' : ''}`} onClick={() => setTab('bias')}>Bias Test Analysis</button>
        <button className={`tab ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}>Live Evaluation Analysis</button>
        <button className={`tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>Metrics Guide</button>
      </div>

      {/* ── Bias Test Analysis ── */}
      {tab === 'bias' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Fairlearn Analysis of Bias Test Results</h3>
              <button className="btn btn-primary" onClick={loadBiasAnalysis} disabled={loading}>
                {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Running...</> : 'Run Fairlearn Analysis'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Applies Fairlearn metrics to your stored bias test results. Requires at least one bias test to have been run.
            </p>
          </div>

          {analysis?.error && (
            <div className="card" style={{ color: 'var(--red)', fontSize: 13 }}>{analysis.error}</div>
          )}

          {analysis && !analysis.error && analysis.analyses?.map((a, i) => (
            <AnalysisCard key={i} analysis={a} />
          ))}

          {analysis && !analysis.error && (
            <div className="card" style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PassBadge passes={analysis.summary?.all_passed} label={analysis.summary?.all_passed ? 'All tests passed' : 'Some tests failed'} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{analysis.summary?.total_tests} test(s) analyzed</span>
                {analysis.fairlearn_available === false && (
                  <span style={{ fontSize: 11, color: 'var(--yellow)', marginLeft: 'auto' }}>Using fallback metrics — install Fairlearn for full analysis</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Live Evaluation Analysis ── */}
      {tab === 'live' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Live Evaluation Fairness Analysis</h3>
              <button className="btn btn-primary" onClick={loadLiveAnalysis} disabled={loading}>
                {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Analyzing...</> : 'Analyze Live Evaluations'}
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Analyzes your actual evaluation database across job positions. Uses recruiter overrides as ground truth when available.
            </p>
          </div>

          {liveAnalysis?.error && (
            <div className="card" style={{ color: 'var(--red)', fontSize: 13 }}>{liveAnalysis.error}</div>
          )}

          {liveAnalysis && !liveAnalysis.error && (
            <>
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <div className="stat-card"><div className="stat-label">Evaluations</div><div className="stat-value">{liveAnalysis.total_evaluations}</div></div>
                <div className="stat-card"><div className="stat-label">Jobs Analyzed</div><div className="stat-value">{liveAnalysis.jobs_analyzed?.length || 0}</div></div>
                <div className="stat-card">
                  <div className="stat-label">DI Ratio</div>
                  <div className="stat-value" style={{ fontSize: 22, color: ratioColor(liveAnalysis.demographic_parity?.ratio) }}>
                    {(liveAnalysis.demographic_parity?.ratio ?? 0).toFixed(3)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">EEOC Status</div>
                  <div className="stat-value" style={{ fontSize: 16 }}>
                    <PassBadge passes={liveAnalysis.overall?.passes} />
                  </div>
                </div>
              </div>
              <AnalysisCard analysis={liveAnalysis} />
            </>
          )}
        </>
      )}

      {/* ── Metrics Guide ── */}
      {tab === 'about' && <MetricsGuide />}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

function AnalysisCard({ analysis }) {
  const dp = analysis.demographic_parity;
  const eo = analysis.equalized_odds;
  const eeoc = analysis.eeoc_four_fifths;
  const byGroup = analysis.by_group_metrics;
  const scores = analysis.score_distribution;
  const groups = analysis.groups || [];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>{analysis.test_name}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            n={analysis.sample_size} · {analysis.created_at ? new Date(analysis.created_at).toLocaleDateString() : ''}
          </div>
        </div>
        <PassBadge passes={analysis.overall?.passes} />
      </div>

      {/* Selection rates by group */}
      {Object.keys(analysis.group_selection_rates || {}).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent)', marginBottom: 8 }}>
            Selection Rates by Group
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
            {Object.entries(analysis.group_selection_rates).map(([grp, rate]) => (
              <div key={grp} style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{grp}</div>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: rate >= 0.5 ? 'var(--green)' : 'var(--yellow)' }}>
                  {(rate * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  n={analysis.group_counts?.[grp] || '?'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Key metrics */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Demographic Parity */}
        {dp && (
          <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: `1px solid ${dp.passes_80_rule ? 'var(--border)' : 'var(--red)'}` }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Demographic Parity</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Ratio (≥0.80 = pass)</div>
              <RatioBar value={dp.ratio} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Difference (≤0.10 preferred)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: pctColor(dp.difference) }}>{(dp.difference ?? 0).toFixed(4)}</div>
            </div>
            <PassBadge passes={dp.passes_80_rule} label={dp.passes_80_rule ? 'Passes 80% Rule' : 'Fails 80% Rule'} />
            {dp.interpretation && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{dp.interpretation}</div>}
          </div>
        )}

        {/* Equalized Odds */}
        {eo && (
          <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Equalized Odds</div>
            {eo.available ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Ratio (≥0.80 = pass)</div>
                  <RatioBar value={eo.ratio ?? 0} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Difference (≤0.10 preferred)</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: pctColor(eo.difference) }}>{(eo.difference ?? 0).toFixed(4)}</div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {eo.note || 'Requires ground truth labels (recruiter overrides) to compute.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* EEOC four-fifths per pair */}
      {eeoc && Object.keys(eeoc).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent)', marginBottom: 8 }}>
            EEOC Four-Fifths Rule — Group Pairs
          </div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr><th>Group 1</th><th>Group 2</th><th>Rate 1</th><th>Rate 2</th><th>DI Ratio</th><th>Status</th></tr>
              </thead>
              <tbody>
                {Object.entries(eeoc).map(([key, val]) => (
                  <tr key={key}>
                    <td style={{ fontSize: 12 }}>{val.group_1}</td>
                    <td style={{ fontSize: 12 }}>{val.group_2}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{(val.rate_1 * 100).toFixed(1)}%</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{(val.rate_2 * 100).toFixed(1)}%</td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: ratioColor(val.ratio) }}>{val.ratio.toFixed(4)}</span></td>
                    <td><PassBadge passes={val.passes} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Score distribution */}
      {scores && Object.keys(scores).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent)', marginBottom: 8 }}>
            Score Distribution by Group
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Group</th><th>Mean</th><th>Median</th><th>Std Dev</th><th>Min</th><th>Max</th></tr></thead>
              <tbody>
                {Object.entries(scores).map(([grp, s]) => (
                  <tr key={grp}>
                    <td style={{ fontSize: 12 }}>{grp}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{s.mean}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.median}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.std}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.min}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MetricsGuide() {
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 16 }}>Fairlearn Metrics Explained</h3>

      {[
        {
          name: 'Demographic Parity Ratio',
          formula: 'min(selection_rate per group) / max(selection_rate per group)',
          pass: '≥ 0.80 (EEOC four-fifths rule)',
          meaning: 'All groups should be selected (pass "Meets requirements") at roughly equal rates. A ratio of 1.0 means perfect equality. A ratio of 0.8 means the least-selected group is selected at least 80% as often as the most-selected group.',
          color: 'var(--green)',
        },
        {
          name: 'Demographic Parity Difference',
          formula: 'max(selection_rate) − min(selection_rate)',
          pass: '≤ 0.10 preferred',
          meaning: 'The raw percentage point gap between the highest and lowest selection rates across groups. A difference of 0 means all groups are selected at the same rate.',
          color: 'var(--accent)',
        },
        {
          name: 'Equalized Odds Ratio',
          formula: 'min(TPR ratio, FPR ratio) across groups',
          pass: '≥ 0.80 preferred',
          meaning: 'Ensures the AI makes correct decisions (both true positives and false positives) at equal rates across groups. Requires recruiter override data as ground truth. TPR = correctly identifying qualified candidates. FPR = incorrectly passing unqualified ones.',
          color: 'var(--yellow)',
        },
        {
          name: 'Selection Rate by Group',
          formula: 'count("Meets requirements") / total in group',
          pass: 'Should be similar across all groups',
          meaning: 'The fraction of each group\'s candidates that the AI rates as "Meets requirements". Used as the base for all other metrics.',
          color: 'var(--text-secondary)',
        },
        {
          name: 'EEOC Four-Fifths Rule',
          formula: 'Adverse impact = (minority selection rate) / (majority selection rate) < 0.80',
          pass: 'All pairs must be ≥ 0.80',
          meaning: 'The EEOC\'s practical benchmark for adverse impact. Applied to every pair of groups in the test. If any pair\'s ratio falls below 0.80, it indicates potential illegal discrimination in selection processes.',
          color: 'var(--red)',
        },
        {
          name: 'Score Parity',
          formula: '|avg_score_group_A − avg_score_group_B| ≤ 1.0',
          pass: 'Difference ≤ 1.0 on the 10-point scale',
          meaning: 'Even if pass rates are similar, we verify the actual numeric scores given by the AI are comparable across groups. A large score difference could indicate systematic under/over-scoring of certain groups.',
          color: 'var(--orange)',
        },
      ].map(m => (
        <div key={m.name} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>{m.name}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--bg-input)', padding: '6px 10px', borderRadius: 4, color: 'var(--text-secondary)' }}>
              {m.formula}
            </div>
            <div style={{ fontSize: 11, background: 'var(--green-soft)', padding: '6px 10px', borderRadius: 4, color: 'var(--green)', fontWeight: 600 }}>
              Pass threshold: {m.pass}
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{m.meaning}</p>
        </div>
      ))}

      <div style={{ padding: 14, background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--accent)' }}>Source:</strong> All metrics implemented by{' '}
        <a href="https://fairlearn.org" target="_blank" rel="noreferrer">Microsoft Fairlearn</a>{' '}
        (github.com/fairlearn/fairlearn). Demographic parity and EEOC four-fifths rule aligned with{' '}
        EEOC Uniform Guidelines on Employee Selection Procedures (29 CFR Part 1607).
      </div>
    </div>
  );
}
