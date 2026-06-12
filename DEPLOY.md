# The AI Solar System — publishing guide

A live 3D map of which AI models the world is using. Planets = AI labs
(size = usage share, distance = founding year), moons = models, the Sun
burns every token generated today. Data: OpenRouter daily rankings.

## Files

- `AI Solar System.html` — the app (rename to `index.html` when hosting)
- `solar/textures.js` — procedural hyper-real planet texture engine
- `solar/build.js` — scene assembly (sun, planets, moons, rings, belt)
- `solar/app.js` — camera, HUD, interactions
- `solar/live.js` — OpenRouter live-data adapter
- `worker/openrouter-proxy.js` — Cloudflare Worker proxy (for public launch)

## Going live WITHOUT exposing your API key (do this before HN)

Visitors should never see your key. Deploy the proxy once:

```bash
npm i -g wrangler
wrangler login
wrangler deploy worker/openrouter-proxy.js --name ai-solar-data
wrangler secret put OPENROUTER_KEY        # paste your OpenRouter key
```

Then in `AI Solar System.html` set:

```js
window.DATA_PROXY_URL = "https://ai-solar-data.<your-subdomain>.workers.dev";
```

The worker caches the dataset for 10 minutes, so a front-page HN spike
costs ~144 upstream requests/day — well under OpenRouter's 500/day limit.

## Hosting

Any static host works (GitHub Pages, Netlify, Cloudflare Pages, Vercel):
rename the HTML to `index.html`, upload the `solar/` folder alongside it.

## Before you post

- [ ] Set `DATA_PROXY_URL` and verify the pill reads "LIVE — Source: OpenRouter…"
- [ ] Add an `og:image` meta tag with an absolute URL to a screenshot (1200×630)
- [ ] Keep the OpenRouter citation visible — it's required by their data terms
- [ ] Test on a phone (touch orbit/pinch/swipe are supported)

## Deep links

`...#planet=openai` (or any lab name) flies straight to that planet — handy
for sharing specific worlds in comments.
