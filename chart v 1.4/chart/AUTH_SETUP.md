# Auth + Route Protection Setup (Secure)

This guide adds a **real authentication system** to the FastAPI app and blocks access to:

- `/chart/*` (including `index.html`, `sessions.html`, `backtesting.html`, JS/CSS/modules)
- `/index.html`
- `/sessions.html`
- `/backtesting.html`

…unless the user has a valid account and session stored in the database.

It uses the requested schema:

## 1️⃣ USERS & AUTH

### `users`

- `id` (PK)
- `name`
- `email` (unique)
- `password_hash`
- `role` (`user` / `admin`)
- `timezone`
- `base_currency`
- `is_active`
- `created_at`
- `updated_at`

### `user_sessions`

- `id` (PK)
- `user_id` (FK → users.id)
- `ip_address`
- `device`
- `last_active_at`

> **Important detail:** `user_sessions.id` will be a **random string token** (stored in an **HttpOnly cookie**) so it works as a secure session key while still matching your schema exactly.

---

# 0) Pre-checks (run once)

## 0.1 Backup database (recommended)

If you already have data:

```bash
mkdir -p backup
cp db/chart_data.db backup/chart_data.db.$(date +%Y%m%d_%H%M%S)
```

## 0.2 Make sure homepage export exists

```bash
cd homepage
npm run build
```

---

# 1) Add required Python dependencies

Edit `requirements.txt` and add:

```txt
passlib[bcrypt]==1.7.4
```

Then rebuild docker later (Step 6).

---

# 2) Add secure environment variables

## 2.1 Update `.env` (create from `.env.example` if needed)

Add these values:

```bash
# Auth
AUTH_ENABLED=true

# Cookie settings
SESSION_COOKIE_NAME=session_id
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
SESSION_COOKIE_MAX_AGE_SECONDS=1209600

# Secrets (CHANGE THIS IN PRODUCTION)
SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
```

### Production recommended values

- `SESSION_COOKIE_SECURE=true` (requires HTTPS)
- `SESSION_SECRET` should be a long random secret.

Generate a strong secret:

```bash
python3 - << 'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

## 2.2 Update `docker-compose.yml`

Add env vars under `environment:` for `trading-chart`:

```yml
      - AUTH_ENABLED=${AUTH_ENABLED:-true}
      - SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-session_id}
      - SESSION_COOKIE_SECURE=${SESSION_COOKIE_SECURE:-false}
      - SESSION_COOKIE_SAMESITE=${SESSION_COOKIE_SAMESITE:-lax}
      - SESSION_COOKIE_MAX_AGE_SECONDS=${SESSION_COOKIE_MAX_AGE_SECONDS:-1209600}
      - SESSION_SECRET=${SESSION_SECRET}
```

---

# 3) Implement DB models + auth endpoints in `api_server.py`

## 3.1 Add imports

At the top of `api_server.py`, update imports to include:

- `Boolean`, `ForeignKey`
- `Request`, `Response`, `Depends`, `Cookie`
- `secrets`, `hmac`, `hashlib`
- `passlib.context.CryptContext`

## 3.2 Add SQLAlchemy models

Add these models near the existing `CSVFile` model:

- `User` mapped to table `users`
- `UserSession` mapped to table `user_sessions`

**Field requirements:**

- `users.email` must be unique
- `users.role` default: `user`
- `users.is_active` default: `True`
- `created_at/updated_at` set automatically
- `user_sessions.id` must be a random string token (PK)

## 3.3 Add password hashing

Use bcrypt via passlib:

- `hash_password(plain) -> password_hash`
- `verify_password(plain, hash) -> bool`

## 3.4 Add session helpers

- Create session on login:
  - Insert a row in `user_sessions`
  - Set HttpOnly cookie `session_id=<user_sessions.id>`
- Logout:
  - Delete row from `user_sessions`
  - Clear cookie

## 3.5 Add endpoints

Create these endpoints:

- `POST /api/auth/signup` (optional if you want public signup)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

**Security requirements:**

- Always return generic errors on login failure
- Never return `password_hash`
- Set cookie:
  - `httponly=True`
  - `secure=SESSION_COOKIE_SECURE`
  - `samesite=SESSION_COOKIE_SAMESITE`
  - `max_age=SESSION_COOKIE_MAX_AGE_SECONDS`

---

# 4) Protect routes (block access if not logged in)

## 4.1 Why middleware is required

FastAPI `StaticFiles` mounts do not support per-route dependency checks.
So we must add a **middleware** that runs before route handling.

## 4.2 Protected paths

Block access to these unless authenticated:

- `/chart` and `/chart/` and `/chart/*`
- `/index.html`
- `/sessions.html`
- `/backtesting.html`

## 4.3 Allowed paths (must remain public)

These should remain public so users can log in:

- `/login` and `/login/`
- `/_next/*` (Next.js exported assets)
- `/assets/ninjatrader/*` (landing assets)
- `/api/auth/*` (login/signup/logout endpoints)
- `/api/status`
- `/` (homepage)

## 4.4 Behavior

- If user is not logged in and requests an HTML page:
  - redirect to `/login/`
- If user is not logged in and requests an API endpoint you decide to protect:
  - return `401` JSON

---

# 5) Wire the `/login` UI to the backend

## 5.1 Current state

`homepage/src/components/ui/auth-fuse.tsx` currently does **console.log** only.

## 5.2 Required changes

- On Sign In submit:
  - `fetch('/api/auth/login', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) })`
  - on success: `window.location.href = '/chart/'`

- On Sign Up submit (if enabled):
  - `fetch('/api/auth/signup', ...)`

---

# 6) Build + run

## 6.1 Rebuild the docker image

```bash
docker-compose build
```

## 6.2 Start

```bash
docker-compose up -d
```

## 6.3 Create first admin user

If you enable public signup, you can sign up from `/login/`.

If you want **admin-only user creation**, add a one-time CLI script or temporary admin route.

---

# 7) Security checklist (recommended)

- Use HTTPS in production
- Set `SESSION_COOKIE_SECURE=true`
- Set strong `SESSION_SECRET`
- Turn off `CORS_ORIGINS=*` in production (set only your domain)
- Consider rate-limiting `/api/auth/login` (Nginx or middleware)
- Consider lockout after repeated failures

---

# Execute order

Run these steps in order:

1. Backup DB
2. Add dependency to `requirements.txt`
3. Add `.env` + `docker-compose.yml` env vars
4. Implement models + endpoints + middleware in `api_server.py`
5. Wire login UI fetch calls
6. Rebuild docker + start
7. Verify:
   - `/login/` is accessible
   - `/chart/` redirects to `/login/` when logged out
   - After login, `/chart/` loads normally
