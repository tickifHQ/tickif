# Security

Scope: **always**.

- Validate **all** external input through `@repo/contracts` schemas.
- Secrets only in env / secrets manager; `.env` is gitignored. Never log secrets,
  tokens, or OTP codes in production (the dev OTP console log is dev-only).
- Gate high-intent + mutating endpoints with `requireAuth` (and role checks where
  relevant). See [auth.md](./auth.md).
- Media originals stay private (R2) and are served via signed URLs (later phase).
- Don't disable rate limiting, CSRF, or origin checks in production.

## Don't

- ❌ Log secrets/tokens/OTP codes in production.
- ❌ Commit secrets; weaken CSRF/origin/rate-limit protections.
- ❌ Trust unvalidated external input.
