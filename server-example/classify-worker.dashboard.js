/**
 * Plain-JavaScript copy of classify-worker.ts, for pasting directly into
 * the Cloudflare dashboard's web-based Worker editor (no TypeScript, no
 * build step, no local tooling required). Functionally identical — see
 * classify-worker.ts and README.md for the full explanation, setup notes,
 * and the wrangler-CLI alternative to this file.
 */

const ALLOWED_TYPES = ["task", "idea", "reminder", "worry", "note"];
const ALLOWED_CATEGORIES = [
  "Work", "Personal", "Home", "Health", "Finance", "Relationships", "Learning", "Other",
];
const ALLOWED_URGENCIES = ["now", "soon", "week", "later", "someday"];

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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    let body;
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
    const toolUse = data?.content?.find((block) => block.type === "tool_use");
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
