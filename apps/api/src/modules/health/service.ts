import * as repository from './repository.js';

let draining = false;

export function beginDraining(): void {
  draining = true;
}

/** Test/process bootstrap helper; server processes normally call this only with false. */
export function setDraining(value: boolean): void {
  draining = value;
}

export async function closePostgres(): Promise<void> {
  await repository.closePostgres();
}

export async function getReadiness(): Promise<{
  ready: boolean;
  body: {
    status: 'ready' | 'not-ready' | 'draining';
    service: 'tickif-api';
    checks: { postgres: 'up' | 'down' };
  };
}> {
  if (draining) {
    return {
      ready: false,
      body: { status: 'draining', service: 'tickif-api', checks: { postgres: 'down' } },
    };
  }

  const postgresReady = await repository.postgresIsReady();
  return {
    ready: postgresReady,
    body: {
      status: postgresReady ? 'ready' : 'not-ready',
      service: 'tickif-api',
      checks: { postgres: postgresReady ? 'up' : 'down' },
    },
  };
}
