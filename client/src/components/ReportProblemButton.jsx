import React, { useState } from 'react';
import { api } from '../api';

export default function ReportProblemButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setSending(true);
    try {
      const page = window.location.pathname;
      const result = await api.reportProblem(description, page);
      setSent(true);
      // Open email client with pre-filled email
      if (result.mailto) {
        window.open(result.mailto, '_blank');
      }
      setTimeout(() => { setOpen(false); setSent(false); setDescription(''); }, 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report a problem"
        style={{
          background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
          color: 'var(--red)', padding: '6px 12px', fontSize: '11px', fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
          fontFamily: 'var(--font-body)', width: '100%', justifyContent: 'center', marginTop: '8px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Report a Problem
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Report a Problem
            </h3>

            {sent ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
                <div style={{ fontSize: '14px', color: 'var(--green)', fontWeight: 600 }}>Report submitted and email opened</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Describe the issue you're experiencing. A report will be saved and an email will be composed to <strong style={{ color: 'var(--text-primary)' }}>iaustin@gmu.edu</strong>.
                </p>
                <div className="form-group">
                  <label>What went wrong?</label>
                  <textarea
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the problem in detail..."
                    rows={5}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', padding: '8px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                  Email to: iaustin@gmu.edu<br/>
                  Subject: Oh Snap FairHireAI Issue<br/>
                  Current page: {window.location.pathname}
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-danger" disabled={sending}>
                    {sending ? 'Sending...' : 'Submit & Email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
