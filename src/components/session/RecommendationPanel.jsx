import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { Status } from "../ui/Hud";
import { RecItemsApi, RecommendationsApi, SetupsApi } from "../../api/client";
import { CHOICE_LABELS, CHOICE_PARAMS, PARAM_LABELS } from "../../data/setupParams";
import { composeDriverProfileText } from "../../data/driverProfile";
import { buildHistory } from "../../utils/motoHistory";
import { runModel } from "../../utils/motoMath";
import { C } from "../../styles/theme";

const PROMPT_VERSION = "mg-v2";
const MODEL_PROMPT_VERSION = "model-v1";
const MODEL_NAME = "claude-sonnet-4-6";

function currentTextFor(item, bike, setup) {
  if (item.kind === "CHOICE") {
    const opt = bike.options.find((o) => o.id === setup.choices[item.param_key]);
    return opt?.kind || "unset";
  }
  return String(setup.values[item.param_key] ?? "");
}

function suggestedTextFor(item) {
  return item.kind === "CHOICE" ? item.suggested_option : String(item.suggested_number);
}

function buildPrompt({ bike, track, setup, session, modelResult, history, driverProfile }) {
  const paramLines = bike.params
    .map((p) => `- ${p.param_key}: current ${setup.values[p.param_key]} (range ${p.min_value}-${p.max_value}, step ${p.step_value})`)
    .join("\n");
  const tyreLines = CHOICE_PARAMS.map((key) => {
    const current = bike.options.find((o) => o.id === setup.choices[key]);
    const options = bike.options.filter((o) => o.param_key === key).map((o) => o.kind);
    return `- ${key}: current ${current?.kind || "unset"} (choices: ${options.join(", ")})`;
  }).join("\n");
  const lapLines = (session.laps || [])
    .map((l) => `  lap ${l.lap_no}: ${(l.lap_ms / 1000).toFixed(3)}s${l.is_valid ? "" : " (invalid)"}`)
    .join("\n");
  const feedbackLines = (session.feedback || [])
    .map((f) => `  [${f.phase}/${f.corner_type}] ${f.symptom} (severity ${f.severity}/5)${f.corner_ref ? ` @ ${f.corner_ref}` : ""}${f.note ? ` — ${f.note}` : ""}`)
    .join("\n");
  const modelLines = (modelResult?.items || [])
    .map((i) => `- ${i.param_key}: model suggests ${i.suggested_text} (currently ${i.current_text}) — ${i.rationale}`)
    .join("\n");
  const historyLines = (history || [])
    .map((h) => {
      const changes = h.changes.map((c) => `${c.param_key} ${c.from}→${c.to}`).join(", ");
      return `- v${h.from_version}→v${h.to_version}: ${changes}. Lap delta ${h.best_lap_delta_ms}ms (comparable: ${h.conditions_comparable}). Verdict: ${h.driver_verdict || "none"}`;
    })
    .join("\n");

  const system = `You are the head race engineer and crew chief for a MotoGP team — world class, no-nonsense, technical. You speak directly, like a seasoned race engineer who has won multiple world championships. You do NOT coddle the rider. You give exact numbers within the allowed ranges, explain the physics, and tell them exactly what will happen if they don't follow the setup.

A rule-based model has already run and produced some candidate changes (see "Model suggests" below) — it is a keyword-matched heuristic, not a physics simulator, so treat its numbers as a starting point you can confirm or override, not as settled fact.

Use the history: do not repeat a change that was already tried and made the bike slower in comparable conditions (conditions_comparable=false means don't trust the lap delta). Treat lap time differences smaller than noise with suspicion.

Always respond in this EXACT JSON format (no markdown, no extra text):
{
  "headline": "One brutal honest assessment sentence",
  "diagnosis": "What the session data, feedback and history show, in technical detail",
  "confidence": "LOW|MEDIUM|HIGH",
  "expected_tradeoff": "What the rider gives up by taking this advice",
  "items": [
    {"priority": 1, "param_key": "<one of the numeric param_keys>", "kind": "NUM", "suggested_number": <int within its range>, "addresses": "<symptom this fixes>", "rationale": "<physics explanation>", "tradeoff": "<what gets worse>"},
    {"priority": 2, "param_key": "tyre_front or tyre_rear", "kind": "CHOICE", "suggested_option": "SOFT|MEDIUM|HARD|WET", "addresses": "...", "rationale": "...", "tradeoff": "..."}
  ],
  "coach_notes": "A brutally honest, technically deep paragraph — what the rider MUST do next session"
}
Recommend one primary change and at most three secondary changes. Only include items worth changing — do not pad the list. Stay strictly within each param's given range.`;

  const user = `Bike: ${bike.name} (${bike.class}, ${bike.game})
Track: ${track.name}, ${track.country || ""}

Current setup "${setup.name}" (v${setup.version}):
${paramLines}
${tyreLines}

Session: ${session.session_type}, weather ${session.weather}, ambient ${session.ambient_temp_c ?? "?"}C, track ${session.track_temp_c ?? "?"}C
Laps: ${session.lap_count}, best ${(session.best_lap_ms / 1000).toFixed(3)}s, avg ${session.avg_lap_ms ? (session.avg_lap_ms / 1000).toFixed(3) + "s" : "?"}
Tyre temps: front ${session.tyre_front_temp || "?"}, rear ${session.tyre_rear_temp || "?"}
Tyre wear: front ${session.tyre_front_wear_pct ?? "?"}%, rear ${session.tyre_rear_wear_pct ?? "?"}%
Brake temps: front ${session.brake_front_temp || "?"}, rear ${session.brake_rear_temp || "?"}
Hit limiter: ${session.hit_limiter ? "yes" : "no"}
${lapLines ? `Lap-by-lap:\n${lapLines}\n` : ""}
${feedbackLines ? `Corner feedback:\n${feedbackLines}\n` : ""}
${modelLines ? `Model suggests:\n${modelLines}\n` : "Model suggests: nothing triggered.\n"}
${historyLines ? `History on this bike+track:\n${historyLines}\n` : "History on this bike+track: none yet.\n"}
Driver profile (standing self-report, not from this session — weight it below the hard data above): ${composeDriverProfileText(driverProfile) || "none given"}
Driver notes: ${session.driver_notes || "none"}

Diagnose the problems and give a championship-level setup correction.`;

  return { system, user };
}

