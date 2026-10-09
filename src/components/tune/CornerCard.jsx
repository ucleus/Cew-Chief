import { SYMPTOMS } from "../../engineer/engineer";
import { formatDelta, formatTime } from "../../utils/laptime";
import { C } from "../../styles/theme";

/**
 * Detail for whatever is selected on the map.
 *  - a corner: the WR reference (entry / min speed / gear), the coach's line,
 *    your engineer's note for it, and one-tap flags into the run report.
 *  - a sector: your time on every run vs the reference lap.
 */
const CornerCard = ({ circuit, selected, report, onToggleFlag, ridingTips, runs }) => {
  if (!circuit || selected == null) {
    return (
      <p className="hud-text cc-hint">
        Tap a corner to see the braking point, gear and line from the world-record lap, and to flag a problem there. Tap a
        sector to see your times run by run.
      </p>
    );
  }

  if (typeof selected === "string") {
    const i = Number(selected[1]) - 1;
    const ref = circuit.reference?.sectorsMs?.[i];
    const corners = circuit.corners.filter((c) => c.at >= [0, ...circuit.splits][i] && c.at < [...circuit.splits, 1][i]);
    return (
      <div className="cc-card">
        <div className="cc-card__head">
          <b>{selected}</b> {circuit.sectorNames?.[i]}
          <span className="cc-card__sub">T{corners[0]?.n}–T{corners[corners.length - 1]?.n}</span>
        </div>
        <div className="cc-card__rows">
          {ref && (
            <div className="cc-card__row">
              <span>WR lap{circuit.reference.approxSectors ? " (≈)" : ""}</span>
              <b>{formatTime(ref)}</b>
            </div>
          )}
          {runs.filter((r) => r.summary?.sectors?.[i] != null).map((r) => (
            <div key={r.version} className="cc-card__row">
              <span>Run {r.version}</span>
              <b>{formatTime(r.summary.sectors[i])}</b>
              {ref && <em style={{ color: r.summary.sectors[i] - ref > 0 ? C.orange : "#4CC38A" }}>{formatDelta(r.summary.sectors[i] - ref)} vs WR</em>}
            </div>
          ))}
          {!runs.some((r) => r.summary?.sectors?.[i] != null) && <span className="hud-text">No sector times logged yet.</span>}
        </div>
      </div>
    );
  }

  const c = circuit.corners.find((x) => x.n === selected);
  if (!c) return null;
  const tips = (ridingTips || []).filter((t) => t.corner === c.n);
  const flagged = new Set(report.feel.filter((f) => f.corners.includes(c.n)).map((f) => f.symptom));

  return (
    <div className="cc-card">
      <div className="cc-card__head">
        <b>T{c.n}</b> {c.name}
      </div>
      {c.ref && (
        <div className="cc-ref">
          {c.ref.entryKmh && (
            <span>
              <b>{c.ref.entryKmh}</b> entry
            </span>
          )}
          <span>
            <b>{c.ref.minKmh}</b> km/h min
          </span>
          <span>
            <b>{c.ref.gear}</b> gear
          </span>
          <em>WR lap</em>
        </div>
      )}
      {tips.length > 0 && (
        <div className="cc-tip">
          <span className="hud-label" style={{ color: C.orange, marginBottom: 2 }}>
            Your engineer
          </span>
          {tips.map((t, i) => (
            <p key={i}>{t.tip}</p>
          ))}
        </div>
      )}
      {c.guide?.length > 0 && (
        <ul className="cc-guide">
          {c.guide.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      )}
      <div>
        <span className="hud-label">Problem here on this run?</span>
        <div className="cc-flags">
          {SYMPTOMS.map((s) => (
            <button key={s.key} type="button" className="cc-flag" aria-pressed={flagged.has(s.key)} onClick={() => onToggleFlag(s.key, c.n)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CornerCard;
