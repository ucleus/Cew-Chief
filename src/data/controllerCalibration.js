// MotoGP's in-game controller calibration — a different axis entirely from
// bike setup. These control how stick/trigger input gets processed before
// it ever reaches the bike, so a "twitchy" or "inconsistent" complaint can
// be a calibration problem that no suspension change will ever fix.
// Source: MotoGP 24's calibration menu (dead zone / linearity / saturation
// / filter pressure / filter release).

export const CALIBRATION_FIELDS = [
  {
    key: "dead_zone",
    label: "Dead Zone",
    unit: "%",
    min: 0,
    max: 50,
    recommended: 0,
    effect: "Minimum stick movement before the bike reacts at all. Higher means more small-input stability, less precision.",
  },
  {
    key: "linearity",
    label: "Linearity",
    unit: "%",
    min: 0,
    max: 150,
    recommended: 95,
    effect: "How precise steering is near the extremes of stick travel. Higher means sharper response at full lean.",
  },
  {
    key: "saturation",
    label: "Saturation",
    unit: "%",
    min: 50,
    max: 150,
    recommended: 105,
    effect: "Caps the upper/lower steering input. Above 100% reaches full lean before the stick is fully deflected.",
  },
  {
    key: "filter_pressure",
    label: "Filter Pressure",
    unit: "%",
    min: 0,
    max: 50,
    recommended: 5,
    effect: "Delay applied when an input is first made. Higher smooths out accidental twitches but adds lag.",
  },
  {
    key: "filter_release",
    label: "Filter Release",
    unit: "%",
    min: 0,
    max: 50,
    recommended: 0,
    effect: "Delay applied when an input is released. Higher smooths catching a slide but slows your correction.",
  },
];

export const EMPTY_CALIBRATION = Object.fromEntries(CALIBRATION_FIELDS.map((f) => [f.key, f.recommended]));

export function composeCalibrationText(calibration) {
  if (!calibration) return "";
  return CALIBRATION_FIELDS
    .map((f) => `${f.label}: ${calibration[f.key] ?? f.recommended}${f.unit}`)
    .join(", ");
}
