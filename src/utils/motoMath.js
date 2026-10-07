// MotoMath - the deterministic half of the MotoGP crew chief.
//
// Unlike the AC side (RaceMath.php, ported from real physics formulas),
// there is no recovered "real" MotoGP model to port: mg_session_feedback.symptom
// is free text, not a fixed enum, and the bike param set has no gearing/aero
// numbers precise enough for closed-form physics. This is a from-scratch,
// intentionally modest keyword-matched rule engine (source: "MODEL"),
// documented so its confidence is never overstated — it reads as a rule
// table, not a simulator.

const KEYWORD_RULES = [
  {
    keywords: ["wheelspin", "traction", "slides on accel", "spins"],
    param_key: "tc1",
    direction: 1,
    addresses: "Wheelspin / traction loss on exit",
    rationale: "Raising TC Map 1 cuts power sooner when the rear starts to spin.",
    tradeoff: "Slower off the corner if it steps in before the bike is actually loose.",
  },
  {
    keywords: ["wheelie", "front lifts", "loops"],
    param_key: "wheelie_control",
    direction: 1,
    addresses: "Wheelie under acceleration",
    rationale: "More wheelie control keeps the front down so power gets to the ground instead of lifting the bike.",
    tradeoff: "Costs a little acceleration once the front is already planted.",
  },
  {
    keywords: ["chatter", "front not sticking", "can't late brake", "front washes", "front folds"],
    param_key: "front_compression",
    direction: -1,
    addresses: "Front end not loading consistently under braking/entry",
    rationale: "Softening front compression lets the front tyre follow the surface and build contact patch instead of skating.",
    tradeoff: "More front dive under hard braking.",
  },
  {
    keywords: ["rear wobble", "rear steps out", "rear slides on decel", "unstable", "instability"],
    param_key: "rear_rebound",
    direction: 1,
    addresses: "Rear instability on brake release / decel",
    rationale: "Stiffer rear rebound slows how fast the rear extends, reducing the step-out as you release the brake.",
    tradeoff: "Rear can feel harsher over bumps mid-corner.",
  },
  {
    keywords: ["understeer", "won't turn", "pushes wide", "can't hold my line"],
    param_key: "front_downforce",
    direction: -1,
    addresses: "Won't hold the line mid-corner",
    rationale: "Less front downforce frees the front to rotate instead of pushing wide.",
    tradeoff: "Less front stability braking into the corner from high speed.",
  },
  {
    keywords: ["losing time on straights", "top speed", "slow on the straight"],
    param_key: "rear_downforce",
    direction: -1,
    addresses: "Losing time on the straights",
    rationale: "Less rear downforce cuts drag for more top speed.",
    tradeoff: "Less rear stability and corner support at high speed.",
  },
];

function matchKeywordRules(feedback) {
  const hits = [];
  for (const row of feedback) {
    const text = `${row.symptom} ${row.note || ""}`.toLowerCase();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((k) => text.includes(k))) {
        hits.push({ rule, severity: row.severity || 3, symptom: row.symptom });
      }
    }
  }
  return hits;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, max, step) {
  const snapped = min + Math.round((value - min) / step) * step;
  return clamp(snapped, min, max);
}

/**
 * Runs the keyword rule table against a session's feedback and telemetry
 * flags (hit_limiter, tyre wear), and proposes at most one primary + two
 * secondary changes. Always source "MODEL", always clearly a heuristic —
 * confidence never goes above MEDIUM.
 */
