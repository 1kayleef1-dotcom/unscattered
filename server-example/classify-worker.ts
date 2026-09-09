/**
 * Optional AI classification endpoint — a Cloudflare Worker.
 *
 * Deploy this yourself and point the app's VITE_CLASSIFY_ENDPOINT at it to
 * upgrade Sort Thoughts from local pattern-matching to real Claude-powered
 * classification. Leave it undeployed and the app works exactly as it does
 * today — see src/lib/classifier/index.ts, which only calls this when
 * VITE_CLASSIFY_ENDPOINT is actually set, and falls back to the local
 * heuristic classifier if this ever fails, times out, or isn't configured.
 *
 * Why a separate worker instead of calling Claude from the browser: the
 * app is a public static site (anyone can view-source it), so an API key
 * embedded client-side would be stolen within hours. This worker is the
 * only thing that holds the key — it never appears in the frontend bundle.
 *
 * ---- Setup ----
 * 1. npm install -g wrangler   (Cloudflare's CLI)
 * 2. wrangler login
 * 3. wrangler secret put ANTHROPIC_API_KEY   (paste your key when prompted)
 * 4. wrangler deploy server-example/classify-worker.ts
 *    -> prints a URL like https://unscattered-classify.<you>.workers.dev
 * 5. Set VITE_CLASSIFY_ENDPOINT to that URL wherever you build the app
 *    (e.g. a GitHub Actions repo secret + env passed to `npm run build`),
 *    then redeploy the app. That's the only wiring needed on the app side.
 *
 * A minimal wrangler.toml to go with this:
 *
 *   name = "unscattered-classify"
 *   main = "server-example/classify-worker.ts"
 *   compatibility_date = "2025-01-01"
 *
 * ---- Cost & rate-limit notes ----
 * One request per Sort Thoughts generation (the whole brain dump goes in
 * ONE call, not one per fragment — see the batching note below), using
 * Haiku — Anthropic's fastest/cheapest model, which is genuinely enough
 * for a structured classification task like this one. A typical brain
 * dump (a few sentences) costs a fraction of a cent and returns in well
 * under the 6s timeout the frontend allows for.
 */

interface ClassifyRequestBody {
  text: string;
}

interface Env {
  ANTHROPIC_API_KEY: string;
}

const ALLOWED_TYPES = ["task", "idea", "reminder", "worry", "note"];
const ALLOWED_CATEGORIES = [
  "Work", "Personal", "Home", "Health", "Finance", "Relationships", "Learning", "Other",
];
const ALLOWED_URGENCIES = ["now", "soon", "week", "later", "someday"];

// A tool (rather than free-form prose) forces Claude to return exactly
// this shape — no prose to parse, no risk of the model wrapping the JSON
// in markdown fences or commentary.
const CLASSIFY_TOOL = {
  name: "record_classified_thoughts",
  description: "Records the brain dump, split into individual thoughts, each classified.",
  input_schema: {
    type: "object",
    properties: {
      thoughts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "The thought's own wording, lightly cleaned up — never rewritten to mean something different." },
            type: { type: "string", enum: ALLOWED_TYPES },
            category: { type: "string", enum: ALLOWED_CATEGORIES },
            urgency: { type: "string", enum: ALLOWED_URGENCIES },
            confidence: { type: "number", description: "0 to 1. How sure you are about `type` specifically. Use low values (under 0.4) freely — guessing badly with false confidence is worse than admitting uncertainty." },
            reasoning: { type: "string", description: "One short phrase: the strongest signal behind this guess." },
            dueDate: { type: "string", description: "ISO yyyy-mm-dd, ONLY if the text names an actual date/day. Never invent one." },
            people: { type: "array", items: { type: "string" }, description: "Names actually mentioned, if any." },
            isVague: { type: "boolean", description: "True only for a task-type thought whose verb targets something abstract (\"deal with insurance\") rather than a concrete step." },
          },
          required: ["text", "type", "category", "urgency", "confidence"],
        },
      },
    },
    required: ["thoughts"],
  },
};

const SYSTEM_PROMPT = `You help split a messy, stream-of-consciousness brain dump — often from someone with ADHD — into individual thoughts, each lightly classified. The person may write in run-on sentences, fragments, with no punctuation, with typos, or with emotional/uncertain language. That is completely normal input, not a problem to fix.

Rules:
- Preserve the person's own wording. Clean up obvious transcription noise, but never rewrite a thought to mean something different or invent details it doesn't contain.
- Never invent a due date, a name, or a fact that isn't in the text.
- "type" is one of: task (something to do), idea (something to maybe build/try someday), reminder (don't-forget-style, often tied to an event), worry (emotional/anxious), note (a fact worth keeping, not an action).
- Use "confidence" honestly. A short fragment like "taxes" is genuinely ambiguous — say so with a mid/low confidence rather than pretending certainty.
- Split multiple distinct thoughts in one run-on sentence into separate entries. Don't split a single coherent thought just because it's long.
- Return ONLY the tool call. No commentary.`;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let body: ClassifyRequestBody;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const text = body?.text?.trim();
    if (!text) {
      return new Response(JSON.stringify({ error: "Missing `text`" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    // A generous but bounded cap — this is a brain dump, not a document
    // upload, and it keeps token usage (and cost) predictable.
    const trimmedText = text.slice(0, 4000);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Today's date is ${new Date().toISOString().slice(0, 10)}.\n\nBrain dump:\n"""\n${trimmedText}\n"""` }],
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: "record_classified_thoughts" },
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Upstream classification failed", detail }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const data = await anthropicRes.json();
    const toolUse = data?.content?.find((block: { type: string }) => block.type === "tool_use");
    const thoughts = toolUse?.input?.thoughts;

    if (!Array.isArray(thoughts)) {
      return new Response(JSON.stringify({ error: "Model did not return usable structured output" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ thoughts }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};
