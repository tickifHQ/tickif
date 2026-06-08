# Requirements Document

## Introduction

Google OAuth login for designers (§4) via better-auth's built-in Google social provider. This is a configuration-driven integration — no custom OAuth code. The feature enables designers to sign in with their Google account, creating a new user or linking to an existing phone-based account when the email matches. The implementation wires up provider configuration, typed environment variables, redirect URI registration, and account-linking policy within the existing `@repo/auth` package.

## Glossary

- **Auth_Server**: The better-auth instance configured in `packages/auth/src/index.ts`, exposed to the API via Hono's request handler.
- **Auth_Client**: The better-auth client used in the Next.js web app to initiate social sign-in (`authClient.signIn.social`).
- **Account_Table**: The `account` table in the database, managed by better-auth, storing OAuth provider credentials linked to a user.
- **Google_Provider**: The better-auth `socialProviders.google` configuration block that handles the Google OAuth 2.0 flow.
- **Session**: A better-auth session record (token + user reference) established after successful authentication.
- **Designer**: A user with the `designer` role who accesses the platform via Google OAuth login.
- **Phone_User**: An existing user who originally registered via phone OTP (the primary auth method).
- **Callback_URI**: The OAuth redirect URI (`/api/auth/callback/google`) that Google redirects to after the user authorizes the application.
- **Typed_Env**: The Zod-validated environment configuration in `@repo/config` that provides `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Requirements

### Requirement 1: Google Provider Configuration

**User Story:** As a platform operator, I want the Google social provider configured in better-auth, so that designers can authenticate via Google OAuth without custom OAuth code.

#### Acceptance Criteria

1. WHEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both non-empty strings in the environment, THE Auth_Server SHALL register the Google_Provider in the `socialProviders` configuration using those values as `clientId` and `clientSecret`.
2. THE Auth_Server SHALL set the `baseURL` to the value of `BETTER_AUTH_URL` from Typed_Env to prevent `redirect_uri_mismatch` errors.
3. WHILE `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is absent or empty in the environment, THE Auth_Server SHALL omit the Google_Provider from the `socialProviders` configuration and SHALL complete startup without throwing an error within 10 seconds.
4. IF only one of `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is provided as a non-empty string while the other is absent or empty, THEN THE Auth_Server SHALL omit the Google_Provider from the configuration and SHALL log a warning message indicating incomplete Google OAuth configuration.

### Requirement 2: Environment Variable Wiring

**User Story:** As a developer, I want Google OAuth credentials validated through the typed environment schema, so that misconfiguration fails fast at boot.

#### Acceptance Criteria

1. THE Typed_Env SHALL declare `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as optional string fields that, when provided, must be non-empty (minimum 1 character).
2. WHEN both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are provided with non-empty values, THE Typed_Env SHALL pass validation and expose their values as typed properties on the exported `config` object.
3. WHEN neither `GOOGLE_CLIENT_ID` nor `GOOGLE_CLIENT_SECRET` is provided (absent or empty), THE Typed_Env SHALL pass validation with both fields resolved to `undefined`.
4. IF only one of `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is provided (non-empty) while the other is absent or empty, THEN THE Typed_Env SHALL throw an Error during schema parsing that names both variables and indicates they must be supplied together.
5. WHEN the Typed_Env schema throws a validation Error, THE application process SHALL fail to start and log the validation error message to stderr.

### Requirement 3: Google Sign-In Flow

**User Story:** As a designer, I want to sign in with my Google account, so that I can access the platform without a phone number.

#### Acceptance Criteria

1. WHEN the Auth_Client calls `signIn.social({ provider: "google" })`, THE Auth_Server SHALL return a redirect URL pointing to Google's OAuth 2.0 authorization endpoint.
2. WHEN Google redirects to the Callback_URI with a valid authorization code, THE Auth_Server SHALL exchange the code for tokens and resolve the user's email and profile from Google's userinfo endpoint.
3. WHEN the OAuth flow completes for a new Google email not present in any existing user record, THE Auth_Server SHALL create a new user record with email set to the Google-provided email and a linked entry in the Account_Table with provider set to `google`.
4. WHEN the OAuth flow completes successfully, THE Auth_Server SHALL establish a Session for the authenticated user and return session credentials to the Auth_Client.
5. IF the Google_Provider is not configured (missing credentials), THEN THE Auth_Server SHALL return an error response when `signIn.social({ provider: "google" })` is called, without initiating an OAuth flow.

### Requirement 4: Account Linking Policy

**User Story:** As an existing phone user who also has a Google account, I want my Google login to link to my existing account, so that I do not end up with duplicate profiles.

#### Acceptance Criteria

1. WHEN a Google OAuth sign-in resolves an email that matches an existing Phone_User's email (case-insensitive comparison), THE Auth_Server SHALL link the Google credential to the existing user's Account_Table entry rather than creating a duplicate user.
2. WHEN account linking occurs, THE Auth_Server SHALL preserve the existing user's user_id, role, profile data, and associated records unchanged.
3. THE Auth_Server SHALL use better-auth's built-in `accountLinking` configuration with `trustProvider: true` for the Google provider to enable automatic email-based linking.
4. WHEN account linking completes successfully, THE Auth_Server SHALL establish a Session referencing the existing Phone_User's user_id.

### Requirement 5: Redirect URI Registration

**User Story:** As a platform operator, I want OAuth redirect URIs documented and registered, so that Google Cloud Console is correctly configured for both development and production environments.

#### Acceptance Criteria

1. THE Callback_URI SHALL follow the exact pattern `{BETTER_AUTH_URL}/api/auth/callback/google`, where `BETTER_AUTH_URL` is the environment variable defined in the application configuration.
2. THE project documentation SHALL specify the redirect URI to register in Google Cloud Console for the development environment as the exact string `http://localhost:3001/api/auth/callback/google`.
3. THE project documentation SHALL specify that the production redirect URI registered in Google Cloud Console SHALL use the HTTPS scheme and follow the exact pattern `https://{production-domain}/api/auth/callback/google`.
4. THE project documentation SHALL state that redirect URIs in Google Cloud Console are matched as exact strings, and that trailing slashes, query parameters, or wildcard characters are not permitted in the registered URI.
5. IF the `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` environment variable is empty or undefined, THEN THE system SHALL disable the Google social provider and not expose the Google OAuth sign-in route.

