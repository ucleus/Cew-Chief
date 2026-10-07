import { useEffect, useRef, useState } from "react";
import { C } from "../../styles/theme";

const SECTOR_COLORS = [C.cyan, C.orange, C.ink];

function formatMs(ms) {
  if (ms == null) return "—";
  return (ms / 1000).toFixed(3) + "s";
}

/**
 * Renders a schematic track outline divided into 3 equal-length sectors.
 * The division uses pathLength="100" + stroke-dasharray, so it's exact
 * regardless of how the path was drawn. Markers at the two boundary points
 * are placed with getPointAtLength, which needs the path mounted first —
 * hence the ref + effect instead of computing them inline.
 *
 * sectorTimes (optional): { sector1_ms, sector2_ms, sector3_ms } — the
 * best known split for this track, shown as a small readout per sector.
 */
const TrackMap = ({ viewBox, path, direction, sectorTimes, trackName }) => {
  const pathRef = useRef(null);
  const [markers, setMarkers] = useState(null);
  const [activeSector, setActiveSector] = useState(null);

  useEffect(() => {
    if (!pathRef.current) return;
    const total = pathRef.current.getTotalLength();
    const p1 = pathRef.current.getPointAtLength(total / 3);
    const p2 = pathRef.current.getPointAtLength((total * 2) / 3);
    setMarkers([p1, p2]);
  }, [path]);

  return (
    <div>
      <svg viewBox={viewBox} style={{ width: "100%", height: "auto" }} role="img" aria-label={`${trackName || "Track"} map`}>
        <path d={path} fill="none" stroke={C.well} strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            ref={i === 0 ? pathRef : undefined}
            d={path}
            fill="none"
            stroke={SECTOR_COLORS[i]}
            strokeWidth={activeSector === i ? 22 : 16}
            strokeLinecap="butt"
            pathLength="100"
            strokeDasharray="33.3334 66.6666"
            strokeDashoffset={-i * 33.3334}
            style={{ cursor: "pointer", transition: "stroke-width 0.15s" }}
            onClick={() => setActiveSector((cur) => (cur === i ? null : i))}
          />
        ))}
        {markers && (
          <>
            <circle cx={markers[0].x} cy={markers[0].y} r="5" fill={C.bg} stroke={C.ink} strokeWidth="2" />
            <circle cx={markers[1].x} cy={markers[1].y} r="5" fill={C.bg} stroke={C.ink} strokeWidth="2" />
          </>
        )}
      </svg>
      <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
        {[0, 1, 2].map((i) => (
          <button
            type="button"
            key={i}
            onClick={() => setActiveSector((cur) => (cur === i ? null : i))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span style={{ width: "10px", height: "10px", background: SECTOR_COLORS[i], display: "inline-block" }} />
            <span className="hud-status" style={{ color: activeSector === i ? C.ink : C.ink2 }}>
              S{i + 1} {sectorTimes ? formatMs(sectorTimes[`sector${i + 1}_ms`]) : ""}
            </span>
          </button>
        ))}
        {direction && <span className="hud-status" style={{ marginLeft: "auto", color: C.ink3 }}>{direction}</span>}
      </div>
      <p className="hud-text" style={{ textTransform: "none", color: C.ink3, fontSize: "11px", marginTop: "4px" }}>
        Schematic layout — recognizable shape and corner sequence, not a survey-accurate trace.
      </p>
    </div>
  );
};

export default TrackMap;