export function runModel({ bike, setup, session }) {
  const paramByKey = Object.fromEntries(bike.params.map((p) => [p.param_key, p]));
  const hits = matchKeywordRules(session.feedback || []);
  const items = [];
  const seen = new Set();

  const bySeverity = hits.sort((a, b) => b.severity - a.severity);
  for (const hit of bySeverity) {
    if (items.length >= 3 || seen.has(hit.rule.param_key)) continue;
    const meta = paramByKey[hit.rule.param_key];
    if (!meta) continue;
    seen.add(hit.rule.param_key);

    const current = Number(setup.values[hit.rule.param_key] ?? meta.default_value);
    const stepsToMove = hit.severity >= 4 ? 2 : 1;
    const raw = current + hit.rule.direction * stepsToMove * Number(meta.step_value);
    const suggested = snapToStep(raw, Number(meta.min_value), Number(meta.max_value), Number(meta.step_value));
    if (suggested === current) continue;

    items.push({
      priority: items.length + 1,
      source: "MODEL",
      param_key: hit.rule.param_key,
      kind: "NUM",
      current_text: String(current),
      suggested_text: String(suggested),
      suggested_number: suggested,
      suggested_option_id: null,
      addresses: `${hit.rule.addresses} (${hit.symptom})`,
      rationale: hit.rule.rationale,
      tradeoff: hit.rule.tradeoff,
    });
  }

  if (session.hit_limiter && items.length < 3) {
    const key = Number(setup.values.front_downforce) >= Number(setup.values.rear_downforce) ? "front_downforce" : "rear_downforce";
    const meta = paramByKey[key];
    if (meta && !seen.has(key)) {
      const current = Number(setup.values[key] ?? meta.default_value);
      const suggested = snapToStep(current - Number(meta.step_value), Number(meta.min_value), Number(meta.max_value), Number(meta.step_value));
      if (suggested !== current) {
        items.push({
          priority: items.length + 1,
          source: "MODEL",
          param_key: key,
          kind: "NUM",
          current_text: String(current),
          suggested_text: String(suggested),
          suggested_number: suggested,
          suggested_option_id: null,
          addresses: "Hit the rev limiter on a straight",
          rationale: "Trimming downforce reduces drag so the bike pulls further before hitting the limiter.",
          tradeoff: "Less stability at high speed and under braking from top speed.",
        });
      }
    }
  }

  const wearFlags = [];
  for (const [key, label] of [["tyre_front_wear_pct", "front"], ["tyre_rear_wear_pct", "rear"]]) {
    if (session[key] != null && Number(session[key]) >= 70) {
      wearFlags.push(`${label} tyre at ${session[key]}% wear — consider a harder compound next time out`);
    }
  }

  const confidence = hits.length >= 2 ? "MEDIUM" : hits.length === 1 ? "LOW" : "LOW";
  const diagnosis = hits.length
    ? `Rule-table reading of ${hits.length} reported symptom(s): ${[...new Set(hits.map((h) => h.symptom))].join(", ")}. This is keyword matching, not a physics model — treat it as a starting point, not the final word.`
    : "No feedback keywords matched the rule table, and the rev limiter wasn't hit. Nothing to recommend from this session alone.";

  return {
    diagnosis,
    confidence,
    expected_tradeoff: items.length
      ? "Each change trades a little of one thing for another — see the tradeoff on each item below."
      : "No changes proposed.",
    data_quality_flags: wearFlags,
    items,
  };
}

// Standing driver-profile nudges for the baseline generator. Only fires at
// severity >= 3 (a real self-reported weakness, not a passing shrug), and
// moves at most 1-2 steps — a starting point to test, not a fix.
const PROFILE_NUDGES = {
  late_braking: { param_key: "engine_brake", direction: 1, reason: "Reported as a weak area — a touch more engine brake helps settle the bike for a late stop." },
  trail_braking: { param_key: "front_rebound", direction: -1, reason: "Reported as a weak area — softer front rebound keeps front grip available through the release." },
  commitment_entry: { param_key: "front_compression", direction: -1, reason: "Reported as a weak area — softer front compression gives more feel/confidence on entry." },
  mid_corner_confidence: { param_key: "front_downforce", direction: 1, reason: "Reported as a weak area — a bit more front downforce for a more planted, confidence-inspiring mid-corner." },
  throttle_exit: { param_key: "tc1", direction: 1, reason: "Reported as a weak area — a bit more TC as a safety net while managing exit throttle." },
  consistency: { param_key: "wheelie_control", direction: 1, reason: "Reported as a weak area — more wheelie control for a more repeatable exit." },
  high_speed_stability: { param_key: "rear_downforce", direction: 1, reason: "Reported as a weak area — more rear downforce for extra stability at speed." },
  low_grip: { param_key: "tc1", direction: 1, reason: "Reported as a weak area — a bit more TC as a safety net in low grip." },
  bumpy_kerbs: { param_key: "rear_compression", direction: -1, reason: "Reported as a weak area — softer rear compression for more compliance over bumps/kerbs." },
  direction_changes: { param_key: "rear_rebound", direction: -1, reason: "Reported as a weak area — faster rear rebound for quicker direction changes." },
};

