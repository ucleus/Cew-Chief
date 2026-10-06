import { Rings } from "./Hud";

const Tachometer = ({
  value = 0,
  max = 100,
  label = "",
  color = "#3DBCD1",
}) => {
  const pct = Math.min(value / max, 1);

  return (
    <div className="hud-gauge">
      <svg viewBox="0 0 80 80" role="img" aria-label={`${label} ${Math.round(value)}`}>
        <Rings
          cx={40}
          cy={40}
          r={33}
          pct={pct}
          outer={color}
          inner={color}
          text={Math.round(value)}
          fontSize={19}
        />
      </svg>
      <div className="hud-gauge__label">{label}</div>
    </div>
  );
};

export default Tachometer;
