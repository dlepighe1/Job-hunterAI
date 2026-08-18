/**
 * A recording stand-in for the Supabase query builder.
 *
 * Test support, not shipped code. It deliberately does NOT import `@supabase/supabase-js`:
 * `db.boundary.test.ts` scans every file under `lib/` for that import, and a helper that
 * reached for the real SDK to imitate it would be the exact thing that test exists to catch.
 *
 * The builder is chainable and terminates in a thenable, so each call records its method and
 * arguments and returns itself. That is what lets a test assert the thing that actually
 * matters in this codebase: that a query filtering on a row id ALSO filtered on the user id.
 * An `.eq("id", …)` without a matching `.eq("user_id", …)` is the whole authorization model
 * failing open, and it is invisible to a mock that only records the terminal result.
 */

export interface Outcome {
  data?: unknown;
  error?: unknown;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  calls: RecordedCall[];
}

const CHAINABLE = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "order",
  "limit",
  "single",
  "maybeSingle",
];

export interface Recorder {
  /** Every query issued, in order, across all tables. */
  readonly log: RecordedQuery[];
  /** Queue the next result for a table. Call repeatedly to script consecutive queries. */
  queue(table: string, outcome: Outcome): void;
  /** Queue the next result for a Storage operation. */
  queueStorage(operation: "list" | "remove" | "upload" | "download", outcome: Outcome): void;
  /** Every query against one table, in order. */
  queries(table: string): RecordedQuery[];
  /** The arguments of every `.eq()` on the nth query against a table. */
  filters(table: string, index?: number): unknown[][];
  /** The argument of the first call to `method` on the nth query against a table. */
  payload(table: string, method: string, index?: number): unknown;
  /** Storage calls, in order, as `[operation, ...args]`. */
  readonly storage: Array<{ operation: string; args: unknown[]; bucket: string }>;
  /** A `createClient` replacement. Pass this straight into the `vi.mock` factory. */
  createClient(): unknown;
  reset(): void;
}

export function createRecorder(): Recorder {
  const log: RecordedQuery[] = [];
  const queued = new Map<string, Outcome[]>();
  const storageQueued = new Map<string, Outcome[]>();
  const storage: Array<{ operation: string; args: unknown[]; bucket: string }> = [];

  function shift(map: Map<string, Outcome[]>, key: string): { data: unknown; error: unknown } {
    const next = map.get(key)?.shift() ?? {};
    return { data: next.data ?? null, error: next.error ?? null };
  }

  function builder(table: string) {
    const record: RecordedQuery = { table, calls: [] };
    log.push(record);

    const chain: Record<string, unknown> = {
      // Thenable, so `await client.from(t).select().eq(…)` resolves wherever the chain
      // happens to stop, which is how the real builder behaves.
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(shift(queued, table)).then(resolve, reject),
    };

    for (const method of CHAINABLE) {
      chain[method] = (...args: unknown[]) => {
        record.calls.push({ method, args });
        return chain;
      };
    }

    return chain;
  }

  function bucket(name: string) {
    const operation = (op: string) => async (...args: unknown[]) => {
      storage.push({ operation: op, args, bucket: name });
      return shift(storageQueued, op);
    };
    return {
      list: operation("list"),
      remove: operation("remove"),
      upload: operation("upload"),
      download: operation("download"),
    };
  }

  return {
    log,
    queue(table, outcome) {
      const existing = queued.get(table) ?? [];
      existing.push(outcome);
      queued.set(table, existing);
    },
    queueStorage(op, outcome) {
      const existing = storageQueued.get(op) ?? [];
      existing.push(outcome);
      storageQueued.set(op, existing);
    },
    queries(table) {
      return log.filter((entry) => entry.table === table);
    },
    filters(table, index = 0) {
      return (log.filter((entry) => entry.table === table)[index]?.calls ?? [])
        .filter((call) => call.method === "eq")
        .map((call) => call.args);
    },
    payload(table, method, index = 0) {
      const query = log.filter((entry) => entry.table === table)[index];
      return query?.calls.find((call) => call.method === method)?.args[0];
    },
    storage,
    createClient() {
      return { from: builder, storage: { from: bucket } };
    },
    reset() {
      log.length = 0;
      storage.length = 0;
      queued.clear();
      storageQueued.clear();
    },
  };
}
