import type { ViteUserConfig } from 'vitest/config';

export declare function nodePreset(overrides?: ViteUserConfig['test']): ViteUserConfig;
export declare function testEnv(): Record<string, string>;
export declare function installTestEnv(environment: Record<string, string | undefined>): () => void;
export declare function testDatabaseUrl(): string;
export declare function workerTestDatabaseUrl(): string;
export declare function testRedisUrl(): string;
export declare function integrationEnv(): Record<string, string>;
