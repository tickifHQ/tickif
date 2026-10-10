# Authentication & Authorization

Auth is handled by **better-auth**, configured once in `packages/auth/src/index.ts`
and mounted into the API. We do not hand-roll sessions, OTP, or OAuth.

## Account dropdown

The shared `AccountMenu` is used by public, personal, designer and admin headers.
It follows Figma nodes `16123:68132` (menu) and `16123:68176` (logout confirmation)
in file `WJhOguDptAwt2735BS2WMG`, retaining the existing role/context settings links.
The unsupported Boards and Following entries are omitted. Active customers get
Saved projects and Enquiries with real counts; only personal visitors get My home
profile. Phone numbers are masked, phone-auth placeholder names use the safe
Account label, generated phone-auth email addresses are never displayed, and
missing address or count data is not fabricated. Details load in
parallel only while the menu is open, are scoped to the current account/context,
and are cancelled on unmount. Failed reads have an inline retry.

`GET /api/saved-projects` uses the existing customer guard, bounds pagination,
returns private/no-store data, and filters by the authenticated caller, published
project and active studio. Its shared public-feed projection keeps pending edits
and private media out of `/saved-projects`; hidden saves are not counted or shown.
This is a read surface over existing saves, not a new boards/following data model.
The saved-projects page listens for validated save-change events belonging to its
authenticated user and refreshes its server-rendered list, counts and pagination
without a full page reload. Failed mutations do not emit these events or remove
cards. Removing the last item on a page reuses the server's page-bound correction.

Account details have a persistent, visually hidden polite status region outside
the busy activity area. Loading, partial or complete failures, and successful
retry results are announced without moving keyboard focus. Retry remains a menu
item; announcements contain activity counts, not personal contact details. Activating
Retry moves its focus to the first remaining menu action before the retry item is
removed for loading, preserving arrow-key navigation as the request completes.

Logout requires confirmation. By default, Better Auth `signOut` revokes the current
session and clears its cookie. With all devices selected, `revokeOtherSessions`
must succeed before `signOut` runs. Better Auth validates an authoritative session
for this endpoint, bypassing the session cookie cache; it does not require a
recently created session. Failures keep the dialog open and retryable without pretending logout
succeeded. Pending requests disable duplicate submissions and dismissal. Cancel
and Escape restore focus to the account trigger. The account menu remains visible
but inert behind the modal confirmation. When there is room, confirmation is
anchored to the menu's left and bottom-aligned, clamped inside the viewport;
narrow screens use the centered dialog. Resize observation keeps the placement
correct as content wraps or errors appear. No auth data is stored locally.

Menu colors, radii and shadows are semantic theme tokens with dark-mode mappings.
The logout backdrop uses the neutral `account-menu-overlay` token from Figma
`16123:68131` (`rgba(23, 22, 18, 0.12)`) in light and dark mode, without changing
the shared overlay used by other dialogs.
The source green `#1a9b7a` is darkened to `#168266` for 4.51:1 contrast against
`#faf9f6` on small functional labels. Account-menu and logout-confirmation icons
come from `lucide-react` and are decorative (`aria-hidden`). They inherit the
menu foreground; the confirmation icon uses scoped light/dark semantic tokens.
Custom account SVG assets and reference screenshots are not shipped.

## What's enabled

| Capability                 | Plugin / provider        | Notes                                                                            |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Phone OTP (primary, India) | `phoneNumber` plugin     | OTP is the main login path.                                                      |
| Gmail SSO                  | `google` social provider | For designers; only active if `GOOGLE_CLIENT_ID/SECRET` are set.                 |
| Role-based access          | `admin` plugin           | Four platform roles with superadmin-only account administration; see RBAC below. |
| Orgs / membership          | `organization` plugin    | Implemented org access, invitations, fixed role capabilities and freeze/restore. |
| Email + password           | —                        | Disabled (`emailAndPassword.enabled: false`).                                    |

## Temporary phone OTP delivery by email

The existing `phoneNumber({ sendOTP })` callback can send allowlisted phone login
codes through the existing Resend provider to a single test inbox. Better Auth
still generates and verifies the code with the same expiry and attempt limits.

Set these values in the API environment (or the root `.env` for local runs),
then restart the API:

```dotenv
PHONE_OTP_DELIVERY=email
PHONE_OTP_EMAIL_TO=tester@example.com
PHONE_OTP_EMAIL_ALLOWED_NUMBERS=+919800000010,+919800000011
RESEND_API_KEY=<your Resend API key>
EMAIL_FROM="Tickif <onboarding@resend.dev>"
SMS_PROVIDER=console
```

