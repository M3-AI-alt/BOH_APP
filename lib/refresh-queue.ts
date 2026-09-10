/** Coalesces refreshes without dropping post-save reads or applying old responses. */
export function createRefreshQueue<T>(options: {
  read: () => Promise<T>;
  apply: (value: T) => void;
  error: (error: unknown) => void;
  busy: (value: boolean) => void;
}) {
  let generation = 0;
  let requested = false;
  let running: Promise<boolean> | null = null;
  return {
    refresh(): Promise<boolean> {
      generation++;
      requested = true;
      if (running) return running;
      options.busy(true);
      // Defer so running is assigned even when read fails synchronously.
      running = Promise.resolve()
        .then(async () => {
          let success = false;
          while (requested) {
            requested = false;
            const started = generation;
            try {
              const value = await options.read();
              if (started !== generation) continue;
              options.apply(value);
              success = true;
            } catch (error) {
              if (started !== generation) continue;
              options.error(error);
              success = false;
            }
          }
          return success;
        })
        .finally(() => {
          running = null;
          options.busy(false);
        });
      return running;
    },
  };
}
