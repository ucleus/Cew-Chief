import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { Status } from "../ui/Hud";
import { ComputeApi, RecItemsApi, RecommendationsApi, SetupsApi } from "../../api/client";
import { buildHistory } from "../../utils/history";
import { CAR_PARAM_LABELS, CORNER_PARAM_LABELS } from "../../data/acParams";
import { C } from "../../styles/theme";

const PROMPT_VERSION = "ac-v2";
const MODEL = "claude-sonnet-4-6";

const labelFor = (paramKey) => CAR_PARAM_LABELS[paramKey] || CORNER_PARAM_LABELS[paramKey] || paramKey;

// Ported verbatim from the earlier build's "engineer system prompt.txt" and
// "response schema.json" — see build-notest.txt for provenance.
const SYSTEM_PROMPT = `You are the race engineer for a sim racing team running Assetto Corsa (the original Kunos title, not Assetto Corsa Competizione). You work with a human engineer who logs data after every stint and makes the final call on every change. Your job is to read one stint and recommend the next setup changes worth testing.

WHAT YOU RECEIVE

Each request is one JSON object:

- track, conditions: the circuit's character and the session's temperatures and grip.
- car, tire: the car's fixed specification and the compound's target hot pressures and temperature window.
- setup.values: the current value of every setting, split into car-level values and the four corners (FL, FR, RL, RR).
- setup.adjustable: every setting this car allows you to change, with min, max, step, unit, and higher_means, which states what a larger number does on this car. A scope of FRONT or REAR covers both wheels on that axle.
- computed: numbers produced by a deterministic calculator from the setup and the stint readings. Includes ride frequencies, roll stiffness and its front share, rake, each tyre's pressure and temperature reading, tyre balance, lap statistics, and pressure_corrections.
- feedback: the driver's complaints, each with a corner phase, a speed range, a symptom, and a severity from 1 (minor) to 5 (undriveable).
- history: earlier changes on this car and track, and what each did to lap time.

RULES

1. Treat everything in \`computed\` as fact. It was calculated exactly; you would only be estimating. Do not recalculate or contradict it. The only arithmetic you do is picking a new value on a setting's step grid.

2. Pressures come from the calculator. Copy every entry in computed.pressure_corrections into your adjustments unchanged, with source "MATH" and priority 0. Do not add, alter or drop pressure changes. They do not count toward the limit in rule 6.

3. Only recommend settings listed in setup.adjustable. Every suggested_value must sit between min and max and on the step grid, in the unit given. If the fix you want is not adjustable on this car, describe it in unavailable_fixes and choose the best available alternative.

4. Give absolute values, never deltas. Report current_value exactly as it appears in setup.values and state the new suggested_value. Read higher_means before deciding direction, because click directions and signs differ between cars. Camber is negative: -3.0 is less camber than -3.5.

5. Work in this order. First the tyres: pressures (rule 2), then camber where computed.tires shows TOO_MUCH_NEGATIVE or TOO_LITTLE_NEGATIVE, because every other change is judged through the contact patch. Then the driver's highest-severity complaint. Then anything else, only if it is clearly worth a test.

6. Recommend one primary change (priority 1) and at most three secondary changes (priority 2 to 4), excluding pressures. Move one or two steps at a time. Small changes tested one after another tell the team what worked; a pile of large changes does not.

7. Match the tool to the speed. Complaints at LOW speed are mechanical: springs, anti-roll bars, dampers, differential, brake bias, geometry. Complaints at HIGH speed are aerodynamic: wings, rake, ride height. MEDIUM is a mix; say which you believe dominates and why. Phase matters too: braking and entry point to brake bias, coast-side differential, front rebound and rear bump; mid-corner to anti-roll bars, springs and camber; exit to power-side differential, preload, rear bump and traction control.

8. Use the history. Do not repeat a change that was already tried and made the car slower in comparable conditions. If the most recent change made things worse, reverting it is a valid primary recommendation. Treat lap time differences as noise when they are smaller than the stint's stdev_ms, or when conditions_comparable is false.

9. Name the cost. Every adjustment needs a tradeoff saying what the driver gives up, and expected_tradeoff sums up the whole package in one or two sentences.

10. Be honest about weak data. Add a short entry to data_quality_flags and lower confidence when: there are fewer than three valid laps; tyres are outside their temperature window (cold tyres give misleading pressure and balance readings); the driver's complaint contradicts the tyre data; or a value looks like a typing error. If the data cannot support a real recommendation, say so in the diagnosis, return the pressure corrections only, and use next_stint_focus to say what to collect.

11. Write for a driver and an engineer reading between stints: plain, specific, short. Refer to corners the driver named.

OUTPUT

Respond with a single JSON object and nothing else: no markdown, no code fences, no text before or after. Order adjustments with pressure corrections first, then by priority. The object must have exactly these fields:
{
  "diagnosis": "string, two to four sentences, citing the readings and complaints that support it",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "data_quality_flags": ["string", ...] (empty array when there are none),
  "adjustments": [
    {
      "priority": 0 for calculator pressure corrections, 1 for the primary change, 2-4 for secondary changes,
      "source": "MATH" | "AI",
      "param_key": "string, must be one of setup.adjustable's param_key values",
      "scope": "FL" | "FR" | "RL" | "RR" | "FRONT" | "REAR" | "CAR",
      "current_value": number, exactly as given in setup.values,
      "suggested_value": number, within min/max and on the step grid,
      "unit": "string",
      "addresses": "string, the complaint or reading this targets",
      "rationale": "string, one or two sentences",
      "tradeoff": "string, what the driver gives up"
    }
  ],
  "expected_tradeoff": "string, net effect of the whole package",
  "next_stint_focus": "string, what to pay attention to and what data to record next time",
  "unavailable_fixes": ["string", ...] (empty array when there are none)
}`;