/**
 * A track-aware, non-AI starting point for a brand new bike+track setup.
 * Mirrors the earlier build's stated philosophy: only move defaults where
 * track character gives a clear, defensible reason (tyre choice, TC/wheelie
 * control for bumpiness and corner speed, engine brake for heavy braking).
 * Suspension and geometry stay on the game's defaults — track-to-track
 * guidance there is too inconsistent to encode as a rule.
 *
 * driverProfile (optional) layers a few more nudges from the rider's
 * standing self-reported weak areas (Settings → Driver Profile) — these are
 * self-report, not measured data, so they're clearly weaker signal than the
 * track-character nudges above and move at most 1-2 steps.
 */
export function suggestBaseline({ bike, track, driverProfile }) {
  const paramByKey = Object.fromEntries(bike.params.map((p) => [p.param_key, p]));
  const values = {};
  const reasons = {};
  for (const p of bike.params) values[p.param_key] = Number(p.default_value);

  const bumpiness = Number(track?.bumpiness ?? 3);
  const avgSpeed = Number(track?.avg_speed_rating ?? 3);
  const straight = Number(track?.straight_rating ?? 3);

  if (paramByKey.tc1 && bumpiness >= 4) {
    values.tc1 = snapToStep(values.tc1 + Number(paramByKey.tc1.step_value), Number(paramByKey.tc1.min_value), Number(paramByKey.tc1.max_value), Number(paramByKey.tc1.step_value));
    reasons.tc1 = "Bumpy track — a touch more TC to cover the rear losing contact over bumps.";
  }
  if (paramByKey.wheelie_control && avgSpeed <= 2) {
    values.wheelie_control = snapToStep(values.wheelie_control + Number(paramByKey.wheelie_control.step_value), Number(paramByKey.wheelie_control.min_value), Number(paramByKey.wheelie_control.max_value), Number(paramByKey.wheelie_control.step_value));
    reasons.wheelie_control = "Tight, slow track — more hard-acceleration zones out of slow corners, so more wheelie control.";
  }
  if (paramByKey.engine_brake && straight >= 4) {
    values.engine_brake = snapToStep(values.engine_brake - Number(paramByKey.engine_brake.step_value), Number(paramByKey.engine_brake.min_value), Number(paramByKey.engine_brake.max_value), Number(paramByKey.engine_brake.step_value));
    reasons.engine_brake = "Long straights mean hard braking from very high speed — less engine brake to keep the rear settled on initial entry.";
  }

  for (const [areaKey, severity] of Object.entries(driverProfile?.weakAreas || {})) {
    if (severity < 3) continue;
    const nudge = PROFILE_NUDGES[areaKey];
    const meta = nudge && paramByKey[nudge.param_key];
    if (!meta || reasons[nudge.param_key]) continue; // don't double-nudge a param two rules already touched
    const steps = severity >= 5 ? 2 : 1;
    const next = snapToStep(
      values[nudge.param_key] + nudge.direction * steps * Number(meta.step_value),
      Number(meta.min_value),
      Number(meta.max_value),
      Number(meta.step_value),
    );
    if (next === values[nudge.param_key]) continue;
    values[nudge.param_key] = next;
    reasons[nudge.param_key] = nudge.reason;
  }

  const choices = {};
  const tyreTargetKind = bumpiness >= 4 || (track?.front_wear_rating ?? 3) >= 4 ? "HARD" : "MEDIUM";
  for (const key of ["tyre_front", "tyre_rear"]) {
    const options = (bike.options || []).filter((o) => o.param_key === key);
    const pick = options.find((o) => o.kind === tyreTargetKind) || options[Math.floor((options.length - 1) / 2)];
    if (pick) {
      choices[key] = pick.id;
      reasons[key] = `${tyreTargetKind === "HARD" ? "High wear/bumpy track" : "Balanced track"} — starting on ${pick.label}.`;
    }
  }

  return { values, choices, reasons };
}
