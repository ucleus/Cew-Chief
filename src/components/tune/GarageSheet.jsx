import { GARAGE, displayValue } from "../../data/garage26";

/**
 * The setup laid out like the game's garage: same menus, same order, and
 * the same ■■■■□□□ bars, so you can copy it into the game top to bottom.
 * Rows that differ from `baseline` are highlighted with the old value.
 * Pass onChange to make it editable.
 */
const GarageSheet = ({ values, baseline, onChange }) => {
  const editable = typeof onChange === "function";
  return (
    <div className="cc-garage">
      {GARAGE.map((group) => (
        <div key={group.menu} className="cc-garage__group">
          <div className="cc-garage__menu">{group.menu}</div>
          {group.params.map((p) => {
            const v = values?.[p.key];
            const was = baseline?.[p.key];
            const changed = baseline && was != null && v !== was;
            const max = p.options ? p.options.length : p.max;
            const min = p.options ? 1 : p.min;
            const set = (n) => editable && onChange(p.key, Math.min(max, Math.max(min, n)));
            return (
              <div key={p.key} className={`cc-row${changed ? " is-changed" : ""}`} title={p.help || undefined}>
                <span className="cc-row__label">{p.label}</span>
                {p.options ? (
                  editable ? (
                    <select className="cc-row__select" value={v ?? ""} onChange={(e) => set(Number(e.target.value))}>
                      {p.options.map((o, i) => (
                        <option key={o} value={i + 1}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="cc-row__choice">{displayValue(p.key, v)}</span>
                  )
                ) : (
                  <span className="cc-row__ctrl">
                    {editable && (
                      <button type="button" className="cc-row__btn" disabled={v <= min} onClick={() => set((v ?? min) - 1)} aria-label={`Lower ${p.label}`}>
                        −
                      </button>
                    )}
                    <span className="cc-row__num">({displayValue(p.key, v)})</span>
                    <span className="cc-pips" aria-hidden="true">
                      {Array.from({ length: p.max - p.min + 1 }, (_, i) => (
                        <i key={i} className={i < (v ?? 0) - p.min + 1 ? "on" : ""} />
                      ))}
                    </span>
                    {editable && (
                      <button type="button" className="cc-row__btn" disabled={v >= max} onClick={() => set((v ?? min) + 1)} aria-label={`Raise ${p.label}`}>
                        +
                      </button>
                    )}
                  </span>
                )}
                {changed && <span className="cc-row__was">was {displayValue(p.key, was)}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default GarageSheet;
