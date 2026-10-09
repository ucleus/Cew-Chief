// The MotoGP 26 garage exactly as the game shows it: same menus, same order,
// same 1–7 / 1–5 scales. Read off the in-game "Manual setup" screens
// (xKamilX 27's Mugello WR video, Xbox, 2026-06). Every engineer answer and
// every saved setup uses these keys, so what the app shows is what you
// type into the game, top to bottom.
//
// Tyres and discs are choices; they're stored as a 1-based index into
// `options` so they save into mg_setup_values like every other number.

export const GARAGE = [
  {
    menu: "Tyres",
    params: [
      { key: "tyre_front", label: "Front tyre", options: ["Soft", "Medium", "Hard"] },
      { key: "tyre_rear", label: "Rear tyre", options: ["Soft", "Medium", "Hard"] },
    ],
  },
  {
    menu: "Front Fork",
    params: [
      { key: "front_preload", label: "Front pre-load", min: 1, max: 7, help: "+ holds the front up under braking; − lets it dive and load the tyre." },
      { key: "oil_quantity", label: "Oil quantity", min: 1, max: 7, help: "+ makes the fork progressively stiffer deep in the stroke; − cushions bumps." },
      { key: "front_spring", label: "Front spring hardness", min: 1, max: 7, help: "+ stiffer, less dive, sharper; − softer, more grip over bumps." },
      { key: "front_compression", label: "Front fork compression", min: 1, max: 7, help: "+ resists dive on the brakes; − softer entry, more feel." },
      { key: "front_extension", label: "Front fork extension", min: 1, max: 7, help: "+ fork returns slower, keeps the front loaded on release; − quicker return." },
    ],
  },
  {
    menu: "Front Brake",
    params: [
      { key: "front_disc", label: "Front brake discs", options: ["355mm High mass", "340mm High mass", "340mm Standard", "340mm Extreme cooling", "320mm Extreme cooling", "320mm Standard"] },
    ],
  },
  {
    menu: "ECU",
    params: [
      { key: "traction_control", label: "Traction control", min: 1, max: 5, help: "+ more intervention, safer exits, less drive; − more wheelspin and drive." },
      { key: "anti_wheelie", label: "Anti-Wheelie", min: 1, max: 5, help: "+ cuts power to keep the front down; − more wheelies, more drive if you control it." },
      { key: "engine_brake", label: "Engine brake", min: 1, max: 5, help: "+ more engine braking, rear less stable on entry; − bike rolls freely, carries speed." },
    ],
  },
  {
    menu: "Transmission",
    params: [
      { key: "gear_1", label: "1st Gear", min: 1, max: 7, help: "+ longer gear; − shorter, punchier." },
      { key: "gear_2", label: "2nd Gear", min: 1, max: 7, help: "+ longer gear; − shorter, punchier out of slow corners." },
      { key: "gear_3", label: "3rd Gear", min: 1, max: 7 },
      { key: "gear_4", label: "4th Gear", min: 1, max: 7 },
      { key: "gear_5", label: "5th Gear", min: 1, max: 7 },
      { key: "gear_6", label: "6th Gear", min: 1, max: 7, help: "Set so you just touch the limiter at the end of the longest straight." },
      { key: "final_ratio", label: "Final ratio", min: 1, max: 7, help: "+ higher top speed; − stronger acceleration." },
      { key: "slipper_clutch", label: "Slipper clutch", min: 1, max: 7, help: "+ clutch slips more on downshifts, calmer rear on entry; − more engine braking." },
    ],
  },
  {
    menu: "Rear Shock",
    params: [
      { key: "rear_preload", label: "Rear pre-load", min: 1, max: 7, help: "+ raises the rear, quicker turning; − more rear grip and squat." },
      { key: "swingarm_connector", label: "Swingarm connector", min: 1, max: 7, help: "+ stiffer progression, less squat on throttle; − softer, more traction." },
      { key: "rear_spring", label: "Rear spring hardness", min: 1, max: 7, help: "+ stiffer, less squat; − softer, more mechanical grip." },
      { key: "rear_compression", label: "Single shock absorber compression", min: 1, max: 7, help: "+ resists squat on throttle; − more traction over bumps." },
      { key: "rear_extension", label: "Single shock absorber extension", min: 1, max: 7, help: "+ slower rebound, calmer on entry; − quicker, keeps the tyre on the road." },
    ],
  },
  {
    menu: "Geometry",
    params: [
      { key: "steering_head", label: "Steering head inclination", min: 1, max: 7, help: "+ more rake, stable; − sharper turn-in." },
      { key: "trail", label: "Trail", min: 1, max: 7, help: "+ more stable, slower to turn; − quicker turn-in, nervous at speed." },
      { key: "steering_plate", label: "Steering plate position", min: 1, max: 7, help: "Moves the front contact point; changes front load and turn-in." },
      { key: "swingarm_length", label: "Rear swingarm length", min: 1, max: 7, help: "+ longer, stable, less wheelie; − shorter, turns tighter." },
    ],
  },
  {
    menu: "Rear Brake",
    params: [{ key: "rear_disc", label: "Rear brake discs", options: ["220mm Standard", "200mm Standard"] }],
  },
];

export const GARAGE_PARAMS = GARAGE.flatMap((g) => g.params.map((p) => ({ ...p, menu: g.menu })));
export const PARAM_BY_KEY = Object.fromEntries(GARAGE_PARAMS.map((p) => [p.key, p]));

/** Middle-of-the-range starting point used when there's no tune yet. */
export const NEUTRAL_SETUP = Object.fromEntries(
  GARAGE_PARAMS.map((p) => [p.key, p.options ? 1 : Math.ceil((p.min + p.max) / 2)]),
);

export function displayValue(key, value) {
  const p = PARAM_BY_KEY[key];
  if (!p || value == null) return "—";
  return p.options ? p.options[value - 1] ?? "—" : String(value).padStart(2, "0");
}

export function clampValue(key, value) {
  const p = PARAM_BY_KEY[key];
  const n = Math.round(Number(value));
  if (!p || !Number.isFinite(n)) return null;
  const max = p.options ? p.options.length : p.max;
  const min = p.options ? 1 : p.min;
  return Math.min(max, Math.max(min, n));
}

/** Option label → index, tolerant of case/spacing ("medium", "355 high mass"). */
export function optionIndex(key, label) {
  const p = PARAM_BY_KEY[key];
  if (!p?.options || label == null) return null;
  if (typeof label === "number") return clampValue(key, label);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const i = p.options.findIndex((o) => norm(o) === norm(label));
  if (i >= 0) return i + 1;
  const j = p.options.findIndex((o) => norm(o).startsWith(norm(label)) || norm(label).startsWith(norm(o)));
  return j >= 0 ? j + 1 : null;
}
