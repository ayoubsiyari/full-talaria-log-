# Talaria Trading Platform - Project Documentation

## Overview

**Talaria** is a comprehensive trading journal and mentorship platform designed for traders. The platform consists of multiple interconnected services that provide trading analytics, journal management, bootcamp registration, and a public-facing homepage.

**Domain:** `talaria-log.com` / `talaria.services`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TALARIA PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │    Homepage     │  │ Journal Frontend│  │  Trading Chart  │              │
│  │   (Next.js)     │  │    (React)      │  │   (FastAPI)     │              │
│  │   Port: 8080    │  │   Port: 3001    │  │   Port: 8001    │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           │                    ▼                    │                        │
│           │           ┌─────────────────┐          │                        │
│           │           │ Journal Backend │          │                        │
│           │           │    (Flask)      │          │                        │
│           │           │   Port: 5001    │          │                        │
│           │           └────────┬────────┘          │                        │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                ▼                                             │
│                      ┌─────────────────┐                                     │
│                      │   PostgreSQL    │                                     │
│                      │   Database      │                                     │
│                      └─────────────────┘                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
talaria-log/
├── docker-compose.yml          # Docker orchestration for all services
├── .env                        # Environment variables (gitignored)
├── .gitignore                  # Git ignore rules
│
├── homepage/                   # Public-facing Next.js website
├── journal-frontend/           # React trading journal application
├── journal-backend/            # Flask API backend for journal
├── trading-chart/              # FastAPI service for trading charts/bootcamp
├── email-templates/            # HTML email templates
├── secrets/                    # Secret files (Google service account, etc.)
└── image/                      # Shared images
```

---

## Services Detail

### 1. Homepage (`/homepage`)

**Technology:** Next.js 15.1, React 19, TypeScript, TailwindCSS

**Purpose:** Public-facing marketing website with registration, legal pages, and bootcamp information.

**Key Files:**
```
homepage/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main landing page
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Global styles
│   │   ├── bootcamp/             # Bootcamp registration pages
│   │   ├── dashboard/            # User dashboard
│   │   ├── login/                # Login page
│   │   ├── register/             # Registration pages
│   │   ├── privacy/              # Privacy policy
│   │   ├── terms/                # Terms of service
│   │   ├── disclaimer/           # Legal disclaimer
│   │   └── refunds/              # Refund policy
│   ├── components/               # Reusable UI components
│   └── lib/                      # Utility functions
├── package.json
├── tailwind.config.ts
├── Dockerfile
└── nginx.conf
```

**Key Dependencies:**
- `next` - React framework
- `framer-motion` - Animations
- `@tsparticles/react` - Particle effects
- `lucide-react` - Icons
- `tailwindcss-animate` - Animation utilities

**Docker Port:** 8080

---

### 2. Journal Frontend (`/journal-frontend`)

**Technology:** React 18, Create React App, TailwindCSS

**Purpose:** Professional trading journal with AI-powered analytics and 200+ performance metrics.

**Key Files:**
```
journal-frontend/
├── src/
│   ├── App.jsx                   # Main application component
│   ├── index.js                  # Entry point
│   ├── config.js                 # API configuration
│   │
│   ├── pages/                    # Application pages
│   │   ├── Dashboard.jsx         # Main dashboard
│   │   ├── Journal.jsx           # Trade journal
│   │   ├── Analytics.jsx         # Trading analytics
│   │   ├── Trades.jsx            # Trade list
│   │   ├── ImportTrades.jsx      # Import trades from files
│   │   ├── Settings.jsx          # User settings
│   │   ├── AdminDashboard.jsx    # Admin panel
│   │   ├── Login.jsx             # User login
│   │   ├── Register.jsx          # User registration
│   │   ├── StrategyBuilder.jsx   # Strategy management
│   │   └── analytics/            # Analytics sub-pages (27 items)
│   │
│   ├── components/               # Reusable components
│   │   ├── Sidebar.jsx           # Navigation sidebar
│   │   ├── UnifiedHeader.jsx     # Header component
│   │   ├── ProtectedRoute.jsx    # Auth route wrapper
│   │   ├── ProfileSelector.jsx   # Profile management
│   │   ├── AdvancedFilter.jsx    # Trade filtering
│   │   ├── BulkEmailManager.jsx  # Admin email tool
│   │   ├── FeatureFlagManager.jsx # Feature flags UI
│   │   ├── ui/                   # Base UI components
│   │   ├── calendar/             # Calendar components
│   │   └── analytics/            # Analytics widgets
│   │
│   ├── context/                  # React Context providers
│   │   ├── AuthContext.jsx       # Authentication state
│   │   ├── ProfileContext.jsx    # Profile management
│   │   ├── ThemeContext.jsx      # Dark/light theme
│   │   ├── FilterContext.jsx     # Trade filters
│   │   ├── FeatureFlagsContext.jsx # Feature flags
│   │   ├── BalanceContext.jsx    # Balance tracking
│   │   └── SidebarContext.jsx    # Sidebar state
│   │
│   ├── hooks/                    # Custom React hooks
│   ├── utils/                    # Utility functions
│   └── data/                     # Static data files
│
├── public/                       # Static assets
├── package.json
├── tailwind.config.js
├── Dockerfile
└── nginx.conf
```

**Key Dependencies:**
- `react-router-dom` - Routing
- `axios` - HTTP client
- `recharts` - Charts and graphs
- `@tanstack/react-query` - Data fetching
- `framer-motion` - Animations
- `@tiptap/react` - Rich text editor
- `papaparse` - CSV parsing
- `jspdf` / `html2canvas` - PDF export
- `i18next` / `react-i18next` - Internationalization
- `@mui/material` - Material UI components
- `lucide-react` - Icons
- `react-toastify` - Notifications

**Docker Port:** 3001

---

### 3. Journal Backend (`/journal-backend`)

**Technology:** Flask, SQLAlchemy, Flask-JWT-Extended, PostgreSQL

**Purpose:** REST API backend for the trading journal, handling authentication, trades, profiles, and admin functions.

**Key Files:**
```
journal-backend/
├── app.py                        # Flask application entry point
├── config.py                     # Configuration management
├── models.py                     # SQLAlchemy database models
├── email_service.py              # Email sending functionality
├── requirements.txt              # Python dependencies
├── Dockerfile
│
└── routes/                       # API route blueprints
    ├── auth_routes.py            # Authentication endpoints
    ├── journal_routes.py         # Trade/journal CRUD operations
    ├── profile_routes.py         # User profile management
    ├── admin_routes.py           # Admin panel endpoints
    ├── strategy_routes.py        # Trading strategies
    └── feature_flags_routes.py   # Feature flag management
