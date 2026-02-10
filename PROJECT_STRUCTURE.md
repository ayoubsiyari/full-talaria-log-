# Talaria Mentorship Platform - Project Structure

## Overview

This is a **trading mentorship platform** called **Talaria** consisting of 4 main services running via Docker Compose:

| Service | Tech Stack | Port | Purpose |
|---------|------------|------|---------|
| **homepage** | Next.js (TypeScript) | 8080 | Public landing page & registration |
| **journal-frontend** | React (JSX) | 3001 | Trading journal SPA |
| **journal-backend** | Flask (Python) | 5001 | Journal API & admin |
| **trading-chart** | FastAPI (Python) | 8001 | Auth, bootcamp, monitoring |

**Database:** PostgreSQL 16 (shared across services)

---

## 1. Homepage (`/homepage`)

### Tech Stack
- **Framework:** Next.js with TypeScript
- **Styling:** TailwindCSS, globals.css

### Pages (`/homepage/src/app/`)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `page.tsx` | Main landing page |
| `/bootcamp` | `bootcamp/page.tsx` | Bootcamp registration |
| `/login` | `login/page.tsx` | User login |
| `/register` | `register/page.tsx` | User registration |
| `/dashboard` | `dashboard/` | User dashboard (6 items) |
| `/ninjatrader` | `ninjatrader/page.tsx` | NinjaTrader integration info |
| `/terms` | `terms/page.tsx` | Terms of service |
| `/privacy` | `privacy/page.tsx` | Privacy policy |
| `/refunds` | `refunds/page.tsx` | Refund policy |
| `/disclaimer` | `disclaimer/page.tsx` | Disclaimer |

### Components (`/homepage/src/components/`)
- `BilingualDisclosures.tsx` - Arabic/English legal disclosures
- `SiteDisclosuresFooter.tsx` - Footer with legal info
- `ui/` - Shared UI components

---

## 2. Journal Frontend (`/journal-frontend`)

### Tech Stack
- **Framework:** React 18 with JSX
- **Router:** React Router DOM (base: `/journal`)
- **State:** React Query, Context API
- **Styling:** TailwindCSS

### App Structure (`/journal-frontend/src/App.jsx`)

**Context Providers (nested order):**
1. `QueryClientProvider` - React Query
2. `AuthProvider` - Authentication state
3. `FeatureFlagsProvider` - Feature toggles
4. `ProfileProvider` - User profiles
5. `FilterProvider` - Trade filters
6. `BalanceProvider` - Balance tracking

### Pages (`/journal-frontend/src/pages/`)

