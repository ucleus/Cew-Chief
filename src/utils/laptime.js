// Lap/sector time entry the way you read it off the HUD: "44.612",
// "1:40.871" or "100.871". Everything is stored as integer ms.

export function parseTime(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const ms = Math.round(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) * 1000);
  return ms > 0 ? ms : null;
}

export function formatTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

export function formatDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  return (ms > 0 ? "+" : ms < 0 ? "−" : "±") + Math.abs(ms / 1000).toFixed(3);
}

/** Best lap and best individual sectors from saved/entered laps. */
export function summarise(laps) {
  const valid = (laps || []).filter((l) => l.is_valid !== 0 && l.is_valid !== false && l.lap_ms);
  if (!valid.length) return null;
  const bestMs = Math.min(...valid.map((l) => l.lap_ms));
  const sectors = ["sector1_ms", "sector2_ms", "sector3_ms"].map((k) => {
    const v = valid.map((l) => l[k]).filter((x) => x != null);
    return v.length ? Math.min(...v) : null;
  });
  const ideal = sectors.every((s) => s != null) ? sectors[0] + sectors[1] + sectors[2] : null;
  return { bestMs, sectors, ideal, laps: valid.length };
}
