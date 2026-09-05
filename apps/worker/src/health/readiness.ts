type Consumer = {
  isRunning(): boolean;
  waitUntilReady(): Promise<unknown>;
  client: Promise<{ status: string; ping(): Promise<string> }>;
};

/** Prove authentication and command round-trip on the consumers' actual Redis connections. */
export async function consumersAreReady(consumers: readonly Consumer[]): Promise<boolean> {
  if (consumers.length === 0) return false;
  return (
    await Promise.all(
      consumers.map(async (consumer) => {
        try {
          if (!consumer.isRunning()) return false;
          await consumer.waitUntilReady();
          const client = await consumer.client;
          if (client.status !== 'ready') return false;
          return (
            (await client.ping()) === 'PONG' && client.status === 'ready' && consumer.isRunning()
          );
        } catch {
          return false;
        }
      }),
    )
  ).every(Boolean);
}

/** Bound the response, retaining a hung operation so repeated probes cannot pile up commands. */
export function createWorkerReadinessProbe(dependencies: {
  postgres(): Promise<boolean>;
  search(): Promise<boolean>;
  consumers(): Promise<boolean>;
}) {
  let pending: Promise<boolean> | null = null;
  return async (): Promise<boolean> => {
    if (!pending) {
      pending = Promise.all([
        Promise.resolve()
          .then(dependencies.postgres)
          .catch(() => false),
        Promise.resolve()
          .then(dependencies.search)
          .catch(() => false),
        Promise.resolve()
          .then(dependencies.consumers)
          .catch(() => false),
      ])
        .then(
          (checks) => checks.every(Boolean),
          () => false,
        )
        .finally(() => {
          pending = null;
        });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 1_750);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
