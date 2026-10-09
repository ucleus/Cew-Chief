// Community tunes the engineer is grounded on, and that you can load as a
// baseline in one tap. Keys match data/garage26.js; tyre/disc values are
// 1-based option indexes. Add new ones as they're found — the engineer also
// web-searches for more when you ask it for a baseline.

export const COMMUNITY_TUNES = [
  {
    id: "mugello-aprilia-xkamilx27",
    game: "MotoGP 26",
    track: "Mugello Circuit",
    match: ["mugello"],
    bike: "Aprilia RS-GP",
    team: "Aprilia Racing",
    lapMs: 100871,
    conditions: "Dry, 26°C air / 47°C track",
    author: "xKamilX 27 (Xbox Series X, world record, Time Trial)",
    sources: [
      { title: "MotoGP 26 - Mugello WORLD RECORD (1.40.8) + setup", url: "https://www.youtube.com/watch?v=wdVErtdQYFA" },
      { title: "How to be fast at Mugello - TRACK GUIDE", url: "https://www.youtube.com/watch?v=y433HDudDlM" },
    ],
    aids: "TCS 3 · AW 5 · EBS 1 · Power map D · uses the RHD out of T3, T5, T11",
    values: {
      tyre_front: 2, // Medium
      tyre_rear: 1, // Soft
      front_preload: 7,
      oil_quantity: 4,
      front_spring: 1,
      front_compression: 4,
      front_extension: 7,
      front_disc: 1, // 355mm High mass
      traction_control: 3,
      anti_wheelie: 5,
      engine_brake: 1,
      gear_1: 2,
      gear_2: 2,
      gear_3: 3,
      gear_4: 4,
      gear_5: 5,
      gear_6: 5,
      final_ratio: 2,
      slipper_clutch: 3,
      rear_preload: 4,
      swingarm_connector: 1,
      rear_spring: 4,
      rear_compression: 5,
      rear_extension: 7,
      steering_head: 1,
      trail: 7,
      steering_plate: 4,
      swingarm_length: 4,
      rear_disc: 1, // 220mm Standard
    },
    notes:
      "Short gearing (1st/2nd/final on 2): nine corners in 2nd for drive. Minimum engine brake so the bike rolls in. Very stable front: trail 7, steering head 1, high front preload with the softest front spring.",
  },
];

export function tunesFor(trackName) {
  const n = String(trackName || "").toLowerCase();
  return COMMUNITY_TUNES.filter((t) => t.match.some((m) => n.includes(m)));
}
