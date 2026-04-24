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
import FairnessPage from './pages/FairnessPage';
import HiringManagerPage from './pages/HiringManagerPage';
import JobManagementPage from './pages/JobManagementPage';
import RiskRegisterPage from './pages/RiskRegisterPage';
import SafetyDashboard from './pages/SafetyDashboard';
import ComplianceDashboardPage from './pages/ComplianceDashboardPage';
import RecruiterDashboard from './pages/RecruiterDashboard';
import ReportProblemButton from './components/ReportProblemButton';

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
  const { user, logout, isAdmin, isRecruiter, isHiringManager } = useAuth();
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
            {/* Recruiter + Admin: Dashboard */}
            {(isRecruiter || isAdmin) && (
              <>
                <NavLink to="/recruiter" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  Recruiter Dashboard
                </NavLink>
              </>
            )}
            {/* Recruiter + Admin nav items */}
            {!isHiringManager && (
              <>
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
                <NavLink to="/fairness" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                  Fairlearn Analysis
                </NavLink>
                <NavLink to="/dataset" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                  Dataset Viewer
                </NavLink>
              </>
            )}

            {/* Hiring Manager + Admin: Job Management + Candidate Selection */}
            {(isHiringManager || isAdmin) && (
              <>
                {isAdmin && <div style={{ height: '1px', background: 'var(--border)', margin: '10px 12px' }} />}
                <NavLink to="/jobs" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3"/></svg>
                  Job Profiles
                </NavLink>
                <NavLink to="/hiring" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>
                  {isHiringManager ? 'Candidate Selection' : 'Hiring Manager View'}
                </NavLink>
              </>
            )}

            {/* Admin nav */}
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
                <NavLink to="/admin/risks" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Risk Register
                </NavLink>
                <NavLink to="/admin/safety" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  AI Safety Dashboard
                </NavLink>
                <NavLink to="/admin/compliance" className={({isActive}) => isActive ? 'active' : ''}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                  Compliance & Audit
                </NavLink>
              </>
            )}
          </nav>

          <div className="sidebar-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: user.role === 'ADMIN' ? 'var(--accent-soft)' : user.role === 'HIRING_MANAGER' ? 'var(--orange-soft, #fff3e0)' : 'var(--green-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
                color: user.role === 'ADMIN' ? 'var(--accent)' : user.role === 'HIRING_MANAGER' ? 'var(--orange, #e5a832)' : 'var(--green)',
              }}>
                {(user.display_name || user.email || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.display_name || user.email}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{user.role === 'HR_RECRUITER' ? 'Recruiter' : user.role === 'HIRING_MANAGER' ? 'Hiring Manager' : user.role}</div>
              </div>
              <button onClick={logout} title="Sign out" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>

            {health && (
              <>
                <span className={`mode-badge ${health.mode === 'mock' ? 'mock' : 'live'}`} style={{ marginBottom: '6px' }}>
                  <span className="dot"></span>
                  {health.mode === 'mock' ? 'Mock Mode' : 'Claude Live'}
                </span>
                <span className={`mode-badge ${health.pii_engine === 'presidio' ? 'live' : 'mock'}`} style={{ marginBottom: '6px' }}>
                  <span className="dot"></span>
                  PII: {health.pii_engine === 'presidio' ? 'Presidio' : 'Regex'}
                </span>
                <span className={`mode-badge ${health.fairlearn === 'available' ? 'live' : 'mock'}`}>
                  <span className="dot"></span>
                  Fairlearn: {health.fairlearn === 'available' ? 'Active' : 'Off'}
                </span>
              </>
            )}
            <ReportProblemButton />
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            {/* Recruiter + Admin routes */}
            {!isHiringManager && (
              <>
                <Route path="/" element={<UploadPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/results" element={<ResultsPage />} />
                <Route path="/compliance" element={<CompliancePage />} />
                <Route path="/fairness" element={<FairnessPage />} />
                <Route path="/dataset" element={<DatasetPage />} />
              </>
            )}

            {/* Hiring Manager + Admin routes */}
            {(isHiringManager || isAdmin) && (
              <>
                <Route path="/jobs" element={<JobManagementPage />} />
                <Route path="/hiring" element={<HiringManagerPage />} />
              </>
            )}

            {/* Hiring Manager default */}
            {isHiringManager && (
              <Route path="*" element={<HiringManagerPage />} />
            )}

            {/* Recruiter routes */}
            {(isRecruiter || isAdmin) && (
              <Route path="/recruiter" element={<RecruiterDashboard />} />
            )}

            {/* Admin routes */}
            {isAdmin && (
              <>
                <Route path="/admin/activity" element={<ActivityLogsPage />} />
                <Route path="/admin/usage" element={<UsagePage />} />
                <Route path="/admin/risks" element={<RiskRegisterPage />} />
                <Route path="/admin/safety" element={<SafetyDashboard />} />
                <Route path="/admin/compliance" element={<ComplianceDashboardPage />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
