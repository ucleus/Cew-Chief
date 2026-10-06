export const SETUP_SECTIONS = [
  {
    key: "suspension_front",
    label: "Front Suspension",
    params: ["front_compression", "front_rebound", "front_preload", "front_height"],
  },
  {
    key: "suspension_rear",
    label: "Rear Suspension",
    params: ["rear_compression", "rear_rebound", "rear_preload", "rear_height"],
  },
  {
    key: "braking",
    label: "Braking System",
    params: ["brake_bias", "engine_brake"],
  },
  {
    key: "aero",
    label: "Aerodynamics",
    params: ["front_downforce", "rear_downforce"],
  },
  {
    key: "electronics",
    label: "Electronics",
    params: ["tc1", "tc2", "wheelie_control", "engine_map", "anti_wheelie"],
  },
];

export const PARAM_LABELS = {
  front_compression: "Compression",
  front_rebound: "Rebound",
  front_preload: "Preload",
  front_height: "Ride Height",
  rear_compression: "Compression",
  rear_rebound: "Rebound",
  rear_preload: "Preload",
  rear_height: "Ride Height",
  brake_bias: "Brake Bias %",
  engine_brake: "Engine Brake",
  front_downforce: "Front Downforce",
  rear_downforce: "Rear Downforce",
  tc1: "TC Map 1",
  tc2: "TC Map 2",
  wheelie_control: "Wheelie Control",
  engine_map: "Engine Map",
  anti_wheelie: "Anti-Wheelie",
};

export const CHOICE_PARAMS = ["tyre_front", "tyre_rear"];

export const CHOICE_LABELS = {
  tyre_front: "Front Tyre",
  tyre_rear: "Rear Tyre",
};

export const TYRE_TEMP_OPTIONS = ["COLD", "OK", "HOT"];
export const WEATHER_OPTIONS = ["DRY", "DAMP", "WET"];
export const SESSION_TYPE_OPTIONS = ["PRACTICE", "QUALI", "SPRINT", "RACE"];
export const SETUP_PURPOSE_OPTIONS = ["PRACTICE", "QUALI", "SPRINT", "RACE", "WET"];
export const FEEDBACK_PHASES = ["BRAKING", "ENTRY", "MID", "EXIT", "STRAIGHT", "BUMPS"];
export const FEEDBACK_CORNER_TYPES = ["ALL", "SLOW", "MEDIUM", "FAST"];

export const SYMPTOM_SUGGESTIONS = [
  "Can't late brake",
  "Front not sticking to line",
  "Rear wobble on hard brake",
  "Understeer mid-corner",
  "Oversteer on exit",
  "Wheelspin on acceleration",
  "Chattering front tyre",
  "Rear slides on decel",
  "Losing time on straights",
  "Instability at top speed",
];

export function defaultValuesFromParams(params) {
  const values = {};
  for (const p of params) values[p.param_key] = Number(p.default_value);
  return values;
}

export function defaultChoicesFromOptions(options) {
  const choices = {};
  for (const key of CHOICE_PARAMS) {
    const first = options.find((o) => o.param_key === key);
    if (first) choices[key] = first.id;
  }
  return choices;
}