function buildAdjustable(car) {
  return (car.ranges || []).map((r) => ({
    param_key: r.param_key,
    scope: r.scope,
    min: Number(r.min_value),
    max: Number(r.max_value),
    step: Number(r.step_value),
    unit: r.unit,
    higher_means: r.higher_means,
  }));
}

function buildCarValues(setup) {
  const values = {};
  for (const key of Object.keys(CAR_PARAM_LABELS)) values[key] = setup[key];
  return values;
}

function buildUserPayload({ car, track, setup, stint, computed, feedback, history }) {
  return {
    prompt_version: PROMPT_VERSION,
    track: {
      name: track.name,
      layout: track.layout,
      length_m: track.length_m,
      direction: track.direction,
      downforce_demand: track.downforce_demand,
      bumpiness: track.bumpiness,
      kerb_usage: track.kerb_usage,
      slow_corners: track.slow_corners,
      medium_corners: track.medium_corners,
      fast_corners: track.fast_corners,
      longest_straight_m: track.longest_straight_m,
    },
    conditions: {
      ambient_temp_c: Number(stint.ambient_temp_c),
      track_temp_c: Number(stint.track_temp_c),
      grip_pct: stint.grip_pct != null ? Number(stint.grip_pct) : null,
    },
    car: {
      name: car.name,
      car_class: car.car_class,
      drivetrain: car.drivetrain,
      total_mass_kg: Number(car.total_mass_kg),
      front_weight_pct: Number(car.front_weight_pct),
      wheelbase_mm: car.wheelbase_mm,
      track_front_mm: car.track_front_mm,
      track_rear_mm: car.track_rear_mm,
      unsprung_front_kg: Number(car.unsprung_front_kg),
      unsprung_rear_kg: Number(car.unsprung_rear_kg),
    },
    tire: (car.compounds || []).find((c) => c.id === setup.compound_id) || null,
    setup: {
      version: setup.version,
      purpose: setup.purpose,
      values: { car: buildCarValues(setup), corners: setup.corners },
      adjustable: buildAdjustable(car),
    },
    computed,
    feedback: (stint.feedback || []).map((f) => ({
      phase: f.phase,
      speed_range: f.speed_range,
      symptom: f.symptom,
      severity: f.severity,
      corner_ref: f.corner_ref,
      note: f.note,
    })),
    history,
  };
}

