import { useEffect, useMemo, useState } from "react";
import Icon from "../ui/Icon";
import { Status } from "../ui/Hud";
import { RecItemsApi, RecommendationsApi, SetupsApi } from "../../api/client";
import { runCalculators } from "../../utils/acCalculators";
import { CAR_PARAM_LABELS, CORNER_PARAM_LABELS } from "../../data/acParams";
import { C } from "../../styles/theme";

const PROMPT_VERSION = "ac-v1";
const MODEL = "claude-sonnet-4-6";
const MATCH_TOLERANCE = 0.05; // 5% — AI item within this of a calculator item is tagged MATH

const labelFor = (paramKey) => CAR_PARAM_LABELS[paramKey] || CORNER_PARAM_LABELS[paramKey] || paramKey;
const itemKey = (item) => `${item.scope}:${item.param_key}`;

function buildPrompt({ car, track, setup, stint, calcItems }) {
  const calcLines = calcItems
    .map((i) => `- [${i.scope}] ${i.param_key}: calculator suggests ${i.suggested_value}${i.unit} (currently ${i.current_value}${i.unit}) — ${i.rationale}`)
    .join("\n");
  const feedbackLines = (stint.feedback || [])
    .map((f) => `  [${f.phase}/${f.speed_range}] ${f.symptom} (severity ${f.severity}/5)${f.corner_ref ? ` @ ${f.corner_ref}` : ""}${f.note ? ` — ${f.note}` : ""}`)
    .join("\n");
  const lapLines = (stint.laps || [])
    .map((l) => `  lap ${l.lap_no}: ${(l.lap_ms / 1000).toFixed(3)}s${l.is_valid ? "" : " (invalid)"}`)
    .join("\n");

  const system = `You are the head race engineer for a sim racing team running Assetto Corsa — world class, no-nonsense, technical. You speak directly, like a seasoned race engineer. You do NOT coddle the driver. You give exact numbers within the allowed ranges and explain the physics.

A deterministic setup calculator has already run and produced some anchor suggestions (see below). For each parameter you want to change: either copy the calculator's number if it's correct, or override it with your own number if the calculator missed something (e.g. it has no visibility into aero balance or driver feel). Don't just restate every calculator item — only include items worth changing, and feel free to add car-level or corner items the calculator didn't touch.

Always respond in this EXACT JSON format (no markdown, no extra text):
{
  "headline": "One brutal honest assessment sentence",
  "diagnosis": "What the stint data and feedback show, in technical detail",
  "confidence": "LOW|MEDIUM|HIGH",
  "expected_tradeoff": "What the driver gives up by taking this advice",
  "items": [
    {"priority": 1, "param_key": "<setup column name>", "scope": "FL|FR|RL|RR|FRONT|REAR|CAR", "suggested_value": <number>, "unit": "<unit>", "addresses": "<symptom this fixes>", "rationale": "<physics explanation>", "tradeoff": "<what gets worse>"}
  ],
  "coach_notes": "A brutally honest, technically deep paragraph — what the driver MUST do next stint"
}`;

  const user = `Car: ${car.name} (${car.car_class}, ${car.drivetrain})
Track: ${track.name}

Calculator anchors:
${calcLines || "  (none triggered — no stint tire/feedback data to react to yet)"}

Stint: ${stint.session_type}, ambient ${stint.ambient_temp_c}C, track ${stint.track_temp_c}C, grip ${stint.grip_pct ?? "?"}%
Laps: ${stint.lap_count}, best ${(stint.best_lap_ms / 1000).toFixed(3)}s, avg ${stint.avg_lap_ms ? (stint.avg_lap_ms / 1000).toFixed(3) + "s" : "?"}
${lapLines ? `Lap-by-lap:\n${lapLines}\n` : ""}
${feedbackLines ? `Corner feedback:\n${feedbackLines}\n` : ""}
Driver notes: ${stint.driver_notes || "none"}

Diagnose the problems and give a championship-level setup correction.`;

  return { system, user };
}

function currentValueFor(item, setup) {
  if (item.scope === "CAR") return setup[item.param_key];
  if (["FL", "FR", "RL", "RR"].includes(item.scope)) return setup.corners?.[item.scope]?.[item.param_key];
  const corner = item.scope === "FRONT" ? "FL" : "RL";
  return setup.corners?.[corner]?.[item.param_key];
}

