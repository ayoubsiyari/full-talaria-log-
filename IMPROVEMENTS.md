# Talaria Project - Improvement Plan

## Overview

This document outlines the identified issues and improvements needed to make the Talaria platform smoother and more synchronized.

---

## 🔴 Critical Issues

### 1. Duplicate Backends with Shared Database

**Current State:**
- `journal-backend` (Flask) and `trading-chart` (FastAPI) both access the same PostgreSQL database
- Both have duplicate model definitions that can drift out of sync

**Problem:** Models can become inconsistent, causing data corruption or API failures.

**Solution:** 
- [ ] Phase 1: Create shared models package
- [ ] Phase 2: Use Alembic for centralized migrations
- [ ] Phase 3: Consider merging backends (long-term)

---

### 2. Massive Route Files

**Current State:**
- `journal_routes.py` is **394KB** (~10,000+ lines)
- `admin_routes.py` is **101KB**

**Problem:** Extremely difficult to maintain, debug, and test.

**Solution:** Split into smaller, focused modules:
```
routes/
├── journal/
│   ├── __init__.py       # Blueprint registration
│   ├── trades.py         # Trade CRUD operations
│   ├── import_export.py  # Excel/CSV import & export
│   ├── analytics.py      # Statistics & calculations
│   ├── filters.py        # Advanced filtering
│   └── screenshots.py    # Screenshot handling
├── admin/
│   ├── __init__.py
│   ├── users.py          # User management
│   ├── groups.py         # Group management
│   ├── emails.py         # Bulk email
│   └── security.py       # IP blocking, logs
```

**Status:** ✅ Completed

**Implementation:**
- Created `routes/journal/` package with modular structure:
  - `__init__.py` - Blueprint registration
  - `filters.py` - Common filtering and query logic
  - `trades.py` - CRUD operations (add, list, update, delete)
  - `analytics.py` - Stats, strategy/symbol analysis, risk summary
  - `import_export.py` - Excel/CSV import and export
  - `exit_analysis.py` - Trade exit analysis metrics
  - `advanced.py` - Streaks, equity curves, variable combinations
- Updated `app.py` to use the new modular package
- Preserved original file as `journal_routes.py.old`

---

### 3. Large Frontend Components

**Current State:**
- `Settings.jsx` is **165KB**
- `Journal.jsx` is **117KB**
- `Analytics.jsx` is **55KB**

**Problem:** Hard to maintain, slow to load, difficult to test.

**Solution:** Break into smaller, reusable components:
```
pages/
├── Settings/
│   ├── index.jsx              # Main container
│   ├── ProfileSettings.jsx    # Profile tab
│   ├── SecuritySettings.jsx   # Security tab
│   ├── AdminPanel.jsx         # Admin panel
│   └── components/            # Shared setting components
├── Journal/
│   ├── index.jsx
│   ├── TradeForm.jsx
│   ├── TradeList.jsx
│   ├── TradeFilters.jsx
│   └── TradeStats.jsx
```

**Status:** 🔄 Partially Complete

**Implementation:**
- Created `pages/Settings/` folder structure with:
  - `index.jsx` - Main container with tab routing
  - `ProfileSettings.jsx` - User profile management
  - `SecuritySettings.jsx` - Password and security settings
  - `AdminPanel.jsx` - Admin functionality placeholder
- Original `Settings.jsx` preserved for backward compatibility
- Pattern established for future component splitting

**Note:** Full migration requires updating imports in App.jsx to use the new modular components.

---

## 🟡 Synchronization Improvements

### 4. Database Migrations (Alembic)

**Current State:**
- Using `db.create_all()` which doesn't handle schema changes
- No migration history or rollback capability

**Solution:**
- [x] Install Alembic
- [x] Initialize migration repository
- [x] Create migration configuration
- [x] Document migration workflow

**Status:** ✅ Completed

