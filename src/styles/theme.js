// HUD palette — mirrors the CSS custom properties in hud.css.
// Use these where a colour has to be passed as a prop (SVG, Recharts).
export const C = {
  bg: "#000000",
  slab: "#1B1C20",
  well: "#101114",
  ink: "#E9ECEF",
  ink2: "#AAB1B8",
  ink3: "#6F777E",
  cyan: "#3DBCD1",
  cyanLine: "#2A9BB0",
  cyanFill: "#215C67",
  cyanDeep: "#12363D",
  orange: "#F25A3C",
};

const display = "'Oxanium', 'Eurostile', system-ui, sans-serif";
const body = "'Saira', system-ui, sans-serif";

// Shared Recharts styling
export const chart = {
  grid: "rgba(61,188,209,0.14)",
  tick: { fill: C.ink2, fontSize: 10, fontFamily: display },
  axisLine: { stroke: C.cyanFill },
  tooltip: {
    background: C.bg,
    border: `1px solid ${C.cyanLine}`,
    borderRadius: 0,
    color: C.ink,
    fontFamily: display,
    fontSize: 12,
    textTransform: "uppercase",
  },
};

// Inline-style tokens kept for backwards compatibility with any component
// that still spreads S.*; new markup uses the classes in hud.css instead.
export const S = {
  app: {
    minHeight: "100vh",
    background: C.bg,
    color: C.ink,
    fontFamily: body,
    position: "relative",
  },
  card: {
    background: C.bg,
    border: `1px solid ${C.cyanLine}`,
    borderRadius: 0,
    padding: "8px",
  },
  cardCyan: {
    background: C.bg,
    border: `1px solid ${C.cyanLine}`,
    borderRadius: 0,
    padding: "8px",
  },
  input: {
    width: "100%",
    background: C.well,
    border: "1px solid #2A2E33",
    borderRadius: 0,
    padding: "11px 12px",
    color: C.ink,
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btn: {
    background: C.orange,
    border: `1px solid ${C.orange}`,
    borderRadius: 0,
    padding: "12px 16px",
    color: "#fff",
    fontFamily: display,
    fontWeight: 500,
    fontSize: "15px",
    letterSpacing: "0.06em",
    cursor: "pointer",
    textTransform: "uppercase",
  },
  btnGhost: {
    background: "transparent",
    border: `1px solid ${C.cyanLine}`,
    borderRadius: 0,
    padding: "12px 16px",
    color: C.cyan,
    fontFamily: display,
    fontWeight: 500,
    fontSize: "15px",
    letterSpacing: "0.06em",
    cursor: "pointer",
    textTransform: "uppercase",
  },
  btnCyan: {
    background: C.cyanFill,
    border: `1px solid ${C.cyanLine}`,
    borderRadius: 0,
    padding: "12px 16px",
    color: C.ink,
    fontFamily: display,
    fontWeight: 500,
    fontSize: "15px",
    letterSpacing: "0.06em",
    cursor: "pointer",
    textTransform: "uppercase",
  },
  label: {
    display: "block",
    fontSize: "11px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: C.ink2,
    marginBottom: "6px",
    fontFamily: display,
  },
  heading: {
    fontFamily: display,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    margin: 0,
  },
  mono: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
};