### Requirement 6: OAuth Cancellation and Denial Handling

**User Story:** As a designer, I want clear feedback when I cancel or deny the Google authorization, so that I understand why sign-in did not complete.

#### Acceptance Criteria

1. WHEN the user cancels the Google authorization prompt, THE Auth_Server SHALL redirect to the Auth_Client's configured `callbackURL` with an `error` query parameter indicating the authorization was not completed.
2. WHEN Google returns an `access_denied` error to the Callback_URI, THE Auth_Server SHALL redirect to the Auth_Client's configured `callbackURL` with an `error` query parameter whose value identifies the denial reason, so the Auth_Client can display a message indicating the user denied permission.
3. IF the OAuth callback receives an invalid or expired authorization code, THEN THE Auth_Server SHALL redirect to the Auth_Client's configured `callbackURL` with an `error` query parameter indicating an invalid code, without creating a user record or Account_Table entry.
4. IF any OAuth error redirect occurs (criteria 1–3), THEN THE Auth_Server SHALL NOT create a Session, user record, or Account_Table entry for that authentication attempt.

### Requirement 7: Email Conflict Handling

**User Story:** As a platform operator, I want controlled behavior when a Google email is already associated with a different account, so that data integrity is maintained.

#### Acceptance Criteria

1. WHEN a Google OAuth sign-in resolves an email that is already linked to a different user via another provider, THE Auth_Server SHALL reject the linking attempt and return an error response containing a machine-readable error type distinguishable from other authentication errors, indicating that the email is already associated with another account.
2. IF account linking fails due to an email conflict, THEN THE Auth_Server SHALL leave both existing user records, their Account_Table entries, roles, and active sessions unchanged, and SHALL NOT create any new Account_Table entry for the conflicting Google credential.
3. WHEN an email-conflict linking failure occurs, THE Auth_Server SHALL log the event at warn level or above, including at minimum the conflicting email address and the provider of the existing linked account.
4. WHEN a Google OAuth sign-in results in an email-conflict error, THE Auth_Server SHALL propagate the error to the Auth_Client so the UI can display a user-facing message explaining that the email is already in use by another account.
