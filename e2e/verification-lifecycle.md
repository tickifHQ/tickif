# Verification lifecycle browser check

`tests/verification-lifecycle.spec.ts` exercises real Better Auth phone sessions,
designer document uploads through signed URLs, admin feedback, document replacement,
approval, expiry, and renewal. It does not mock API responses or authenticated state.
It seeds only synthetic users, organizations, projects, and a one-pixel PNG document.

Run against the local stack with Postgres, Redis, Typesense, and a private MinIO
bucket whose CORS allows PUT from `http://localhost:3000`. Set `SMS_PROVIDER=console`
and use only local test credentials. Both `DATABASE_URL` and `DATABASE_URL_TEST`
must point to the same local database ending in `_test`; the fixture fails closed
otherwise. The database must exist; the fixture applies committed migrations.
Set `R2_ENDPOINT=http://localhost:9000`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and
`R2_SECRET_ACCESS_KEY` for the local private bucket. Set `BETTER_AUTH_URL` to
`http://localhost:3001` and `TRUSTED_ORIGINS` to `http://localhost:3000`.

Keep ports 3000 and 3001 free so Playwright starts this checkout's API and web
servers. Do not run DB-truncating Vitest integration suites concurrently.

```powershell
pnpm --filter @repo/e2e test:e2e tests/verification-lifecycle.spec.ts --workers=1 --output="$env:TEMP/tickif-verification-playwright"
```

The fixture cleans up only its own database records, never truncating shared
tables. Browser screenshots are saved to the system temporary directory. Synthetic
document objects remain in the local test bucket for inspection; discard that
bucket after testing. External staging validation of private Cloudflare R2 access,
short-lived signed URLs, CORS, and expiry still requires the staging account and
is not proven by this local MinIO test.
