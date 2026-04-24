import React, { useState, useEffect } from 'react';
import { api } from '../api';

const STATUS_COLORS = { compliant: 'var(--green)', needs_attention: 'var(--yellow)', non_compliant: 'var(--red)' };
const STATUS_LABELS = { compliant: '✓ Compliant', needs_attention: '⚠ Needs Attention', non_compliant: '✗ Non-Compliant' };

export default function ComplianceDashboardPage() {
  const [compliance, setCompliance] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [aif360, setAif360] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [comp, integ, bias] = await Promise.all([
        api.getComplianceStatus().catch(() => null),
        api.verifyAuditIntegrity().catch(() => null),
        api.getAIF360Analysis().catch(() => null),
      ]);
      setCompliance(comp);
      setIntegrity(integ);
      setAif360(bias);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  const frameworks = compliance?.frameworks || {};

  return (
    <div>
      <div className="page-header">
        <h2>Compliance Dashboard</h2>
        <p>Regulatory alignment, audit integrity verification, and IBM AIF360 bias analysis.</p>
      </div>

      {/* Audit Chain Integrity */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>SHA-256 Audit Chain Integrity</h3></div>
        {integrity ? (
          <div style={{ padding: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
              padding: 16, borderRadius: 'var(--radius-sm)',
              background: integrity.valid ? 'var(--green-soft)' : 'var(--red-soft)',
              border: `1px solid ${integrity.valid ? 'var(--green)' : 'var(--red)'}`,
            }}>
              <span style={{ fontSize: 28 }}>{integrity.valid ? '🔒' : '🚨'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: integrity.valid ? 'var(--green)' : 'var(--red)' }}>
                  {integrity.valid ? 'All Logs Verified — No Tampering Detected' : 'TAMPERING DETECTED'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{integrity.details}</div>
              </div>
            </div>
            <div className="grid-3">
              <div className="stat-card"><div className="stat-label">Total Entries</div><div className="stat-value">{integrity.total}</div></div>
              <div className="stat-card"><div className="stat-label">Verified</div><div className="stat-value" style={{ color: 'var(--green)' }}>{integrity.verified}</div></div>
              <div className="stat-card"><div className="stat-label">Chain Status</div><div className="stat-value" style={{ fontSize: 14, color: integrity.valid ? 'var(--green)' : 'var(--red)' }}>{integrity.valid ? 'Intact' : `Broken at #${integrity.broken_at}`}</div></div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Unable to verify audit chain</div>
        )}
      </div>

      {/* Compliance Frameworks */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {Object.entries(frameworks).map(([key, fw]) => (
          <div className="card" key={key} style={{ border: `1px solid ${STATUS_COLORS[fw.status]}44` }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{fw.name}</div>
                <span style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: `${STATUS_COLORS[fw.status]}22`, color: STATUS_COLORS[fw.status],
                }}>{STATUS_LABELS[fw.status]}</span>
              </div>
              {fw.checks && Object.entries(fw.checks).map(([ck, cv]) => (
                <div key={ck} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6,
                  padding: 6, borderRadius: 4, background: cv.pass ? 'var(--green-soft)' : 'var(--yellow-soft)',
                }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{cv.pass ? '✓' : '⚠'}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {ck.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cv.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AIF360 Bias Analysis */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>IBM AIF360 Bias Analysis</h3>
          <button className="btn btn-secondary" onClick={loadAll}>Refresh</button>
        </div>
        {aif360 ? (
          <div style={{ padding: 16 }}>
            {aif360.message ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{aif360.message}</div>
            ) : aif360.metrics ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                  padding: 12, borderRadius: 'var(--radius-sm)',
                  background: aif360.risk_level === 'low' ? 'var(--green-soft)' : aif360.risk_level === 'medium' ? 'var(--yellow-soft)' : 'var(--red-soft)',
                }}>
                  <span style={{ fontSize: 20 }}>
                    {aif360.risk_level === 'low' ? '✅' : aif360.risk_level === 'medium' ? '⚠️' : '🚨'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Risk Level: {aif360.risk_level?.toUpperCase()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{aif360.recommendation}</div>
                  </div>
                </div>
                <div className="grid-4">
                  <div className="stat-card">
                    <div className="stat-label">Disparate Impact</div>
                    <div className="stat-value" style={{ color: aif360.metrics.eeoc_four_fifths_pass ? 'var(--green)' : 'var(--red)' }}>
                      {aif360.metrics.disparate_impact?.toFixed(3)}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Must be ≥ 0.800</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Parity Difference</div>
                    <div className="stat-value">{aif360.metrics.statistical_parity_difference?.toFixed(3)}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ideal: 0.000</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Group A Rate</div>
                    <div className="stat-value">{(aif360.metrics.group_0_selection_rate * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>n={aif360.metrics.group_0_count}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Group B Rate</div>
                    <div className="stat-value">{(aif360.metrics.group_1_selection_rate * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>n={aif360.metrics.group_1_count}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                  EEOC Four-Fifths: {aif360.metrics.eeoc_four_fifths_pass ? '✓ PASS' : '✗ FAIL'} | 
                  AIF360: {aif360.aif360_available ? '✓ Installed' : '⚠ Using fallback'} | 
                  Total: {aif360.metrics.total_candidates} candidates
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No analysis data available. Run evaluations first.</div>
            )}
          </div>
        ) : (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Unable to load AIF360 analysis</div>
        )}
      </div>

      {/* Summary Stats */}
      {compliance?.summary && (
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-label">Total Evaluations</div><div className="stat-value">{compliance.summary.total_evaluations}</div></div>
          <div className="stat-card"><div className="stat-label">Bias Tests Run</div><div className="stat-value">{compliance.summary.total_bias_tests}</div></div>
          <div className="stat-card"><div className="stat-label">Crypto Log Entries</div><div className="stat-value">{compliance.summary.total_crypto_logs}</div></div>
          <div className="stat-card"><div className="stat-label">Open Risks</div><div className="stat-value" style={{ color: compliance.summary.open_risks > 0 ? 'var(--yellow)' : 'var(--green)' }}>{compliance.summary.open_risks}</div></div>
        </div>
      )}

      {/* Info */}
      <div style={{ padding: 12, background: 'var(--accent-soft)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--accent)' }}>Compliance Framework:</strong> This dashboard tracks alignment with EU AI Act (risk management, logging, bias mitigation), NYC Local Law 144 (bias audits, public disclosure, audit API), and EEOC guidelines (non-discriminatory hiring, documentation). SHA-256 audit chain ensures tamper-evident logging. IBM AIF360 provides advanced fairness metrics.
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
