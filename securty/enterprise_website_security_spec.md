# Enterprise Website Security Specification
> **For:** Development / DevSecOps Agent  
> **Purpose:** Build and configure a production-grade, Zero Trust-aligned secure web system  
> **Version:** 1.0

---

## Table of Contents

1. [Perimeter Security](#1-perimeter-security)
2. [Transport & Protocol Security](#2-transport--protocol-security)
3. [Application Security](#3-application-security)
4. [Authentication & Access Control](#4-authentication--access-control)
5. [Data Security](#5-data-security)
6. [Infrastructure Security](#6-infrastructure-security)
7. [Zero Trust Architecture](#7-zero-trust-architecture)
8. [Admin Security Dashboard](#8-admin-security-dashboard)
9. [Incident Response](#9-incident-response)
10. [Compliance & Audit](#10-compliance--audit)
11. [Security Testing Checklist](#11-security-testing-checklist)

---

## 1. Perimeter Security

### 1.1 Web Application Firewall (WAF)
- Deploy a managed WAF (AWS WAF, Cloudflare WAF, or Azure Front Door WAF) in front of all public endpoints.
- Enable OWASP Core Rule Set (CRS) v3.3+.
- Block the OWASP Top 10 by default: SQLi, XSS, CSRF, SSRF, path traversal, XML injection, insecure deserialization.
- Enable bot management rules (block scrapers, credential stuffing bots, scanners).
- Set WAF to **blocking mode** (not just detection mode) in production.
- Log every blocked request to the SIEM with full request headers, IP, and geo-location.

### 1.2 DDoS Protection
- Enable Layer 3/4 DDoS protection (volumetric, protocol) at the network edge.
- Enable Layer 7 DDoS protection (HTTP floods, slow loris) at the WAF.
- Set rate limits per IP: 100 requests/minute for general pages, 10/minute for auth endpoints.
- Configure automatic IP blacklisting for IPs exceeding thresholds.
- Use anycast routing via CDN to absorb volumetric attacks.

### 1.3 Content Delivery Network (CDN)
- Route all traffic through a CDN (Cloudflare, Fastly, or AWS CloudFront).
- Hide the true origin IP — never expose the origin server directly.
- Enable CDN-level TLS termination with HTTP/2 and HTTP/3 (QUIC) support.
- Configure CDN to strip sensitive response headers before delivery.
- Cache static assets aggressively; pass API requests and auth routes to origin only.

### 1.4 IP Allowlisting & Geo-blocking
- Restrict admin panels, SSH, and internal APIs to allowlisted IPs only.
- Block traffic from countries where the service does not operate (geo-blocking) unless there's a business reason.
- Maintain a dynamic blocklist updated from threat intelligence feeds (AbuseIPDB, Spamhaus, etc.).
- Block Tor exit nodes and known VPN abuse ranges from accessing sensitive endpoints.

### 1.5 DNS Security
- Enable DNSSEC on all domains.
- Use DNS CAA records to restrict which CAs can issue certificates for your domain.
- Set DNS TTL appropriately — short TTL for frequently changing records, longer for stable ones.
- Monitor for DNS hijacking and unauthorized zone changes.
- Use split-horizon DNS — internal and external DNS namespaces are separate.

---

## 2. Transport & Protocol Security

### 2.1 TLS Configuration
- Enforce TLS 1.2 as minimum; TLS 1.3 preferred.
- Disable SSLv2, SSLv3, TLS 1.0, and TLS 1.1 entirely.
- Use strong cipher suites only. Recommended TLS 1.3 ciphers:
  - `TLS_AES_256_GCM_SHA384`
  - `TLS_CHACHA20_POLY1305_SHA256`
  - `TLS_AES_128_GCM_SHA256`
- Enable Perfect Forward Secrecy (PFS) via ECDHE key exchange.
- Use RSA 2048-bit or ECDSA 256-bit certificates minimum.
- Enable OCSP stapling to speed up certificate validation.
- Aim for an A+ rating on SSL Labs (ssllabs.com/ssltest).

### 2.2 HTTP Strict Transport Security (HSTS)
- Set `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- Submit the domain to the HSTS preload list.
- Never serve any content over plain HTTP — redirect all HTTP to HTTPS (301).

### 2.3 Secure HTTP Headers
Every response must include the following headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; style-src 'self' 'nonce-{random}'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; upgrade-insecure-requests;
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

- Remove: `X-Powered-By`, `Server`, `X-AspNet-Version`, `X-AspNetMvc-Version`
- Validate headers using securityheaders.com — target an A rating.
- Generate a fresh CSP nonce per request; never use `'unsafe-inline'` or `'unsafe-eval'` in production.

### 2.4 Certificate Management
- Use short-lived certificates (90 days max, Let's Encrypt preferred) with automated renewal.
- Store private keys in a Hardware Security Module (HSM) or cloud KMS — never on disk in plaintext.
- Alert when any certificate is within 30 days of expiry.
- Certificate pinning for mobile apps — pin to the intermediate CA, not the leaf.

---

## 3. Application Security

### 3.1 Input Validation & Output Encoding
- Validate ALL input server-side — never trust client-side validation alone.
- Use an allowlist approach: define valid patterns and reject everything else.
- Validate type, length, format, and range for every field.
- HTML-encode all user-supplied data before rendering in HTML context.
- Use parameterized queries / prepared statements for ALL database queries — never concatenate SQL strings.
- Encode for context: HTML encoding for HTML, JS escaping for JS, CSS escaping for CSS.

### 3.2 Cross-Site Scripting (XSS) Prevention
- Implement Content Security Policy (see section 2.3).
- Use a templating engine with auto-escaping enabled (e.g., Jinja2, Handlebars, React JSX).
- Never use `innerHTML`, `document.write()`, or `eval()` with user-controlled input.
- Sanitize rich text input with a strict allowlist library (e.g., DOMPurify).
- Set `HttpOnly` and `Secure` flags on all session cookies.

### 3.3 Cross-Site Request Forgery (CSRF) Prevention
- Use synchronizer token pattern: generate a unique, unpredictable CSRF token per session.
- Include the token in every state-changing request (POST, PUT, PATCH, DELETE).
- Validate the CSRF token server-side on every mutation.
- Set `SameSite=Strict` or `SameSite=Lax` on session cookies.
- Use the `Origin` and `Referer` headers as a secondary check.

### 3.4 SQL Injection Prevention
- Use an ORM with parameterized queries (SQLAlchemy, Prisma, ActiveRecord, etc.).
- If raw SQL is needed, use prepared statements with bound parameters exclusively.
- Apply principle of least privilege to DB users — the app DB user should not have `DROP`, `CREATE`, or `GRANT` permissions.
- Use a database firewall (e.g., Cloudflare D1, AWS RDS Proxy) to filter anomalous queries.
- Enable DB-level query logging and alert on anomalous patterns.

### 3.5 Server-Side Request Forgery (SSRF) Prevention
- Validate and allowlist all URLs before making server-side HTTP requests.
- Block requests to private IP ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (link-local / cloud metadata endpoint).
- Do not follow redirects automatically in server-side HTTP clients.
- Use an egress proxy to control all outbound server traffic.

### 3.6 Dependency & Supply Chain Security
- Run `npm audit` / `pip-audit` / `bundler-audit` on every CI build.
- Block deploys if any **critical** severity CVE is present in dependencies.
- Pin dependency versions in lockfiles (`package-lock.json`, `poetry.lock`, etc.).
- Use Dependabot or Renovate for automated dependency updates.
- Verify integrity of third-party scripts with Subresource Integrity (SRI) hashes.
- Scan container images with Trivy or Grype before deployment.

### 3.7 Error Handling & Information Disclosure
- Never expose stack traces, internal paths, or database errors to end users.
- Return generic error messages in production. Log the full details server-side.
- Disable debug mode, verbose logging, and development endpoints in production.
- Ensure 404 pages don't reveal whether a resource exists vs. is forbidden.
- Implement structured logging — never log passwords, tokens, or PII.

---

## 4. Authentication & Access Control

### 4.1 Multi-Factor Authentication (MFA)
- Require MFA for ALL admin and privileged accounts — no exceptions.
- Offer MFA for all users: TOTP (Google Authenticator, Authy), hardware keys (FIDO2/WebAuthn), or passkeys.
- Support passkeys (WebAuthn) as the primary auth method where possible.
- Block logins from users with MFA enabled but not completed.
- Generate and store one-time backup codes, encrypted, for account recovery.

### 4.2 Password Policy
- Minimum 12 characters. No maximum below 64.
- Check against known breached passwords using the HaveIBeenPwned API (k-anonymity method).
- Do NOT require periodic password rotation (per NIST SP 800-63B) — rotate only on breach.
- Hash passwords with bcrypt (cost factor 12+), Argon2id, or scrypt. Never MD5, SHA-1, or unsalted SHA-256.
- Implement account lockout after 5 failed attempts; use exponential backoff + CAPTCHA.

### 4.3 Session Management
- Generate session IDs with a cryptographically secure random number generator (CSPRNG), minimum 128 bits.
- Regenerate session ID after login (session fixation prevention).
- Set session expiry: 15–30 minutes of inactivity for sensitive operations, 24 hours absolute max.
- Invalidate all sessions on password change, logout, or detected compromise.
- Store sessions server-side (Redis, database) — never store sensitive data in client-side cookies or localStorage.
- Set cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/`

### 4.4 OAuth 2.0 / OpenID Connect (OIDC)
- Use Authorization Code Flow with PKCE for all OAuth flows.
- Never use Implicit Flow.
- Validate `state` parameter to prevent CSRF on OAuth callbacks.
- Validate `nonce` in ID tokens.
- Restrict redirect URIs to an exact allowlist — no wildcard URIs.
- Use short-lived access tokens (15 minutes) with refresh token rotation.

### 4.5 Role-Based Access Control (RBAC)
- Define roles explicitly: `superadmin`, `admin`, `editor`, `viewer`, `api_client`.
- Enforce roles server-side on every request — never rely on client-side role checks.
- Apply principle of least privilege: each role has only the minimum permissions needed.
- Use attribute-based access control (ABAC) for fine-grained resource permissions.
- Deny by default — explicitly grant access rather than explicitly deny.
- Log every privilege escalation or role change.

### 4.6 API Authentication
- All APIs require authentication — no anonymous access to sensitive endpoints.
- Use short-lived JWT access tokens signed with RS256 or ES256 (asymmetric).
- Validate token signature, expiry (`exp`), issuer (`iss`), and audience (`aud`) on every request.
- Rotate API keys regularly; support key versioning for graceful rotation.
- Use mTLS (mutual TLS) for service-to-service API authentication.
- Implement API key scoping — each key has declared permissions, not blanket access.

---

## 5. Data Security

### 5.1 Encryption at Rest
- Encrypt all databases, file storage, and backups using AES-256.
- Use cloud-provider KMS (AWS KMS, GCP Cloud KMS, Azure Key Vault) for key management.
- Enable transparent data encryption (TDE) on all relational databases.
- Encrypt sensitive fields at the application layer (column-level encryption) for PII, payment data, health records.
- Never store plaintext secrets, API keys, or credentials in code, config files, or environment variables in source control.

### 5.2 Encryption in Transit
- All internal service-to-service communication must use TLS — even within the same VPC.
- Use mTLS for service mesh communication (Istio, Linkerd, or equivalent).
- Encrypt message queues (SQS, Kafka, RabbitMQ) with TLS.
- Never use unencrypted protocols (HTTP, FTP, Telnet, plain SMTP) in any environment.

### 5.3 Secrets Management
- Use a dedicated secrets manager: HashiCorp Vault, AWS Secrets Manager, or GCP Secret Manager.
- Never hardcode secrets in source code or commit them to version control.
- Rotate all secrets automatically on a schedule: API keys every 90 days, DB credentials every 30 days, TLS certs every 90 days.
- Audit every secret access — log who accessed what and when.
- Use short-lived dynamic credentials (Vault dynamic secrets) for database access where possible.
- Scan all code commits for secret leaks using `git-secrets`, `truffleHog`, or Gitleaks in CI.

### 5.4 Data Classification & Handling
- Classify all data: Public / Internal / Confidential / Restricted.
- Apply controls appropriate to the classification level:
  - **Public:** No special controls.
  - **Internal:** Authenticated access only, encrypted in transit.
  - **Confidential:** Encrypted at rest and in transit, access logging, MFA required.
  - **Restricted (PII/PHI/PCI):** Column-level encryption, strict RBAC, DLP controls, audit trail.
- Implement Data Loss Prevention (DLP) to detect and block exfiltration of sensitive data patterns.
- Anonymize or pseudonymize PII in non-production environments (dev, staging, test).

### 5.5 Backup Security
- Encrypt all backups with a separate key from the production encryption key.
- Store backups in a separate account / cloud region from production.
- Test restoration from backup monthly.
- Implement immutable backup storage (WORM) to protect against ransomware.
- Retain backups per compliance requirements (e.g., 7 years for financial, 6 years for HIPAA).

---

## 6. Infrastructure Security

### 6.1 Network Segmentation
- Separate network into zones: DMZ (public), application, database, management.
- Use security groups / NACLs to enforce traffic rules between zones.
- Database servers must NOT be publicly accessible — only accessible from the application tier.
- Management interfaces (SSH, RDP, admin panels) must NOT be internet-facing.
- Use a bastion host or VPN for all administrative access.

### 6.2 Container & Kubernetes Security
- Run containers as non-root users.
- Use read-only root filesystems where possible.
- Set resource limits (CPU, memory) on all containers.
- Scan container images for vulnerabilities before deployment (Trivy, Snyk).
- Use Kubernetes Network Policies to restrict pod-to-pod communication.
- Enable Kubernetes RBAC and audit logging.
- Do not mount the Docker socket in containers.
- Use Pod Security Admission (PSA) to enforce security standards on pods.

### 6.3 Server Hardening
- Follow CIS Benchmarks for the OS, web server, and database.
- Disable unnecessary services, ports, and protocols.
- Apply OS patches within 14 days of release for critical/high CVEs.
- Enable host-based firewall (iptables/nftables) with default-deny.
- Install a host-based intrusion detection system (HIDS): OSSEC, Wazuh, or Falco.
- Disable root SSH login; use key-based authentication only.
- Configure SSH: disable password auth, use Ed25519 keys, restrict to allowlisted IPs.

### 6.4 CI/CD Pipeline Security
- Require code review and approval before merging to main/production branches.
- Run SAST (Static Application Security Testing) on every pull request: Semgrep, CodeQL, Bandit.
- Run DAST (Dynamic Application Security Testing) against staging before every production deploy.
- Run SCA (Software Composition Analysis) to detect vulnerable dependencies.
- Sign all build artifacts and container images (Sigstore/cosign).
- Use short-lived OIDC tokens for CI/CD cloud authentication — never long-lived static keys.
- Separate CI/CD credentials per environment; staging cannot deploy to production.

---

## 7. Zero Trust Architecture

### Core Principle
**"Never trust, always verify."** Every user, device, service, and network request is treated as potentially hostile, regardless of where it originates — even within the internal network.

### 7.1 Identity as the New Perimeter
- Every access request must be authenticated and authorized via a central Identity Provider (IdP): Okta, Azure AD, Keycloak, or AWS IAM Identity Center.
- Device health must be verified on every login: is the device managed? Is the OS patched? Is the disk encrypted?
- User context is evaluated continuously: location, time, behavior, device posture.
- Implement Continuous Adaptive Risk and Trust Assessment (CARTA).

### 7.2 Least Privilege Access
- Grant access only to resources required for the specific task.
- Implement Just-In-Time (JIT) access for privileged operations — access is requested, approved, and expires automatically.
- Use Just-Enough-Access (JEA) for administrative tasks.
- Review and recertify all access permissions quarterly.
- Automatically revoke access for departed employees within 1 hour of offboarding.

### 7.3 Microsegmentation
- Divide the network into small segments; each workload can only communicate with explicitly permitted services.
- Implement east-west traffic inspection within the network — not just north-south (external) traffic.
- Use a service mesh (Istio, Consul) to enforce mTLS and authorization policies between all services.
- Default deny all traffic; explicitly allow only required flows.

### 7.4 Assume Breach Posture
- Design every system as if the perimeter is already breached.
- Minimize blast radius: isolate sensitive systems so a single breach cannot cascade.
- Enable full telemetry across the entire environment: logs, traces, and metrics from every service.
- Implement behavioral analytics to detect anomalous patterns that indicate compromise.
- Red team exercises quarterly to validate "assume breach" defenses.

### 7.5 Device Trust
- Require managed (enrolled) devices for all admin and privileged access.
- Enforce device compliance policies: OS patch level, disk encryption, screen lock, EDR installed.
- Block access from unmanaged or non-compliant devices to sensitive resources.
- Implement Mobile Device Management (MDM): Jamf, Intune, or Google Endpoint Management.

### 7.6 Zero Trust Network Access (ZTNA)
- Replace traditional VPN with a ZTNA solution (Cloudflare Access, Zscaler, BeyondCorp, Tailscale).
- ZTNA grants access to specific applications, not the entire network.
- Every connection to internal apps requires identity verification, device check, and authorization.
- Session tokens expire and require re-authentication on suspicious context change (new location, new device).

---

## 8. Admin Security Dashboard

### 8.1 Real-Time Threat Monitoring
The dashboard must display live metrics with ≤30-second refresh for:

- **Active blocked attacks** — WAF blocks, DDoS events, rate-limited IPs, by type (SQLi, XSS, bot, etc.)
- **Live traffic map** — global requests per second, geo-distribution, anomaly spike indicator
- **Current threat level** — aggregate risk score (Green / Yellow / Orange / Red) based on active incidents
- **Top attacking IPs** — ranked by block count with ASN, country, and ISP data

### 8.2 Authentication & Access Events
- Failed login attempts per hour (with chart showing trend)
- Accounts locked out in the last 24 hours
- MFA bypass attempts or unexpected MFA failures
- Privilege escalations — who granted what role to whom, and when
- Admin actions log — filterable by user, action type, and resource
- Active sessions — all currently authenticated users with IP, device, and session age
- Unusual login alerts — new country, new device, off-hours login, impossible travel

### 8.3 Vulnerability & Patch Status
- Open CVEs across all dependencies, grouped by severity (Critical / High / Medium / Low)
- Number of unpatched systems and days since patch was available
- Last SAST/DAST scan results with trend vs. prior scan
- Container image vulnerabilities — per image, per service
- Certificate expiry tracker — all TLS certs with days remaining, highlighted if < 30 days
- Secrets rotation status — which secrets are overdue for rotation

### 8.4 Infrastructure Health
- Network traffic by zone (DMZ, app, DB) — unusual east-west traffic highlighted
- Security group / firewall rule changes (who changed what, when)
- Failed SSH / RDP attempts per server
- Kubernetes audit log summary — unauthorized API calls, role changes, privilege escalation attempts
- Cloud config drift alerts — any resource that deviates from its approved baseline

### 8.5 Data & Compliance
- DLP events — detected sensitive data patterns in outbound traffic or logs
- Database audit trail — unusual queries, bulk exports, off-hours access
- Backup status — last successful backup per system, restoration test date
- Compliance posture score — CIS Benchmark pass rate, per service and overall
- Audit log integrity check — confirm logs have not been tampered with (hash chain verification)
- GDPR / HIPAA / PCI data access report — who accessed restricted data in the last 30 days

### 8.6 SIEM & Alerting Rules
Integrate with a SIEM (Splunk, Elastic SIEM, Microsoft Sentinel, or Datadog Security) and configure alerts for:

| Event | Severity | Response |
|---|---|---|
| 5+ failed logins from same IP in 1 minute | High | Auto-block IP, alert SOC |
| Admin login from new country | Critical | Notify admin via email + SMS, require re-auth |
| CVE Critical in production dependency | Critical | Block deploy, page on-call |
| WAF in detection mode (not blocking) | High | Alert daily until resolved |
| Certificate expiry < 14 days | High | Page on-call, auto-renew attempt |
| Secret not rotated > 90 days | Medium | Alert team |
| Unusual DB query volume (3x baseline) | High | Alert DBA and security |
| Outbound data volume > 2x baseline | Critical | Trigger DLP review, alert SOC |
| Container running as root in production | High | Alert DevOps |
| Unapproved firewall rule change | Critical | Revert and alert |

---

## 9. Incident Response

### 9.1 Incident Severity Levels

| Level | Definition | Response Time |
|---|---|---|
| P0 — Critical | Active breach, data exfiltration, full outage | Immediate (< 15 min) |
| P1 — High | Confirmed attack in progress, partial compromise | < 1 hour |
| P2 — Medium | Suspected attack, single system affected | < 4 hours |
| P3 — Low | Policy violation, minor anomaly | < 24 hours |

### 9.2 Response Playbook
1. **Detect** — SIEM alert fires or manual discovery.
2. **Triage** — Confirm the incident, assess scope and severity.
3. **Contain** — Isolate affected systems; revoke compromised credentials; block attacker IPs.
4. **Eradicate** — Remove malware, close the attack vector, patch the vulnerability.
5. **Recover** — Restore systems from clean backups; verify integrity before returning to production.
6. **Review** — Conduct a post-mortem within 5 business days; update playbooks and controls.

### 9.3 Communication
- Internal: Notify security team, engineering lead, and CTO within 1 hour of P0/P1.
- Regulatory: Notify relevant authority within 72 hours if personal data is involved (GDPR Article 33).
- Customers: Notify affected users promptly; do not delay disclosure beyond legal requirements.

---

## 10. Compliance & Audit

### 10.1 Logging Requirements
All systems must log the following and retain logs for a minimum of 1 year (2 years for regulated industries):

- Authentication events (success and failure)
- Authorization decisions (access granted / denied)
- All admin and privileged actions
- All API calls with request ID, user ID, IP, endpoint, response code
- All data access for Confidential and Restricted data
- All configuration and infrastructure changes
- All security alerts and their resolution

### 10.2 Log Integrity
- Ship logs to an immutable, centralized logging system (separate from production) in real time.
- Use cryptographic chaining (hash-linked log entries) to detect tampering.
- No single user should have the ability to delete or modify logs.
- Alert immediately if log ingestion from any system stops unexpectedly.

### 10.3 Compliance Frameworks
Configure controls to satisfy the following (as applicable):

- **OWASP Top 10** — implement all mitigations in section 3.
- **NIST SP 800-53 / CSF** — map all controls to NIST categories.
- **CIS Controls v8** — implement all 18 CIS controls.
- **GDPR** — data minimization, consent, right to erasure, breach notification.
- **PCI DSS** (if processing payments) — network segmentation, encryption, access control, logging.
- **SOC 2 Type II** — availability, confidentiality, processing integrity, privacy, security.
- **ISO 27001** — information security management system (ISMS).

### 10.4 Penetration Testing
- Conduct an external penetration test at minimum annually, or after major architectural changes.
- Conduct internal red team exercises quarterly.
- Run automated vulnerability scans (Nessus, Qualys, or Rapid7) weekly.
- Bug bounty program: maintain a responsible disclosure policy and HackerOne / Bugcrowd program.
- All critical and high findings from pen tests must be remediated within 30 days.

---

## 11. Security Testing Checklist

Use this checklist before every production release:

### Transport & Headers
- [ ] TLS 1.3 enforced; TLS 1.0/1.1 disabled
- [ ] HSTS header present with `preload`
- [ ] CSP header present with no `unsafe-inline` or `unsafe-eval`
- [ ] All other secure headers present (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] Server version headers removed
- [ ] SSL Labs score A or A+

### Authentication
- [ ] MFA enforced for all admin accounts
- [ ] Session tokens are HttpOnly, Secure, SameSite=Strict
- [ ] CSRF tokens present on all state-changing forms and API calls
- [ ] Password hashing uses bcrypt/Argon2 with appropriate cost
- [ ] Account lockout after 5 failed attempts
- [ ] Session invalidated on logout

### Application
- [ ] All inputs validated server-side
- [ ] All database queries use parameterized statements
- [ ] All outputs HTML-encoded in appropriate context
- [ ] No stack traces or internal errors exposed to users
- [ ] No sensitive data in URL query parameters
- [ ] No secrets in source code or version control

### Infrastructure
- [ ] No critical/high CVEs in dependencies
- [ ] No publicly accessible admin ports or panels
- [ ] All services running as non-root
- [ ] Backups encrypted and tested for restoration
- [ ] All secrets stored in secrets manager, not env variables
- [ ] Container images scanned with no critical vulnerabilities

### Monitoring
- [ ] SIEM receiving logs from all services
- [ ] Alerting rules active and tested
- [ ] Dashboard accessible and up to date
- [ ] On-call rotation configured with escalation path
- [ ] Incident response runbook reviewed and current

---

*This document should be reviewed and updated quarterly, or after any significant security incident or architectural change.*
