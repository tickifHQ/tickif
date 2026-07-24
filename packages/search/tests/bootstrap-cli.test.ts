import { describe, expect, it, vi } from 'vitest';
import { runBootstrapCli } from '../src/bootstrap-cli.js';

describe('search bootstrap CLI', () => {
  it('rejects conflicting modes instead of silently choosing one', async () => {
    const bootstrap = vi.fn();

    await expect(
      runBootstrapCli(['--check', '--apply-updates'], { bootstrap, log: vi.fn() }),
    ).rejects.toThrow('--check and --apply-updates cannot be used together');
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('passes the selected mode to bootstrap and prints a framed result', async () => {
    const bootstrap = vi.fn(async () => ({
      createdCollections: [],
      updatedCollections: [],
      createdAliases: [],
      updatedSynonymSet: false,
    }));
    const log = vi.fn();

    await runBootstrapCli(['--check'], { bootstrap, log });

    expect(bootstrap).toHaveBeenCalledWith({ applyUpdates: false, check: true });
    expect(log).toHaveBeenCalledWith(
      '[search] Bootstrap complete: {"createdCollections":[],"updatedCollections":[],"createdAliases":[],"updatedSynonymSet":false}',
    );
  });
});
