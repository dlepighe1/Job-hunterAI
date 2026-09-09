/**
 * One question — "what can this project actually serve?" — answered in a sentence a person
 * can act on.
 *
 * Both callers of this used to reach for `fetch` directly, and both turned a dead project
 * into an unhandled `TypeError: fetch failed` over a Node stack trace. That is the least
 * useful form the answer can take: the cause (`ENOTFOUND`) is buried in `error.cause`, the
 * exit is a crash rather than a report, and the four failures that reach here are genuinely
 * different problems with different fixes.
 *
 *   unreachable   the hostname does not resolve. The project was deleted, or SUPABASE_URL
 *                 has the wrong ref. Nothing else can be diagnosed until a project exists.
 *   offline       DNS worked and the connection did not. Usually the machine, not Supabase.
 *   rejected      the project answered and refused the key.
 *   unavailable   the project answered with an error. Paused projects land here.
 *
 * A reachable project returns its table set, which is PostgREST's own schema cache — the
 * same cache the app's writes consult, so "is the schema applied?" is answered by the thing
 * that would fail rather than by something adjacent to it. An empty set is not an error
 * here: it is a project with no schema, which is a real state with its own remedy, and the
 * callers word it for themselves.
 */

/**
 * @typedef {{ ok: true, tables: Set<string> }} ProbeSuccess
 * @typedef {{ ok: false, reason: "unreachable" | "offline" | "rejected" | "unavailable",
 *             message: string }} ProbeFailure
 */

/** The DNS and socket codes worth telling apart. Anything else is reported verbatim. */
const TRANSPORT = {
  ENOTFOUND: "unreachable",
  EAI_AGAIN: "offline",
  ECONNREFUSED: "offline",
  ECONNRESET: "offline",
  ETIMEDOUT: "offline",
  UND_ERR_CONNECT_TIMEOUT: "offline",
};

/**
 * Turn a thrown `fetch` error into a reason and a sentence.
 *
 * `fetch` reports every transport failure as the same opaque `TypeError`, with the code one
 * level down in `cause`, so this reads that rather than the message.
 *
 * @param {unknown} error
 * @param {string} url
 * @returns {ProbeFailure}
 */
export function describeTransportFailure(error, url) {
  const cause = /** @type {{ code?: string, message?: string } | undefined} */ (
    /** @type {{ cause?: unknown }} */ (error)?.cause
  );
  const code = cause?.code ?? "";
  const host = safeHost(url);
  const reason = /** @type {ProbeFailure["reason"]} */ (TRANSPORT[code] ?? "offline");

  if (code === "ENOTFOUND") {
    return {
      ok: false,
      reason: "unreachable",
      message:
        `${host} does not resolve. A Supabase project that is merely paused still resolves, ` +
        "so this is a project that was deleted, or a SUPABASE_URL pointing at the wrong ref.\n" +
        "Create a project, then put its URL and service-role key in web/.env.local.",
    };
  }

  return {
    ok: false,
    reason,
    message:
      `Could not reach ${host} (${code || "no error code"}). DNS resolved, the connection did ` +
      "not, so check this machine's network before the project.",
  };
}

/**
 * Which tables the project exposes, or why it cannot say.
 *
 * @param {string} url
 * @param {string} serviceKey
 * @returns {Promise<ProbeSuccess | ProbeFailure>}
 */
export async function probeProject(url, serviceKey) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/`;

  let res;
  try {
    res = await fetch(endpoint, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  } catch (error) {
    return describeTransportFailure(error, url);
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      reason: "rejected",
      message:
        `${safeHost(url)} refused the service-role key (${res.status}). The key belongs to a ` +
        "different project, or it was rotated. Copy it again from Project Settings > API.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: "unavailable",
      message:
        `${safeHost(url)} answered ${res.status}. A paused project reports itself this way; ` +
        "resume it in the dashboard, then run this again.",
    };
  }

  let doc;
  try {
    doc = /** @type {{ paths?: Record<string, unknown> }} */ (await res.json());
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: `${safeHost(url)} answered 200 with something that is not the PostgREST schema document.`,
    };
  }

  // One path per table PostgREST can see. `/` is the document root and `/rpc/*` are
  // functions, neither of which is a table.
  return {
    ok: true,
    tables: new Set(
      Object.keys(doc.paths ?? {})
        .filter((path) => path.startsWith("/") && path !== "/" && !path.startsWith("/rpc/"))
        .map((path) => path.slice(1)),
    ),
  };
}

/** The hostname, or the raw string when it is too malformed to parse — which is itself the
 *  answer in that case, and throwing here would replace a diagnosis with a crash. */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The project ref: the first label of the Supabase hostname. */
export function projectRef(url) {
  return safeHost(url).split(".")[0];
}
