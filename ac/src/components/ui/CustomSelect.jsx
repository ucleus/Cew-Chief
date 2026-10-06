import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { C } from "../../styles/theme";

const CustomSelect = ({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  const selected = normalized.find((option) => option.value === value);

  useEffect(() => {
    const close = (event) =>
      !rootRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const choose = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        event.key === "ArrowDown"
          ? Math.min(index + 1, normalized.length - 1)
          : Math.max(index - 1, 0),
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && normalized[activeIndex]) choose(normalized[activeIndex]);
      else setOpen(true);
    } else if (event.key === "Escape") setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="hud-select"
      style={{ zIndex: open ? 300 : "auto" }}
    >
      <button
        type="button"
        className="hud-input hud-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((state) => !state)}
        onKeyDown={handleKeyDown}
      >
        <span
          className="hud-select__value"
          style={{ color: selected ? C.ink : C.ink3 }}
        >
          {selected?.label || placeholder}
        </span>
        <span
          style={{
            display: "flex",
            transform: open ? "rotate(-90deg)" : "rotate(90deg)",
            transition: "transform .2s",
          }}
        >
          <Icon name="chevronright" size={16} color={C.cyan} />
        </span>
      </button>
      {open && (
        <div role="listbox" className="hud-select__list">
          {normalized.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              className={`hud-select__opt${index === activeIndex ? " is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              {option.label}
              {option.meta && (
                <span className="hud-select__meta">{option.meta}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
