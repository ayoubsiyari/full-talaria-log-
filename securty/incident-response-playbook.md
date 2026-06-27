# Incident Response Playbook (enterprise_website_security_spec.md §9)

## Severity Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| P0 — Critical | Active breach, data exfiltration, full outage | Immediate (< 15 min) |
| P1 — High | Confirmed attack in progress, partial compromise | < 1 hour |
| P2 — Medium | Suspected attack, single system affected | < 4 hours |
| P3 — Low | Policy violation, minor anomaly | < 24 hours |

## Response Steps

1. **Detect** — SIEM alert or manual discovery via Admin Security Dashboard (`/chart/admin-dashboard.html` → Health → Security).
2. **Triage** — Confirm incident scope; assign severity; preserve logs (`security_logs`, `admin_audit_log`, nginx access logs).
3. **Contain** — Block attacker IPs (`POST /journal/api/admin/security/block-ip`); revoke sessions; disable compromised accounts.
4. **Eradicate** — Patch vulnerability; rotate secrets; remove malware.
5. **Recover** — Restore from encrypted backups; verify integrity before production traffic.
6. **Review** — Post-mortem within 5 business days; update controls and this playbook.

## Communication

- **Internal:** Notify security team, engineering lead, and CTO within 1 hour for P0/P1.
- **Regulatory:** GDPR Article 33 — notify authority within 72 hours if personal data involved.
- **Customers:** Notify affected users without undue delay.

## Automated SIEM Alerts (§8.6)

| Event | Severity | Response |
|-------|----------|----------|
| 5+ failed logins from same IP in 1 minute | High | Auto-block IP, alert SOC |
| Admin login from new country | Critical | Email + SMS, require re-auth |
| Critical CVE in production dependency | Critical | Block deploy, page on-call |
| Certificate expiry < 14 days | High | Page on-call, auto-renew |
| Unusual DB query volume (3× baseline) | High | Alert DBA and security |

## Contacts

Configure in production environment:

- `ADMIN_ALERT_EMAIL` — security notifications
- `ONCALL_WEBHOOK_URL` — PagerDuty/Slack webhook (optional)
- `SOC_SIEM_ENDPOINT` — log shipping destination
