import type { ViteUserConfig } from 'vitest/config';

export declare function nodePreset(overrides?: ViteUserConfig['test']): ViteUserConfig;
export declare function testDatabaseUrl(): string;
export declare function integrationEnv(): Record<string, string>;