Email delivery is rejected when `NODE_ENV=production` unless `DEPLOYMENT_ENV=staging` is explicitly configured. Requests for phone
numbers outside `PHONE_OTP_EMAIL_ALLOWED_NUMBERS` fail without sending a code.
Keep that comma-separated allowlist limited to dedicated test accounts in E.164
format. The Resend test sender works only if the destination is the email associated
with your Resend account. Otherwise use a sender on a verified domain. See
[Resend's test sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
Do not commit the API key. Missing inbox/key configuration fails at startup;
provider failures fail the OTP request instead of silently dropping the code.

Enter a phone number in the existing login form, retrieve its code from the
configured inbox, and enter that code in the same form. The email includes the
phone number to distinguish requests. The login UI still describes SMS delivery.
Access to this inbox enables login as any allowlisted phone, so this mode is limited
to controlled non-production testing.
Ordinary email verification still goes to the user's email address.

For staging containers, retain `NODE_ENV=production` so secure cookies, Redis
rate limiting, and production checks stay enabled. Set `DEPLOYMENT_ENV=staging`
and `PHONE_OTP_EMAIL_ALLOW_ALL=true` to send login codes for any valid phone
number to `PHONE_OTP_EMAIL_TO`. This opt-in is rejected outside staging and
defaults to false. The inbox can sign in as any staging phone account while it
is enabled; use staging-only data. OTP generation, expiry, attempt limits, and
verification still belong to Better Auth. Set `PHONE_OTP_DELIVERY=sms` and
`PHONE_OTP_EMAIL_ALLOW_ALL=false` when switching to the real SMS provider.

`SMS_PROVIDER=console` avoids requiring Novu credentials while it is unconfigured;
booking SMS will not be delivered. To restore SMS, set `PHONE_OTP_DELIVERY=sms`,
configure `SMS_PROVIDER=novu` and its credentials/workflows, and restart the API
and worker. Email mode bypasses the SMS queue for phone OTPs only.

## How it's wired into the API

In `apps/api/src/app.ts`, better-auth owns everything under `/api/auth/*`:

```ts
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
```

A session-resolving middleware (`apps/api/src/lib/auth-middleware.ts`) runs on
every request and attaches `user` / `session` to the Hono context:

```ts
app.use('*', withSession); // sets c.get('user') / c.get('session')
```

## Protecting a route

Use the `requireAuth` middleware via the route definition's `middleware` field:

```ts
const createRoute = createRoute({
  method: 'post',
  path: '/',
  middleware: [requireAuth] as const, // ← guard here
  security: [{ cookieAuth: [] }], // ← documents it in OpenAPI
  // ...
});
```

`requireAuth` throws `AppError.unauthorized()` (→ 401) when there's no user.
Inside a handler you can read the caller with `c.get('user')`.

> Do **not** guard routes with a chained `.use(path, requireAuth)` between
> `.openapi()` calls — it breaks the OpenAPIHono type chain. See
> [adding-a-module.md](../guides/adding-a-module.md) and [troubleshooting.md](../guides/troubleshooting.md).

### Fresh vs cached session state

`withSession` resolves the session through better-auth's ≤5-min session cookie
cache, so what it attaches to the context can be stale. That's fine for
identity-only reads ("who am I", rendering a name), but **not** for authorization.
Every guard (`requireAuth`, `requireAnyRole`, `requireRole`, `requireOwnership`)
therefore re-reads the session past the cache — at most once per request — before
deciding, and forwards better-auth's refreshed `session_data` cookie so the
client's stale copy is replaced rather than living out its TTL.

Some routes need live state _and_ must keep serving anonymous callers — e.g.
`GET /api/projects/{id}`, where a published project is public but draft visibility
is decided from the caller's ban/role. Those declare `withFreshSession`, the
optional-auth counterpart: it refreshes the session without rejecting anonymous
requests.

```ts
middleware: [withFreshSession] as const,   // optional auth, never cached state
```

Rule of thumb: if a handler or service reads `isBanned`, `role`, or
`activeOrganizationId` to decide what the caller may see, the route must declare a
guard or `withFreshSession`. On the web side the same split applies:
`requireAuth()` in `apps/web/src/lib/auth-guard.ts` always bypasses the cache,
while the non-throwing `getServerSession()` may use it.

## The phone-OTP flow (and how to test it)

In dev, the SMS worker can use the `console` sender, which **logs the code to the
worker console** instead of sending an SMS. Production should use the `novu`
provider with `NOVU_SECRET_KEY` and `NOVU_OTP_WORKFLOW_ID` configured. So to test
end-to-end locally:

```bash
PHONE="+919812345678"

# 1. Request an OTP — the code is printed in the API log
curl -s -X POST http://localhost:8008/api/auth/phone-number/send-otp \
  -H 'content-type: application/json' -d "{\"phoneNumber\":\"$PHONE\"}"

# 2. Find the code in the running worker output: "[sms] OTP for 91...: 123456"

# 3. Verify — creates the user + session, returns a session token/cookie
curl -s -X POST http://localhost:8008/api/auth/phone-number/verify \
  -H 'content-type: application/json' -d "{\"phoneNumber\":\"$PHONE\",\"code\":\"123456\"}"
```

On verify, better-auth creates rows in `user` and `session` (and consumes the
`verification` row). On first sign-up it derives a placeholder email
(`<phone>@phone.tickif.local`) until the designer completes their profile —
configured via `signUpOnVerification` in the plugin options.

## Transactional email delivery

Auth emails and organization invitations are delivered through Resend. Production
requires `RESEND_API_KEY`; `EMAIL_FROM` must use a sender or domain verified in the
same Resend account. The auth package validates both at startup so a deployment
does not discover a missing credential on its first email. It also rejects the
checked-in sender placeholder in production.

Development and test environments may omit the key. In that mode the email sender
logs only recipient and subject metadata, never the HTML body or any OTP content.

## better-auth tables & the schema

better-auth's tables (`user`, `session`, `account`, `verification`,
`organization`, `member`, `invitation`) are defined in
`packages/db/src/schema/auth.ts` and migrate **together with** the domain tables
(one migration set — see [database-and-migrations.md](../guides/database-and-migrations.md)).

