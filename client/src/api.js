const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('fairhire_token');
}

function setToken(token) {
  localStorage.setItem('fairhire_token', token);
}

function clearToken() {
  localStorage.removeItem('fairhire_token');
  localStorage.removeItem('fairhire_user');
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('fairhire_user')); } catch { return null; }
}

function setStoredUser(user) {
  localStorage.setItem('fairhire_user', JSON.stringify(user));
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function apiBlobFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  if (res.status === 401) { clearToken(); window.location.reload(); throw new Error('Session expired'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Download failed');
  }
  return res;
}

export const auth = {
  login: async (email, password) => {
    const result = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(result.token);
    setStoredUser(result.user);
    return result;
  },
  logout: async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    clearToken();
  },
  getMe: () => apiFetch('/auth/me'),
  getToken,
  getStoredUser,
  isLoggedIn: () => !!getToken(),
};

export const api = {
  health: () => apiFetch('/health'),

  // Jobs
  getJobs: () => apiFetch('/jobs'),
  getJob: (id) => apiFetch(`/jobs/${id}`),
  createJob: (data) => apiFetch('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => apiFetch(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id) => apiFetch(`/jobs/${id}`, { method: 'DELETE' }),

  // Candidates
  getCandidates: () => apiFetch('/candidates'),
  uploadResume: (formData) =>
    fetch(`${API_BASE}/candidates/upload`, { method: 'POST', headers: authHeaders(), body: formData }).then(async (r) => {
      if (r.status === 401) { clearToken(); window.location.reload(); }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data;
    }),
  evaluateCandidate: (candidateId, jobId) =>
    apiFetch(`/candidates/${candidateId}/evaluate`, { method: 'POST', body: JSON.stringify({ job_id: jobId }) }),
  deleteCandidate: (id) => apiFetch(`/candidates/${id}`, { method: 'DELETE' }),

  // Evaluations
  getEvaluations: () => apiFetch('/evaluations'),
  getEvaluation: (id) => apiFetch(`/evaluations/${id}`),
  overrideEvaluation: (id, data) => apiFetch(`/evaluations/${id}/override`, { method: 'POST', body: JSON.stringify(data) }),

  // Compliance
  getComplianceStats: () => apiFetch('/evaluations/compliance/stats'),
  getAuditLog: (limit = 100, offset = 0) => apiFetch(`/evaluations/compliance/audit-log?limit=${limit}&offset=${offset}`),
  exportAuditLog: () => apiFetch('/evaluations/compliance/audit-export'),
  getBiasResults: () => apiFetch('/evaluations/compliance/bias-results'),
  runBiasTest: (sampleSize) => apiFetch('/evaluations/compliance/run-bias-test', { method: 'POST', body: JSON.stringify({ sampleSize }) }),
  downloadBiasReportPDF: async () => {
    const res = await apiBlobFetch('/evaluations/compliance/bias-report-pdf', { method: 'POST' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `FairHire_Bias_Audit_${new Date().toISOString().split('T')[0]}.pdf`;
    a.click(); URL.revokeObjectURL(url);
  },
  downloadHiringReportPDF: async (jobId) => {
    const res = await apiBlobFetch('/evaluations/hiring-report-pdf', { method: 'POST', body: JSON.stringify({ job_id: jobId }) });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `FairHire_Hiring_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    a.click(); URL.revokeObjectURL(url);
  },

  // Certification
  getCertification: (jobId) => apiFetch(`/evaluations/certification/${jobId}`),
  certifyJob: (jobId, notes) => apiFetch('/evaluations/certification', { method: 'POST', body: JSON.stringify({ job_id: jobId, notes }) }),
  downloadCertifiedReportPDF: async (jobId) => {
    const res = await apiBlobFetch('/evaluations/certified-report-pdf', { method: 'POST', body: JSON.stringify({ job_id: jobId }) });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `FairHire_CERTIFIED_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    a.click(); URL.revokeObjectURL(url);
  },

  // Dataset
  getDatasetRecords: (limit = 50, offset = 0, category = '') =>
    apiFetch(`/evaluations/dataset/records?limit=${limit}&offset=${offset}${category ? `&category=${category}` : ''}`),

  // Fairlearn
  getFairlearnStatus: () => apiFetch('/evaluations/fairlearn/status'),
  getFairlearnBiasAnalysis: () => apiFetch('/evaluations/fairlearn/bias-analysis'),
  getFairlearnLiveAnalysis: (jobId = '') => apiFetch(`/evaluations/fairlearn/live-analysis${jobId ? `?job_id=${jobId}` : ''}`),
  runFairlearnAnalysis: (data) => apiFetch('/evaluations/fairlearn/analyze', { method: 'POST', body: JSON.stringify(data) }),

  // Hiring Manager
  getCertifiedJobs: () => apiFetch('/evaluations/hiring-manager/certified-jobs'),
  getHMCandidates: (jobId) => apiFetch(`/evaluations/hiring-manager/candidates/${jobId}`),
  submitHiringDecision: (data) => apiFetch('/evaluations/hiring-manager/decision', { method: 'POST', body: JSON.stringify(data) }),
  getHiringDecision: (jobId) => apiFetch(`/evaluations/hiring-manager/decision/${jobId}`),

  // Admin
  getUsers: () => apiFetch('/auth/users'),
  disableUser: (id) => apiFetch(`/auth/users/${id}/disable`, { method: 'POST' }),
  enableUser: (id) => apiFetch(`/auth/users/${id}/enable`, { method: 'POST' }),
  changeUserRole: (id, role) => apiFetch(`/auth/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) }),
  getProblemReports: () => apiFetch('/auth/problem-reports'),
  getActivityLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/auth/activity-logs?${q}`);
  },
  exportActivityLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/auth/activity-logs/export?${q}`);
  },
  getUsage: () => apiFetch('/auth/usage'),
  resetUsage: (month) => apiFetch('/auth/usage/reset', { method: 'POST', body: JSON.stringify({ month }) }),

  // Problem Report
  reportProblem: (description, page) => apiFetch('/auth/report-problem', { method: 'POST', body: JSON.stringify({ description, page }) }),

  // Risk Register (Admin)
  getRisks: () => apiFetch('/audit/risks'),
  createRisk: (data) => apiFetch('/audit/risks', { method: 'POST', body: JSON.stringify(data) }),
  updateRisk: (id, data) => apiFetch(`/audit/risks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRisk: (id) => apiFetch(`/audit/risks/${id}`, { method: 'DELETE' }),

  // Safety Checks (Admin)
  getSafetyStats: () => apiFetch('/api/safety/stats'),
  getSafetyLogs: (filters) => apiFetch(`/api/safety/logs?${new URLSearchParams(filters)}`),

  // Compliance & Audit Integrity (Admin)
  getComplianceStatus: () => apiFetch('/audit/compliance-status'),
  verifyAuditIntegrity: () => apiFetch('/audit/integrity'),
  getCryptoLogs: (limit = 100) => apiFetch(`/audit/crypto-logs?limit=${limit}`),
  getAIF360Analysis: (jobId) => apiFetch(`/audit/aif360/analysis${jobId ? '?job_id=' + jobId : ''}`),
  getAIF360Status: () => apiFetch('/audit/aif360/status'),

  // Public audit summary (no auth)
  getPublicAuditSummary: () => fetch(`${BASE}/public/audit-summary`).then(r => r.json()),
};
