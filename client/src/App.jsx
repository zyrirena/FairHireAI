import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { api } from './api';
import { AuthProvider, useAuth } from './components/AuthContext';
import LoginPage from './pages/LoginPage';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import ResultsPage from './pages/ResultsPage';
import CompliancePage from './pages/CompliancePage';
import DatasetPage from './pages/DatasetPage';
import ActivityLogsPage from './pages/ActivityLogsPage';
import UsagePage from './pages/UsagePage';

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return <MainApp />;
}

function MainApp() {
  const { user, logout, isAdmin } = useAuth();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error', mode: 'unknown' }));
  }, []);

  return (
    <BrowserRouter>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src="/logo.png" alt="FairHire AI" className="logo-img" />
            <div className="badge">Equitable Recruitment Agent</div>
          </div>

          <nav className="sidebar-nav">
            <NavLink to="/" end className={({isActive}) => isActive ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Resumes
            </NavLink>
            <NavLink to="/dashboard" className={({isActive}) => isActive ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
              Recruiter Dashboard
            </NavLink>
            <NavLink to="/results" className={({isActive}) => isActive ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Candidate Results
            </NavLink>
            <NavLink to="/compliance" className={({isActive}) => isActive ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Compliance
            </NavLink>
            <NavLink to="/dataset" className={({isActive}) => isActive ? 'active' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              Dataset Viewer
            </NavLink>

            {isAdmin && (
              <>
                <div style={{ height: '1px', background: 'var(--border)', margin: '10px 12px' }} />
                <div style={{ padding: '4px 12px', fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 700 }}>Admin</div>
                <NavLink to="/admin/activity" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  User Activity
                </NavLink>
                <NavLink to="/admin/usage" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  AI Usage & Costs
                </NavLink>
              </>
            )}
          </nav>

          <div className="sidebar-footer">
            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: user.role === 'ADMIN' ? 'var(--accent-soft)' : 'var(--green-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
                color: user.role === 'ADMIN' ? 'var(--accent)' : 'var(--green)',
              }}>
                {(user.display_name || user.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || user.email}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{user.role}</div>
              </div>
              <button onClick={logout} title="Sign out" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>

            {health && (
              <span className={`mode-badge ${health.mode === 'mock' ? 'mock' : 'live'}`}>
                <span className="dot"></span>
                {health.mode === 'mock' ? 'Mock Mode' : 'Claude Live'}
              </span>
            )}
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/dataset" element={<DatasetPage />} />
            {isAdmin && (
              <>
                <Route path="/admin/activity" element={<ActivityLogsPage />} />
                <Route path="/admin/usage" element={<UsagePage />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
