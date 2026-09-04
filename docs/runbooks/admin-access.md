# Admin access bootstrap and recovery

Tickif has two privileged platform roles. An `admin` can use the application moderation
console. A `superadmin` can also administer users and sessions through Better Auth. Only
operators with production database access may bootstrap or recover superadmin access.

Do not use this runbook for routine role changes. Record the change in an approved ticket,
identify the operator, and take a current database backup before changing production.

## Bootstrap the first superadmin

1. Have the intended operator sign in through the normal Tickif login once. This creates
   their user record. Verify the identifier they use to sign in through a separate trusted
   channel. For phone login, verify the phone number. For Google login, verify the email.
   Never treat a generated `@phone.tickif.local` email as proof of identity.
2. Open a transaction in the production database console and lock the exact user row:

   ```sql
   BEGIN;

   SELECT pg_advisory_xact_lock(hashtextextended('tickif-superadmin-bootstrap', 0));

   SELECT id, email, email_verified, phone_number, phone_number_verified,
          status, role, banned
   FROM "user"
   WHERE id = '<verified-user-id>'
     AND (
       (email_verified IS TRUE AND lower(email) = lower('<verified-email>'))
       OR
       (phone_number_verified IS TRUE AND phone_number = '<verified-phone-number>')
     )
   FOR UPDATE;
   ```

3. Stop and run `ROLLBACK;` unless the query returns exactly one expected, non-banned
   account with a lifecycle status approved for access. The verified database identifier
   must be the same identifier checked through the trusted channel. Confirm that the
   deployment does not already have a superadmin:

   ```sql
   SELECT id, email, status, banned
   FROM "user"
   WHERE role = 'superadmin';
   ```

4. If no superadmin exists, promote the locked account and revoke its existing sessions:

   ```sql
   UPDATE "user"
   SET role = 'superadmin', updated_at = now()
   WHERE id = '<verified-user-id>'
     AND (
       (email_verified IS TRUE AND lower(email) = lower('<verified-email>'))
       OR
       (phone_number_verified IS TRUE AND phone_number = '<verified-phone-number>')
     )
     AND status IN ('pending', 'active')
     AND banned IS NOT TRUE
   RETURNING id, email, role;

   DELETE FROM "session"
   WHERE user_id = '<verified-user-id>';

   COMMIT;
   ```

5. Require the user to sign in again. Verify `/moderation` access. Then send an authenticated
   `GET /api/auth/admin/list-users?limit=1` request. It must return 200 for the superadmin
   and 403 for a regular admin. This is the production check because it does not change user
   or session state. Record the returned status codes and user ID in the approved ticket.
   Do not record the response body, session cookies, or OTPs.

## Recover when no superadmin is accessible

Use recovery only after confirming that no current superadmin can sign in. Check whether
the account is banned, suspended, or using the wrong identity before changing roles.

1. Get a second operator to confirm the outage and the replacement user's identity. Obtain
   separate approval for creating one replacement superadmin while inaccessible privileged
   rows remain. The approval must name the replacement user ID and verified login identifier.
2. Query all current superadmin rows and record their non-secret state in the incident
   ticket. If an accessible superadmin exists, stop and use the normal administration path.
3. Start a new transaction and take the same advisory lock. Before changing the replacement,
   make the transaction abort unless the current superadmin count still matches the approved
   incident record. Replace `<approved-superadmin-count>` with that recorded count before
   running the block:

   ```sql
   BEGIN;

   SELECT pg_advisory_xact_lock(hashtextextended('tickif-superadmin-bootstrap', 0));

   DO $$
   DECLARE
     expected_superadmin_count integer := '<approved-superadmin-count>';
     current_superadmin_count integer;
   BEGIN
     SELECT count(*) INTO current_superadmin_count
     FROM "user"
     WHERE role = 'superadmin';

     IF current_superadmin_count <> expected_superadmin_count THEN
       RAISE EXCEPTION 'Superadmin count changed: expected %, found %',
         expected_superadmin_count, current_superadmin_count;
     END IF;
   END
   $$;
   ```

   The advisory lock serializes operators following this runbook. The count guard stops a
   second recovery after the first operator has already promoted a replacement. Next, lock
   the replacement row with the identity query from bootstrap step 2. Do not apply bootstrap
   step 3's "no existing superadmin" condition during recovery. Compare the locked row and
   current superadmin list with the approved incident record. Stop and run `ROLLBACK;` on any
   mismatch.

4. Run the `UPDATE`, session deletion, and `COMMIT` from bootstrap step 4 for the one approved
   replacement. Existing superadmin rows remain unchanged for investigation.
5. Sign in as the replacement and run the checks from bootstrap step 5 before demoting,
   banning, or repairing any old privileged account. Revoke sessions for every account whose
   privilege or credentials changed.
6. Close database access, rotate any temporary operator credentials, and record the final
   privileged account list in the incident ticket.

If any query returns an unexpected row count or identity, run `ROLLBACK;` and investigate.
Never weaken auth guards, enable password login, or add a hard-coded privileged user as a
recovery shortcut.
