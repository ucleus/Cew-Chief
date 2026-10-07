import { useEffect, useRef } from "react";

const HOLD_DELAY = 400;
const REPEAT_INTERVAL = 90;

function decimalsOf(step) {
  const s = String(step);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * A hud-input styled as [ − ][ number ][ + ]. Clicking a button steps by
 * `step`; holding it down repeats after a short delay. Typing directly into
 * the field still works.
 */
const NumberStepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  id,
  placeholder,
  disabled = false,
  className = "",
}) => {
  const holdTimeout = useRef(null);
  const repeatInterval = useRef(null);

  const clamp = (n) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const nudge = (dir) => {
    const current = value === "" || value == null ? Number(min ?? 0) : Number(value);
    const decimals = decimalsOf(step);
    const next = clamp(Number((current + dir * Number(step)).toFixed(decimals)));
    onChange(next);
  };

  const stopRepeat = () => {
    clearTimeout(holdTimeout.current);
    clearInterval(repeatInterval.current);
  };

  const startRepeat = (dir) => {
    if (disabled) return;
    nudge(dir);
    holdTimeout.current = setTimeout(() => {
      repeatInterval.current = setInterval(() => nudge(dir), REPEAT_INTERVAL);
    }, HOLD_DELAY);
  };

  useEffect(() => stopRepeat, []);

  const atMin = min != null && value !== "" && value != null && Number(value) <= Number(min);
  const atMax = max != null && value !== "" && value != null && Number(value) >= Number(max);

  return (
    <div className={`hud-stepper ${className}`}>
      <button
        type="button"
        className="hud-stepper__btn"
        tabIndex={-1}
        disabled={disabled || atMin}
        aria-label="Decrease"
        onMouseDown={() => startRepeat(-1)}
        onMouseUp={stopRepeat}
        onMouseLeave={stopRepeat}
        onTouchStart={(e) => {
          e.preventDefault();
          startRepeat(-1);
        }}
        onTouchEnd={stopRepeat}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        className="hud-input hud-stepper__input"
        value={value}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
      <button
        type="button"
        className="hud-stepper__btn"
        tabIndex={-1}
        disabled={disabled || atMax}
        aria-label="Increase"
        onMouseDown={() => startRepeat(1)}
        onMouseUp={stopRepeat}
        onMouseLeave={stopRepeat}
        onTouchStart={(e) => {
          e.preventDefault();
          startRepeat(1);
        }}
        onTouchEnd={stopRepeat}
      >
        +
      </button>
    </div>
  );
};

export default NumberStepper;
