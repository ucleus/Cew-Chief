import { useEffect, useState } from "react";
import { Hex, Panel } from "../components/ui/Hud";
import { C } from "../styles/theme";

const LoginScreen = ({ onLogin }) => {
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("ac_driver");
    if (!stored) setIsNew(true);
  }, []);

  const handleLogin = () => {
    if (!name.trim()) {
      setError("Enter your driver name.");
      return;
    }
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    const stored = localStorage.getItem("ac_driver");
    if (stored) {
      const data = JSON.parse(stored);
      if (data.pin !== pin) {
        setGlitch(true);
        setError("Invalid PIN. Try again.");
        setTimeout(() => setGlitch(false), 600);
        return;
      }
      onLogin(data);
    } else {
      const driver = { name: name.trim(), pin, createdAt: Date.now() };
      localStorage.setItem("ac_driver", JSON.stringify(driver));
      onLogin(driver);
    }
  };

  return (
    <div className="hud-login">
      <div className="hud-login__frame">
        <div className="hud-login__hex">
          <Hex label="AC Crew Chief">
            <g transform="translate(36 28) scale(2)" fill="none" stroke={C.orange} strokeWidth="1.3">
              <path d="M3 13h2l2-5h10l2 5h2" />
              <circle cx="6" cy="16" r="2" />
              <circle cx="18" cy="16" r="2" />
              <path d="M8 13V9h8v4" />
            </g>
          </Hex>
        </div>
        <h1 className="hud-login__title">AC CREW CHIEF</h1>
        <div className="hud-login__sub">Assetto Corsa Race Engineer</div>

        <Panel title={isNew ? "New Driver" : "Garage Access"} className={glitch ? "login-glitch" : ""}>
          <div className="hud-body hud-stack" style={{ gap: "14px" }}>
            <div>
              <label className="hud-label" htmlFor="driver-name">
                Driver Name
              </label>
              <input
                id="driver-name"
                className="hud-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="hud-label" htmlFor="driver-pin">
                PIN Code
              </label>
              <input
                id="driver-pin"
                className="hud-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={isNew ? "Create a 4-6 digit PIN" : "Enter your PIN"}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {error && (
              <div className="hud-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <button type="button" className="hud-btn" onClick={handleLogin}>
            {isNew ? "Create Account" : "Enter Garage"}
          </button>
          {!isNew && (
            <button
              type="button"
              className="hud-link"
              onClick={() => {
                localStorage.removeItem("ac_driver");
                setIsNew(true);
                setError("");
              }}
            >
              New driver? Start fresh
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default LoginScreen;
