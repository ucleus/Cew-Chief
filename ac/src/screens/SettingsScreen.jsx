import { useEffect, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import NumberStepper from "../components/ui/NumberStepper";
import { CarsApi } from "../api/client";
import { DRIVETRAIN_OPTIONS } from "../data/acParams";
import { C } from "../styles/theme";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const EMPTY_IMPORT_CAR = {
  name: "",
  car_class: "",
  drivetrain: "MR",
  total_mass_kg: "",
  front_weight_pct: "",
  wheelbase_mm: "",
  track_front_mm: "",
  track_rear_mm: "",
  fuel_tank_l: "",
};

const SettingsScreen = ({ settings, onSave, onBack }) => {
  const [form, setForm] = useState(
    settings || { apiKey: "", carId: null, carName: "" },
  );
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cars, setCars] = useState([]);
  const [carsError, setCarsError] = useState("");

  const [importFiles, setImportFiles] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importRanges, setImportRanges] = useState([]);
  const [importCar, setImportCar] = useState(null);
  const [savingCar, setSavingCar] = useState(false);

  const reloadCars = () => CarsApi.list().then(setCars).catch((e) => setCarsError(e.message));
  useEffect(() => {
    reloadCars();
  }, []);

  const runImport = async () => {
    if (!importFiles?.length) return;
    setImportBusy(true);
    setImportError("");
    try {
      const body = new FormData();
      for (const file of importFiles) body.append("files[]", file);
      const res = await fetch(`${API_BASE}/ac_import.php`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      if (!data.found) {
        setImportError((data.errors || []).join(" ") || "None of those files looked like setup.ini, car.ini or suspensions.ini.");
        return;
      }
      setImportRanges(data.ranges || []);
      setImportCar({ ...EMPTY_IMPORT_CAR, ...data.car });
    } catch (e) {
      setImportError(e.message);
    }
    setImportBusy(false);
  };

  const saveImportedCar = async () => {
    if (!importCar?.name || !importCar?.car_class) {
      setImportError("Name and class are required.");
      return;
    }
    setSavingCar(true);
    setImportError("");
    try {
      await CarsApi.create(importCar);
      setImportCar(null);
      setImportRanges([]);
      setImportFiles(null);
      await reloadCars();
    } catch (e) {
      setImportError(e.message);
    }
    setSavingCar(false);
  };

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

        <Panel title="Import a Car From Game Files" className="span-full">
          <div className="hud-body">
            <p className="hud-text" style={{ textTransform: "none", color: C.ink2 }}>
              Reads mass/fuel/dimensions from <code>car.ini</code> and <code>suspensions.ini</code>, and setting
              ranges from <code>setup.ini</code> — found in the car's <b>data</b> folder under
              assettocorsa/content/cars/&lt;car&gt; once data.acd is unpacked. Nothing is saved until you check the
              form below and press Save.
            </p>
            <input
              type="file"
              multiple
              accept=".ini,.txt,text/plain"
              onChange={(e) => setImportFiles(Array.from(e.target.files || []))}
            />
            <button type="button" className="hud-btn hud-btn--ghost" onClick={runImport} disabled={importBusy || !importFiles?.length} style={{ marginTop: "8px" }}>
              {importBusy ? "Reading..." : "Read the files"}
            </button>
            {importError && <Status color={C.orange}>{importError}</Status>}
          </div>

          {importCar && (
            <div className="hud-body hud-form">
              <div className="hud-field wide">
                <label className="hud-label" htmlFor="imp-name">Car Name</label>
                <input id="imp-name" className="hud-input" value={importCar.name} onChange={(e) => setImportCar((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div className="hud-field">
                <label className="hud-label" htmlFor="imp-class">Class</label>
                <input id="imp-class" className="hud-input" value={importCar.car_class} onChange={(e) => setImportCar((c) => ({ ...c, car_class: e.target.value }))} placeholder="GT3, Road, ..." />
              </div>
              <div className="hud-field">
                <span className="hud-label">Drivetrain</span>
                <CustomSelect value={importCar.drivetrain} onChange={(v) => setImportCar((c) => ({ ...c, drivetrain: v }))} options={DRIVETRAIN_OPTIONS} />
              </div>
              {["total_mass_kg", "front_weight_pct", "wheelbase_mm", "track_front_mm", "track_rear_mm", "fuel_tank_l"].map((key) => (
                <div className="hud-field" key={key}>
                  <label className="hud-label" htmlFor={`imp-${key}`}>{key.replace(/_/g, " ")}</label>
                  <NumberStepper
                    id={`imp-${key}`}
                    min={0}
                    value={importCar[key]}
                    onChange={(v) => setImportCar((c) => ({ ...c, [key]: v }))}
                  />
                </div>
              ))}
              <div className="hud-field wide">
                <button type="button" className="hud-btn" onClick={saveImportedCar} disabled={savingCar}>
                  {savingCar ? "Saving..." : "Save Car"}
                </button>
              </div>
            </div>
          )}

          {importRanges.length > 0 && (
            <div className="hud-body">
              <p className="hud-text" style={{ textTransform: "none", color: C.ink2 }}>
                {importRanges.length} setting range(s) found in setup.ini — not auto-mapped to our param keys, since
                guessing that mapping wrong would silently save bad ranges. Compare against the Garage screen and
                enter the ones that matter yourself:
              </p>
              <div className="hud-stack" style={{ gap: "4px" }}>
                {importRanges.map((r, i) => (
                  <p className="hud-text" key={i} style={{ color: C.ink2 }}>
                    <b>{r.section}</b> ({r.label}): {r.min_value}–{r.max_value} step {r.step_value}
                  </p>
                ))}
              </div>
            </div>
          )}
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
