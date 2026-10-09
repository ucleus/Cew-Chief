import { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../styles/theme";

// Corner states the Tune screen can paint onto the map.
export const CORNER_STATE = {
  weak: { color: C.orange, label: "Problem" },
  worse: { color: "#E8B341", label: "Slower" },
  improved: { color: "#4CC38A", label: "Faster" },
};

const SECTOR_TINT = [C.cyan, "#8E7CF0", C.ink2];
const ZONE_HALF = 0.014; // half-width of a corner's highlight, as a fraction of the lap

function formatDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const s = ms / 1000;
  return (s > 0 ? "+" : "") + s.toFixed(3);
}

function formatMs(ms) {
  if (ms == null) return "—";
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}

/**
 * Real-geometry circuit map. The track is a centreline path measured with
 * pathLength="1000", so every corner zone and sector band is just a dash
 * window at a fraction of the lap — no hit-testing maths needed.
 *
 *   cornerStates: { [n]: "weak" | "worse" | "improved" }
 *   sectors:      [{ ms, deltaMs }] x3 — this run, delta vs the run before
 *   selected:     corner number or "S1".."S3"
 *   onSelect(n | "S1" | null)
 */
const CircuitMap = ({ circuit, cornerStates = {}, sectors, selected, onSelect, compact = false }) => {
  const pathRef = useRef(null);
  const [startPt, setStartPt] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const total = el.getTotalLength();
    const a = el.getPointAtLength(0);
    const b = el.getPointAtLength(total * 0.006);
    setStartPt({ x: a.x, y: a.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }, [circuit.path]);

  const bounds = useMemo(() => [0, ...circuit.splits, 1], [circuit.splits]);
  const pick = (id) => onSelect?.(selected === id ? null : id);
  const active = hover ?? selected;

  const sectorColor = (i) => {
    const d = sectors?.[i]?.deltaMs;
    if (d == null) return SECTOR_TINT[i];
    return d < 0 ? CORNER_STATE.improved.color : d > 0 ? CORNER_STATE.weak.color : SECTOR_TINT[i];
  };

  const dash = (from, to) => ({
    pathLength: 1000,
    strokeDasharray: `${(to - from) * 1000} 1000`,
    strokeDashoffset: -from * 1000,
  });

  const ring = 15;
  return (
    <div className="cc-map">
      <svg
        viewBox={circuit.viewBox}
        className="cc-map__svg"
        style={compact ? { maxHeight: 340 } : undefined}
        role="img"
        aria-label={`${circuit.name} map`}
      >
        {/* tarmac */}
        <path ref={pathRef} d={circuit.path} fill="none" stroke="#2B2E35" strokeWidth="17" strokeLinejoin="round" />

        {/* sector bands: thin centre line, coloured by gain/loss when we have times */}
        {[0, 1, 2].map((i) => {
          const id = `S${i + 1}`;
          return (
            <path
              key={id}
              d={circuit.path}
              fill="none"
              stroke={sectorColor(i)}
              strokeWidth={active === id ? 7 : 3}
              strokeOpacity={active && active !== id && typeof active === "string" ? 0.35 : 0.9}
              strokeLinecap="butt"
              {...dash(bounds[i], bounds[i + 1])}
              style={{ cursor: "pointer", transition: "stroke-width .15s" }}
              onClick={() => pick(id)}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {/* corner zones — the coloured highlight for problem / faster / slower */}
        {circuit.corners.map((c) => {
          const state = CORNER_STATE[cornerStates[c.n]];
          const isActive = active === c.n;
          if (!state && !isActive) return null;
          return (
            <path
              key={`z${c.n}`}
              d={circuit.path}
              fill="none"
              stroke={state ? state.color : C.ink}
              strokeWidth={isActive ? 17 : 13}
              strokeOpacity={isActive ? 1 : 0.85}
              strokeLinecap="round"
              {...dash(Math.max(0, c.at - ZONE_HALF), Math.min(1, c.at + ZONE_HALF))}
              pointerEvents="none"
            />
          );
        })}

        {/* sector split markers */}
        {circuit.splits.map((at, i) => (
          <path
            key={`sp${i}`}
            d={circuit.path}
            fill="none"
            stroke={C.ink}
            strokeWidth="21"
            {...dash(at, at + 0.0025)}
            pointerEvents="none"
          />
        ))}

        {/* start / finish */}
        {startPt && (
          <g transform={`translate(${startPt.x} ${startPt.y}) rotate(${startPt.angle})`} pointerEvents="none">
            <rect x="-2.5" y="-13" width="5" height="26" fill={C.ink} />
            <rect x="-2.5" y="-13" width="5" height="6.5" fill={C.bg} />
            <rect x="-2.5" y="0" width="5" height="6.5" fill={C.bg} />
            <path d="M 12,-20 L 26,-20 M 20,-25 L 26,-20 L 20,-15" stroke={C.ink2} strokeWidth="2" fill="none" />
          </g>
        )}

        {/* corner number bubbles — the click targets */}
        {circuit.corners.map((c) => {
          const state = CORNER_STATE[cornerStates[c.n]];
          const isActive = active === c.n;
          return (
            <g
              key={`b${c.n}`}
              transform={`translate(${c.label[0]} ${c.label[1]})`}
              style={{ cursor: "pointer" }}
              onClick={() => pick(c.n)}
              onMouseEnter={() => setHover(c.n)}
              onMouseLeave={() => setHover(null)}
              role="button"
              aria-label={`Turn ${c.n} ${c.name}`}
            >
              <circle r={ring + 8} fill="transparent" />
              <circle
                r={isActive ? ring + 2 : ring}
                fill={isActive ? C.ink : state ? state.color : C.bg}
                stroke={state ? state.color : isActive ? C.ink : C.ink3}
                strokeWidth="1.6"
              />
              <text
                textAnchor="middle"
                dy="5"
                fontSize="15"
                fontFamily="Oxanium, system-ui, sans-serif"
                fontWeight="700"
                fill={isActive ? C.bg : state ? C.bg : C.ink}
                pointerEvents="none"
              >
                {c.n}
              </text>
            </g>
          );
        })}
      </svg>

      {/* readout under the map: what's hovered/selected, then the sector strip */}
      <div className="cc-map__caption">
        {typeof active === "number" ? (
          <span>
            <b>T{active}</b> {circuit.corners.find((c) => c.n === active)?.name}
            {cornerStates[active] && <em style={{ color: CORNER_STATE[cornerStates[active]].color }}> · {CORNER_STATE[cornerStates[active]].label}</em>}
          </span>
        ) : typeof active === "string" ? (
          <span>
            <b>{active}</b> {circuit.sectorNames?.[Number(active[1]) - 1]}
          </span>
        ) : (
          <span style={{ color: C.ink3 }}>Tap a corner number or a sector</span>
        )}
      </div>
      <div className="cc-map__sectors">
        {[0, 1, 2].map((i) => {
          const id = `S${i + 1}`;
          const s = sectors?.[i];
          const d = formatDelta(s?.deltaMs);
          return (
            <button
              type="button"
              key={id}
              className={`cc-sector${selected === id ? " is-on" : ""}`}
              style={{ borderColor: sectorColor(i) }}
              onClick={() => pick(id)}
            >
              <span className="cc-sector__id">{id}</span>
              <span className="cc-sector__time">{formatMs(s?.ms)}</span>
              {d && (
                <span className="cc-sector__delta" style={{ color: s.deltaMs < 0 ? CORNER_STATE.improved.color : CORNER_STATE.weak.color }}>
                  {d}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CircuitMap;
