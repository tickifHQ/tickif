"""Offline production safety tests; Docker renders manifests but starts no services."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("runtime", ROOT / "prepare-runtime.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def fixture():
    app = {k: "synthetic_" + "a" * 48 for k in runtime.FIELDS}
    app.update(REDIS_PASSWORD="r" * 64, GOOGLE_CLIENT_ID="synthetic.apps.googleusercontent.com",
               EMAIL_FROM="Tickif <noreply@updates.tickif.com>")
    db = dict(POSTGRES_HOST=runtime.DB_HOST, POSTGRES_PORT="5432", POSTGRES_DB="tickif",
              POSTGRES_USER="tickif_app", MIGRATION_USER="tickif_migrator",
              POSTGRES_PASSWORD="p" * 64, MIGRATION_PASSWORD="m" * 64)
    return app, db


class RuntimeSafetyTest(unittest.TestCase):
    def test_credential_boundaries_and_verified_transport(self):
        app, db = fixture()
        payloads, env = runtime.runtime_payloads(app, db)
        self.assertIn("sslmode=verify-full", payloads["api_config"])
        self.assertIn("rediss://", payloads["worker_config"])
        self.assertNotIn(db["MIGRATION_PASSWORD"], payloads["api_config"])
        self.assertNotIn(db["MIGRATION_PASSWORD"], payloads["worker_config"])
        self.assertIn(db["MIGRATION_PASSWORD"], payloads["migration_config"])
        self.assertNotIn("GOOGLE_CLIENT_SECRET", payloads["worker_config"])
        self.assertNotIn("REDIS_URL", payloads["migration_config"])
        self.assertNotIn("RAZORPAY", payloads["api_config"])
        self.assertEqual(env["BILLING_READY"], "false")
        self.assertNotEqual(payloads["typesense_admin_key"], payloads["typesense_search_key"])
        self.assertEqual(payloads["typesense_search_key"], runtime.runtime_payloads(app, db)[0]["typesense_search_key"])
        self.assertNotIn(db["POSTGRES_PASSWORD"], json.dumps(env))

    def test_wrong_database_and_partial_or_test_billing_rejected(self):
        app, db = fixture()
        with self.assertRaises(ValueError):
            runtime.runtime_payloads(app, {**db, "POSTGRES_USER": "tickif_admin"})
        with self.assertRaises(ValueError):
            runtime.runtime_payloads({**app, "RAZORPAY_KEY_ID": "rzp_live_partial"}, db)
        with self.assertRaises(ValueError):
            runtime.runtime_payloads({**app, **{k: "test" for k in runtime.BILLING}, "RAZORPAY_KEY_ID": "rzp_test_forbidden"}, db)

    def test_secret_file_injection_rejected(self):
        for value in ("a\nINJECTED=x", "a'b", "", "a\x00b"):
            with self.assertRaises(ValueError):
                runtime.dotenv({"BETTER_AUTH_SECRET": value})

    def test_mutable_or_other_repository_images_rejected(self):
        release = dict(version="v0.1.123", commit="a" * 40,
                       images={k: f"ghcr.io/tickifhq/tickif-{k}@sha256:" + "b" * 64
                               for k in ("api", "web", "worker", "operations")})
        self.assertEqual(runtime.release_environment(release)["RELEASE_VERSION"], "v0.1.123")
        for image in ("ghcr.io/tickifhq/tickif-api:latest", "ghcr.io/other/api@sha256:" + "b" * 64):
            with self.assertRaises(ValueError):
                runtime.release_environment({**release, "images": {**release["images"], "api": image}})

    def test_swarm_manifests_render_private_with_resource_limits(self):
        _, settings = runtime.runtime_payloads(*fixture())
        env = dict(os.environ, **settings, RELEASE_VERSION="v0.1.1")
        for service in ("API", "WEB", "WORKER", "OPERATIONS"):
            env[service + "_IMAGE"] = "ghcr.io/tickifhq/tickif-" + service.lower() + "@sha256:" + "a" * 64
        for name in ("API_CONFIG_SECRET", "WORKER_CONFIG_SECRET", "TYPESENSE_ADMIN_KEY_SECRET",
                     "RDS_CA_CONFIG", "TRAEFIK_STATIC_CONFIG", "TRAEFIK_DYNAMIC_CONFIG", "ORIGIN_CERT_SECRET", "ORIGIN_KEY_SECRET"):
            env[name] = "test_" + name.lower()
        command = ["docker", "compose", "-f", str(ROOT / "stack.yml"), "config", "--format", "json"]
        rendered = json.loads(subprocess.run(command, env=env, check=True, text=True, capture_output=True).stdout)
        self.assertEqual(set(rendered["services"]), {"web", "api", "worker", "typesense"})
        for name, service in rendered["services"].items():
            self.assertFalse(service.get("ports"))
            self.assertTrue(service["read_only"])
            self.assertIn("memory", service["deploy"]["resources"]["limits"])
            if name != "typesense": self.assertEqual(service["deploy"]["replicas"], 0)
        self.assertFalse(rendered["services"]["web"].get("secrets"))
        ingress = json.loads(subprocess.run(
            ["docker", "compose", "-f", str(ROOT / "stack.yml"), "-f", str(ROOT / "ingress.yml"),
             "config", "--format", "json"], env=env, check=True, text=True, capture_output=True).stdout)
        self.assertTrue(all(port["mode"] == "host" for port in ingress["services"]["traefik"]["ports"]))
        self.assertEqual(ingress["services"]["traefik"]["deploy"]["replicas"], 0)
        for options in (["-c", str(ROOT / "stack.yml")],
                        ["-c", str(ROOT / "stack.yml"), "-c", str(ROOT / "ingress.yml")]):
            subprocess.run(["docker", "stack", "config", *options], env=env, check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
