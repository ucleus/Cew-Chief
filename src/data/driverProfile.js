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
