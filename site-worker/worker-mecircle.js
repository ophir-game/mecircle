// MECircle static-site server for Cloudflare Workers + KV, with a same-origin
// JSON-RPC proxy at POST /rpc -> ME Network testnet (chain 400).
// Assets live in the bound KV namespace ASSETS under keys "<path>" (one
// namespace per site). Upload stores the MIME type in KV metadata as {ct}.
// Resolution: exact key, then "<path>.html", then "<path>/index.html".
// NOTE: fetch() from a Worker to an IP literal is refused by Cloudflare
// (error 1003 "Direct IP access not allowed"), so the upstream is reached
// through the nip.io wildcard-DNS name that resolves to the node's IP.
const RPC_UPSTREAM = "http://118.175.0.249.nip.io:8545";
const RPC_TIMEOUT_MS = 25000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

async function handleRpc(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "Use POST with a JSON-RPC body", chainId: 400, upstream: "ME Network Testnet" }),
      { status: 405, headers: { "content-type": "application/json", ...CORS } }
    );
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      { status: 405, headers: { "content-type": "application/json", ...CORS } });
  }
  const body = await request.text();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
  try {
    const upstream = await fetch(RPC_UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
    });
  } catch (err) {
    const msg = err && err.name === "AbortError" ? "RPC upstream timed out" : "RPC upstream unreachable";
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: msg } }),
      { status: 502, headers: { "content-type": "application/json", ...CORS } }
    );
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/rpc") return handleRpc(request);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const candidates = [path];
    if (path.endsWith("/")) candidates.push(path + "index.html");
    else if (!path.split("/").pop().includes(".")) candidates.push(path + ".html", path + "/index.html");

    for (const key of candidates) {
      const hit = await env.ASSETS.getWithMetadata(key, { type: "arrayBuffer", cacheTtl: 120 });
      if (hit && hit.value) {
        const ct = (hit.metadata && hit.metadata.ct) || "application/octet-stream";
        const isHtml = ct.startsWith("text/html");
        // Code and data must refresh fast after a redeploy; only media files
        // are immutable enough for the long cache.
        const softCache = isHtml || /\.(js|css|json)$/.test(key);
        const headers = {
          "content-type": ct,
          "cache-control": softCache ? "public, max-age=60" : "public, max-age=3600",
        };
        return new Response(request.method === "HEAD" ? null : hit.value, { status: 200, headers });
      }
    }
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
  },
};
