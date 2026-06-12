# The AI Solar System

**A live 3D map of which AI models the world is actually using.**

Every planet is an AI lab — its size tracks real token usage, its distance
from the Sun tracks the lab's founding year (the old guard orbits close;
beyond the asteroid belt is the class of 2023). Every moon is one of that
lab's models, sized by usage. The Sun burns every token generated today.

Built with vanilla JavaScript + three.js. No build step, no framework.
All planet surfaces are generated procedurally at load (fBM noise, domain
warping, bump + specular maps, atmospheric scattering shader) — the page
weighs almost nothing and loads in seconds.

**Data:** [Source: OpenRouter (openrouter.ai/rankings)](https://openrouter.ai/rankings) —
daily token totals for the top 50 public models. The best public proxy of
real-world LLM usage; labs don't publish their own token counts. Models
outside the daily top 50 are aggregated upstream and can't be attributed.

## Run it locally

No build step — it's static files. Either open `AI Solar System.html`
directly in a browser, or (recommended) serve the folder:

```bash
# any of these, from the project root:
npx serve .
# or
python3 -m http.server 8000
```

then open http://localhost:8000/AI%20Solar%20System.html

Without live data it runs on demo numbers. To go live, click the
**DEMO DATA** pill and paste an [OpenRouter API key](https://openrouter.ai/keys)
(stored only in your browser), or deploy the proxy below.

## Deploy / publish

See [DEPLOY.md](DEPLOY.md) — includes a Cloudflare Worker
(`worker/openrouter-proxy.js`) that keeps your API key server-side and
caches the dataset, so public visitors get live data with no key.

## Controls

| input | action |
|---|---|
| drag | orbit the camera |
| scroll / pinch | zoom |
| click planet / arrow keys | fly to a planet |
| click moon | model stats |
| esc / g | back to system view |
| `#planet=openai` in URL | deep link to a planet |

## License

MIT — see [LICENSE](LICENSE).
