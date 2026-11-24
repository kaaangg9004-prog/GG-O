/** Dedicated Cloudflare Worker. Deploy separately; never bundle its secrets into Next.js.
 * Internet requests must enter through Cloudflare, which sets CF-Connecting-IP.
 * No caller-provided X-Forwarded-For / JSON identity is trusted.
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
  VIEW_HASH_SECRET?: string;
}
export type EdgeRequest = Request & { cf?: unknown };
const actions = new Set([
  "post.create",
  "post.update",
  "post.delete",
  "comment.create",
  "comment.update",
  "comment.delete",
  "poll_comment.create",
  "poll_comment.update",
  "poll_comment.delete",
]);
const allowed: Record<string, string[]> = {
  "post.create": ["title", "body", "topic", "prefix_id", "body_size", "body_color", "images"],
  "post.update": ["id", "title", "body", "topic", "prefix_id", "body_size", "body_color", "images"],
  "post.delete": ["id"],
  "comment.create": ["post_id", "body", "parent_id"],
  "comment.update": ["id", "body"],
  "comment.delete": ["id"],
  "poll_comment.create": ["poll_id", "body", "parent_id"],
  "poll_comment.update": ["id", "body"],
  "poll_comment.delete": ["id"],
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function handleRequest(
  request: EdgeRequest,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get("origin") ?? "",
    origins =
      env.ALLOWED_ORIGINS?.split(",")
        .map((x) => x.trim())
        .filter(Boolean) ?? [];
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (!origin || !origins.includes(origin))
    return reply(403, "GGO_ORIGIN_DENIED");
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, "GGO_METHOD_DENIED");
  if (!["/write", "/view"].includes(new URL(request.url).pathname))
    return reply(404, "GGO_NOT_FOUND");
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return reply(415, "GGO_INVALID_INPUT");
  if (
    !env.SUPABASE_URL?.match(/^https:\/\/[a-z0-9-]+\.supabase\.co$/) ||
    !env.SUPABASE_ANON_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  )
    return reply(503, "GGO_SERVER_UNAVAILABLE");
  // request.cf is runtime-provided, not a browser header. Fail closed in local,
  // direct-origin or unsupported runtimes instead of storing a spoofed address.
  const ip = request.headers.get("cf-connecting-ip");
  if (
    !request.cf ||
    !ip ||
    ip.includes(",") ||
    ip.includes("/") ||
    !(ip.includes(":")
      ? /^[0-9a-f:]+$/i.test(ip)
      : /^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
  )
    return reply(503, "GGO_IP_UNAVAILABLE");
  if (new URL(request.url).pathname === "/view")
    return handleViewRequest(request, env, ip, headers, fetcher);
  const auth = request.headers.get("authorization");
  if (!auth?.match(/^Bearer [A-Za-z0-9._~-]+$/))
    return reply(401, "GGO_AUTH_REQUIRED");
  let input: { action?: unknown; data?: unknown };
  try {
    // Bound actual streamed bytes, not only the spoofable Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "GGO_INVALID_INPUT");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24576) {
        await reader.cancel();
        return reply(413, "GGO_INVALID_INPUT");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return reply(400, "GGO_INVALID_INPUT");
  }
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !["action", "data"].includes(k)) ||
    typeof input.action !== "string" ||
    !actions.has(input.action) ||
    !input.data ||
    typeof input.data !== "object" ||
    Array.isArray(input.data)
  )
    return reply(400, "GGO_INVALID_INPUT");
  const data = input.data as Record<string, unknown>;
  if (
    Object.entries(data).some(
      ([key, value]) => !allowed[input.action as string].includes(key) ||
        (key === "images" ? !Array.isArray(value) : typeof value !== "string" && value !== null),
    )
  )
    return reply(400, "GGO_INVALID_INPUT");
  try {
    const userResponse = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth },
      signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return reply(401, "GGO_AUTH_REQUIRED");
    const user = (await userResponse.json()) as {
      id?: string;
      app_metadata?: { provider?: string };
      identities?: { provider: string }[];
    };
    if (
      !user.id ||
      !uuid.test(user.id) ||
      user.app_metadata?.provider !== "google" ||
      !user.identities?.some((identity) => identity.provider === "google")
    )
      return reply(403, "GGO_GOOGLE_REQUIRED");
    const response = await fetcher(
      `${env.SUPABASE_URL}/rest/v1/rpc/anonymous_trusted_write`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_actor: user.id,
          p_ip: ip,
          p_action: input.action,
          p_data: data,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = (await response.json()) as {
      id?: string;
      message?: string;
      code?: string;
    };
    if (!response.ok) {
      const known = [
        "GGO_MEMBER_RESTRICTED",
        "GGO_VOTE_REQUIRED",
        "GGO_NOT_FOUND",
        "GGO_INVALID_INPUT",
      ];
      return reply(
        result.code === "42501" ? 403 : 400,
        known.includes(result.message ?? "")
          ? result.message!
          : "GGO_WRITE_FAILED",
      );
    }
    if (!result.id || !uuid.test(result.id))
      return reply(502, "GGO_WRITE_FAILED");
    // Never forward raw DB results, PostgREST errors, JWTs or request headers.
    return new Response(JSON.stringify({ id: result.id }), {
      status: 200,
      headers,
    });
  } catch {
    return reply(503, "GGO_SERVER_UNAVAILABLE");
  }
}
export default { fetch: handleRequest };

/** Read counters use a per-post, per-UTC-day HMAC. Neither raw IP nor its
 * pseudonym is returned to the browser. Direct client RPC writes are revoked. */
async function handleViewRequest(
  request: Request,
  env: Env,
  ip: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
) {
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (!env.VIEW_HASH_SECRET || env.VIEW_HASH_SECRET.length < 32)
    return fail(503, "GGO_VIEW_UNAVAILABLE");
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "GGO_INVALID_INPUT");
    let body = "",
      size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return fail(413, "GGO_INVALID_INPUT");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const input = JSON.parse(body);
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length !== 1 ||
      typeof input.post_id !== "string" ||
      !uuid.test(input.post_id)
    )
      return fail(400, "GGO_INVALID_INPUT");
    const day = new Date().toISOString().slice(0, 10),
      key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.VIEW_HASH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(input.post_id + "|" + day + "|" + ip),
    );
    const viewerHash = Array.from(new Uint8Array(signature), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const response = await fetcher(
      env.SUPABASE_URL + "/rest/v1/rpc/anonymous_trusted_view",
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_id: input.post_id,
          p_viewer_hash: viewerHash,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return fail(400, "GGO_VIEW_FAILED");
    const data = (await response.json()) as { views?: number };
    if (!Number.isSafeInteger(data.views) || Number(data.views) < 0)
      return fail(502, "GGO_VIEW_FAILED");
    return new Response(JSON.stringify({ views: data.views }), {
      status: 200,
      headers,
    });
  } catch {
    return fail(400, "GGO_INVALID_INPUT");
  }
}
