// Deterministic, non-AI setup math. Each function returns 0+ items shaped like
// recommendation_items rows (minus recommendation_id/priority/accepted), always
// source: "MATH". These feed straight into the UI as an instant preview, and are
// handed to the AI debrief as anchor values it can adopt (kept as MATH) or
// override (re-tagged AI) — see RecommendationPanel.

const TARGET_HZ = { FRONT: 2.2, REAR: 2.4 };

function round(n, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function springRateSuggestion(car, axle, currentRate) {
  const pct = axle === "FRONT" ? Number(car.front_weight_pct) : 100 - Number(car.front_weight_pct);
  const unsprung = axle === "FRONT" ? Number(car.unsprung_front_kg) : Number(car.unsprung_rear_kg);
  const motionRatio = axle === "FRONT" ? Number(car.motion_ratio_front) : Number(car.motion_ratio_rear);
  const cornerMass = (Number(car.total_mass_kg) * pct) / 100 / 2;
  const sprungMass = Math.max(cornerMass - unsprung, 10);
  const hz = TARGET_HZ[axle];
  const wheelRateNPerM = (2 * Math.PI * hz) ** 2 * sprungMass;
  const wheelRateNPerMm = wheelRateNPerM / 1000;
  const springRate = round(wheelRateNPerMm / motionRatio ** 2, 1);

  if (currentRate == null || Math.abs(springRate - currentRate) < 2) return null;
  return {
    param_key: "spring_rate",
    scope: axle,
    current_value: currentRate,
    suggested_value: springRate,
    unit: "N/mm",
    addresses: `Target ride frequency ${hz}Hz on the ${axle.toLowerCase()} axle`,
    rationale: `Sprung corner mass ~${round(sprungMass, 0)}kg with a ${motionRatio.toFixed(3)} motion ratio needs ~${springRate} N/mm at the spring to hold a ${hz}Hz natural frequency.`,
    tradeoff: "Changes mechanical grip/platform balance — recheck ride height and bump rubber clearance after fitting.",
  };
}

export function tirePressureSuggestion(corner, measuredHotPsi, targetHotPsi, currentColdPsi) {
  if (measuredHotPsi == null || targetHotPsi == null || currentColdPsi == null) return null;
  const delta = Number(measuredHotPsi) - Number(targetHotPsi);
  if (Math.abs(delta) < 0.5) return null;
  const suggestedCold = round(Number(currentColdPsi) - delta, 1);
  return {
    param_key: "cold_psi",
    scope: corner,
    current_value: Number(currentColdPsi),
    suggested_value: suggestedCold,
    unit: "psi",
    addresses: `Hot pressure ran ${delta > 0 ? "over" : "under"} the compound's target by ${Math.abs(delta).toFixed(1)} psi`,
    rationale: `Measured ${measuredHotPsi} psi hot vs a ${targetHotPsi} psi target. Pit-wall rule: move cold pressure by the same delta, opposite direction.`,
    tradeoff: "Re-measure after a full heat cycle — the correction assumes similar track temp and stint length next time out.",
  };
}

export function brakeBiasSuggestion(feedback, currentBiasFrontPct, range) {
  const weight = (sym) =>
    feedback
      .filter((f) => f.symptom === sym)
      .reduce((sum, f) => sum + Number(f.severity || 1), 0);
  const frontLock = weight("FRONT_LOCKING");
  const rearLock = weight("REAR_LOCKING");
  if (frontLock === 0 && rearLock === 0) return null;

  const stepPct = 0.3;
  const delta = (rearLock - frontLock) * stepPct;
  if (Math.abs(delta) < 0.1) return null;

  let suggested = round(Number(currentBiasFrontPct) + delta, 1);
  if (range) suggested = Math.min(Math.max(suggested, Number(range.min_value)), Number(range.max_value));

  return {
    param_key: "brake_bias_front_pct",
    scope: "CAR",
    current_value: Number(currentBiasFrontPct),
    suggested_value: suggested,
    unit: "%",
    addresses: frontLock > rearLock ? "Front lock-up reported under braking" : "Rear lock-up reported under braking",
    rationale: `Feedback severity-weighted: front lock score ${frontLock}, rear lock score ${rearLock}. Moving bias ${delta > 0 ? "forward" : "rearward"} by ${Math.abs(delta).toFixed(1)}pt to balance braking.`,
    tradeoff: "Too far the other way trades one lock-up symptom for the opposite one — move in small steps and re-test.",
  };
}

export function arbHeuristicSuggestion(car, currentArbFront, currentArbRear, rangeFront, rangeRear) {
  if (currentArbFront == null || currentArbRear == null) return null;
  const frontShare = Number(car.front_weight_pct) / 100;
  const total = Number(currentArbFront) + Number(currentArbRear);
  let suggestedFront = round(total * frontShare, 1);
  let suggestedRear = round(total - suggestedFront, 1);
  if (rangeFront) suggestedFront = Math.min(Math.max(suggestedFront, Number(rangeFront.min_value)), Number(rangeFront.max_value));
  if (rangeRear) suggestedRear = Math.min(Math.max(suggestedRear, Number(rangeRear.min_value)), Number(rangeRear.max_value));

  if (Math.abs(suggestedFront - currentArbFront) < 1 && Math.abs(suggestedRear - currentArbRear) < 1) return null;

  const rationale = `Heuristic only (no roll-center/CG height in the schema): splitting current total roll stiffness ${round(total, 0)} N/mm in proportion to the car's ${round(car.front_weight_pct, 0)}% front weight distribution.`;
  return [
    {
      param_key: "arb_front",
      scope: "CAR",
      current_value: Number(currentArbFront),
      suggested_value: suggestedFront,
      unit: "N/mm",
      addresses: "Front/rear roll stiffness balance",
      rationale,
      tradeoff: "Low confidence — treat as a starting direction, not a precise target. Confirm with on-track balance feedback.",
    },
    {
      param_key: "arb_rear",
      scope: "CAR",
      current_value: Number(currentArbRear),
      suggested_value: suggestedRear,
      unit: "N/mm",
      addresses: "Front/rear roll stiffness balance",
      rationale,
      tradeoff: "Low confidence — treat as a starting direction, not a precise target. Confirm with on-track balance feedback.",
    },
  ];
}

/**
 * Runs every calculator against the current car/setup/stint context.
 * Returns a flat list of recommendation_items-shaped objects (source: "MATH").
 */
export function runCalculators({ car, setup, compound, stint }) {
  const items = [];
  const byScope = {
    CAR: {},
    FRONT: {},
    REAR: {},
  };
  for (const r of car.ranges || []) byScope[r.scope][r.param_key] = r;

  for (const axle of ["FRONT", "REAR"]) {
    const corner = axle === "FRONT" ? "FL" : "RL";
    const current = setup.corners?.[corner]?.spring_rate;
    const suggestion = springRateSuggestion(car, axle, current != null ? Number(current) : null);
    if (suggestion) items.push(suggestion);
  }

  if (compound && stint?.tires) {
    for (const corner of ["FL", "FR", "RL", "RR"]) {
      const axle = corner[0] === "F" ? "FRONT" : "REAR";
      const target = axle === "FRONT" ? compound.target_hot_psi_front : compound.target_hot_psi_rear;
      const measured = stint.tires[corner]?.hot_psi;
      const currentCold = setup.corners?.[corner]?.cold_psi;
      const suggestion = tirePressureSuggestion(corner, measured, target, currentCold);
      if (suggestion) items.push(suggestion);
    }
  }

  if (stint?.feedback?.length && setup.brake_bias_front_pct != null) {
    const suggestion = brakeBiasSuggestion(stint.feedback, Number(setup.brake_bias_front_pct), byScope.CAR.brake_bias_front_pct);
    if (suggestion) items.push(suggestion);
  }

  if (setup.arb_front != null && setup.arb_rear != null) {
    const suggestions = arbHeuristicSuggestion(
      car,
      Number(setup.arb_front),
      Number(setup.arb_rear),
      byScope.CAR.arb_front,
      byScope.CAR.arb_rear,
    );
    if (suggestions) items.push(...suggestions);
  }

  return items.map((item, i) => ({ ...item, priority: i + 1, source: "MATH" }));
}
