import { SYMPTOMS } from "../../engineer/engineer";
import { formatTime, parseTime } from "../../utils/laptime";

export const EMPTY_REPORT = { feel: [], laps: [{ s1: "", s2: "", s3: "", lap: "" }], notes: "" };

/** Text rows → laps in ms. A lap with all three sectors totals itself. */
export function reportLaps(report) {
  return (report.laps || [])
    .map((row, i) => {
      const s = [row.s1, row.s2, row.s3].map(parseTime);
      const sum = s.every((x) => x != null) ? s[0] + s[1] + s[2] : null;
      const lap = parseTime(row.lap) ?? sum;
      return lap ? { lap_no: i + 1, lap_ms: lap, sector1_ms: s[0], sector2_ms: s[1], sector3_ms: s[2], is_valid: 1 } : null;
    })
    .filter(Boolean);
}

/** Corners flagged anywhere in the report. */
export function flaggedCorners(report) {
  return new Set((report.feel || []).flatMap((f) => f.corners || []));
}

const RunReport = ({ report, onChange, circuit }) => {
  const set = (patch) => onChange({ ...report, ...patch });
  const feelFor = (key) => report.feel.find((f) => f.symptom === key);

  const toggleSymptom = (key) =>
    set({
      feel: feelFor(key) ? report.feel.filter((f) => f.symptom !== key) : [...report.feel, { symptom: key, corners: [] }],
    });

  const toggleCorner = (key, n) =>
    set({
      feel: report.feel.map((f) =>
        f.symptom === key ? { ...f, corners: f.corners.includes(n) ? f.corners.filter((c) => c !== n) : [...f.corners, n].sort((a, b) => a - b) } : f,
      ),
    });

  const setLap = (i, field, value) => set({ laps: report.laps.map((row, j) => (j === i ? { ...row, [field]: value } : row)) });

  return (
    <div className="hud-stack" style={{ gap: 14 }}>
      <div>
        <label className="hud-label">What did the bike do?</label>
        <div className="hud-chips">
          {SYMPTOMS.map((s) => (
            <button key={s.key} type="button" className="hud-chip" aria-pressed={!!feelFor(s.key)} onClick={() => toggleSymptom(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {report.feel.length > 0 && circuit && (
        <div className="hud-stack" style={{ gap: 10 }}>
          <label className="hud-label" style={{ marginBottom: 0 }}>
            Where? Tap the corners (none = everywhere)
          </label>
          {report.feel.map((f) => {
            const s = SYMPTOMS.find((x) => x.key === f.symptom);
            return (
              <div key={f.symptom} className="cc-where">
                <div className="cc-where__name">{s?.label}</div>
                <div className="cc-where__corners">
                  {circuit.corners.map((c) => (
                    <button
                      key={c.n}
                      type="button"
                      className="cc-turn"
                      aria-pressed={f.corners.includes(c.n)}
                      title={c.name}
                      onClick={() => toggleCorner(f.symptom, c.n)}
                    >
                      {c.n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label className="hud-label">Lap times — sectors from the HUD splits (e.g. 44.612), lap fills itself</label>
        <div className="cc-laps">
          <div className="cc-laps__head">
            <span>#</span>
            <span>S1</span>
            <span>S2</span>
            <span>S3</span>
            <span>Lap</span>
          </div>
          {report.laps.map((row, i) => {
            const s = [row.s1, row.s2, row.s3].map(parseTime);
            const auto = s.every((x) => x != null) ? formatTime(s[0] + s[1] + s[2]) : "";
            return (
              <div key={i} className="cc-laps__row">
                <span className="cc-laps__no">{i + 1}</span>
                {["s1", "s2", "s3"].map((k) => (
                  <input
                    key={k}
                    className={`hud-input cc-laps__in${row[k] && parseTime(row[k]) == null ? " is-bad" : ""}`}
                    inputMode="decimal"
                    placeholder="—"
                    value={row[k]}
                    onChange={(e) => setLap(i, k, e.target.value)}
                  />
                ))}
                <input
                  className={`hud-input cc-laps__in${row.lap && parseTime(row.lap) == null ? " is-bad" : ""}`}
                  inputMode="decimal"
                  placeholder={auto || "1:42.000"}
                  value={row.lap}
                  onChange={(e) => setLap(i, "lap", e.target.value)}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button type="button" className="hud-btn hud-btn--ghost cc-small" onClick={() => set({ laps: [...report.laps, { s1: "", s2: "", s3: "", lap: "" }] })}>
            + Lap
          </button>
          {report.laps.length > 1 && (
            <button type="button" className="hud-btn hud-btn--ghost cc-small" onClick={() => set({ laps: report.laps.slice(0, -1) })}>
              − Lap
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="hud-label" htmlFor="run-notes">
          Anything else (in your words)
        </label>
        <textarea
          id="run-notes"
          className="hud-input"
          rows={2}
          placeholder="e.g. running wide at Arrabbiata 2, losing the front into T10 on the brakes"
          value={report.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
};

export default RunReport;
