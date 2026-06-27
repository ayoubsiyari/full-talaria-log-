# Security Implementation Status

Tracks `enterprise_website_security_spec.md` against this repository.

| Section | Status | Location |
|---------|--------|----------|
| §1 WAF / CDN / DDoS | **Template + nginx rate limits** | `securty/cloudflare-waf-template.json`, `homepage/nginx.local.conf` |
| §2 TLS / HSTS / Headers | **Implemented** | `securty/nginx-*.conf`, `talaria_security/headers.py`, Flask/FastAPI middleware |
| §3 App security | **Partial** | ORM, CSRF, password policy, SSRF guard module |
| §4 Auth / MFA / sessions | **Implemented** | `routes/mfa_routes.py`, `routes/auth_routes.py`, `config.py` |
| §5 Data / secrets | **Partial** | Env + Gitleaks; KMS/Vault = ops |
| §6 Infrastructure | **Partial** | Non-root Docker, CI scans; K8s/mTLS = ops |
| §7 Zero Trust | **Not in code** | Requires IdP/ZTNA vendor |
| §8 Admin dashboard | **Partial** | `/api/admin/monitoring/security-dashboard`, admin UI |
| §9 Incident response | **Playbook** | `securty/incident-response-playbook.md` |
| §10 Compliance / audit | **Partial** | `AuditLogChain`, `audit_log_service.py` |
| §11 Release checklist | **API snapshot** | Security dashboard `release_checklist` |

## Ops-only (configure in cloud provider)

- Managed WAF (OWASP CRS), bot management, geo-blocking
- CDN with origin hiding, DNSSEC, CAA records
- KMS / Secrets Manager, encryption at rest (TDE)
- SIEM log shipping (`SOC_SIEM_ENDPOINT`)
- mTLS service mesh, penetration testing schedule

## Verify locally

```bash
./scripts/verify-dependencies.sh
```

## Admin MFA setup

1. Sign in as admin (password only on first setup — blocked until MFA enrolled).
2. `POST /journal/api/auth/mfa/setup` with Bearer token.
3. Scan `provisioning_uri` in authenticator app.
4. `POST /journal/api/auth/mfa/confirm` with `{ "code": "123456" }`.
5. Login with `{ "email", "password", "totp_code" }`.