const RecommendationPanel = ({ apiKey, car, track, setup, stint, onApplied }) => {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

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
    try {
      const compound = (car.compounds || []).find((c) => c.id === setup.compound_id);
      const computed = await ComputeApi.run({ car, setup, compound, stint });
      const chain = await SetupsApi.chain(car.id, track.id);
      const history = await buildHistory(chain);
      const userPayload = buildUserPayload({ car, track, setup, stint, computed, feedback: stint.feedback, history });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(userPayload) }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Pressure corrections are always ours, not the AI's — inject them
      // directly rather than trusting the model copied them correctly.
      const pressureItems = (computed.pressure_corrections || []).map((p) => ({
        priority: 0,
        source: "MATH",
        param_key: p.param_key,
        scope: p.scope,
        current_value: p.current_value,
        suggested_value: p.suggested_value,
        unit: p.unit,
        addresses: "Hot pressure away from the compound's target on this corner",
        rationale: `Measured hot pressure did not match the ${p.unit} target for this compound; cold pressure corrected by the same ratio.`,
        tradeoff: null,
      }));

      const aiItems = (parsed.adjustments || [])
        .filter((a) => a.param_key !== "cold_psi")
        .map((a, i) => ({
          priority: i + 1,
          source: "AI",
          param_key: a.param_key,
          scope: a.scope,
          current_value: Number(a.current_value),
          suggested_value: Number(a.suggested_value),
          unit: a.unit,
          addresses: a.addresses || null,
          rationale: a.rationale || "",
          tradeoff: a.tradeoff || null,
        }));

      const items = [...pressureItems, ...aiItems];

      const created = await RecommendationsApi.create({
        stint_id: stint.id,
        provider: "anthropic",
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        request_json: JSON.stringify({ system: SYSTEM_PROMPT, user: userPayload }),
        response_json: JSON.stringify(parsed),
        diagnosis: parsed.diagnosis || "",
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
      const carValues = buildCarValues(setup);
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

  if (!recommendation) {
    return (
      <div>
        <button type="button" className="hud-btn hud-btn--cyan" onClick={generate} disabled={generating}>
          <Icon name="zap" size={16} color={C.ink} />
          {generating ? "Engineer is thinking..." : "Ask Crew Chief"}
        </button>
        {error && <Status color={C.orange}>{error}</Status>}
      </div>
    );
  }

  const full = (() => {
    try {
      return JSON.parse(recommendation.response_json || "{}");
    } catch {
      return {};
    }
  })();

  return (
    <div className="hud-stack" style={{ gap: "8px" }}>
      <div className="hud-fix hud-fix--high">
        <div className="hud-fix__head">
          <span className="hud-tag">{recommendation.confidence}</span>
          <span>{recommendation.status}</span>
        </div>
        <p className="hud-text">{recommendation.diagnosis}</p>
        {recommendation.expected_tradeoff && (
          <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {recommendation.expected_tradeoff}</p>
        )}
        {full.data_quality_flags?.length > 0 && (
          <div style={{ marginTop: "6px" }}>
            <span className="hud-tag hud-tag--solid">Weak data</span>
            {full.data_quality_flags.map((f, i) => (
              <p className="hud-text" key={i} style={{ color: C.orange }}>{f}</p>
            ))}
          </div>
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

      {full.next_stint_focus && (
        <div className="hud-fix">
          <div className="hud-fix__head"><span className="hud-tag">Next stint</span></div>
          <p className="hud-text">{full.next_stint_focus}</p>
        </div>
      )}
      {full.unavailable_fixes?.length > 0 && (
        <div className="hud-fix">
          <div className="hud-fix__head"><span className="hud-tag">Can't adjust on this car</span></div>
          {full.unavailable_fixes.map((f, i) => <p className="hud-text" key={i}>{f}</p>)}
        </div>
      )}

      {recommendation.status === "PENDING" && (
        <button type="button" className="hud-btn" onClick={applyAccepted} disabled={applying || !recommendation.items.some((i) => i.accepted === 1)}>
          {applying ? "Applying..." : "Apply Accepted → New Setup Version"}
        </button>
      )}
      {error && <Status color={C.orange}>{error}</Status>}
    </div>
  );
};

export default RecommendationPanel;
