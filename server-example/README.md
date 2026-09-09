# Optional: real AI classification

By default, Sort Thoughts runs entirely on-device — `src/lib/classifier/heuristicClassifier.ts`,
no network call, no API key, works offline. This folder is what upgrades that to genuine
Claude-powered classification, if you want it.

## Why this is a separate deployable thing, not a toggle in the app

The app is a public static site — anyone can view-source the JS it ships. An Anthropic API key
embedded in that bundle would be extracted and abused within hours. So the key has to live
somewhere the browser never sees it: a small serverless function that holds the key, is
called by the app, and calls Claude on the app's behalf. `classify-worker.ts` is that function.

```
Frontend  --(POST { text })-->  this worker  --(with your API key)-->  Claude API
Frontend  <--(structured JSON)--  this worker  <--(structured JSON)--  Claude API
```

The worker never trusts the model's output blindly, and the frontend never trusts the
worker's output blindly either — see the validation in `src/lib/classifier/aiClassifier.ts`.
A malformed or missing field degrades to a safe default; it never crashes the sorting screen.

## Deploying it (Cloudflare Workers — free tier is plenty for personal use)

`wrangler.toml` is already in this folder — nothing to write yourself. Run these from
**inside `server-example/`** (`cd server-example` from the repo root first):

1. `npm install -g wrangler`
2. `wrangler login` — opens a browser tab to authorize your Cloudflare account (free to sign
   up if you don't have one: dash.cloudflare.com/sign-up)
3. `wrangler secret put ANTHROPIC_API_KEY` — pastes into a prompt, not a file; get a key from
   console.anthropic.com → API Keys → Create Key
4. `wrangler deploy` — prints your endpoint URL, something like
   `https://unscattered-classify.<you>.workers.dev`

That URL is not secret — it's fine to share, paste into chat, or hand to anyone helping you
wire it up. Your API key is the only thing that has to stay private, and it never leaves
Cloudflare's secret store once you `put` it in step 3.

### No terminal? Use the Cloudflare dashboard instead

Everything above can be done by clicking, in a browser, with `classify-worker.dashboard.js`
(the same worker, in plain JavaScript so the dashboard's editor accepts it with no build step):

1. dash.cloudflare.com/sign-up (free) → log in.
2. Left sidebar → **Workers & Pages** → **Create** → **Workers** → give it a name → **Deploy**
   (this creates a placeholder "Hello World" worker — that's expected).
3. Click **Edit code**. Delete everything in the editor and paste in the full contents of
   `classify-worker.dashboard.js`. Click **Deploy** (or **Save and deploy**).
4. Back on the worker's page → **Settings** tab → **Variables and Secrets** → **Add** →
   type `ANTHROPIC_API_KEY`, mark it **Secret**, paste your key from console.anthropic.com →
   **Deploy** to apply it.
5. The worker's URL is shown at the top of its page — looks like
   `https://<name>.<your-subdomain>.workers.dev`. That's the URL for the next step.

## Wiring it into the app

Set the `VITE_CLASSIFY_ENDPOINT` environment variable to that URL wherever the app gets
**built** (Vite bakes env vars in at build time, not runtime):

- Deploying via the included GitHub Actions workflow
  (`.github/workflows/deploy.yml` — already wired to read this secret, nothing to edit):
  on GitHub, go to the repo → **Settings → Secrets and variables → Actions → New repository
  secret** → name it `VITE_CLASSIFY_ENDPOINT`, value is your worker's URL → **Add secret**.
  Push anything (or re-run the workflow manually from the Actions tab) and the next deploy
  picks it up.
- Building locally: create `.env.local` with `VITE_CLASSIFY_ENDPOINT=https://...` before
  running `npm run build`.

Leave it unset and nothing changes — the app never attempts a network call and behaves
exactly as it does today.

## What you get, and what you don't

- One request per "Sort my thoughts" click, not one per fragment — the whole brain dump goes
  in a single call, which is both cheaper and lets the model see the full context when
  deciding where one thought ends and the next begins.
- A ~6 second timeout on the frontend; if the worker is slow, down, or errors, sorting falls
  straight back to the local heuristic classifier with no error shown to the user — see
  `classifyThoughts()` in `src/lib/classifier/index.ts`.
- Structured JSON only (via Claude's tool-use, not prose parsing) — the model can't return
  something the frontend can't safely handle.
- The AI never deletes, archives, or saves anything on its own. It returns suggestions; the
  same review UI (Sort Thoughts) is still the only thing that writes to your data, and only
  when you tap Save/Archive/Accept.

## Adapting this to a different host

The worker has no Cloudflare-specific logic beyond the `export default { fetch(request, env) }`
shape — porting it to a Vercel Edge Function or Netlify Function is mostly moving that fetch
handler into that platform's expected file shape and swapping how the secret is read
(`env.ANTHROPIC_API_KEY` → `process.env.ANTHROPIC_API_KEY`, etc.). The request/response
contract the frontend expects (`POST { text } -> { thoughts: [...] }`) stays the same either way.