#### Public Pages (No Authentication)
| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home.jsx` | Landing page |
| `/login` | `Login.jsx` | User login |
| `/verify-email` | `VerifyEmail.jsx` | Email verification |
| `/resend-verification` | `ResendVerification.jsx` | Resend verification code |
| `/features` | `Features.jsx` | Feature showcase |
| `/pricing` | `Pricing.jsx` | Pricing plans |
| `/contact` | `Contact.jsx` | Contact form |
| `/privacy-policy` | `PrivacyPolicy.jsx` | Privacy policy |
| `/refund-policy` | `RefundPolicy.jsx` | Refund policy |
| `/terms` | `TermsOfService.jsx` | Terms of service |
| `/cookie-policy` | `CookiePolicy.jsx` | Cookie policy |
| `/disclaimer` | `Disclaimer.jsx` | Disclaimer |
| `/legal` | `Legal.jsx` | Legal overview |

#### Protected Pages (Require Authentication + Profile)
| Route | Component | Feature Flag | Purpose |
|-------|-----------|--------------|---------|
| `/dashboard` | `Dashboard.jsx` | DASHBOARD | Main dashboard with metrics |
| `/journal` | `Journal.jsx` | JOURNAL | Trade journal entries |
| `/trades` | `Trades.jsx` | TRADES | Trade list view |
| `/settings` | `Settings.jsx` | SETTINGS | User settings (165KB - extensive!) |
| `/ai-dashboard` | `AIDashboard.jsx` | AI_DASHBOARD | AI-powered insights |
| `/import-trades` | `ImportTrades.jsx` | IMPORT_TRADES | Import trades from files |
| `/strategy-builder` | `StrategyBuilder.jsx` | STRATEGY_BUILDER | Build trading strategies |
| `/notes` | `Notes.jsx` | NOTES | Personal notes |
| `/learn` | `Learn.jsx` | LEARN | Educational content |
| `/manage-profiles` | `ManageProfilePage.jsx` | PROFILE_MANAGEMENT | Manage trading profiles |
| `/select-profile` | `ProfileSelectionPage.jsx` | - | Profile selection |

#### Analytics Pages (`/analytics/*`)
| Route | Component | Feature Flag | Purpose |
|-------|-----------|--------------|---------|
| `/analytics` | `Analytics.jsx` | ANALYTICS | Analytics overview |
| `/analytics/variables` | `VariablesAnalysis.jsx` | ANALYTICS_VARIABLES | Variable performance analysis |
| `/analytics/top-combinations` | `TopCombinationsView.jsx` | ANALYTICS_VARIABLES | Best variable combinations |
| `/analytics/exitanalysis` | `ExitAnalysis.jsx` | ANALYTICS_EXIT_ANALYSIS | Trade exit analysis |
| `/analytics/exitanalysis-amelioration` | `ExitAnalysisAmelioration.jsx` | ANALYTICS_EXIT_ANALYSIS | Exit optimization |
| `/analytics/pnl-distribution` | `PnlDistribution.jsx` | ANALYTICS_PNL_DISTRIBUTION | P&L distribution |
| `/analytics/daily-limit-optimization` | `DailyLimitOptimization.jsx` | ANALYTICS_PNL_DISTRIBUTION | Daily limit optimization |
| `/analytics/equity` | `Equity.jsx` | ANALYTICS_EQUITY | Equity curve |
| `/analytics/calendar` | `Calendar.jsx` | ANALYTICS_CALENDAR | Trading calendar |
| `/analytics/recent-trades` | `RecentTrades.jsx` | ANALYTICS_RECENT_TRADES | Recent trades view |
| `/analytics/symbols` | `SymbolAnalysis.jsx` | ANALYTICS_SYMBOL_ANALYSIS | Symbol performance |
| `/analytics/performance-analysis` | `PerformanceAnalysis.jsx` | ANALYTICS_PERFORMANCE | Performance metrics |
| `/analytics/streaks` | `StreakAnalyzer.jsx` | ANALYTICS_STREAKS | Win/loss streaks |
| `/analytics/trade-duration` | `TradeDuration.jsx` | ANALYTICS_TRADE_DURATION | Trade duration analysis |
| `/analytics/trade-duration-simple` | `TradeDurationSimple.jsx` | ANALYTICS_TRADE_DURATION | Simple duration view |
| `/analytics/all-metrics` | `AllMetrics.jsx` | ANALYTICS_ALL_METRICS | Comprehensive metrics |

#### Admin Pages
| Route | Component | Feature Flag |
|-------|-----------|--------------|
| `/admin/feature-flags` | `FeatureFlagManager.jsx` | ADMIN_PANEL |

### Key Components (`/journal-frontend/src/components/`)

#### Layout & Navigation
- `Sidebar.jsx` - Main navigation sidebar
- `UnifiedHeader.jsx` - Top header bar
- `Layout.jsx` - Page layout wrapper
- `ProtectedRoute.jsx` - Route protection with feature flags
- `FeatureDisabled.jsx` - Disabled feature placeholder

#### Filters & Analysis
- `AdvancedFilter.jsx` (61KB) - Comprehensive trade filtering
- `FilterToggle.jsx` - Filter visibility toggle
- `SummaryMetrics.jsx` - Quick metrics summary
- `TradeExitAnalysis.jsx` - Exit analysis component
- `AISummary.jsx` - AI-generated summaries

#### Profile Management
- `ProfileSelector.jsx` - Profile dropdown
- `NewProfileSelector.jsx` - Enhanced profile selector
- `ProfileManager.jsx` - Full profile management
- `ProfileSetup.jsx` - Initial profile setup

#### Admin Components
- `BulkEmailManager.jsx` (47KB) - Bulk email sending
- `BulkUserImport.jsx` - Import users in bulk
- `FeatureFlagManager.jsx` - Manage feature flags
- `GroupFeatureFlagManager.jsx` - Group-based flags

#### Strategy Components
- `StrategyModal.jsx` - Strategy creation modal
- `StrategyDetailModal.jsx` - Strategy details view
- `StrategyStep1-4.jsx` - Strategy wizard steps

#### Custom Variables
- `CustomVariablesManager.jsx` - Manage custom trade variables
- `VariableSelector.jsx` - Variable selection UI
- `CustomTimePicker.jsx` - Time selection

#### UI Components (`components/ui/`)
- Shared UI primitives (buttons, modals, tooltips, etc.)

### Context Files (`/journal-frontend/src/context/`)

| Context | Purpose |
|---------|---------|
| `AuthContext.jsx` | JWT authentication, login/logout |
| `ProfileContext.jsx` | Active trading profile management |
| `FilterContext.jsx` | Global trade filters |
| `BalanceContext.jsx` | Account balance tracking |
| `FeatureFlagsContext.jsx` | Feature flag state |
| `SidebarContext.jsx` | Sidebar open/closed state |
| `ThemeContext.jsx` | Dark/light theme |

---

## 3. Journal Backend (`/journal-backend`)

### Tech Stack
- **Framework:** Flask with Flask-JWT-Extended
- **Database:** PostgreSQL via SQLAlchemy
- **Email:** Flask-Mail

### API Routes

#### Auth Routes (`/api/auth/`) - `auth_routes.py`
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/login` | User login, returns JWT |
| POST | `/register` | Registration (disabled) |
| POST | `/verify-email` | Verify email with code |
| POST | `/resend-verification` | Resend verification code |
| POST | `/forgot-password` | Request password reset |
| POST | `/reset-password` | Reset password with code |
| GET | `/profile` | Get user profile |
| PUT | `/profile` | Update user profile |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Logout user |
| POST | `/validate-token` | Validate JWT token |
| POST | `/check-email-verified` | Check if email is verified |

#### Journal Routes (`/api/journal/`) - `journal_routes.py` (394KB - largest file!)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/add` | Add new trade entry |
| GET | `/list` | List all trade entries |
| GET | `/stats` | Get trading statistics |
| GET | `/stats/all` | Get all comprehensive stats |
| DELETE | `/delete/<id>` | Delete trade entry |
| PUT | `/<id>` | Update trade entry |
| GET | `/export` | Export trades (CSV/Excel) |
| POST | `/import/excel` | Import trades from Excel |
| POST | `/import` | Import trades (JSON) |
| GET | `/import/history` | Get import history |
| GET | `/import/file/<batch_id>` | Download imported file |
| DELETE | `/import/<batch_id>` | Delete import batch |
| GET | `/strategy-analysis` | Strategy performance analysis |
| GET | `/variables-analysis` | Variables analysis |
| GET | `/combinations-filter` | Filter by variable combinations |
| GET | `/symbol-analysis` | Symbol performance |
| GET | `/risk-summary` | Risk metrics summary |
| GET | `/risk-reward-amelioration` | Risk/reward optimization |
| GET | `/performance-highlights` | Performance highlights |
| GET | `/report-data` | Full report data |
| GET | `/trade/<id>/exit-analysis` | Single trade exit analysis |
| GET | `/analytics/exit-metrics` | Exit metrics analytics |
| GET | `/exit-analysis-summary` | Exit analysis summary |
| GET | `/pnl-distribution` | P&L distribution data |
| GET | `/streaks` | Win/loss streak analysis |
| GET | `/equities` | Equity curve data |
| GET | `/market/benchmark` | Market benchmark data |
| GET | `/health` | Health check |

#### Profile Routes (`/api/profile/`) - `profile_routes.py`
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/profiles` | Get all user profiles |
| POST | `/profiles` | Create new profile |
| PUT | `/profiles/<id>` | Update profile |
| POST | `/profiles/<id>/activate` | Activate profile |
| DELETE | `/profiles/<id>` | Delete profile |
| GET | `/profiles/active` | Get active profile |
| GET | `/modes` | Get available profile modes |

#### Admin Routes (`/api/admin/`) - `admin_routes.py` (101KB)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dashboard` | Admin dashboard data |
| GET | `/dashboard/enhanced` | Enhanced dashboard |
| GET | `/users` | List all users |
| GET | `/users/<id>` | Get user details |
| POST | `/users` | Create user |
| PUT | `/users/<id>` | Update user |
| DELETE | `/users/<id>` | Delete user |
| POST | `/users/bulk` | Bulk user operations |
| GET | `/users/export` | Export users |
| POST | `/import-users` | Import users from file |
| GET | `/download-user-template` | Get import template |
| GET | `/logs` | Get admin logs |
| GET | `/activity` | Get recent activity |
| GET | `/groups` | List groups |
| POST | `/groups` | Create group |
| GET | `/groups/<id>/analytics` | Group analytics |
| POST | `/users/<id>/login-as` | Login as user (admin) |
| POST | `/send-bulk-email` | Send bulk emails |
| GET | `/monitoring/overview` | System monitoring |
| GET | `/system/health` | System health check |
| GET | `/system/metrics` | System metrics |
| GET | `/security/blocked-ips` | Get blocked IPs |
| POST | `/security/block-ip` | Block an IP |
| DELETE | `/security/unblock-ip/<id>` | Unblock IP |
| GET | `/security/logs` | Security logs |
| GET | `/security/failed-logins` | Failed login attempts |
| GET | `/security/stats` | Security statistics |
| GET | `/analytics/overview` | Analytics overview |

#### Feature Flags Routes (`/api/`) - `feature_flags_routes.py`
- Feature flag management endpoints

#### Strategy Routes (`/api/`) - `strategy_routes.py`
- Trading strategy endpoints

---

## 4. Trading Chart Service (`/trading-chart`)

### Tech Stack
- **Framework:** FastAPI
- **Database:** PostgreSQL via SQLAlchemy
- **Auth:** JWT sessions

### API Routes

#### Auth Routes (`/api/auth/`) - `auth.py`
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/signup` | User registration |
| POST | `/login` | User login |
| POST | `/verify-email` | Verify email |
| POST | `/resend-code` | Resend verification |
| POST | `/forgot-password` | Password reset request |
| POST | `/reset-password` | Reset password |
| GET | `/me` | Get current user |
| PUT | `/profile` | Update profile |

#### Bootcamp Routes (`/api/bootcamp/`) - `bootcamp.py`
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/register` | Register for bootcamp |
| GET | `/registrations` | List registrations (admin) |

#### Sessions Routes - `sessions.py`
- Trading session management

#### Admin Routes - `admin.py`
- Admin functionality

#### Monitoring Routes - `monitoring.py`
- System monitoring

#### Chart Pages Routes - `chart_pages.py`
- Chart-related pages

---

## 5. Email Templates (`/email-templates/`)

| File | Purpose |
|------|---------|
| `mentorship-acceptance-ar.html` | Arabic acceptance email (v1) |
| `mentorship-acceptance-ar-v2.html` | Arabic acceptance email (v2) |
| `mentorship-acceptance-ar-v3.html` | Arabic acceptance email (v3) |

---

## 6. Docker Compose Services

```yaml
services:
  db:           PostgreSQL 16 (port: internal)
  trading-chart: FastAPI (port: 8001 → 8000)
  homepage:     Next.js (port: 8080 → 80)
  journal-backend: Flask (port: 5001 → 5000)
  journal-frontend: React (port: 3001 → 80)
```

---

## Development Workflow

### Starting the Project
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service-name]
```

### Key Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET_KEY` - JWT signing key
- `SECRET_KEY` - App secret key
- `CORS_ORIGINS` - Allowed origins
- `SMTP_*` - Email configuration
- `ADMIN_EMAIL/PASSWORD` - Default admin credentials

### URLs (Development)
- Homepage: http://localhost:8080
- Journal Frontend: http://localhost:3001/journal
- Journal Backend API: http://localhost:5001/api
- Trading Chart API: http://localhost:8001/api

### URLs (Production - talaria-log.com)
- Homepage: https://talaria-log.com
- Journal: https://talaria-log.com/journal
- API: https://talaria-log.com/api

---

## Feature Flags System

The platform uses feature flags to control access to features per user/group:

**Core Features:** DASHBOARD, JOURNAL, TRADES, SETTINGS
**Advanced Features:** AI_DASHBOARD, IMPORT_TRADES, STRATEGY_BUILDER, NOTES, LEARN, PROFILE_MANAGEMENT
**Analytics Features:** ANALYTICS, ANALYTICS_VARIABLES, ANALYTICS_EXIT_ANALYSIS, ANALYTICS_PNL_DISTRIBUTION, ANALYTICS_EQUITY, ANALYTICS_CALENDAR, ANALYTICS_RECENT_TRADES, ANALYTICS_SYMBOL_ANALYSIS, ANALYTICS_PERFORMANCE, ANALYTICS_STREAKS, ANALYTICS_TRADE_DURATION, ANALYTICS_ALL_METRICS
**Admin Features:** ADMIN_PANEL
**Test Features:** TEST_COMBINATIONS, TEST_FILTER

---

## Key Files by Size (Complexity Indicators)

| File | Size | Notes |
|------|------|-------|
| `journal_routes.py` | 394KB | Core journal API logic |
| `Settings.jsx` | 165KB | Extensive settings page |
| `VariablesAnalysis.jsx` | 124KB | Complex variables analysis |
| `Journal.jsx` | 117KB | Main journal component |
| `admin_routes.py` | 101KB | Admin functionality |
| `Dashboard.jsx` | 64KB | Main dashboard |
| `AdvancedFilter.jsx` | 61KB | Complex filtering logic |
| `ImportTrades.jsx` | 58KB | Trade import functionality |
| `SymbolAnalysis.jsx` | 58KB | Symbol analysis |
| `Analytics.jsx` | 55KB | Analytics overview |