const RecommendationPanel = ({ apiKey, car, track, setup, stint, onApplied }) => {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

  const calcItems = useMemo(() => {
    const compound = (car.compounds || []).find((c) => c.id === setup.compound_id);
    return runCalculators({ car, setup, compound, stint });
  }, [car, setup, stint]);

  useEffect(() => {
    RecommendationsApi.listByStint(stint.id)
      .then((rows) => setRecommendation(rows[0] || null))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [stint.id]);

  const generate = async () => {
    if (!apiKey) {
      setError("Add your Anthropic API key in Settings first.");
      return;
    }
    setGenerating(true);
    setError("");
    const { system, user } = buildPrompt({ car, track, setup, stint, calcItems });
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const calcByKey = Object.fromEntries(calcItems.map((i) => [itemKey(i), i]));
      const aiItems = (parsed.items || []).map((item, i) => {
        const match = calcByKey[itemKey(item)];
        const isMatch = match && Math.abs(Number(item.suggested_value) - match.suggested_value) / (Math.abs(match.suggested_value) || 1) < MATCH_TOLERANCE;
        return {
          priority: item.priority ?? i + 1,
          source: isMatch ? "MATH" : "AI",
          param_key: item.param_key,
          scope: item.scope,
          current_value: currentValueFor(item, setup) ?? 0,
          suggested_value: Number(item.suggested_value),
          unit: item.unit,
          addresses: item.addresses || null,
          rationale: item.rationale || "",
          tradeoff: item.tradeoff || null,
        };
      });

      const aiKeys = new Set(aiItems.map(itemKey));
      const untouchedCalcItems = calcItems
        .filter((i) => !aiKeys.has(itemKey(i)))
        .map((i) => ({ ...i, current_value: currentValueFor(i, setup) ?? i.current_value }));

      const items = [...aiItems, ...untouchedCalcItems].map((item, i) => ({ ...item, priority: i + 1 }));

      const created = await RecommendationsApi.create({
        stint_id: stint.id,
        provider: "anthropic",
        model: MODEL,
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

      const rows = await RecommendationsApi.listByStint(stint.id);
      setRecommendation(rows.find((r) => r.id === created.id) || rows[0]);
    } catch (e) {
      setError(e.message);
    }
    setGenerating(false);
  };

  const toggleAccepted = async (item, accepted) => {
    await RecItemsApi.setAccepted(item.id, accepted);
    setRecommendation((rec) => ({
      ...rec,
      items: rec.items.map((i) => (i.id === item.id ? { ...i, accepted } : i)),
    }));
  };

  const applyAccepted = async () => {
    const accepted = recommendation.items.filter((i) => i.accepted === 1);
    if (!accepted.length) return;
    setApplying(true);
    setError("");
    try {
      const carValues = {};
      for (const key of Object.keys(CAR_PARAM_LABELS)) carValues[key] = setup[key];
      const corners = { ...setup.corners };

      for (const item of accepted) {
        if (item.scope === "CAR") {
          carValues[item.param_key] = item.suggested_value;
        } else if (["FL", "FR", "RL", "RR"].includes(item.scope)) {
          corners[item.scope] = { ...corners[item.scope], [item.param_key]: item.suggested_value };
        } else {
          const pair = item.scope === "FRONT" ? ["FL", "FR"] : ["RL", "RR"];
          for (const corner of pair) corners[corner] = { ...corners[corner], [item.param_key]: item.suggested_value };
        }
      }

      const summary = accepted.map((i) => `${labelFor(i.param_key)} (${i.scope}) → ${i.suggested_value}${i.unit}`).join("; ");

      const newSetup = await SetupsApi.create({
        car_id: car.id,
        track_id: track.id,
        parent_setup_id: setup.id,
        name: `${car.name} v${setup.version + 1}`,
        purpose: setup.purpose,
        compound_id: setup.compound_id,
        fuel_l: setup.fuel_l,
        final_drive: setup.final_drive,
        gear_ratios: setup.gear_ratios,
        change_summary: summary,
        notes: recommendation.diagnosis,
        corners,
        ...carValues,
      });

      await RecommendationsApi.updateStatus(recommendation.id, {
        status: accepted.length === recommendation.items.length ? "APPLIED" : "PARTIAL",
        applied_setup_id: newSetup.id,
      });
      setRecommendation((rec) => ({ ...rec, status: "APPLIED", applied_setup_id: newSetup.id }));
      onApplied?.(newSetup);
    } catch (e) {
      setError(e.message);
    }
    setApplying(false);
  };

  if (loading) return <Status color={C.ink3}>Loading debrief...</Status>;

  return (
    <div className="hud-stack" style={{ gap: "8px" }}>
      {calcItems.length > 0 && (
        <div className="hud-fix">
          <div className="hud-fix__head">
            <span className="hud-tag">CALCULATOR</span>
            <span>{calcItems.length} suggestion{calcItems.length === 1 ? "" : "s"}</span>
          </div>
          {calcItems.map((item, i) => (
            <p className="hud-text" key={i}>
              [{item.scope}] {labelFor(item.param_key)}: {item.current_value}{item.unit} → {item.suggested_value}{item.unit} — {item.rationale}
            </p>
          ))}
        </div>
      )}

      {!recommendation ? (
        <div>
          <button type="button" className="hud-btn hud-btn--cyan" onClick={generate} disabled={generating}>
            <Icon name="zap" size={16} color={C.ink} />
            {generating ? "Engineer is thinking..." : "Ask Crew Chief"}
          </button>
          {error && <Status color={C.orange}>{error}</Status>}
        </div>
      ) : (
        <>
          <div className="hud-fix hud-fix--high">
            <div className="hud-fix__head">
              <span className="hud-tag">{recommendation.confidence}</span>
              <span>{recommendation.status}</span>
            </div>
            <p className="hud-text">{recommendation.diagnosis}</p>
            {recommendation.expected_tradeoff && (
              <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {recommendation.expected_tradeoff}</p>
            )}
          </div>

          {recommendation.items.map((item) => (
            <div key={item.id} className="hud-fix">
              <div className="hud-fix__head">
                <span className="hud-tag">{item.source}</span>
                <span>[{item.scope}] {labelFor(item.param_key)}</span>
                <span>{item.current_value}{item.unit} → {item.suggested_value}{item.unit}</span>
              </div>
              <p className="hud-text">{item.rationale}</p>
              {item.tradeoff && <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {item.tradeoff}</p>}
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" className="hud-chip" aria-pressed={item.accepted === 1} onClick={() => toggleAccepted(item, 1)}>Accept</button>
                <button type="button" className="hud-chip" aria-pressed={item.accepted === 0} onClick={() => toggleAccepted(item, 0)}>Skip</button>
              </div>
            </div>
          ))}

          {recommendation.status === "PENDING" && (
            <button type="button" className="hud-btn" onClick={applyAccepted} disabled={applying || !recommendation.items.some((i) => i.accepted === 1)}>
              {applying ? "Applying..." : "Apply Accepted → New Setup Version"}
            </button>
          )}
          {error && <Status color={C.orange}>{error}</Status>}
        </>
      )}
    </div>
  );
};

export default RecommendationPanel;