Two things to know:

- **Property keys must match better-auth's field names** (camelCase), because the
  Drizzle adapter discovers tables/fields by those names. The `casing: 'snake_case'`
  option maps them to snake_case columns.
- The canonical source for this schema is better-auth's own generator. If you
  change auth **plugins**, regenerate and reconcile `auth.ts`:
  ```bash
  pnpm --filter @repo/auth generate   # runs `npx @better-auth/cli generate`
  ```
  Review the output against `schema/auth.ts`, port any new columns, then
  `pnpm db:generate && pnpm db:migrate`. (We invoke the CLI via `npx` on purpose —
  installing it as a dependency caused a version conflict; see
  [troubleshooting.md](../guides/troubleshooting.md).)

### `user.status` (account lifecycle)

`user.status` is an app-owned column (not a better-auth protocol field): one of
`pending | active | suspended | deleted`, defaulting to `pending`. New phone/SSO
sign-ups start `pending` (placeholder profile) and move to `active` on profile
completion; `suspended` is reserved for Epic-3 moderation/bans. It is registered as
a better-auth `additionalField` (`input: false`) so it appears on the session user,
and stored as `text().$type<UserStatus>()` (not a `pgEnum`) to keep the committed
schema drift-free against `pnpm auth:generate`.

> **Scope note (E-80 ↔ Epic 3):** the `admin` + `organization` plugins and their
> `organization/member/invitation` tables are wired today because the configured
> auth instance depends on them. E-80's text scopes role/org work to Epic 3 (E-86/
> E-87); we kept the tables in place and only reconciled/indexed them. Ratify this
> split with the Epic owner before Epic-3 RBAC work begins.

## Platform RBAC

The platform roles are `superadmin`, `admin`, `designer`, and `visitor`. Both
privileged roles can enter the Tickif admin console, where app permissions are
enforced by the Hono guards. Only `superadmin` has Better Auth's user and session
administration permissions. A regular `admin` cannot create, promote, ban, remove,
or reset another account through `/api/auth/admin/*`.

Both privileged role names remain in Better Auth's `adminRoles` option. That option
also tells Better Auth which accounts are protected impersonation targets. Actual
endpoint permissions come from the role statements in `packages/auth/src/permissions.ts`.

See [the admin access runbook](../runbooks/admin-access.md) before creating the first
superadmin or recovering a deployment with no accessible superadmin.

## Client side (web)

### Unfinished designer onboarding

Fresh accounts keep their visitor role until validated onboarding creates the
designer profile, organization and owner membership in one transaction. Unfinished
signups can resume at `/designer/onboarding/deferred`, an
authenticated page with **Continue setup** and **Explore projects** links, available
only to pending visitor accounts. Active visitors cannot open this recovery page.
Designer workspace pages, including studio selection and organization creation,
require the designer role; any other role is denied access instead of being sent
to onboarding. Visitors and designers cannot enter admin pages, which require
the admin or superadmin role. Completed onboarding keeps its dashboard destination.

The web app authenticates against `/api/auth/*` using better-auth's client (or
direct calls during early development). Authenticated API calls rely on the
session cookie; the `hc<AppType>` client forwards credentials when configured to.
Keep auth calls separate from the typed `hc` data client.
