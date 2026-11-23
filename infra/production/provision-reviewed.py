"""Apply an already-reviewed initial AWS plan from MFA-authenticated CloudShell.

Requires boto3 and a checksum-verified Terraform executable. Secret values never
enter command arguments, output, files, Terraform state, or saved plans.
This is initial provisioning, not an application deployment or rotation tool.
"""

import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

import boto3
from botocore.exceptions import ClientError


ACCOUNT = "401909805160"
REGION = "ap-south-1"
BUCKET = f"tickif-terraform-state-{ACCOUNT}-{REGION}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--terraform", type=Path, required=True)
    parser.add_argument("--apply-reviewed", action="store_true", required=True)
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    executable = str(args.terraform.resolve(strict=True))
    os.umask(0o077)
    session = boto3.Session(region_name=REGION)
    if session.client("sts").get_caller_identity()["Account"] != ACCOUNT:
        raise RuntimeError("Refusing to provision a different AWS account")
    # Never use the review-only local backend for real resources.
    if 'backend "s3" {}' not in (directory / "versions.tf").read_text():
        raise RuntimeError("The reviewed S3 backend configuration is required")

    s3 = session.client("s3")
    created = False
    try:
        s3.head_bucket(Bucket=BUCKET, ExpectedBucketOwner=ACCOUNT)
    except ClientError as error:
        if error.response["Error"]["Code"] not in ("404", "NoSuchBucket"):
            raise
        s3.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        created = True
    if created:
        s3.put_public_access_block(
            Bucket=BUCKET,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            },
        )
        s3.put_bucket_versioning(Bucket=BUCKET, VersioningConfiguration={"Status": "Enabled"})
        s3.put_bucket_encryption(
            Bucket=BUCKET,
            ServerSideEncryptionConfiguration={"Rules": [{
                "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
            }]},
        )
        s3.put_bucket_policy(Bucket=BUCKET, Policy=json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*",
                "Action": "s3:*",
                "Resource": [f"arn:aws:s3:::{BUCKET}", f"arn:aws:s3:::{BUCKET}/*"],
                "Condition": {"Bool": {"aws:SecureTransport": "false"}},
            }],
        }))
    # Existing state buckets must already have the required controls; do not
    # overwrite their policies or silently import unrelated infrastructure.
    assert s3.get_bucket_location(Bucket=BUCKET)["LocationConstraint"] == REGION
    assert s3.get_bucket_versioning(Bucket=BUCKET).get("Status") == "Enabled"
    assert all(s3.get_public_access_block(Bucket=BUCKET)["PublicAccessBlockConfiguration"].values())
    rules = s3.get_bucket_encryption(Bucket=BUCKET)["ServerSideEncryptionConfiguration"]["Rules"]
    assert any(r["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] in ("AES256", "aws:kms") for r in rules)
    policy = json.loads(s3.get_bucket_policy(Bucket=BUCKET)["Policy"])
    assert any(s.get("Effect") == "Deny" and s.get("Principal") == "*"
               and s.get("Action") == "s3:*"
               and s.get("Condition", {}).get("Bool", {}).get("aws:SecureTransport") == "false"
               and {f"arn:aws:s3:::{BUCKET}", f"arn:aws:s3:::{BUCKET}/*"}.issubset(s.get("Resource", []))
               for s in policy["Statement"])
    print("Protected remote state bucket verified", flush=True)

    env = dict(os.environ, AWS_PAGER="", TF_IN_AUTOMATION="1")
    # Required input is unused by the targeted secret-metadata bootstrap.
    env["TF_VAR_redis_auth_token"] = "MetadataBootstrapOnlyNotARealSecret12345"

    def tf(*arguments, capture=False):
        return subprocess.run(
            [executable, *arguments], cwd=directory, env=env,
            check=True, text=True, capture_output=capture,
        )

    tf("init", "-input=false", "-reconfigure", "-lockfile=readonly", "-no-color",
       f"-backend-config=bucket={BUCKET}", "-backend-config=key=production/terraform.tfstate",
       f"-backend-config=region={REGION}", "-backend-config=encrypt=true", "-backend-config=use_lockfile=true")

    def apply_creates_only(filename, *options):
        tf("plan", "-input=false", "-no-color", f"-out={filename}", *options)
        plan = json.loads(tf("show", "-json", filename, capture=True).stdout)
        for change in plan.get("resource_changes", []):
            actions = change["change"]["actions"]
            if actions not in (["create"], ["read"], ["no-op"]):
                raise RuntimeError(f"Unreviewed mutation refused: {change['address']} {actions}")
        tf("apply", "-input=false", "-no-color", filename)

    apply_creates_only("secrets.tfplan", "-target=aws_secretsmanager_secret.runtime")
    sm = session.client("secretsmanager")
    try:
        app = json.loads(sm.get_secret_value(SecretId="tickif/production/app")["SecretString"])
        token = app["REDIS_PASSWORD"]
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        # Initial credential creation only. Never overwrite an existing app JSON.
        token = secrets.token_hex(32)
        sm.put_secret_value(SecretId="tickif/production/app", SecretString=json.dumps({"REDIS_PASSWORD": token}))
    if not isinstance(token, str) or not token.isascii() or not token.isalnum() or not 32 <= len(token) <= 128:
        raise RuntimeError("Existing Redis token does not meet the reviewed constraints")
    env["TF_VAR_redis_auth_token"] = token
    apply_creates_only("production.tfplan")
    tf("output", "-json")


if __name__ == "__main__":
    main()