```

**API Endpoints:**

| Prefix | Blueprint | Description |
|--------|-----------|-------------|
| `/api/auth` | auth_bp | Login, register, password reset, token refresh |
| `/api/journal` | journal_bp | Trade CRUD, import, export, analytics |
| `/api/profile` | profile_bp | Profile management, FTP settings |
| `/api/admin` | admin_bp | User management, bulk email, system settings |
| `/api` | strategy_bp | Strategy CRUD |
| `/api` | feature_flags_bp | Feature flags management |

**Database Models:**
- `User` - User accounts with roles (admin/user)
- `Group` - User groups for mentorship
- `GroupFeatureFlags` - Feature flags per group
- `GroupVariable` - Custom variables per group
- `Profile` - Trading profiles (journal, backtest, journal_live)
- `JournalEntry` - Individual trades with extensive metrics
- `ImportBatch` - Excel/CSV import tracking
- `Strategy` - Trading strategies with rules
- `FeatureFlags` - Global feature toggles
- `BlockedIP` - Security: blocked IP addresses
- `SecurityLog` - Security event logging
- `FailedLoginAttempt` - Rate limiting for login
- `SystemSettings` - Key-value configuration

**Docker Port:** 5001

---

### 4. Trading Chart Service (`/trading-chart`)

**Technology:** FastAPI, SQLAlchemy 2.0, PostgreSQL

**Purpose:** Secondary API service for trading sessions, bootcamp registration, and advanced charting.

**Key Files:**
```
trading-chart/
├── app/
│   ├── main.py                   # FastAPI application
│   ├── settings.py               # Environment configuration
│   ├── db.py                     # Database session management
│   ├── models.py                 # SQLAlchemy models
│   ├── schemas.py                # Pydantic schemas
│   ├── security.py               # Password hashing, JWT
│   ├── deps.py                   # Dependencies (current user, etc.)
│   │
│   └── routes/
│       ├── auth.py               # Authentication endpoints
│       ├── sessions.py           # Trading sessions management
│       ├── admin.py              # Admin functions
│       ├── bootcamp.py           # Bootcamp registration
│       ├── chart_pages.py        # Chart rendering
│       └── monitoring.py         # Health/monitoring endpoints
│
├── scripts/                      # Utility scripts
├── requirements.txt
└── Dockerfile
```

**Database Models (shared with journal-backend):**
- `User` - User accounts
- `TradingSession` - Trading session containers
- `Trade` - Individual trades with MFE/MAE tracking
- `BootcampRegistration` - Bootcamp signups
- `JournalGroup`, `JournalProfile`, `JournalEntry` - Journal models
- `Strategy`, `ImportBatch`, `FeatureFlag`

**Docker Port:** 8001

---

### 5. Email Templates (`/email-templates`)

**Purpose:** HTML email templates for notifications and newsletters.

**Templates:**
- `mentorship-acceptance-ar.html` - Arabic mentorship acceptance
- `mentorship-acceptance-ar-v2.html` - Version 2
- `mentorship-acceptance-ar-v3.html` - Version 3
- `newsletter-educational.html` - Educational content
- `newsletter-market-update.html` - Market updates
- `newsletter-special-offer.html` - Special offers
- `newsletter-weekly-tips.html` - Weekly tips

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts with authentication |
| `journal_groups` | User groups for mentorship programs |
| `journal_profiles` | Trading profiles (journal/backtest/live) |
| `journal_entries` | Individual trade records |
| `import_batches` | Excel/CSV import tracking |
| `strategies` | Trading strategies with rules |
| `trading_sessions` | Session containers for trading-chart |
| `trades` | Trades for trading-chart service |
| `bootcamp_registrations` | Bootcamp signups |
| `feature_flags` | Global feature toggles |
| `group_feature_flags` | Per-group feature flags |
| `group_variable` | Custom variables per group |
| `blocked_ips` | Security: blocked IPs |
| `security_logs` | Security event logs |
| `failed_login_attempts` | Login rate limiting |
| `system_settings` | Key-value configuration |

### Key Relationships

```
User
 ├── has many JournalProfiles
 ├── has many JournalEntries
 ├── has many Strategies
 ├── has many TradingSessions
 └── belongs to Group (optional)

