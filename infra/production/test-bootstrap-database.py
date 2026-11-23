"""Exercise the bootstrap SQL against disposable PostgreSQL 16, never shared DBs."""

import ast
from pathlib import Path
import subprocess
import time
import unittest
import uuid


class BootstrapPermissionsTest(unittest.TestCase):
    def test_role_boundaries_and_future_table_grants(self):
        source = Path(__file__).with_name("bootstrap-database.py").read_text()
        tree = ast.parse(source)
        statement = next(node.value for node in ast.walk(tree)
                         if isinstance(node, ast.Assign)
                         and any(isinstance(t, ast.Name) and t.id == "sql" for t in node.targets)
                         and isinstance(node.value, ast.JoinedStr))
        sql = "".join(part.value if isinstance(part, ast.Constant)
                      else "disposable_test_password" for part in statement.values)
        name = "tickif-db-bootstrap-test-" + uuid.uuid4().hex[:10]
        subprocess.run(["docker", "run", "-d", "--name", name, "-e",
                        "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"],
                       check=True, capture_output=True)

        def query(user, database, command, check=True):
            return subprocess.run(["docker", "exec", "-i", name, "psql", "-XqAt",
                                   "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"],
                                  input=command, text=True, capture_output=True, check=check)
        try:
            for _ in range(30):
                if query("postgres", "postgres", "SELECT 1", False).returncode == 0:
                    break
                time.sleep(1)
            query("postgres", "postgres", "CREATE ROLE tickif_admin LOGIN CREATEROLE CREATEDB; CREATE DATABASE tickif OWNER tickif_admin;")
            query("tickif_admin", "tickif", sql)
            query("tickif_migrator", "tickif", "CREATE TABLE public.probe(id bigserial PRIMARY KEY, value text); CREATE SCHEMA drizzle; CREATE TABLE drizzle.private_probe(id integer);")
            query("tickif_app", "tickif", "INSERT INTO public.probe(value) VALUES ('ok'); UPDATE public.probe SET value='updated'; SELECT * FROM public.probe; DELETE FROM public.probe;")
            for forbidden in ("CREATE TABLE public.forbidden(id int)",
                              "CREATE SCHEMA forbidden", "TRUNCATE public.probe",
                              "DROP TABLE public.probe", "SELECT * FROM drizzle.private_probe",
                              "SET ROLE tickif_migrator", "CREATE ROLE forbidden"):
                self.assertNotEqual(query("tickif_app", "tickif", forbidden, False).returncode, 0, forbidden)
            result = query("tickif_admin", "tickif", "SELECT count(*) FROM pg_roles WHERE rolname IN ('tickif_app','tickif_migrator') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls);")
            self.assertEqual(result.stdout.strip(), "0")
        finally:
            subprocess.run(["docker", "rm", "-f", name], check=True, capture_output=True)


if __name__ == "__main__":
    unittest.main()
