import { useEffect, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import { CarsApi } from "../api/client";
import { C } from "../styles/theme";

const SettingsScreen = ({ settings, onSave, onBack }) => {
  const [form, setForm] = useState(
    settings || { apiKey: "", carId: null, carName: "" },
  );
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cars, setCars] = useState([]);
  const [carsError, setCarsError] = useState("");

  useEffect(() => {
    CarsApi.list().then(setCars).catch((e) => setCarsError(e.message));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const changeCar = (carId) => {
    const car = cars.find((c) => c.id === carId);
    setForm((f) => ({ ...f, carId, carName: car?.name || "" }));
  };

  const handleSave = () => {
    localStorage.setItem("ac_settings", JSON.stringify(form));
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="hud-pagehead">
        <button type="button" className="hud-back" onClick={onBack} aria-label="Back to dashboard">
          <Icon name="chevronright" size={20} color={C.cyan} />
        </button>
        <h2>Garage Settings</h2>
      </div>

      <div className="hud-grid">
        <Panel title="AI Engine" tone="or" className="sm-full md-full lg-2" style={{ alignSelf: "start" }}>
          <div className="hud-body">
            <label className="hud-label" htmlFor="set-apikey">
              Anthropic API Key
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="set-apikey"
                className="hud-input hud-input--mono"
                style={{ paddingRight: "48px" }}
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                style={{
                  position: "absolute",
                  right: "4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px",
                  display: "flex",
                }}
              >
                <Icon name={showKey ? "eyeoff" : "eye"} size={16} color={C.ink2} />
              </button>
            </div>
            <p className="hud-text" style={{ fontSize: "12px", marginTop: "8px", color: C.ink3 }}>
              Your key is stored locally only. Never transmitted except directly to Anthropic.
            </p>
          </div>
        </Panel>

        <Panel title="Car" tone="cy" className="sm-full md-full lg-2">
          <div className="hud-body hud-form">
            <div className="hud-field wide">
              <span className="hud-label">Active Car</span>
              <CustomSelect
                value={form.carId}
                onChange={changeCar}
                options={cars.map((c) => ({ value: c.id, label: c.name, meta: c.car_class }))}
                placeholder="Select a car"
              />
              {carsError && <Status color={C.orange}>Couldn't load cars: {carsError}</Status>}
              {cars.length === 0 && !carsError && (
                <Status color={C.ink3}>
                  No cars yet — run <code>php api/ac_seed.php</code> or add one directly in the
                  database.
                </Status>
              )}
            </div>
          </div>
        </Panel>

        <div className="span-full">
          <button type="button" className="hud-btn" onClick={handleSave}>
            {saved ? (
              <>
                <Icon name="checkmark" size={16} color="#fff" /> Saved
              </>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
