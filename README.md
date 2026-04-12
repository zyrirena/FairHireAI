# FairHire AI – Bias-Aware Resume Screening Assistant

**Local Bias-Aware AI Hiring Assistant (Secure Testing Version)**

AI-powered resume screening with authentication, role-based access, bias testing, compliance tracking, and AI cost controls.

---

## Quick Start (5 minutes)

### Step 1: Install Node.js

- Go to **https://nodejs.org**
- Click the big green **"Download LTS"** button
- Run the installer → click "Next" on every screen until done
- Restart your computer if prompted

### Step 2: Download This Project

- Download and extract the project folder
- You should see a folder called `fairhire-ai` with files inside

### Step 3: Open a Terminal

- Open the `fairhire-ai` folder in File Explorer
- Hold **SHIFT** and **right-click** on empty space
- Click **"Open PowerShell window here"** (or "Open in Terminal")

### Step 4: Install Dependencies

Type this command and press Enter:

```
npm run install:all
```

Wait for it to finish (may take 1-2 minutes).

### Step 5: Set Up Environment

```
copy .env.example .env
```

Open the `.env` file in Notepad and add your Anthropic API key (optional — the app works in mock mode without it).

### Step 6: Load Sample Data

```
npm run seed
```

### Step 7: Start the App

```
npm run dev
```

### Step 8: Open in Browser

Go to: **http://localhost:3000**

You'll see the login screen.

---

## Default Login Accounts

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@fairhire.local | Admin123! |
| **Recruiter** | recruiter@fairhire.local | Recruiter123! |

**Admin** can see everything: all users, activity logs, AI usage costs, compliance data.

**Recruiter** can upload resumes, view candidates, override AI decisions, and add notes.

---

## Features

### Authentication & Security
- JWT-based login with 8-hour session expiry
- Passwords hashed with bcrypt
- All API routes require valid authentication
- Role-based access control (Admin vs Recruiter)

### AI Resume Screening
- Claude AI evaluates resumes for skills, experience, education, certifications only
- PII automatically scrubbed before AI evaluation
- Transparent score breakdowns with explanations
- Mock mode works without API key

### AI Cost Controls
- **$5/month spending cap** enforced automatically
- Token tracking on every API call
- When limit is reached, system switches to mock mode
- Admin can view usage dashboard and reset if needed

### User Activity Tracking
- Every action logged: login, upload, evaluate, override, delete
- Admin can filter logs by user, date, or action type
- Full export to JSON for compliance audits

### Bias Testing
- Disparate impact analysis (80% / four-fifths rule)
- Test with 5 to 200 applicants per group
- PDF audit reports with calculation walkthroughs

### Compliance
- EEOC-aligned job-related criteria only
- Audit trail for all evaluations
- Human-in-the-loop override capability
- 120-day data retention with auto-deletion
- Consent required before upload

---

## Application Pages

| Page | Access | Description |
|------|--------|-------------|
| **Login** | Everyone | Sign in with email and password |
| **Upload Resumes** | All users | Upload PDF/DOCX/TXT, auto-screen against job |
| **Recruiter Dashboard** | All users | View candidates, override decisions, generate PDF reports |
| **Candidate Results** | All users | Detailed score breakdowns, matched/missing skills |
| **Compliance** | All users | Bias tests, audit log, compliance checklist |
| **Dataset Viewer** | All users | Browse Kaggle/sample data |
| **User Activity** | Admin only | Filter and export all user actions |
| **AI Usage & Costs** | Admin only | Token tracking, budget status, reset |

---

## Docker Setup (Alternative)

If you have Docker Desktop installed:

```bash
docker compose up --build
```

Then open **http://localhost:3000** and seed data:

```bash
docker compose exec fairhire npm run seed
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Claude API key (optional, mock mode without) |
| `JWT_SECRET` | auto-generated | Secret for signing auth tokens |
| `JWT_EXPIRY` | 8h | How long login sessions last |
| `AI_MONTHLY_LIMIT` | 5.00 | Max dollars of AI usage per month |
| `MOCK_MODE` | false | Force mock mode (no API calls) |
| `DATA_RETENTION_DAYS` | 120 | Days before auto-deleting candidate data |

---

## Testing

### Test Authentication
1. Open http://localhost:3000 → login screen appears
2. Try wrong password → "Invalid email or password"
3. Login as recruiter → no Admin nav items visible
4. Login as admin → Admin nav items appear

### Test Role Restrictions
1. As recruiter, try accessing /admin/usage → redirected
2. As admin, all pages accessible

### Test Cost Cap
1. Login as admin → go to "AI Usage & Costs"
2. See current spend and $5 limit
3. When limit reached, evaluations auto-switch to mock mode

### Test Bias Module
```
npm run test:bias
```

---

## Architecture

```
fairhire-ai/
├── server/
│   ├── index.js                 # Express server + auth routes
│   ├── database.js              # SQLite with users/activity/usage tables
│   ├── middleware/
│   │   └── authMiddleware.js    # JWT verification + role checking
│   ├── modules/
│   │   ├── authController.js    # Login, JWT generation
│   │   ├── userModel.js         # User CRUD, bcrypt hashing
│   │   ├── userActivityLogger.js # Tracks all user actions
│   │   ├── usageTracker.js      # AI token/cost tracking, $5 cap
│   │   ├── claudeEvaluator.js   # Claude API + budget enforcement
│   │   ├── piiScrubber.js       # PII removal
│   │   ├── resumeParser.js      # PDF/DOCX parsing
│   │   ├── biasTester.js        # Disparate impact analysis
│   │   ├── auditLogger.js       # System audit trail
│   │   └── kaggleDownloader.js  # Dataset management
│   ├── routes/
│   │   ├── auth.js              # Login, logout, users, activity, usage
│   │   ├── jobs.js              # Job descriptions (auth required)
│   │   ├── candidates.js        # Resume upload/evaluate (auth required)
│   │   └── evaluations.js       # Results, compliance, reports (auth required)
│   └── scripts/
│       ├── seed.js              # Create default users + sample data
│       ├── biasTester.js        # CLI bias test runner
│       ├── generateBiasReport.py
│       └── generateHiringReport.py
├── client/src/
│   ├── App.jsx                  # Auth guard + routing
│   ├── api.js                   # API helper with JWT tokens
│   ├── components/
│   │   └── AuthContext.jsx      # React auth state management
│   └── pages/
│       ├── LoginPage.jsx        # Login screen
│       ├── UploadPage.jsx
│       ├── DashboardPage.jsx
│       ├── ResultsPage.jsx
│       ├── CompliancePage.jsx
│       ├── DatasetPage.jsx
│       ├── ActivityLogsPage.jsx # Admin: user activity logs
│       └── UsagePage.jsx        # Admin: AI cost dashboard
└── data/                        # SQLite DB + datasets
```
