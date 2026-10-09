// The senior race engineer. One call, one job: given where you are (track,
// team, the setup on the bike) and what happened on the run (what you felt,
// where, and your sector times), return the COMPLETE next setup in garage
// order plus corner-by-corner riding notes. Grounded on the community tunes
// we have for the track and, when web search is on, whatever YouTube /
// Reddit setups it can find.
//
// Runs in the browser against the Anthropic API with the rider's own key.

import { GARAGE, GARAGE_PARAMS, PARAM_BY_KEY, clampValue, displayValue, optionIndex } from "../data/garage26";
import { composeDriverProfileText } from "../data/driverProfile";
import { composeCalibrationText } from "../data/controllerCalibration";

export const ENGINEER_MODEL = "claude-opus-5-5";
export const ENGINEER_PROMPT_VERSION = "tune-v1";

export const SYMPTOMS = [
  { key: "front_wont_stop", label: "Front won't stop", phase: "BRAKING" },
  { key: "rear_unstable_brakes", label: "Rear unstable on the brakes", phase: "BRAKING" },
  { key: "wont_turn_in", label: "Won't turn in", phase: "ENTRY" },
  { key: "runs_wide", label: "Runs wide mid-corner", phase: "MID" },
  { key: "rear_slides", label: "Rear steps out / oversteer", phase: "MID" },
  { key: "slow_direction_change", label: "Slow changing direction", phase: "MID" },
  { key: "weak_drive", label: "Weak drive out of corners", phase: "EXIT" },
  { key: "wheelspin", label: "Wheelspin on exit", phase: "EXIT" },
  { key: "wheelies", label: "Wheelies on exit", phase: "EXIT" },
  { key: "low_top_speed", label: "Down on top speed", phase: "STRAIGHT" },
  { key: "hits_limiter", label: "Hits the limiter", phase: "STRAIGHT" },
  { key: "unstable_at_speed", label: "Unstable at speed", phase: "STRAIGHT" },
  { key: "chatter_bumps", label: "Chatter over bumps / kerbs", phase: "BUMPS" },
];
export const SYMPTOM_BY_KEY = Object.fromEntries(SYMPTOMS.map((s) => [s.key, s]));

const fmt = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(3));

function garageSheet(values) {
  return GARAGE.map(
    (g) =>
      `${g.menu}:\n` +
      g.params
        .map((p) => {
          const range = p.options ? `choices: ${p.options.join(" | ")}` : `${p.min}–${p.max}`;
          return `  ${p.key} (${p.label}) = ${displayValue(p.key, values?.[p.key])}   [${range}]${p.help ? ` — ${p.help}` : ""}`;
        })
        .join("\n"),
  ).join("\n");
}

function tuneLines(t) {
  return GARAGE_PARAMS.map((p) => `${p.key}=${displayValue(p.key, t.values[p.key])}`).join(", ");
}

