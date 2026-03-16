Merge Admin Panel into Talaria
Overview
The standalone admin panel (pure HTML/CSS/JS) will be integrated into the Talaria journal-frontend (React) as a new protected route at /admin. It will be wired to the real journal-backend admin API (admin_routes.py) which already has endpoints for: users, activity, logs, system health, security, analytics, feature flags, and bulk email.

The merge keeps the premium visual design (dark theme, sidebar, charts) but replaces mock data with live API calls to http://localhost:5001/api/admin/.

What Already Exists in Talaria
What	Location	Notes
Admin API routes	journal-backend/admin_routes.py (101KB)	Users, logs, security, health, analytics, activity
Feature flags UI	
journal-frontend/src/components/FeatureFlagManager.jsx
Already functional
Bulk email UI	
journal-frontend/src/components/BulkEmailManager.jsx
 (78KB)	Already functional
Bulk user import	
journal-frontend/src/components/BulkUserImport.jsx
Already functional
ADMIN_PANEL feature flag	
journal-frontend/src/App.jsx
Route /admin/feature-flags exists
Proposed Changes
journal-frontend
[NEW] src/pages/admin/AdminPanel.jsx
Central admin panel page. Contains the sidebar, topbar, and page router — all in React. Adapts the design from 
admin/index.html
 + 
admin/style.css
.

[NEW] src/pages/admin/AdminDashboard.jsx
Connects to GET /api/admin/dashboard/enhanced — displays real stats: total users, active sessions, revenue, signups, system health.

[NEW] src/pages/admin/AdminUsers.jsx
Connects to GET /api/admin/users — real user table with ban, edit, delete, change plan actions using existing CRUD endpoints.

[NEW] src/pages/admin/AdminSecurity.jsx
Connects to GET /api/admin/security/logs, GET /api/admin/security/blocked-ips, POST /api/admin/security/block-ip — live IP blocking and login logs.

[NEW] src/pages/admin/AdminLogs.jsx
Connects to GET /api/admin/logs — real server log viewer.

[NEW] src/pages/admin/AdminActivity.jsx
Connects to GET /api/admin/activity — live activity feed.

[NEW] src/pages/admin/AdminAnalytics.jsx
Connects to GET /api/admin/analytics/overview — real MRR, churn, conversion metrics.

[NEW] src/pages/admin/AdminEmailer.jsx
Wraps the existing 
BulkEmailManager.jsx
 component — no extra API work needed.

[NEW] src/pages/admin/AdminFeatureFlags.jsx
Wraps the existing 
FeatureFlagManager.jsx
 + 
GroupFeatureFlagManager.jsx
 — no extra API work needed.

[MODIFY] 
src/App.jsx
Add the /admin route under the ADMIN_PANEL feature flag protection. Import AdminPanel.

[MODIFY] 
src/components/Sidebar.jsx
Add an Admin nav link that appears only when ADMIN_PANEL feature flag is enabled.

[MODIFY] 
src/index.css
Add admin-specific CSS variables and card styles (copied/adapted from 
admin/style.css
), so admin pages inherit the existing Tailwind+custom theme seamlessly.

IMPORTANT

The pages that map cleanly to the real API are: Dashboard, Users, Security, Logs, Activity, Analytics, Feature Flags, and Email. Sections like Subscriptions/Payments/Market Data/Backtesting currently have no backend equivalent in Talaria — those will use placeholder/mock data for now with a clear TODO comment, so they are visible in the UI but non-destructive.

Pages Wired to Real API vs Mock
Admin Section	Backend Endpoint	Status
Dashboard	GET /admin/dashboard/enhanced	✅ Real API
Users	GET /admin/users + CRUD	✅ Real API
Security	GET /admin/security/*	✅ Real API
Logs	GET /admin/logs	✅ Real API
Activity Feed	GET /admin/activity	✅ Real API
Analytics Overview	GET /admin/analytics/overview	✅ Real API
Feature Flags	existing component	✅ Real API
Email	existing BulkEmailManager	✅ Real API
Subscriptions	—	🟡 Mock
Payments	—	🟡 Mock
Market Data	—	🟡 Mock
Backtesting Engine	—	🟡 Mock
Trades & Journal	GET /api/journal/stats/all	✅ Real API
Community	—	🟡 Mock
Notifications	existing email infra	🟡 Partial
Affiliates	—	🟡 Mock
Indicators	—	🟡 Mock
AI Tools	—	🟡 Mock
Content	—	🟡 Mock
Email Templates	email-templates/ folder	🟡 Static view
Settings	—	🟡 Mock
Verification Plan
Manual Verification
Start Talaria with docker-compose up -d
Login at http://localhost:3001/journal with an account that has ADMIN_PANEL flag enabled
Click Admin in the sidebar → confirm /admin loads the admin panel layout
Navigate to each section in the admin sidebar — confirm all pages load
On the Users page — confirm real users from the database appear
On the Dashboard page — confirm real stats match backend data
On the Security page — confirm blocked IPs list loads from the API
On the Logs page — confirm log entries appear from the backend
On the Feature Flags page — toggle a flag and confirm it persists on refresh
On the Email page — confirm the BulkEmailManager renders correctly