import { installE2eEnvironment } from '@repo/config/e2e';

export const environment = installE2eEnvironment();
export const apiUrl = environment.BETTER_AUTH_URL!;
export const webUrl = environment.PUBLIC_WEB_URL!;
export const providerUrl = `http://localhost:${environment.E2E_PROVIDER_PORT}`;
