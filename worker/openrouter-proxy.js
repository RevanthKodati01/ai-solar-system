/* =====================================================================
   Cloudflare Worker — OpenRouter rankings proxy for The AI Solar System
   Keeps your API key server-side and caches the dataset for 10 minutes,
   so the public page needs no key and you stay far under rate limits.

   Deploy:
     1. npm i -g wrangler && wrangler login
     2. wrangler deploy worker/openrouter-proxy.js --name ai-solar-data
     3. wrangler secret put OPENROUTER_KEY     (paste your key)
     4. In "AI Solar System.html", set:
          window.DATA_PROXY_URL = "https://ai-solar-data.<you>.workers.dev";
   ===================================================================== */

const CACHE_TTL = 600; // seconds

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const upstream = "https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=" + since;

    const cache = caches.default;
    const cacheKey = new Request(upstream);
    let res = await cache.match(cacheKey);
    if (!res) {
      const or = await fetch(upstream, {
        headers: { Authorization: "Bearer " + env.OPENROUTER_KEY },
      });
      if (!or.ok) {
        return new Response(JSON.stringify({ error: "upstream " + or.status }), { status: 502, headers: cors });
      }
      res = new Response(or.body, or);
      res.headers.set("Cache-Control", "public, max-age=" + CACHE_TTL);
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    const body = await res.text();
    return new Response(body, { headers: { ...cors, "Cache-Control": "public, max-age=" + CACHE_TTL } });
  },
};
