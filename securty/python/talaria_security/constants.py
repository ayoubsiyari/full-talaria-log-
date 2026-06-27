"""Spec-aligned security constants (enterprise_website_security_spec.md)."""

# §1.2 / §4.2 — rate limits
GENERAL_RATE_LIMIT_PER_MINUTE = 100
AUTH_RATE_LIMIT_PER_MINUTE = 10

# §4.2 — password policy
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
PASSWORD_BCRYPT_ROUNDS = 12

# §4.2 / §4.3 — account lockout & sessions
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 60
SESSION_INACTIVITY_MINUTES = 30
SESSION_ABSOLUTE_HOURS = 24

# §4.1 — MFA
MFA_BACKUP_CODE_COUNT = 10
MFA_TOTP_ISSUER = "Talaria"

# §10.1 — audit log retention (days)
AUDIT_LOG_RETENTION_DAYS = 365
