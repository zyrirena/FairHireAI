import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(26,158,143,0.06) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(43,182,115,0.04) 0%, transparent 50%)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/logo.png" alt="FairHire AI" style={{ maxWidth: '220px', height: 'auto', marginBottom: '8px' }} />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
            Secure Testing Version
          </div>
        </div>

        {/* Login Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '32px', boxShadow: 'var(--shadow-lg)',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px', textAlign: 'center' }}>Sign in</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
            Enter your credentials to access the system
          </p>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--red-soft)', color: 'var(--red)',
              borderRadius: 'var(--radius-sm)', fontSize: '13px', marginBottom: '16px',
              border: '1px solid var(--red)',
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@fairhire.local" autoComplete="email" autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px', marginTop: '8px' }}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16 }}></div> Signing in...</> : 'Sign In'}
            </button>
          </form>

          {/* Hint */}
          <div style={{ marginTop: '20px', padding: '12px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Default accounts:</strong><br/>
            Admin: admin@fairhire.local / Admin123!<br/>
            Recruiter: recruiter@fairhire.local / Recruiter123!
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
