export async function probeSearchReadiness(
  health: () => Promise<{ ok: boolean }>,
): Promise<boolean> {
  try {
    return (await health()).ok;
  } catch {
    return false;
  }
}
