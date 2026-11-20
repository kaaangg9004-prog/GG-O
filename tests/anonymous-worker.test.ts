import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRequest,
  type Env,
  type EdgeRequest,
} from "../backend/anonymous-api/src/index";
const env: Env = {
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_ANON_KEY: "public-key",
  SUPABASE_SERVICE_ROLE_KEY: "private-test-key",
  ALLOWED_ORIGINS: "https://gg-o.com",
};
const id = "cbaeeeb0-2117-4e89-905f-4ac12ad6d593";
function request(
  body: unknown = {
    action: "comment.create",
    data: { post_id: id, body: "익명 댓글" },
  },
  origin = "https://gg-o.com",
  cf = true,
) {
  const req = new Request("https://api.example/write", {
    method: "POST",
    headers: {
      origin,
      authorization: "Bearer verified.test.token",
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.20",
      "x-forwarded-for": "1.1.1.1",
    },
    body: JSON.stringify(body),
  }) as EdgeRequest;
  if (cf) req.cf = { colo: "ICN" };
  return req;
}
test("write gateway verifies Google OAuth server-side, ignores forged forwarding headers and projects the response", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json(
      calls.length === 1
        ? {
            id,
            app_metadata: { provider: "google" },
            identities: [{ provider: "google" }],
          }
        : { id, user_id: "must-not-leak", ip_address: "must-not-leak" },
    );
  };
  const response = await handleRequest(request(), env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id });
  assert.equal(calls.length, 2);
  const sent = JSON.parse(calls[1].init!.body as string);
  assert.equal(sent.p_actor, id);
  assert.equal(sent.p_ip, "203.0.113.20");
  assert.equal(sent.p_action, "comment.create");
  assert.ok(!JSON.stringify(sent).includes("1.1.1.1"));
});
test("identity/IP injection, missing platform IP, unapproved origins and invalid sessions cannot reach DB", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ error: "bad" }, { status: 401 });
  };
  assert.equal(
    (
      await handleRequest(
        request({
          action: "comment.create",
          data: { body: "내용", user_id: id, ip_address: "1.1.1.1" },
        }),
        env,
        fetcher,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        request(undefined, "https://gg-o.com", false),
        env,
        fetcher,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleRequest(
        request(undefined, "https://attacker.example"),
        env,
        fetcher,
      )
    ).status,
    403,
  );
  assert.equal(calls, 0);
  assert.equal((await handleRequest(request(), env, fetcher)).status, 401);
  assert.equal(calls, 1);
});
test("non-Google identities and oversized streams are rejected, and raw backend errors never reach browsers", async () => {
  let calls = 0;
  const denied: typeof fetch = async () => {
    calls++;
    return Response.json({
      id,
      app_metadata: { provider: "facebook" },
      identities: [{ provider: "facebook" }],
    });
  };
  assert.equal((await handleRequest(request(), env, denied)).status, 403);
  assert.equal(calls, 1);
  assert.equal(
    (
      await handleRequest(
        request({ action: "post.create", data: { body: "a".repeat(26000) } }),
        env,
        denied,
      )
    ).status,
    413,
  );
  assert.equal(calls, 1);
  const failed: typeof fetch = async () => {
    calls++;
    return calls === 2
      ? Response.json({
          id,
          app_metadata: { provider: "google" },
          identities: [{ provider: "google" }],
        })
      : Response.json(
          {
            message: "SECRET actor IP database constraint",
            details: env.SUPABASE_SERVICE_ROLE_KEY,
            code: "23514",
          },
          { status: 400 },
        );
  };
  const response = await handleRequest(request(), env, failed);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "GGO_WRITE_FAILED" });
});

test('public view counting hashes only the trusted platform IP and never exposes its hash or address',async()=>{
 const viewEnv={...env,VIEW_HASH_SECRET:'test-only-random-secret-with-32-characters'},requests:Record<string,unknown>[]=[];
 const viewRequest=(extra:Record<string,unknown>={})=>{const req=new Request('https://api.example/view',{method:'POST',headers:{origin:'https://gg-o.com','content-type':'application/json','cf-connecting-ip':'203.0.113.90','x-forwarded-for':'1.1.1.1'},body:JSON.stringify({post_id:id,...extra})}) as EdgeRequest;req.cf={colo:'ICN'};return req;};
 const fetcher:typeof fetch=async(_,init)=>{requests.push(JSON.parse(init!.body as string));return Response.json({views:42,viewer_hash:'must-not-leak',ip_address:'must-not-leak'});};
 const response=await handleRequest(viewRequest(),viewEnv,fetcher);assert.equal(response.status,200);assert.deepEqual(await response.json(),{views:42});assert.equal(requests[0].p_id,id);assert.match(requests[0].p_viewer_hash as string,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(requests).includes('203.0.113.90'));assert.ok(!JSON.stringify(requests).includes('1.1.1.1'));
 assert.equal((await handleRequest(viewRequest({viewer_hash:'forged'}),viewEnv,fetcher)).status,400);assert.equal(requests.length,1);assert.equal((await handleRequest(viewRequest(),env,fetcher)).status,503);
});
