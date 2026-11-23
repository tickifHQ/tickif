"""Read-only TLS/AUTH/PING check from the EC2 host using its instance role."""

import argparse
import json
import socket
import ssl
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    result = subprocess.run([
        "aws", "secretsmanager", "get-secret-value", "--region", "ap-south-1",
        "--secret-id", "tickif/production/app", "--query", "SecretString",
        "--output", "text",
    ], check=True, capture_output=True, text=True)
    password = json.loads(result.stdout)["REDIS_PASSWORD"].encode()
    context = ssl.create_default_context()
    with socket.create_connection((args.host, 6379), timeout=15) as connection:
        with context.wrap_socket(connection, server_hostname=args.host) as secured:
            reader = secured.makefile("rb")
            secured.sendall(b"*1\r\n$4\r\nPING\r\n")
            if not reader.readline().startswith(b"-NOAUTH"):
                raise RuntimeError("Redis must reject unauthenticated PING")
            secured.sendall(b"*2\r\n$4\r\nAUTH\r\n$" + str(len(password)).encode() + b"\r\n" + password + b"\r\n")
            if reader.readline() != b"+OK\r\n":
                raise RuntimeError("Redis authentication failed")
            secured.sendall(b"*1\r\n$4\r\nPING\r\n")
            if reader.readline() != b"+PONG\r\n":
                raise RuntimeError("Redis authenticated PING failed")
    print("PASS: Redis certificate/hostname verified, unauthenticated access denied, authenticated PING returned PONG")


if __name__ == "__main__":
    main()
