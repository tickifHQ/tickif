#!/usr/bin/env python3
"""Render-only checks: no service, secret, network or provider mutations."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
env = os.environ.copy()
for line in (ROOT / 'infra/staging/.env.example').read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        env[key] = value.strip().strip('"').strip("'")
env.update(TRAEFIK_STATIC_CONFIG='synthetic-static', TRAEFIK_DYNAMIC_CONFIG='synthetic-dynamic')


def render(files):
    args = ['docker', 'stack', 'config']
    for file in files:
        args += ['--compose-file', file]
    output = subprocess.check_output(args, cwd=ROOT, env=env, text=True)
    # Stack already interpolated the manifest; leave literal shell $ expressions intact.
    return json.loads(subprocess.check_output(
        ['docker', 'compose', '-f', '-', 'config', '--no-interpolate', '--format', 'json'],
        input=output, cwd=ROOT, env=env, text=True,
    ))


base = render(['infra/staging/stack.yml'])
env['GOOGLE_PLACES_API_KEY_SECRET'] = 'synthetic-google-places-key'
enabled = render(['infra/staging/stack.yml', 'infra/staging/google-reviews.yml'])
for service in ['api', 'worker']:
    original = {item['source'] for item in base['services'][service]['secrets']}
    actual = {item['source'] for item in enabled['services'][service]['secrets']}
    assert actual == original | {'google_places_api_key'}, service
    assert all(item in enabled['services'][service]['secrets'] for item in base['services'][service]['secrets'])
    assert 'GOOGLE_PLACES_API_KEY_FILE' not in base['services'][service]['environment']
    assert enabled['services'][service]['environment'] == {
        **base['services'][service]['environment'],
        'GOOGLE_PLACES_API_KEY_FILE': '/run/secrets/google_places_api_key',
    }
    assert {key: value for key, value in enabled['services'][service].items() if key not in {'environment', 'secrets'}} == {
        key: value for key, value in base['services'][service].items() if key not in {'environment', 'secrets'}
    }
for service in set(enabled['services']) - {'api', 'worker'}:
    assert enabled['services'][service] == base['services'][service], service
assert enabled['secrets']['google_places_api_key']['name'] == env['GOOGLE_PLACES_API_KEY_SECRET']
print('Google reviews overlay preserves existing credentials and only grants the key to API/worker.')
