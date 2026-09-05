import { apiUrl, providerUrl, environment } from '../lib/environment';

export default async function readiness() {
  const urls = [
    `${apiUrl}/health`,
    `http://localhost:${environment.WORKER_HEALTH_PORT}/readyz`,
    `${providerUrl}/health`,
  ];
  for (const url of urls) {
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) {
          ready = true;
          break;
        }
      } catch {
        /* bounded startup polling */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`E2E service did not become ready: ${url}`);
  }
}
