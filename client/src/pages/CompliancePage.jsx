import React, { useState, useEffect } from 'react';
import { api } from '../api';

function CompliancePage() {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [biasResults, setBiasResults] = useState([]);
  const [runningBias, setRunningBias] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [expandedTest, setExpandedTest] = useState(null);
  const [sampleSize, setSampleSize] = useState(10);
  const [biasRunResult, setBiasRunResult] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = () => {
    api.getComplianceStats().then(setStats).catch(console.error);
    api.getAuditLog().then(setAuditLog).catch(console.error);
    api.getBiasResults().then(setBiasResults).catch(console.error);
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRunBiasTest = async () => {
    setRunningBias(true);
    try {
      const result = await api.runBiasTest(sampleSize);
      setBiasRunResult(result);
      showToast('Bias test completed');
      loadAll();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setRunningBias(false); }
  };

  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      await api.downloadBiasReportPDF();
      showToast('Bias audit PDF downloaded');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setGeneratingPdf(false); }
  };

  const handleExportAudit = async () => {
    try {
      const data = await api.exportAuditLog();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Audit log exported');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const parseDetails = (r) => {
    try { return JSON.parse(r.details || '{}'); } catch { return {}; }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Compliance Dashboard</h2>
        <p>Monitor bias metrics, audit trails, and EEOC-aligned evaluation compliance.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'bias' ? 'active' : ''}`} onClick={() => setTab('bias')}>Bias Testing</button>
        <button className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>Audit Log</button>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && stats && (
        <>
          <div className="grid-4" style={{ marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-label">Total Evaluations</div>
              <div className="stat-value">{stats.total_evaluations}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Skills Score</div>
              <div className="stat-value">{(stats.average_scores?.avg_skills || 0).toFixed(1)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Overall Score</div>
              <div className="stat-value">{(stats.average_scores?.avg_overall || 0).toFixed(1)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Recruiter Overrides</div>
              <div className="stat-value" style={{ color: 'var(--orange)' }}>{stats.total_overrides}</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 style={{ fontSize: '15px', marginBottom: '16px' }}>Qualification Distribution</h3>
              {(stats.by_qualification || []).map(q => (
                <div key={q.qualification} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', marginBottom: '4px' }}>{q.qualification}</div>
                    <div className="score-bar">
                      <div
                        className={`score-bar-fill ${q.qualification?.includes('Meets') && !q.qualification?.includes('Partially') ? 'high' : q.qualification?.includes('Partially') ? 'mid' : 'low'}`}
                        style={{ width: `${(q.count / Math.max(stats.total_evaluations, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600 }}>{q.count}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <h3 style={{ fontSize: '15px', marginBottom: '16px' }}>Compliance Checklist</h3>
              {[
                'PII scrubbing before AI evaluation',
                'Job-related criteria only (no personality/culture fit)',
                'Transparent score breakdowns',
                'Human-in-the-loop override capability',
                'Audit trail for all evaluations',
                'Data retention policy (120 days)',
                'Consent collection before upload',
                'Bias testing module available',
              ].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--green)', fontSize: '16px' }}>✓</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bias Testing Tab */}
      {tab === 'bias' && (
        <>
          <div className="card">
            <div className="card-header">
              <h3>Bias Test Results</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {biasResults.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleExportPdf} disabled={generatingPdf} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {generatingPdf ? (
                      <><div className="spinner" style={{ width: 14, height: 14 }}></div> Generating...</>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Export PDF Report
                      </>
                    )}
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                    Per group:
                  </label>
                  <select
                    value={sampleSize}
                    onChange={e => setSampleSize(parseInt(e.target.value))}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                  </select>
                </div>
                <button className="btn btn-primary" onClick={handleRunBiasTest} disabled={runningBias}>
                  {runningBias ? <><div className="spinner" style={{ width: 14, height: 14 }}></div> Running...</> : 'Run Bias Test'}
                </button>
              </div>
            </div>

            {biasResults.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🧪</div>
                <h3>No bias tests run yet</h3>
                <p>Click "Run Bias Test" to test the AI screening for disparate impact across different demographic groups.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Group A</th>
                      <th>Group B</th>
                      <th>DI Ratio</th>
                      <th>80% Rule</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {biasResults.map(r => {
                      const details = parseDetails(r);
                      const isExpanded = expandedTest === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.test_name}</td>
                            <td>
                              <div style={{ fontSize: '12px' }}>{r.group_a_label}</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{(r.group_a_pass_rate * 100).toFixed(0)}% pass</div>
                            </td>
                            <td>
                              <div style={{ fontSize: '12px' }}>{r.group_b_label}</div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{(r.group_b_pass_rate * 100).toFixed(0)}% pass</div>
                            </td>
                            <td>
                              <span style={{
                                fontFamily: 'var(--font-mono)', fontWeight: 600,
                                color: r.disparate_impact_ratio >= 0.8 ? 'var(--green)' : 'var(--red)',
                              }}>{r.disparate_impact_ratio?.toFixed(3)}</span>
                            </td>
                            <td>
                              <span className={`status-badge ${r.passed_80_rule ? 'status-meets' : 'status-not'}`}>
                                {r.passed_80_rule ? 'PASS' : 'FAIL'}
                              </span>
                            </td>
                            <td style={{ fontSize: '12px' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setExpandedTest(isExpanded ? null : r.id)}
                              >
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan="7" style={{ padding: 0, border: 'none' }}>
                                <CalculationDetail result={r} details={details} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Methodology explanation */}
          <div className="card" style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>How Bias Is Calculated</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: '12px' }}>
                FairHire AI uses the <strong style={{ color: 'var(--text-primary)' }}>Disparate Impact Ratio</strong> (also
                called the <strong style={{ color: 'var(--text-primary)' }}>four-fifths rule</strong>) from the EEOC Uniform
                Guidelines on Employee Selection Procedures.
              </p>

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '12px', marginBottom: '16px', border: '1px solid var(--border)', lineHeight: 2 }}>
                <div style={{ color: 'var(--accent)', marginBottom: '4px' }}>// Formula</div>
                <div>DI Ratio = (Lower Group Pass Rate) / (Higher Group Pass Rate)</div>
                <div style={{ marginTop: '8px', color: 'var(--accent)', marginBottom: '4px' }}>// Decision rule</div>
                <div>If DI Ratio &gt;= 0.80 → <span style={{ color: 'var(--green)' }}>PASS</span> (no adverse impact)</div>
                <div>If DI Ratio &lt;&nbsp; 0.80 → <span style={{ color: 'var(--red)' }}>FAIL</span> (potential adverse impact)</div>
              </div>

              <p style={{ marginBottom: '8px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Testing process:</strong>
              </p>
              <div style={{ paddingLeft: '16px', borderLeft: '2px solid var(--accent)', marginBottom: '16px' }}>
                <p>1. Generate identical resumes, varying only the test variable (e.g., gendered names)</p>
                <p>2. PII scrub each resume to remove identifying information</p>
                <p>3. Send anonymized text to Claude AI for evaluation</p>
                <p>4. Count how many in each group are rated "Meets requirements"</p>
                <p>5. Calculate pass rate per group, then compute the DI Ratio</p>
              </div>

              <p>
                <strong style={{ color: 'var(--text-primary)' }}>Score Parity</strong> is also checked — the average scores
                between groups should differ by no more than 1.0 point on a 10-point scale.
              </p>
            </div>
          </div>

          {/* PII Scrub Proof */}
          {biasRunResult?.pii_scrub_summary && (
            <PIIScrubProof summary={biasRunResult.pii_scrub_summary} />
          )}
        </>
      )}

      {/* Audit Log Tab */}
      {tab === 'audit' && (
        <div className="card">
          <div className="card-header">
            <h3>Audit Trail</h3>
            <button className="btn btn-secondary btn-sm" onClick={handleExportAudit}>Export JSON</button>
          </div>

          {auditLog.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📝</div>
              <h3>No audit entries</h3>
              <p>Activities will be logged here as you use the system.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map(log => {
                    let details = {};
                    try { details = JSON.parse(log.details || '{}'); } catch {}
                    return (
                      <tr key={log.id}>
                        <td>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '2px 6px',
                            borderRadius: '3px', background: 'var(--bg-input)', color: 'var(--text-primary)',
                          }}>{log.action}</span>
                        </td>
                        <td style={{ fontSize: '12px' }}>{log.entity_type}/{log.entity_id?.substring(0, 8)}...</td>
                        <td style={{ fontSize: '12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </td>
                        <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

/** Inline calculation detail for a single bias test */
function CalculationDetail({ result, details }) {
  const rateA = result.group_a_pass_rate;
  const rateB = result.group_b_pass_rate;
  const higher = Math.max(rateA, rateB);
  const lower = Math.min(rateA, rateB);
  const higherLabel = rateA >= rateB ? result.group_a_label : result.group_b_label;
  const lowerLabel = rateA < rateB ? result.group_a_label : result.group_b_label;
  const di = result.disparate_impact_ratio;
  const parity = details.score_parity;

  return (
    <div style={{
      margin: '0 14px 16px', padding: '20px', background: 'var(--bg-input)',
      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
    }}>
      <h4 style={{ fontSize: '14px', marginBottom: '14px', color: 'var(--accent)' }}>
        Calculation Breakdown: {result.test_name}
      </h4>

      {/* Step by step */}
      <div className="grid-2" style={{ marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {result.group_a_label}
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {(rateA * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>pass rate</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {result.group_b_label}
          </div>
          <div style={{ fontSize: '24px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {(rateB * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>pass rate</div>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 2, marginBottom: '12px',
      }}>
        <div style={{ color: 'var(--text-muted)' }}>// Step 1: Identify higher and lower pass rates</div>
        <div>Higher rate ({higherLabel}): <span style={{ color: 'var(--accent)' }}>{(higher * 100).toFixed(1)}%</span></div>
        <div>Lower rate ({lowerLabel}):&nbsp; <span style={{ color: 'var(--accent)' }}>{(lower * 100).toFixed(1)}%</span></div>
        <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>// Step 2: Calculate Disparate Impact Ratio</div>
        <div>DI Ratio = {(lower * 100).toFixed(1)}% / {(higher * 100).toFixed(1)}% = <span style={{ color: di >= 0.8 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{di.toFixed(4)}</span></div>
        <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>// Step 3: Compare against threshold</div>
        <div>{di.toFixed(4)} {di >= 0.8 ? '>=' : '<'} 0.8000 → <span style={{ color: di >= 0.8 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{di >= 0.8 ? 'PASS' : 'FAIL'}</span></div>
      </div>

      {parity && (
        <div style={{
          background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 2,
        }}>
          <div style={{ color: 'var(--text-muted)' }}>// Score Parity Check</div>
          <div>Avg score {result.group_a_label}: <span style={{ color: 'var(--accent)' }}>{(parity.group_a_avg || 0).toFixed(2)}/10</span></div>
          <div>Avg score {result.group_b_label}: <span style={{ color: 'var(--accent)' }}>{(parity.group_b_avg || 0).toFixed(2)}/10</span></div>
          <div>Difference: {(parity.diff || 0).toFixed(2)} (threshold: ≤ 1.0)</div>
          <div>Result: <span style={{ color: parity.passes ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{parity.passes ? 'PASS' : 'FAIL'}</span></div>
        </div>
      )}
    </div>
  );
}

export default CompliancePage;

/** PII Scrub Proof Card — shows what was embedded and what was removed */
function PIIScrubProof({ summary }) {
  const { leaks } = summary;
  const totalChecks = summary.total_resumes_processed * 6;
  const totalLeaks = Object.values(leaks).reduce((s, v) => s + v, 0);

  const categories = [
    { label: 'Names', embedded: summary.total_resumes_processed, leaked: leaks.names_leaked, icon: '👤' },
    { label: 'SSNs', embedded: summary.total_resumes_processed, leaked: leaks.ssns_leaked, icon: '🔢' },
    { label: 'Dates of Birth', embedded: summary.total_resumes_processed, leaked: leaks.dobs_leaked, icon: '📅' },
    { label: 'Phone Numbers', embedded: summary.total_resumes_processed, leaked: leaks.phones_leaked, icon: '📞' },
    { label: 'Email Addresses', embedded: summary.total_resumes_processed, leaked: leaks.emails_leaked, icon: '📧' },
    { label: 'Gender Indicators', embedded: summary.total_resumes_processed, leaked: leaks.gender_hints_leaked, icon: '⚧' },
  ];

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="card-header">
        <h3>PII Scrub Proof</h3>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
          color: totalLeaks === 0 ? 'var(--green)' : 'var(--red)',
          padding: '4px 12px',
          background: totalLeaks === 0 ? 'var(--green-soft)' : 'var(--red-soft)',
          borderRadius: '20px',
        }}>
          {summary.scrub_success_rate} success
        </span>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Each synthetic resume was embedded with fake PII (SSN, date of birth, phone, email, address, gender
        indicators) before being processed by the PII scrubber. Below shows what was embedded and whether
        it was successfully removed.
      </p>

      {/* Stats row */}
      <div className="grid-3" style={{ marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">Resumes Processed</div>
          <div className="stat-value">{summary.total_resumes_processed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PII Items Removed</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{summary.total_pii_items_removed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg PII Per Resume</div>
          <div className="stat-value">{summary.avg_pii_per_resume}</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{ marginBottom: '16px' }}>
        {categories.map(cat => {
          const removed = cat.embedded - cat.leaked;
          const pct = cat.embedded > 0 ? (removed / cat.embedded * 100) : 100;
          return (
            <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{cat.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{cat.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: cat.leaked === 0 ? 'var(--green)' : 'var(--red)' }}>
                    {removed}/{cat.embedded} removed {cat.leaked > 0 ? `(${cat.leaked} leaked)` : ''}
                  </span>
                </div>
                <div className="score-bar">
                  <div className={`score-bar-fill ${pct === 100 ? 'high' : pct >= 80 ? 'mid' : 'low'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, minWidth: '45px', textAlign: 'right',
                color: pct === 100 ? 'var(--green)' : 'var(--red)' }}>{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>

      {/* Sample proof table */}
      {summary.sample_proof?.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', marginBottom: '12px', fontWeight: 500 }}>
            View sample proof (first {summary.sample_proof.length} applicants)
          </summary>
          <div className="table-wrap" style={{ marginTop: '8px' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Original Name</th>
                  <th>Embedded SSN</th>
                  <th>Embedded DOB</th>
                  <th>Items Removed</th>
                  <th>Name Scrubbed</th>
                  <th>SSN Scrubbed</th>
                </tr>
              </thead>
              <tbody>
                {summary.sample_proof.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{p.applicant_index + 1}</td>
                    <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.original_name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{p.embedded_ssn}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{p.embedded_dob}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.pii_items_removed}</td>
                    <td>{p.name_in_scrubbed ?
                      <span style={{ color: 'var(--red)' }}>LEAKED</span> :
                      <span style={{ color: 'var(--green)' }}>REMOVED</span>}</td>
                    <td>{p.ssn_in_scrubbed ?
                      <span style={{ color: 'var(--red)' }}>LEAKED</span> :
                      <span style={{ color: 'var(--green)' }}>REMOVED</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}