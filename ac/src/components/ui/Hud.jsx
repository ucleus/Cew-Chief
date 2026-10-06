import { C } from "../../styles/theme";

/* Bordered panel with an optional grey title bar. */
export const Panel = ({
  title,
  icon,
  tone, // "or" | "cy" — tints the title text
  align, // "left" — left-aligned title
  hot, // orange outline
  className = "",
  children,
  ...rest
}) => (
  <section
    className={`hud-panel${hot ? " hud-panel--hot" : ""} ${className}`}
    {...rest}
  >
    {title && (
      <h3
        className={`hud-title${align === "left" ? " hud-title--left" : ""}${
          tone ? ` hud-title--${tone}` : ""
        }`}
      >
        {icon}
        {title}
      </h3>
    )}
    {children}
  </section>
);

const Chevron = ({ side }) => (
  <svg
    className={`hud-triple__chev hud-triple__chev--${side}`}
    viewBox="0 0 10 40"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polyline points={side === "l" ? "0,0 10,20 0,40" : "10,0 0,20 10,40"} />
  </svg>
);

/* Three-up readout: grey arrow blocks either side of a cyan-bracketed centre.
   items = [{ label, value, color? }, x3] */
export const Triple = ({ items }) => {
  const [left, mid, right] = items;
  return (
    <div className="hud-triple">
      <div className="hud-triple__side">
        <span className="hud-triple__val" style={{ color: left.color }}>
          {left.value}
        </span>
        <span className="hud-triple__cap">{left.label}</span>
      </div>
      <div className="hud-triple__mid">
        <Chevron side="l" />
        <span
          className="hud-triple__val"
          style={{ color: mid.color || C.cyan }}
        >
          {mid.value}
        </span>
        <span className="hud-triple__cap">{mid.label}</span>
        <Chevron side="r" />
      </div>
      <div className="hud-triple__side">
        <span className="hud-triple__val" style={{ color: right.color }}>
          {right.value}
        </span>
        <span className="hud-triple__cap">{right.label}</span>
      </div>
    </div>
  );
};

export const Status = ({ children, color }) => (
  <div className="hud-status" style={color ? { color } : undefined}>
    {children}
  </div>
);

/* Arc that starts at 12 o'clock and sweeps clockwise for pct (0–1). */
const Arc = ({ cx, cy, r, pct, color, width }) => (
  <circle
    cx={cx}
    cy={cy}
    r={r}
    fill="none"
    stroke={color}
    strokeWidth={width}
    pathLength="100"
    strokeDasharray={`${Math.max(0, Math.min(pct, 1)) * 100} 100`}
    transform={`rotate(-90 ${cx} ${cy})`}
    style={{ transition: "stroke-dasharray .5s ease" }}
  />
);

/* Double ring: thick outer ring + thin inner ring, both showing the same
   value, with the number in the middle. */
export const Rings = ({
  cx,
  cy,
  r,
  pct,
  outer = C.cyan,
  inner = C.orange,
  text,
  sub, // small caption under the number
  fontSize,
}) => (
  <g>
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={C.cyanDeep}
      strokeWidth={r * 0.17}
    />
    <Arc cx={cx} cy={cy} r={r} pct={pct} color={outer} width={r * 0.17} />
    <Arc
      cx={cx}
      cy={cy}
      r={r * 0.74}
      pct={pct}
      color={inner}
      width={r * 0.12}
    />
    <text
      x={cx}
      y={sub ? cy - r * 0.1 : cy}
      textAnchor="middle"
      dominantBaseline="central"
      fill={C.ink}
      fontSize={fontSize || r * 0.52}
      fontFamily="Oxanium, Eurostile, sans-serif"
      fontWeight="500"
    >
      {text}
    </text>
    {sub && (
      <text
        x={cx}
        y={cy + r * 0.32}
        textAnchor="middle"
        dominantBaseline="central"
        fill={C.ink2}
        fontSize={r * 0.2}
        letterSpacing="0.5"
        fontFamily="Oxanium, Eurostile, sans-serif"
      >
        {sub}
      </text>
    )}
  </g>
);

/* Hexagon frame used in the hero and on the login screen.
   Pass pct + text for a ring gauge, or children for custom content. */
export const Hex = ({ pct, text, sub, label, children }) => (
  <svg viewBox="0 0 120 104" role="img" aria-label={label}>
    <polygon
      points="30.6,1 89.4,1 118.8,52 89.4,103 30.6,103 1.2,52"
      fill={C.bg}
      stroke={C.cyanLine}
      strokeWidth="1.2"
    />
    <polygon
      points="33.5,6 86.5,6 113,52 86.5,98 33.5,98 7,52"
      fill="none"
      stroke={C.cyanLine}
      strokeWidth="0.8"
    />
    {children || <Rings cx={60} cy={52} r={31} pct={pct} text={text} sub={sub} />}
  </svg>
);