JournalProfile
 ├── belongs to User
 ├── has many JournalEntries
 └── has many ImportBatches

JournalEntry
 ├── belongs to User
 ├── belongs to JournalProfile
 └── belongs to ImportBatch (optional)

Group
 ├── has many Users
 ├── has many GroupFeatureFlags
 └── has many GroupVariables
```

---

## Authentication Flow

1. **Login:** User submits credentials to `/api/auth/login`
2. **Token Generation:** Backend generates JWT access token (24h) and refresh token (30d)
3. **Storage:** Frontend stores tokens in `localStorage`
4. **API Calls:** Frontend includes `Authorization: Bearer <token>` header
5. **Token Refresh:** When access token expires, use refresh token to get new one
6. **Logout:** Clear all tokens from `localStorage`

### Admin Login as User

Admins can login as any user via the admin panel:
1. Admin requests login-as-user from `/api/admin/login-as-user/<user_id>`
2. Backend generates tokens for target user
3. Frontend receives session via URL parameter `?admin_login=<key>`
4. AuthContext processes admin login session

---

## Docker Deployment

### Services Configuration

```yaml
services:
  db:              # PostgreSQL 16
  homepage:        # Next.js (port 8080)
  journal-frontend: # React (port 3001)
  journal-backend:  # Flask (port 5001)
  trading-chart:    # FastAPI (port 8001)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB/USER/PASSWORD` | Database credentials |
| `DATABASE_URL` | Full database connection string |
| `SECRET_KEY` | Application secret key |
| `JWT_SECRET_KEY` | JWT signing key |
| `CORS_ORIGINS` | Allowed CORS origins |
| `ADMIN_EMAIL/PASSWORD/NAME` | Default admin account |
| `SMTP_*` | Email server configuration |
| `GOOGLE_*` | Google Sheets API integration |

### Running Locally

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Individual Development

```bash
# Homepage (Next.js)
cd homepage && npm run dev

# Journal Frontend (React)
cd journal-frontend && npm start

# Journal Backend (Flask)
cd journal-backend && python app.py

# Trading Chart (FastAPI)
cd trading-chart && uvicorn app.main:app --reload
```

---

## Key Features

### Trading Journal
- **Trade Entry:** Manual or import from Excel/CSV
- **Multiple Profiles:** Journal, backtest, live trading modes
- **200+ Metrics:** Win rate, profit factor, Sharpe ratio, etc.
- **Filtering:** Advanced filters by date, symbol, strategy, etc.
- **Visualizations:** Charts, heatmaps, equity curves
- **Screenshots:** Entry/exit trade screenshots
- **Notes:** Rich text notes per trade

### Admin Panel
- **User Management:** Create, edit, deactivate users
- **Bulk Email:** Send newsletters and notifications
- **Group Management:** Create and manage user groups
- **Feature Flags:** Toggle features globally or per-group
- **Login as User:** Debug user issues
- **System Settings:** Key-value configuration

### Security
- **JWT Authentication:** Secure token-based auth
- **Rate Limiting:** Failed login tracking
- **IP Blocking:** Block suspicious IPs
- **Security Logging:** Track security events
- **CORS Protection:** Whitelist allowed origins

---

## Technology Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend (Homepage)** | Next.js 15, React 19, TypeScript, TailwindCSS |
| **Frontend (Journal)** | React 18, CRA, TailwindCSS, Recharts |
| **Backend (Journal)** | Flask, SQLAlchemy, Flask-JWT-Extended |
| **Backend (Chart)** | FastAPI, SQLAlchemy 2.0, Pydantic |
| **Database** | PostgreSQL 16 |
| **Authentication** | JWT (access + refresh tokens) |
| **Containerization** | Docker, Docker Compose |
| **Proxy** | Nginx |
| **Email** | SMTP (configurable) |

---

## File Size Reference

| Component | Largest Files |
|-----------|---------------|
| journal-frontend | `Settings.jsx` (165KB), `Journal.jsx` (117KB), `AdminDashboard.jsx` (44KB) |
| journal-backend | `journal_routes.py` (394KB), `admin_routes.py` (101KB) |
| homepage | `page.tsx` (36KB) |

---

## Contact & Support

- **Domain:** talaria-log.com
- **Services:** talaria.services
- **Email:** contact@talaria.services
