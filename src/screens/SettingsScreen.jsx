import { useEffect, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import { BikesApi } from "../api/client";
import { CLASS_TEAMS, RACING_CLASSES } from "../data/championship";
import { EMPTY_DRIVER_PROFILE, WEAK_AREAS } from "../data/driverProfile";
import { C } from "../styles/theme";

const SettingsScreen = ({ settings, onSave, onBack }) => {
  const [form, setForm] = useState(
    settings || {
      apiKey: "",
      riderNumber: "",
      team: "",
      teamNationality: "",
      class_: "MotoGP",
      bikeId: null,
      bikeName: "",
      sponsor: "",
      manager: "",
      engineeringStaff: "",
      driverProfile: EMPTY_DRIVER_PROFILE,
    },
  );
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bikes, setBikes] = useState([]);
  const [bikesLoading, setBikesLoading] = useState(false);
  const [bikesError, setBikesError] = useState("");

  useEffect(() => {
    if (!form.class_) return;
    setBikesLoading(true);
    setBikesError("");
    BikesApi.list({ game: "MotoGP 26", class: form.class_ })
      .then(setBikes)
      .catch((e) => setBikesError(e.message))
      .finally(() => setBikesLoading(false));
  }, [form.class_]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const profile = form.driverProfile || EMPTY_DRIVER_PROFILE;
  const toggleWeakArea = (key) =>
    setForm((f) => {
      const weakAreas = { ...(f.driverProfile?.weakAreas || {}) };
      if (weakAreas[key]) delete weakAreas[key];
      else weakAreas[key] = 3;
      return { ...f, driverProfile: { ...(f.driverProfile || EMPTY_DRIVER_PROFILE), weakAreas } };
    });
  const setWeakAreaSeverity = (key, severity) =>
    setForm((f) => ({
      ...f,
      driverProfile: {
        ...(f.driverProfile || EMPTY_DRIVER_PROFILE),
        weakAreas: { ...(f.driverProfile?.weakAreas || {}), [key]: severity },
      },
    }));
  const setProfileNotes = (notes) =>
    setForm((f) => ({ ...f, driverProfile: { ...(f.driverProfile || EMPTY_DRIVER_PROFILE), notes } }));
  const changeClass = (className) =>
    setForm((current) => ({
      ...current,
      class_: className,
      team: "",
      bikeId: null,
      bikeName: "",
    }));
  const changeBike = (bikeId) => {
    const bike = bikes.find((b) => b.id === bikeId);
    setForm((current) => ({ ...current, bikeId, bikeName: bike?.name || "" }));
  };

  const handleSave = () => {
    localStorage.setItem("mgp_settings", JSON.stringify(form));
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="hud-pagehead">
        <button
          type="button"
          className="hud-back"
          onClick={onBack}
          aria-label="Back to dashboard"
        >
          <Icon name="chevronright" size={20} color={C.cyan} />
        </button>
        <h2>Garage Settings</h2>
      </div>

      <div className="hud-grid">
        {/* AI API Key */}
        <Panel
          title="AI Engine"
          tone="or"
          className="sm-full md-full lg-2"
          style={{ alignSelf: "start" }}
        >
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
                <Icon
                  name={showKey ? "eyeoff" : "eye"}
                  size={16}
                  color={C.ink2}
                />
              </button>
            </div>
            <p
              className="hud-text"
              style={{ fontSize: "12px", marginTop: "8px", color: C.ink3 }}
            >
              Your key is stored locally only. Never transmitted except directly
              to Anthropic.
            </p>
          </div>
        </Panel>

        {/* Rider Profile */}
        <Panel
          title="Rider Profile"
          tone="cy"
          className="sm-full md-full lg-2"
        >
          <div className="hud-body hud-form">
            <div className="hud-field">
              <label className="hud-label" htmlFor="set-number">
                Racing Number
              </label>
              <input
                id="set-number"
                className="hud-input"
                value={form.riderNumber}
                onChange={(e) => set("riderNumber", e.target.value)}
                placeholder="#46"
              />
            </div>
            <div className="hud-field">
              <span className="hud-label">Class</span>
              <CustomSelect
                value={form.class_}
                onChange={changeClass}
                options={RACING_CLASSES}
                placeholder="Select class"
              />
            </div>
            <div className="hud-field wide">
              <span className="hud-label">Team Name</span>
              <CustomSelect
                value={form.team}
                onChange={(value) => set("team", value)}
                options={CLASS_TEAMS[form.class_] || []}
                placeholder={`Select ${form.class_} team`}
              />
            </div>
            <div className="hud-field">
              <span className="hud-label">Bike</span>
              <CustomSelect
                value={form.bikeId}
                onChange={changeBike}
                disabled={bikesLoading || bikes.length === 0}
                options={bikes.map((b) => ({ value: b.id, label: b.name }))}
                placeholder={bikesLoading ? "Loading bikes..." : `Select ${form.class_} bike`}
              />
              {bikesError && (
                <Status color={C.orange}>Couldn't load bikes: {bikesError}</Status>
              )}
            </div>
            <div className="hud-field">
              <label className="hud-label" htmlFor="set-nationality">
                Team Nationality
              </label>
              <input
                id="set-nationality"
                className="hud-input"
                value={form.teamNationality}
                onChange={(e) => set("teamNationality", e.target.value)}
                placeholder="Italian, Spanish..."
              />
            </div>
            <div className="hud-field wide">
              <label className="hud-label" htmlFor="set-sponsor">
                Sponsor
              </label>
              <input
                id="set-sponsor"
                className="hud-input"
                value={form.sponsor}
                onChange={(e) => set("sponsor", e.target.value)}
                placeholder="Primary sponsor name"
              />
            </div>
            <div className="hud-field">
              <label className="hud-label" htmlFor="set-manager">
                Team Manager
              </label>
              <input
                id="set-manager"
                className="hud-input"
                value={form.manager}
                onChange={(e) => set("manager", e.target.value)}
                placeholder="Manager name"
              />
            </div>
            <div className="hud-field">
              <label className="hud-label" htmlFor="set-engineer">
                Engineering Staff
              </label>
              <input
                id="set-engineer"
                className="hud-input"
                value={form.engineeringStaff}
                onChange={(e) => set("engineeringStaff", e.target.value)}
                placeholder="Head engineer"
              />
            </div>
          </div>
        </Panel>

        {/* Driver Profile — standing weaknesses, not tied to any one session */}
        <Panel title="Driver Profile" tone="or" className="span-full">
          <div className="hud-body">
            <p className="hud-text" style={{ textTransform: "none", color: C.ink2 }}>
              General tendencies, not what happened on one session — this feeds every AI debrief
              and the starting-point baseline. Session-specific issues still go on the Log Session
              form.
            </p>
            <div className="hud-stack" style={{ gap: "8px" }}>
              {WEAK_AREAS.map((area) => {
                const severity = profile.weakAreas?.[area.key];
                const active = severity != null;
                return (
                  <div key={area.key}>
                    <button
                      type="button"
                      className="hud-chip"
                      aria-pressed={active}
                      onClick={() => toggleWeakArea(area.key)}
                    >
                      {area.label}
                    </button>
                    {active && (
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", alignItems: "center" }}>
                        <span className="hud-status">Severity</span>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={severity}
                          onChange={(e) => setWeakAreaSeverity(area.key, Number(e.target.value))}
                        />
                        <span className="hud-status">{severity}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="hud-label" htmlFor="set-profile-notes" style={{ marginTop: "12px", display: "block" }}>
              Anything else
            </label>
            <textarea
              id="set-profile-notes"
              className="hud-input"
              value={profile.notes || ""}
              onChange={(e) => setProfileNotes(e.target.value)}
              placeholder="e.g. prefers a loose rear, struggles in off-camber corners"
            />
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