const RecommendationPanel = ({ apiKey, driverProfile, bike, track, setup, session, onApplied }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [runningModel, setRunningModel] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    RecommendationsApi.listBySession(session.id)
      .then(setRecommendations)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session.id]);

  const runModelAdvice = async () => {
    setRunningModel(true);
    setError("");
    try {
      const result = runModel({ bike, setup, session });
      const items = result.items.map((item) => ({ ...item, suggested_option_id: item.suggested_option_id ?? null }));
      const created = await RecommendationsApi.create({
        session_id: session.id,
        source: "MODEL",
        prompt_version: MODEL_PROMPT_VERSION,
        response_json: JSON.stringify(result),
        diagnosis: result.diagnosis,
        confidence: result.confidence,
        expected_tradeoff: result.expected_tradeoff,
        items,
      });
      const rows = await RecommendationsApi.listBySession(session.id);
      setRecommendations(rows);
      return rows.find((r) => r.id === created.id);
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setRunningModel(false);
    }
  };

  const generate = async () => {
    if (!apiKey) {
      setError("Add your Anthropic API key in Settings first.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const modelResult = runModel({ bike, setup, session });
      const chain = await SetupsApi.chain(bike.id, track.id);
      const history = await buildHistory(chain);
      const { system, user } = buildPrompt({ bike, track, setup, session, modelResult, history, driverProfile });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          max_tokens: 2000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const items = (parsed.items || []).map((item, i) => {
        const isChoice = item.kind === "CHOICE";
        const optionId = isChoice
          ? bike.options.find((o) => o.param_key === item.param_key && o.kind === item.suggested_option)?.id
          : null;
        return {
          priority: item.priority ?? i + 1,
          source: "AI",
          param_key: item.param_key,
          kind: isChoice ? "CHOICE" : "NUM",
          current_text: currentTextFor(item, bike, setup),
          suggested_text: suggestedTextFor(item),
          suggested_number: isChoice ? null : Number(item.suggested_number),
          suggested_option_id: optionId,
          addresses: item.addresses || null,
          rationale: item.rationale || "",
          tradeoff: item.tradeoff || null,
        };
      });

      const created = await RecommendationsApi.create({
        session_id: session.id,
        source: "AI",
        provider: "anthropic",
        model: MODEL_NAME,
        prompt_version: PROMPT_VERSION,
        request_json: JSON.stringify({ system, user }),
        response_json: JSON.stringify(parsed),
        diagnosis: parsed.diagnosis || parsed.headline || "",
        confidence: parsed.confidence || "MEDIUM",
        expected_tradeoff: parsed.expected_tradeoff || "",
        input_tokens: data.usage?.input_tokens ?? null,
        output_tokens: data.usage?.output_tokens ?? null,
        items,
      });

      const rows = await RecommendationsApi.listBySession(session.id);
      setRecommendations(rows);
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  const toggleAccepted = async (rec, item, accepted) => {
    await RecItemsApi.setAccepted(item.id, accepted);
    setRecommendations((rows) =>
      rows.map((r) =>
        r.id === rec.id ? { ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, accepted } : i)) } : r,
      ),
    );
  };

  const applyAccepted = async (rec) => {
    const accepted = rec.items.filter((i) => i.accepted === 1);
    if (!accepted.length) return;
    setApplying(rec.id);
    setError("");
    try {
      const newValues = { ...setup.values };
      const newChoices = { ...setup.choices };
      for (const item of accepted) {
        if (item.kind === "NUM") newValues[item.param_key] = item.suggested_number;
        else if (item.suggested_option_id) newChoices[item.param_key] = item.suggested_option_id;
      }
      const summary = accepted
        .map((i) => `${PARAM_LABELS[i.param_key] || CHOICE_LABELS[i.param_key] || i.param_key} → ${i.suggested_text}`)
        .join("; ");

      const newSetup = await SetupsApi.create({
        bike_id: bike.id,
        track_id: track.id,
        parent_setup_id: setup.id,
        name: `${bike.name} v${setup.version + 1}`,
        purpose: setup.purpose,
        change_summary: summary,
        notes: rec.diagnosis,
        values: newValues,
        choices: newChoices,
      });

      await RecommendationsApi.updateStatus(rec.id, {
        status: accepted.length === rec.items.length ? "APPLIED" : "PARTIAL",
        applied_setup_id: newSetup.id,
      });
      setRecommendations((rows) =>
        rows.map((r) => (r.id === rec.id ? { ...r, status: "APPLIED", applied_setup_id: newSetup.id } : r)),
      );
      onApplied?.(newSetup);
    } catch (e) {
      setError(e.message);
    }
    setApplying(null);
  };

  if (loading) return <Status color={C.ink3}>Loading debrief...</Status>;

  return (
    <div className="hud-stack" style={{ gap: "10px" }}>
      {recommendations.length === 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="hud-btn hud-btn--ghost" onClick={runModelAdvice} disabled={runningModel}>
            {runningModel ? "Running model..." : "Run Model (instant, no API key)"}
          </button>
          <button type="button" className="hud-btn hud-btn--cyan" onClick={generate} disabled={generating}>
            <Icon name="zap" size={16} color={C.ink} />
            {generating ? "Engineer is thinking..." : "Ask Crew Chief"}
          </button>
        </div>
      )}
      {error && <Status color={C.orange}>{error}</Status>}

      {recommendations.map((rec) => {
        const acceptedCount = rec.items.filter((i) => i.accepted === 1).length;
        return (
          <div key={rec.id} className="hud-stack" style={{ gap: "8px" }}>
            <div className="hud-fix hud-fix--high">
              <div className="hud-fix__head">
                <span className="hud-tag">{rec.source}</span>
                <span className="hud-tag">{rec.confidence}</span>
                <span>{rec.status}</span>
              </div>
              <p className="hud-text">{rec.diagnosis}</p>
              {rec.expected_tradeoff && (
                <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {rec.expected_tradeoff}</p>
              )}
            </div>

            {rec.items.map((item) => (
              <div key={item.id} className="hud-fix">
                <div className="hud-fix__head">
                  <span className="hud-tag">{PARAM_LABELS[item.param_key] || CHOICE_LABELS[item.param_key] || item.param_key}</span>
                  <span>{item.current_text} → {item.suggested_text}</span>
                </div>
                <p className="hud-text">{item.rationale}</p>
                {item.tradeoff && <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {item.tradeoff}</p>}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" className="hud-chip" aria-pressed={item.accepted === 1} onClick={() => toggleAccepted(rec, item, 1)}>Accept</button>
                  <button type="button" className="hud-chip" aria-pressed={item.accepted === 0} onClick={() => toggleAccepted(rec, item, 0)}>Skip</button>
                </div>
              </div>
            ))}

            {rec.status === "PENDING" && (
              <button type="button" className="hud-btn" onClick={() => applyAccepted(rec)} disabled={applying === rec.id || !acceptedCount}>
                {applying === rec.id ? "Applying..." : `Apply ${acceptedCount || ""} Accepted → New Setup Version`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RecommendationPanel;
