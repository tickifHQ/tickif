"""Initial RDS role bootstrap from MFA-authenticated AWS CloudShell.

Default is a read-only preflight. --apply-reviewed creates two restricted roles
and saves their random passwords in the existing database secret. Run only before
application migrations. Requires boto3, psql, AWS CLI and Session Manager plugin.
Passwords stay in memory and child-process environments; never print SQL/errors.
"""

import argparse
import contextlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

import boto3
from botocore.exceptions import ClientError

ACCOUNT = "401909805160"
REGION = "ap-south-1"
INSTANCE = "i-0c4119452058c9434"
DATABASE = "tickif"
SECRET = "tickif/production/database"
APP = "tickif_app"
MIGRATOR = "tickif_migrator"


@contextlib.contextmanager
def tunnel(session, host, port):
    with tempfile.TemporaryFile(mode="w+") as log:
        process = subprocess.Popen([
            "aws", "ssm", "start-session", "--region", REGION,
            "--target", INSTANCE, "--document-name",
            "AWS-StartPortForwardingSessionToRemoteHost", "--parameters",
            json.dumps({"host": [host], "portNumber": ["5432"],
                        "localPortNumber": [str(port)]}),
        ], stdout=log, stderr=log, start_new_session=True)
        try:
            for _ in range(60):
                if process.poll() is not None:
                    raise RuntimeError("SSM tunnel failed; check session permissions")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=1):
                        break
                except OSError:
                    time.sleep(1)
            else:
                raise RuntimeError("SSM tunnel did not become ready")
            yield
        finally:
            log.seek(0)
            match = re.search(r"Starting session with SessionId: ([\w-]+)", log.read())
            try:
                if match:
                    session.client("ssm").terminate_session(SessionId=match[1])
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()


def psql(host, port, ca, user, password, sql):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGHOST=host, PGHOSTADDR="127.0.0.1", PGPORT=str(port),
               PGDATABASE=DATABASE, PGUSER=user, PGPASSWORD=password,
               PGSSLMODE="verify-full", PGSSLROOTCERT=str(ca),
               PGCONNECT_TIMEOUT="10", PGAPPNAME="tickif-production-bootstrap")
    result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                            input=sql, capture_output=True, text=True, env=env,
                            timeout=45)
    if result.returncode:
        # psql errors can include the failing SQL containing a credential.
        raise RuntimeError("Database operation failed; SQL/output withheld for credential safety")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-reviewed", action="store_true")
    args = parser.parse_args()
    session = boto3.Session(region_name=REGION)
    if session.client("sts").get_caller_identity()["Account"] != ACCOUNT:
        raise RuntimeError("Wrong AWS account")
    db = session.client("rds").describe_db_instances(
        DBInstanceIdentifier="tickif-production")["DBInstances"][0]
    if db["PubliclyAccessible"] or db["DBName"] != DATABASE or db["DBInstanceStatus"] != "available":
        raise RuntimeError("Unexpected RDS configuration/status")
    host = db["Endpoint"]["Address"]
    sm = session.client("secretsmanager")
    admin = json.loads(sm.get_secret_value(
        SecretId=db["MasterUserSecret"]["SecretArn"])["SecretString"])
    saved = None
    try:
        saved = json.loads(sm.get_secret_value(SecretId=SECRET)["SecretString"])
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
    # Pick a currently free local port; the SSM tunnel opens no public ingress.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="tickif-db-") as work:
        ca = Path(work) / "rds-ca.pem"
        with urllib.request.urlopen(
            "https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem",
            timeout=20,
        ) as response:
            ca.write_bytes(response.read())
        with tunnel(session, host, port):
            def run(sql, user=admin["username"], password=admin["password"]):
                return psql(host, port, ca, user, password, sql)

            if run("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid();") != "t":
                raise RuntimeError("TLS is required")
            roles = run("SELECT rolname FROM pg_roles WHERE rolname IN ('tickif_app','tickif_migrator') ORDER BY rolname;")
            if roles:
                raise RuntimeError("Roles already exist; refusing to reset credentials or privileges")
            if run("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','v','m','S');") != "0":
                raise RuntimeError("Database is not empty; initial bootstrap refused")
            values = {"POSTGRES_HOST": host, "POSTGRES_PORT": "5432",
                      "POSTGRES_DB": DATABASE, "POSTGRES_USER": APP,
                      "MIGRATION_USER": MIGRATOR}
            if saved is not None:
                if not isinstance(saved, dict) or any(saved.get(k) != v for k, v in values.items()):
                    raise RuntimeError("Existing database secret needs manual review")
                for key in ("POSTGRES_PASSWORD", "MIGRATION_PASSWORD"):
                    if not isinstance(saved.get(key), str) or not re.fullmatch(r"[A-Za-z0-9_-]{64}", saved[key]):
                        raise RuntimeError("Existing password needs manual review")
                values = saved
            print("PASS: private RDS, verified TLS through EC2, empty database, no existing app/migration roles", flush=True)
            if not args.apply_reviewed:
                print("READY: create tickif_app (data access) and tickif_migrator (schema changes); save credentials in tickif/production/database")
                return
            if saved is None:
                values.update(POSTGRES_PASSWORD=secrets.token_urlsafe(48),
                              MIGRATION_PASSWORD=secrets.token_urlsafe(48))
                # Persist first so a failed SQL transaction can be safely retried
                # with the same passwords. No role is accessible until commit.
                sm.put_secret_value(SecretId=SECRET, SecretString=json.dumps(values))
            sql = f"""
BEGIN;
CREATE ROLE tickif_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 30 PASSWORD '{values['POSTGRES_PASSWORD']}';
CREATE ROLE tickif_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD '{values['MIGRATION_PASSWORD']}';
REVOKE ALL ON DATABASE tickif FROM PUBLIC;
GRANT CONNECT ON DATABASE tickif TO tickif_app, tickif_migrator;
GRANT CREATE ON DATABASE tickif TO tickif_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tickif_app;
GRANT USAGE, CREATE ON SCHEMA public TO tickif_migrator;
GRANT tickif_migrator TO tickif_admin WITH SET TRUE;
SET ROLE tickif_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tickif_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO tickif_app;
RESET ROLE;
REVOKE tickif_migrator FROM tickif_admin;
COMMIT;
"""
            run(sql)
            app_flags = run("SELECT (NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT has_database_privilege(current_user,'tickif','CREATE') AND NOT has_schema_privilege(current_user,'public','CREATE')) FROM pg_roles WHERE rolname=current_user;",
                            APP, values["POSTGRES_PASSWORD"])
            migration_flags = run("SELECT (NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND has_database_privilege(current_user,'tickif','CREATE') AND has_schema_privilege(current_user,'public','CREATE')) FROM pg_roles WHERE rolname=current_user;",
                                  MIGRATOR, values["MIGRATION_PASSWORD"])
            if app_flags != "t" or migration_flags != "t":
                raise RuntimeError("Role permission verification failed")
            current = json.loads(sm.get_secret_value(SecretId=SECRET)["SecretString"])
            if current != values:
                raise RuntimeError("Database secret verification failed")
            print("PASS: both role logins and restricted privileges verified over TLS; database secret saved. No migrations or seeds executed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # AWS/SQL exception strings can carry sensitive request details.
        print(f"STOP: {type(error).__name__}; no credential values printed. Review configuration before retrying.")
        raise SystemExit(1) from None
