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
    const stored = localStorage.getItem("mgp_rider");
    if (!stored) setIsNew(true);
  }, []);

  const handleLogin = () => {
    if (!name.trim()) {
      setError("Enter your rider name.");
      return;
    }
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    const stored = localStorage.getItem("mgp_rider");
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
      const rider = { name: name.trim(), pin, createdAt: Date.now() };
      localStorage.setItem("mgp_rider", JSON.stringify(rider));
      onLogin(rider);
    }
  };

  return (
    <div className="hud-login">
      <div className="hud-login__frame">
        {/* Logo */}
        <div className="hud-login__hex">
          <Hex label="Crew Chief">
            <g
              transform="translate(36 28) scale(2)"
              fill="none"
              stroke={C.orange}
              strokeWidth="1.3"
            >
              <path d="M5 17H3a2 2 0 0 1-2-2v-4l4-4h10l3 3 2 1v4a2 2 0 0 1-2 2h-2" />
              <circle cx="7" cy="17" r="2" />
              <circle cx="17" cy="17" r="2" />
              <path d="M9 11h6" />
            </g>
          </Hex>
        </div>
        <h1 className="hud-login__title">CREW CHIEF</h1>
        <div className="cc-gamepick" role="group" aria-label="Choose your game">
          <span className="cc-gamepick__opt is-on" aria-current="true">
            MotoGP 26
          </span>
          <a className="cc-gamepick__opt" href="/ac/">
            Assetto Corsa
          </a>
        </div>

        <Panel
          title={isNew ? "New Rider" : "Garage Access"}
          className={glitch ? "login-glitch" : ""}
        >
          <div className="hud-body hud-stack" style={{ gap: "14px" }}>
            <div>
              <label className="hud-label" htmlFor="rider-name">
                Rider Name
              </label>
              <input
                id="rider-name"
                className="hud-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="hud-label" htmlFor="rider-pin">
                PIN Code
              </label>
              <input
                id="rider-pin"
                className="hud-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
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
                localStorage.removeItem("mgp_rider");
                setIsNew(true);
                setError("");
              }}
            >
              New rider? Start fresh
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default LoginScreen;
