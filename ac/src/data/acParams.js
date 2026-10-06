export const CORNERS = ["FL", "FR", "RL", "RR"];
export const CORNER_LABELS = { FL: "Front Left", FR: "Front Right", RL: "Rear Left", RR: "Rear Right" };
export const AXLE_OF_CORNER = { FL: "FRONT", FR: "FRONT", RL: "REAR", RR: "REAR" };

export const CAR_PARAM_SECTIONS = [
  { key: "brakes", label: "Brakes", params: ["brake_bias_front_pct", "brake_power_pct", "brake_duct_front", "brake_duct_rear"] },
  { key: "chassis", label: "Chassis", params: ["arb_front", "arb_rear", "caster_deg"] },
  { key: "aero", label: "Aero", params: ["wing_front", "wing_rear"] },
  { key: "diff", label: "Differential", params: ["diff_power_pct", "diff_coast_pct", "diff_preload_nm"] },
  { key: "drivetrain", label: "Drivetrain", params: ["final_drive"] },
  { key: "electronics", label: "Electronics", params: ["tc_level", "abs_level", "engine_brake", "turbo_boost_pct"] },
];

export const CAR_PARAM_LABELS = {
  brake_bias_front_pct: "Brake Bias Front %",
  brake_power_pct: "Brake Power %",
  brake_duct_front: "Front Brake Duct",
  brake_duct_rear: "Rear Brake Duct",
  arb_front: "ARB Front",
  arb_rear: "ARB Rear",
  caster_deg: "Caster",
  wing_front: "Front Wing",
  wing_rear: "Rear Wing",
  diff_power_pct: "Diff Power %",
  diff_coast_pct: "Diff Coast %",
  diff_preload_nm: "Diff Preload",
  final_drive: "Final Drive",
  tc_level: "Traction Control",
  abs_level: "ABS",
  engine_brake: "Engine Brake",
  turbo_boost_pct: "Turbo Boost %",
};

export const CORNER_PARAM_SECTIONS = [
  { key: "tyres", label: "Tyres & Alignment", params: ["cold_psi", "camber_deg", "toe"] },
  { key: "springs", label: "Springs & Ride Height", params: ["spring_rate", "ride_height", "packer", "bumpstop_rate"] },
  { key: "dampers", label: "Dampers", params: ["slow_bump", "slow_rebound", "fast_bump", "fast_rebound"] },
];

export const CORNER_PARAM_LABELS = {
  cold_psi: "Cold Pressure",
  camber_deg: "Camber",
  toe: "Toe",
  spring_rate: "Spring Rate",
  ride_height: "Ride Height",
  packer: "Packer",
  bumpstop_rate: "Bumpstop Rate",
  slow_bump: "Slow Bump",
  slow_rebound: "Slow Rebound",
  fast_bump: "Fast Bump",
  fast_rebound: "Fast Rebound",
};

export const SETUP_PURPOSE_OPTIONS = ["BASELINE", "QUALI", "RACE", "ENDURANCE", "WET"];
export const SESSION_TYPE_OPTIONS = ["PRACTICE", "QUALI", "RACE"];
export const DRIVETRAIN_OPTIONS = ["FR", "MR", "RR", "FF", "AWD"];

export const FEEDBACK_PHASES = ["BRAKING", "ENTRY", "MID", "EXIT", "STRAIGHT", "KERBS"];
export const FEEDBACK_SPEED_RANGES = ["LOW", "MEDIUM", "HIGH", "ALL"];
export const FEEDBACK_SYMPTOMS = [
  "UNDERSTEER",
  "OVERSTEER",
  "SNAP_OVERSTEER",
  "TRACTION_LOSS",
  "FRONT_LOCKING",
  "REAR_LOCKING",
  "INSTABILITY",
  "BOTTOMING",
  "BOUNCING",
  "SLOW_RESPONSE",
  "OTHER",
];

export function midpointDefault(range) {
  const min = Number(range.min_value);
  const max = Number(range.max_value);
  const step = Number(range.step_value) || 1;
  const mid = min + (max - min) / 2;
  return Math.round(mid / step) * step;
}

export function defaultCornerValues(byScope) {
  const corners = {};
  for (const corner of CORNERS) {
    const scope = AXLE_OF_CORNER[corner];
    const values = {};
    for (const [key, range] of Object.entries(byScope[scope] || {})) {
      values[key] = midpointDefault(range);
    }
    corners[corner] = values;
  }
  return corners;
}

export function defaultCarValues(byScope) {
  const values = {};
  for (const [key, range] of Object.entries(byScope.CAR || {})) {
    values[key] = midpointDefault(range);
  }
  return values;
}

export function rangesByScope(ranges) {
  const out = { CAR: {}, FRONT: {}, REAR: {} };
  for (const r of ranges) {
    out[r.scope] = out[r.scope] || {};
    out[r.scope][r.param_key] = r;
  }
  return out;
}
