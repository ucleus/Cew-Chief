// A standing driver profile, independent of any one session — distinct from
// the per-session "Corner Feedback" on the Log Session form, which reports
// what happened on a specific run. This is "who this rider generally is."

export const WEAK_AREAS = [
  { key: "late_braking", label: "Late braking" },
  { key: "trail_braking", label: "Trail braking / brake release" },
  { key: "commitment_entry", label: "Committing to corner entry" },
  { key: "mid_corner_confidence", label: "Mid-corner confidence / holding the line" },
  { key: "throttle_exit", label: "Throttle application on exit" },
  { key: "consistency", label: "Lap-to-lap consistency" },
  { key: "high_speed_stability", label: "Nerves at high speed" },
  { key: "low_grip", label: "Low-grip / wet conditions" },
  { key: "bumpy_kerbs", label: "Bumpy surfaces / kerbs" },
  { key: "direction_changes", label: "Quick changes of direction / chicanes" },
];

export const EMPTY_DRIVER_PROFILE = { weakAreas: {}, notes: "" };

/** Turns the structured profile into one line of prose for an AI prompt. */
export function composeDriverProfileText(profile) {
  if (!profile) return "";
  const tags = Object.entries(profile.weakAreas || {})
    .filter(([, severity]) => severity > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, severity]) => {
      const area = WEAK_AREAS.find((a) => a.key === key);
      return `${area?.label || key} (${severity}/5)`;
    });
  const parts = [];
  if (tags.length) parts.push(`Self-reported weak areas: ${tags.join(", ")}.`);
  if (profile.notes?.trim()) parts.push(`Notes: ${profile.notes.trim()}`);
  return parts.join(" ");
}

function snapToStep(value, min, max, step) {
  const clamped = Math.min(max, Math.max(min, value));
  return min + Math.round((clamped - min) / step) * step;
}

// Standing driver-profile nudges for a brand-new baseline setup. Only fires
// at severity >= 3, moves at most 1-2 steps, and never touches a param two
// rules already landed on. Self-report, not measured data — weaker signal
// than the rest of the baseline, which is why it only nudges, never resets.
const PROFILE_NUDGES = {
  late_braking: { location: "car", param_key: "brake_bias_front_pct", direction: -1, reason: "Reported as a weak area — a touch less front brake bias for margin against front lock-up on a late, hard stop." },
  trail_braking: { location: "corner", axle: "FRONT", param_key: "slow_bump", direction: -1, reason: "Reported as a weak area — softer front slow bump keeps front grip available through trail braking." },
  commitment_entry: { location: "corner", axle: "FRONT", param_key: "camber_deg", direction: -1, reason: "Reported as a weak area — a touch more front camber for extra confidence-inspiring grip on entry." },
  mid_corner_confidence: { location: "car", param_key: "wing_front", direction: 1, reason: "Reported as a weak area — a bit more front wing for a more planted mid-corner." },
  throttle_exit: { location: "car", param_key: "diff_power_pct", direction: -1, reason: "Reported as a weak area — a little less power-side diff lock for smoother exit throttle application." },
  consistency: { location: "car", param_key: "tc_level", direction: 1, reason: "Reported as a weak area — more TC for a more repeatable exit." },
  high_speed_stability: { location: "car", param_key: "wing_rear", direction: 1, reason: "Reported as a weak area — more rear wing for extra stability at speed." },
  low_grip: { location: "car", param_key: "tc_level", direction: 1, reason: "Reported as a weak area — a bit more TC as a safety net in low grip." },
  bumpy_kerbs: { location: "corner", axle: "REAR", param_key: "slow_bump", direction: -1, reason: "Reported as a weak area — softer rear slow bump for more compliance over bumps/kerbs." },
  direction_changes: { location: "corner", axle: "REAR", param_key: "slow_rebound", direction: -1, reason: "Reported as a weak area — faster rear rebound for quicker direction changes." },
};

const CORNERS_OF_AXLE = { FRONT: ["FL", "FR"], REAR: ["RL", "RR"] };

/**
 * Applies driver-profile nudges on top of a baseline's car-level values and
 * per-corner values. Returns new objects (does not mutate the inputs).
 */
export function applyDriverProfileNudges({ carValues, corners, byScope, driverProfile }) {
  const nextCar = { ...carValues };
  const nextCorners = Object.fromEntries(Object.entries(corners).map(([k, v]) => [k, { ...v }]));
  const reasons = {};

  for (const [areaKey, severity] of Object.entries(driverProfile?.weakAreas || {})) {
    if (severity < 3) continue;
    const nudge = PROFILE_NUDGES[areaKey];
    if (!nudge || reasons[nudge.param_key]) continue;
    const steps = severity >= 5 ? 2 : 1;

    if (nudge.location === "car") {
      const range = byScope.CAR?.[nudge.param_key];
      if (!range) continue;
      const next = snapToStep(
        nextCar[nudge.param_key] + nudge.direction * steps * Number(range.step_value),
        Number(range.min_value),
        Number(range.max_value),
        Number(range.step_value),
      );
      if (next === nextCar[nudge.param_key]) continue;
      nextCar[nudge.param_key] = next;
    } else {
      const range = byScope[nudge.axle]?.[nudge.param_key];
      if (!range) continue;
      for (const corner of CORNERS_OF_AXLE[nudge.axle]) {
        const current = nextCorners[corner]?.[nudge.param_key];
        if (current == null) continue;
        nextCorners[corner][nudge.param_key] = snapToStep(
          current + nudge.direction * steps * Number(range.step_value),
          Number(range.min_value),
          Number(range.max_value),
          Number(range.step_value),
        );
      }
    }
    reasons[nudge.param_key] = nudge.reason;
  }

  return { carValues: nextCar, corners: nextCorners, reasons };
}
