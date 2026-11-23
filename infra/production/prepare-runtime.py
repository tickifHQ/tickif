"""Prepare versioned Swarm secrets on the production EC2 manager.

No application deployment or AWS secret writes. Default validates only;
--apply-reviewed imports secrets and writes non-secret runtime.env metadata.
Uses the instance role and AWS CLI; no Python third-party dependencies required.
"""

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
from urllib.parse import quote, urlencode
import urllib.request

REGION = "ap-south-1"
ACCOUNT = "401909805160"
INSTANCE = "i-0c4119452058c9434"
DB_HOST = "tickif-production.crkoiay2y1ci.ap-south-1.rds.amazonaws.com"
REDIS_HOST = "master.tickif-production.rqrnpl.aps1.cache.amazonaws.com"
R2_ENDPOINT = "https://e37069d61b97c21c019f5e492e4e485e.r2.cloudflarestorage.com"
FIELDS = ("BETTER_AUTH_SECRET", "TYPESENSE_API_KEY", "GOOGLE_CLIENT_SECRET",
          "RESEND_API_KEY", "MSG91_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
BILLING = ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
           "RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS", "RAZORPAY_PLAN_ID_CORPORATE")


def command(*args, value=None):
    result = subprocess.run(args, input=value, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError("Command failed; output withheld to protect credentials")
    return result.stdout.strip()


def aws(*args):
    return json.loads(command("aws", *args, "--region", REGION, "--output", "json", "--no-cli-pager"))


def dotenv(values):
    lines = []
    for key, value in values.items():
        if not isinstance(value, str) or not value or any(c in value for c in "'\r\n\x00"):
            raise ValueError("Unsupported/empty secret field: " + key)
        lines.append(f"{key}='{value}'")
    return "\n".join(lines) + "\n"


def release_environment(release):
    if not re.fullmatch(r"[a-f0-9]{40}", release.get("commit", "")):
        raise ValueError("Release needs a full Git commit")
    if not re.fullmatch(r"v0\.1\.[0-9]+", release.get("version", "")):
        raise ValueError("Release needs the main CI version tag")
    env = {"RELEASE_VERSION": release["version"], "RELEASE_COMMIT": release["commit"]}
    for service in ("api", "web", "worker", "operations"):
        image = release.get("images", {}).get(service, "")
        if not re.fullmatch(r"ghcr\.io/tickifhq/tickif-" + service + r"@sha256:[a-f0-9]{64}", image):
            raise ValueError("Expected production GHCR image digest for " + service)
        env[service.upper() + "_IMAGE"] = image
    return env


def runtime_payloads(app, db):
    for key in (*FIELDS, "REDIS_PASSWORD", "GOOGLE_CLIENT_ID", "EMAIL_FROM"):
        if not isinstance(app.get(key), str) or not app[key].strip():
            raise ValueError("Missing app field: " + key)
    expected = {"POSTGRES_HOST": DB_HOST, "POSTGRES_PORT": "5432", "POSTGRES_DB": "tickif",
                "POSTGRES_USER": "tickif_app", "MIGRATION_USER": "tickif_migrator"}
    if any(db.get(k) != v for k, v in expected.items()):
        raise ValueError("Database secret does not match production")
    for key in ("POSTGRES_PASSWORD", "MIGRATION_PASSWORD"):
        if not re.fullmatch(r"[A-Za-z0-9_-]{64}", db.get(key, "")):
            raise ValueError("Invalid database password format")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", app["TYPESENSE_API_KEY"]):
        raise ValueError("Invalid Typesense bootstrap key")
    if app["EMAIL_FROM"] != "Tickif <noreply@updates.tickif.com>":
        raise ValueError("Review the verified production email sender")
    # Stable, domain-separated search key permits recovery without granting the
    # host write access to Secrets Manager. It is registered with search-only ACL.
    search_key = app.get("TYPESENSE_SEARCH_API_KEY") or hmac.new(
        app["TYPESENSE_API_KEY"].encode(), b"tickif/production/typesense/search/v1", hashlib.sha256).hexdigest()
    if search_key == app["TYPESENSE_API_KEY"] or len(search_key) < 32:
        raise ValueError("Search key must be distinct from the bootstrap key")

    def db_url(user, password):
        query = urlencode({"sslmode": "verify-full", "sslrootcert": "/etc/tickif/rds-ca.pem"})
        return f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{DB_HOST}:5432/tickif?{query}"

    api = {key: app[key] for key in FIELDS}
    api.update(DATABASE_URL=db_url(db["POSTGRES_USER"], db["POSTGRES_PASSWORD"]),
               REDIS_URL=f"rediss://:{quote(app['REDIS_PASSWORD'], safe='')}@{REDIS_HOST}:6379/0",
               TYPESENSE_SEARCH_API_KEY=search_key)
    billing_ready = all(app.get(k) for k in BILLING)
    if any(app.get(k) for k in BILLING) and not billing_ready:
        raise ValueError("Partial billing configuration; finish or omit all billing fields")
    if billing_ready:
        if not app["RAZORPAY_KEY_ID"].startswith("rzp_live_"):
            raise ValueError("Production refuses Razorpay test keys")
        api.update({k: app[k] for k in ("RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET")})
    worker = {k: v for k, v in api.items() if k not in ("GOOGLE_CLIENT_SECRET", "RAZORPAY_WEBHOOK_SECRET")}
    # The shared config parser requires production media settings even for the
    # Drizzle CLI; migration credentials are never mounted into app services.
    migration = {k: api[k] for k in ("BETTER_AUTH_SECRET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")}
    migration["DATABASE_URL"] = db_url(db["MIGRATION_USER"], db["MIGRATION_PASSWORD"])
    payloads = {"api_config": dotenv(api), "worker_config": dotenv(worker),
                "migration_config": dotenv(migration), "typesense_admin_key": app["TYPESENSE_API_KEY"],
                "typesense_search_key": search_key}
    env = {"PRODUCTION_HOST": "tickif.com", "STACK_NAME": "tickif-production",
           "R2_ENDPOINT": R2_ENDPOINT, "R2_BUCKET": "tickif-production-media",
           "TYPESENSE_COLLECTION_PREFIX": "tickif_production", "EMAIL_FROM": app["EMAIL_FROM"],
           "GOOGLE_CLIENT_ID": app["GOOGLE_CLIENT_ID"], "WHATSAPP_PROVIDER": "msg91",
           "MSG91_WHATSAPP_NUMBER": "17115008251", "MSG91_WHATSAPP_TEMPLATE": "tickif_otp",
           "MSG91_WHATSAPP_LANGUAGE": "en", "BILLING_READY": str(billing_ready).lower(),
           "SYSTEM_ADMIN_EMAIL": "", "API_REPLICAS": "0", "WEB_REPLICAS": "0", "WORKER_REPLICAS": "0"}
    if billing_ready:
        env.update({k: app[k] for k in BILLING if k not in ("RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET")})
    return payloads, env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("/opt/tickif/production/runtime.env"))
    parser.add_argument("--apply-reviewed", action="store_true")
    args = parser.parse_args()
    env = release_environment(json.loads(args.release.read_text()))
    token = urllib.request.urlopen(urllib.request.Request(
        "http://169.254.169.254/latest/api/token", method="PUT",
        headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"}), timeout=3).read().decode()
    instance = urllib.request.urlopen(urllib.request.Request(
        "http://169.254.169.254/latest/meta-data/instance-id",
        headers={"X-aws-ec2-metadata-token": token}), timeout=3).read().decode()
    if instance != INSTANCE or aws("sts", "get-caller-identity")["Account"] != ACCOUNT:
        raise RuntimeError("Must run on the production EC2 instance")
    app = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", "tickif/production/app")["SecretString"])
    db = json.loads(aws("secretsmanager", "get-secret-value", "--secret-id", "tickif/production/database")["SecretString"])
    payloads, settings = runtime_payloads(app, db)
    env.update(settings)
    ca = Path("/opt/tickif/certs/rds-ca-bundle.pem").read_text()
    if "BEGIN CERTIFICATE" not in ca:
        raise ValueError("RDS CA bundle missing")
    if not args.apply_reviewed:
        print("PASS: production identity, release metadata and required secrets validated; no Docker changes")
        return
    if os.geteuid() != 0:
        raise RuntimeError("Run as root to protect runtime metadata")
    os.umask(0o077)
    for name, value in payloads.items():
        version = hashlib.sha256(value.encode()).hexdigest()[:24]
        reference = f"tickif_production_{name}_{version}"
        found = subprocess.run(["docker", "secret", "inspect", reference], capture_output=True).returncode == 0
        if not found:
            command("docker", "secret", "create", reference, "-", value=value)
        env[name.upper() + "_SECRET"] = reference
    ca_name = "tickif_production_rds_ca_" + hashlib.sha256(ca.encode()).hexdigest()[:24]
    if subprocess.run(["docker", "config", "inspect", ca_name], capture_output=True).returncode:
        command("docker", "config", "create", ca_name, "-", value=ca)
    env["RDS_CA_CONFIG"] = ca_name
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.is_symlink():
        raise ValueError("Runtime metadata must not be a symlink")
    args.output.write_text("\n".join(f"{k}={shlex.quote(v)}" for k, v in env.items()) + "\n")
    args.output.chmod(0o600)
    print("PASS: versioned Docker secrets and non-secret runtime.env prepared; no services deployed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"STOP: {type(error).__name__}; output withheld to protect credentials")
        raise SystemExit(1) from None
