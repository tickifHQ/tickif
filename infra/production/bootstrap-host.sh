#!/usr/bin/env bash
# Run as root through SSM on the dedicated Amazon Linux 2023 production host.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run through the root SSM session' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == amzn && "$VERSION_ID" == 2023 ]] || {
  echo 'This bootstrap requires Amazon Linux 2023' >&2; exit 1;
}

dnf install -y docker jq
install -d -m 750 /opt/tickif/releases /opt/tickif/certs /opt/tickif/state
install -d -m 700 /etc/tickif
install -d -m 755 /etc/docker
# Do not replace an operator's existing daemon settings on a later run.
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": false
}
JSON
fi
systemctl enable --now docker
if [[ "$(docker info --format '{{.Swarm.LocalNodeState}}')" == inactive ]]; then
  token=$(curl --fail --silent --show-error -X PUT \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
    http://169.254.169.254/latest/api/token)
  private_ip=$(curl --fail --silent --show-error \
    -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/local-ipv4)
  unset token
  # Swarm prints join credentials by default; never send those to SSM logs.
  docker swarm init --advertise-addr "$private_ip" >/dev/null
fi
[[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" == true ]]

curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://truststore.pki.rds.amazonaws.com/ap-south-1/ap-south-1-bundle.pem \
  -o /opt/tickif/certs/rds-ca-bundle.pem
chmod 644 /opt/tickif/certs/rds-ca-bundle.pem
openssl crl2pkcs7 -nocrl -certfile /opt/tickif/certs/rds-ca-bundle.pem | \
  openssl pkcs7 -print_certs -noout >/dev/null
docker version --format 'Docker server {{.Server.Version}}'
docker info --format 'Swarm {{.Swarm.LocalNodeState}}, manager {{.Swarm.ControlAvailable}}'
df -h /
free -m
echo 'Host runtime prepared; application services and public ingress are not deployed.'