function buildPrompt(ctx) {
  const { mode, track, team, bikeName, circuit, values, run, history, community, profile, calibration } = ctx;

  const system = `You are the senior race engineer for a MotoGP 26 rider (Xbox, controller). You have won championships. You are direct and technical, and every answer ends in numbers the rider types straight into the game garage.

Rules:
- Return the COMPLETE setup: every key in the garage sheet, in the same order, using the game's own scales (1–7, ECU 1–5) and the exact option names for tyres and discs.
- ${mode === "baseline" ? "This is a BASELINE for the first run. Start from the strongest community tune you have for this track (adapting it to this bike if it was built on a different one) — do not invent from scratch when a proven tune exists." : "This is a DEBRIEF. Change only what the rider's report justifies — usually 1 to 4 settings, one clear idea per change. Don't undo something history shows was already tried and was slower."}
- Tie every change to a symptom AND the corners where it happened. Say what it will cost (the trade-off).
- Some problems are riding, not setup (wrong gear, braking point, line). When that's the case, put it in riding notes for that corner instead of changing the bike. Use the reference lap's speeds and gears and the track guide.
- Controller calibration is a separate axis: if the symptom smells like input processing (twitchy, inconsistent), say so in calibration_note with the value to change; otherwise leave it empty.
- Sector times: compare to the previous run and to the reference lap. Point at the sector where the most time is.
${ctx.webSearch ? "- You may search the web (YouTube descriptions, Reddit, forums) for MotoGP 26 setups for this track/bike. Cite what you actually used in sources. Prefer MotoGP 26 sources; say if a source is for an older game." : ""}

Reply with ONLY a JSON object, no prose around it:
{
  "headline": "one sentence",
  "diagnosis": "2–4 sentences: what's happening and why",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "setup": { "<key>": <number or option name>, ... every key ... },
  "changes": [ { "key": "<key>", "why": "symptom + corners + physics", "tradeoff": "what it costs" } ],
  "riding": [ { "corner": <turn number>, "tip": "braking point / gear / line / throttle, specific" } ],
  "focus_sector": "S1" | "S2" | "S3" | null,
  "expected": "what the rider should feel and where the time should come from",
  "calibration_note": "",
  "sources": [ { "title": "", "url": "" } ]
}`;

  const corners = (circuit?.corners || [])
    .map((c) => {
      const r = c.ref || {};
      const refBits = [r.entryKmh && `entry ${r.entryKmh}`, r.minKmh && `min ${r.minKmh} km/h`, r.gear && `gear ${r.gear}`].filter(Boolean).join(", ");
      return `  T${c.n} ${c.name}${refBits ? ` — WR lap: ${refBits}` : ""}${c.guide?.length ? `\n     guide: ${c.guide.join(" ")}` : ""}`;
    })
    .join("\n");

  const laps = (run?.laps || [])
    .map((l, i) => `  lap ${i + 1}: ${fmt(l.lap_ms)}  (S1 ${fmt(l.sector1_ms)}  S2 ${fmt(l.sector2_ms)}  S3 ${fmt(l.sector3_ms)})`)
    .join("\n");

  const feel = (run?.feel || [])
    .map((f) => {
      const s = SYMPTOM_BY_KEY[f.symptom];
      const where = f.corners?.length ? f.corners.map((n) => `T${n}`).join(", ") : "everywhere";
      return `  - ${s?.label || f.symptom} [${s?.phase || "?"}] at ${where}`;
    })
    .join("\n");

  const hist = (history || [])
    .map((h) => `  v${h.version}${h.change_summary ? ` (${h.change_summary})` : ""}: best ${fmt(h.bestMs)}  S1 ${fmt(h.sectors?.[0])} S2 ${fmt(h.sectors?.[1])} S3 ${fmt(h.sectors?.[2])}${h.feel ? `  felt: ${h.feel}` : ""}`)
    .join("\n");

  const ref = circuit?.reference;
  const user = `Track: ${track}${ref ? `  (reference: ${fmt(ref.lapMs)} by ${ref.by} on the ${ref.bike}; sectors ≈ ${ref.sectorsMs.map(fmt).join(" / ")})` : ""}
Team: ${team}  ·  Bike: ${bikeName}

Corners:
${corners || "  (no corner map for this track)"}

Community tunes for this track:
${community?.length ? community.map((t) => `  ${t.author} — ${t.bike}, ${fmt(t.lapMs)}, ${t.conditions}. Aids: ${t.aids}\n    ${tuneLines(t)}\n    notes: ${t.notes}`).join("\n") : "  none on file"}

Setup on the bike now:
${garageSheet(values)}

${mode === "debrief" ? `This run:\n${laps || "  no lap times entered"}\nWhat the rider felt:\n${feel || "  nothing flagged"}\n${run?.notes ? `Rider notes: ${run.notes}\n` : ""}` : `First run on this track${run?.notes ? `. Rider notes: ${run.notes}` : ""}.`}
Previous runs on this tune:
${hist || "  none"}

Rider profile: ${composeDriverProfileText(profile) || "not set"}
Controller calibration: ${composeCalibrationText(calibration) || "not set"}`;

  return { system, user };
}

async function callClaude({ apiKey, system, user, webSearch }) {
  const messages = [{ role: "user", content: user }];
  const body = {
    model: ENGINEER_MODEL,
    max_tokens: 6000,
    system,
    messages,
    ...(webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }] } : {}),
  };
  let usage = { input_tokens: 0, output_tokens: 0 };
  // Server-side search can pause a long turn; resume it a couple of times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Engineer request failed (${res.status})`);
    usage.input_tokens += data.usage?.input_tokens || 0;
    usage.output_tokens += data.usage?.output_tokens || 0;
    if (data.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return { text, usage };
  }
  throw new Error("The engineer ran out of time searching. Try again, or turn web search off.");
}

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The engineer's answer wasn't readable. Try again.");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Coerce the model's setup into valid garage values; anything missing keeps the current value. */
function normaliseSetup(answer, current) {
  const out = {};
  for (const p of GARAGE_PARAMS) {
    const v = answer?.[p.key];
    const n = p.options ? optionIndex(p.key, v) : clampValue(p.key, v);
    out[p.key] = n ?? current?.[p.key] ?? null;
  }
  return out;
}

export async function askEngineer(ctx) {
  if (!ctx.apiKey) throw new Error("Add your Anthropic API key in Settings first.");
  const { system, user } = buildPrompt(ctx);
  const { text, usage } = await callClaude({ apiKey: ctx.apiKey, system, user, webSearch: ctx.webSearch });
  const parsed = parseJson(text);
  const setup = normaliseSetup(parsed.setup, ctx.values);
  const why = Object.fromEntries((parsed.changes || []).map((c) => [c.key, c]));
  const changes = GARAGE_PARAMS.filter((p) => ctx.values?.[p.key] !== setup[p.key]).map((p) => ({
    key: p.key,
    from: ctx.values?.[p.key] ?? null,
    to: setup[p.key],
    why: why[p.key]?.why || "",
    tradeoff: why[p.key]?.tradeoff || "",
  }));
  return {
    ...parsed,
    setup,
    changes,
    riding: (parsed.riding || []).filter((r) => Number.isFinite(Number(r.corner))).map((r) => ({ corner: Number(r.corner), tip: r.tip })),
    request: { system, user },
    usage,
  };
}

export function changeSummary(changes) {
  return changes
    .slice(0, 6)
    .map((c) => `${PARAM_BY_KEY[c.key]?.label || c.key} ${displayValue(c.key, c.from)}→${displayValue(c.key, c.to)}`)
    .join(", ")
    .slice(0, 250);
}