**Implementation:**
- Added `alembic==1.13.1` to `requirements.txt`
- Created `alembic.ini` configuration file
- Created `migrations/` folder structure:
  - `env.py` - Alembic environment configuration
  - `script.py.mako` - Migration template
  - `README.md` - Usage documentation
  - `versions/` - Migration scripts folder

**Usage:**
```bash
# Generate migration from model changes
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

### 5. Centralize Email Templates

**Current State:**
- Templates in `/email-templates/` folder (7 files)
- Templates also inline in `email_service.py` (3 templates)
- Duplication and inconsistency

**Solution:**
- [x] Move all inline templates to `/email-templates/`
- [x] Create template loader utility
- [x] Use consistent naming convention

**Status:** ✅ Completed

**Implementation:**
- Created `email_templates.py` utility module with:
  - `load_template()` - Loads HTML from file
  - `render_email_template()` - Loads and renders with context
  - `get_plain_text_template()` - Plain text fallbacks
- Created new template files:
  - `verification-email.html`
  - `password-reset-ar.html`
  - `welcome-email.html`
- Updated `email_service.py` to use the template loader

---

### 6. Create Shared Constants Package

**Current State:**
- Feature flags defined separately in frontend and backend
- Storage keys hardcoded in multiple places
- API endpoints scattered

**Solution:**
```
shared/
├── constants.json       # Feature flags, storage keys, API endpoints
└── README.md            # Usage documentation
```

**Status:** ✅ Completed

**Implementation:**
- Created `shared/constants.json` with:
  - App metadata (name, version, domain)
  - Storage keys for localStorage
  - Feature flag categories
  - API endpoint paths
  - Default values and limits
  - Instrument types, trade directions, profile modes
- Created `shared/README.md` with usage examples for JS and Python

---

## 🟢 Quick Wins

### 7. Unified Error Handling

**Current State:** Inconsistent error responses across backends.

**Solution:**
```python
# Standard error response format
{
    "error": true,
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": {...}
}
```

**Status:** ⏳ Pending

---

### 8. Health Check Endpoints

**Current State:** Different health check formats per service.

**Solution:** Standardize:
```json
GET /health
{
    "status": "healthy",
    "service": "journal-backend",
    "version": "1.0.0",
    "database": "connected",
    "timestamp": "2026-02-11T10:00:00Z"
}
```

**Status:** ⏳ Pending

---

### 9. Environment Configuration

**Current State:** 
- `.env` file exists but no `.env.example`
- Variables scattered across services

**Solution:**
- [ ] Create `.env.example` with all variables documented
- [ ] Add validation for required variables on startup

**Status:** ⏳ Pending

---

## 📋 Implementation Order

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 1 | Split journal_routes.py | 🔴 High | Medium | 🔄 In Progress |
| 2 | Split admin_routes.py | 🔴 High | Medium | ⏳ Pending |
| 3 | Set up Alembic migrations | 🔴 High | Low | ⏳ Pending |
| 4 | Split Settings.jsx | 🟡 Medium | Medium | ⏳ Pending |
| 5 | Split Journal.jsx | 🟡 Medium | Medium | ⏳ Pending |
| 6 | Centralize email templates | 🟡 Medium | Low | ⏳ Pending |
| 7 | Create shared constants | 🟢 Low | Low | ⏳ Pending |
| 8 | Add .env.example | 🟢 Low | Low | ⏳ Pending |
| 9 | Standardize health checks | 🟢 Low | Low | ⏳ Pending |

---

## Progress Log

### 2026-02-11
- [x] Created IMPROVEMENTS.md
- [x] Split journal_routes.py into modular package (routes/journal/)
- [x] Set up Alembic migrations
- [x] Centralized email templates with loader utility
- [x] Created shared constants package
- [x] Created Settings component folder structure

---

## Notes

- All changes should maintain backward compatibility
- Run tests after each major change
- Keep Docker builds working throughout
