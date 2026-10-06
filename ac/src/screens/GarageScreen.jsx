import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import { CarsApi, SetupsApi, TracksApi } from "../api/client";
import {
  AXLE_OF_CORNER,
  CAR_PARAM_LABELS,
  CAR_PARAM_SECTIONS,
  CORNERS,
  CORNER_LABELS,
  CORNER_PARAM_LABELS,
  CORNER_PARAM_SECTIONS,
  SETUP_PURPOSE_OPTIONS,
  defaultCarValues,
  defaultCornerValues,
  rangesByScope,
} from "../data/acParams";
import { C } from "../styles/theme";

const CAR_KEYS = CAR_PARAM_SECTIONS.flatMap((s) => s.params);

const GarageScreen = ({ settings }) => {
  const [car, setCar] = useState(null);
  const [carError, setCarError] = useState("");

  const [tracks, setTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  const [chain, setChain] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState(null);

  const [draftCorners, setDraftCorners] = useState({});
  const [draftCar, setDraftCar] = useState({});
  const [compoundId, setCompoundId] = useState(null);
  const [fuelL, setFuelL] = useState("");
  const [gearRatios, setGearRatios] = useState([]);
  const [finalDrive, setFinalDrive] = useState("");
  const [form, setForm] = useState({ name: "", purpose: "BASELINE", change_summary: "", notes: "" });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    TracksApi.list().then(setTracks).catch((e) => setCarError(e.message));
  }, []);

  useEffect(() => {
    if (!settings?.carId) {
      setCar(null);
      return;
    }
    CarsApi.get(settings.carId).then(setCar).catch((e) => setCarError(e.message));
  }, [settings?.carId]);

  const byScope = useMemo(() => rangesByScope(car?.ranges || []), [car]);
  const track = tracks.find((t) => t.id === selectedTrackId);

  useEffect(() => {
    if (!car || !selectedTrackId) {
      setChain([]);
      setActiveVersionId(null);
      return;
    }
    setChainLoading(true);
    SetupsApi.chain(car.id, selectedTrackId)
      .then((rows) => {
        setChain(rows);
        selectVersion(rows[0] || null);
      })
      .finally(() => setChainLoading(false));
  }, [car, selectedTrackId]);

  const selectVersion = (version) => {
    setActiveVersionId(version?.id ?? null);
    if (version) {
      setDraftCorners({ ...version.corners });
      const carValues = {};
      for (const key of CAR_KEYS) carValues[key] = version[key];
      setDraftCar(carValues);
      setCompoundId(version.compound_id);
      setFuelL(String(version.fuel_l ?? ""));
      setGearRatios(Array.isArray(version.gear_ratios) ? version.gear_ratios : []);
      setFinalDrive(version.final_drive != null ? String(version.final_drive) : "");
      setForm({
        name: `${car.name} v${version.version + 1}`,
        purpose: version.purpose,
        change_summary: "",
        notes: "",
      });
    } else if (car) {
      setDraftCorners(defaultCornerValues(byScope));
      setDraftCar(defaultCarValues(byScope));
      setCompoundId(car.compounds?.[0]?.id ?? null);
      setFuelL(car.fuel_tank_l ? String(Math.round(car.fuel_tank_l / 2)) : "");
      setGearRatios([]);
      setFinalDrive("");
      setForm({
        name: `${car.name} Baseline`,
        purpose: "BASELINE",
        change_summary: "Stock starting point",
        notes: "",
      });
    }
    setSaved(false);
  };

  const updateCorner = (corner, key, value) =>
    setDraftCorners((prev) => ({ ...prev, [corner]: { ...prev[corner], [key]: value } }));

  const addGear = () => setGearRatios((g) => [...g, ""]);
  const updateGear = (i, value) => setGearRatios((g) => g.map((v, idx) => (idx === i ? value : v)));
  const removeGear = (i) => setGearRatios((g) => g.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!car || !selectedTrackId) return;
    if (!compoundId) {
      setSaveError("Pick a tire compound.");
      return;
    }
    if (!fuelL) {
      setSaveError("Enter a fuel load.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const corners = {};
      for (const corner of CORNERS) {
        const c = draftCorners[corner] || {};
        if (c.cold_psi == null || c.cold_psi === "") continue;
        corners[corner] = c;
      }
      const res = await SetupsApi.create({
        car_id: car.id,
        track_id: selectedTrackId,
        parent_setup_id: activeVersionId || null,
        name: form.name || `${car.name} Setup`,
        purpose: form.purpose,
        compound_id: compoundId,
        change_summary: form.change_summary || null,
        notes: form.notes || null,
        fuel_l: fuelL,
        final_drive: finalDrive || null,
        gear_ratios: gearRatios.filter((g) => g !== "").map(Number),
        corners,
        ...draftCar,
      });
      const rows = await SetupsApi.chain(car.id, selectedTrackId);
      setChain(rows);
      selectVersion(rows.find((r) => r.id === res.id) || rows[0]);
      setSaved(true);
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="hud-pagehead">
        <Icon name="wrench" size={16} color={C.orange} />
        <h2>Garage</h2>
      </div>

      <div className="hud-grid">
        <Panel title="Select Track" icon={<Icon name="map" size={14} color={C.cyan} />} className="sm-full md-full lg-2">
          <CustomSelect
            value={selectedTrackId || ""}
            onChange={setSelectedTrackId}
            placeholder="Choose a circuit..."
            options={tracks.map((t) => ({ value: t.id, label: t.name, meta: t.notes || "" }))}
          />
          {track && (
            <div className="hud-cells">
              <div className="hud-cell">
                <div className="hud-cell__val">{(track.length_m / 1000).toFixed(2)}km</div>
                <div className="hud-cell__cap">Length</div>
              </div>
              <div className="hud-cell">
                <div className="hud-cell__val">{track.downforce_demand}</div>
                <div className="hud-cell__cap">Downforce</div>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Car" icon={<Icon name="flag" size={14} color={C.orange} />} className="sm-full md-full lg-2">
          {car ? (
            <>
              <div className="hud-kicker cy" style={{ fontSize: "18px" }}>{car.name}</div>
              <Status>{car.car_class} · {car.drivetrain}</Status>
            </>
          ) : (
            <Status color={C.ink3}>{carError || "Pick a car in Settings to load its setup ranges."}</Status>
          )}
        </Panel>

        {car && selectedTrackId && (
          <Panel title="Setup Chain" icon={<Icon name="chart" size={14} color={C.cyan} />} className="span-full">
            {chainLoading ? (
              <Status color={C.ink3}>Loading saved setups...</Status>
            ) : chain.length === 0 ? (
              <Status color={C.ink3}>No saved setup yet — editing the stock baseline below.</Status>
            ) : (
              <div className="hud-chips">
                {chain.map((v) => (
                  <button
                    type="button"
                    key={v.id}
                    className="hud-chip"
                    aria-pressed={v.id === activeVersionId}
                    onClick={() => selectVersion(v)}
                  >
                    v{v.version} · {v.name}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {car && selectedTrackId && (
          <>
            <Panel title="Tyres, Fuel & Compound" className="span-full">
              <div className="hud-body hud-form">
                <div className="hud-field">
                  <span className="hud-label">Compound</span>
                  <CustomSelect
                    value={compoundId || ""}
                    onChange={setCompoundId}
                    options={(car.compounds || []).map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select compound"
                  />
                </div>
                <div className="hud-field">
                  <label className="hud-label" htmlFor="fuel-l">Fuel Load (L)</label>
                  <input
                    id="fuel-l"
                    className="hud-input"
                    type="number"
                    step="0.5"
                    value={fuelL}
                    onChange={(e) => setFuelL(e.target.value)}
                  />
                </div>
              </div>

              <div className="hud-cornergrid">
                {CORNERS.map((corner) => (
                  <div key={corner} className="hud-panel" style={{ padding: "10px" }}>
                    <h4 className="hud-title hud-title--left" style={{ marginBottom: "6px" }}>
                      {CORNER_LABELS[corner]}
                    </h4>
                    {CORNER_PARAM_SECTIONS.flatMap((s) => s.params).map((key) => {
                      const range = byScope[AXLE_OF_CORNER[corner]]?.[key];
                      return (
                        <div className="hud-field" key={key} style={{ marginBottom: "6px" }}>
                          <label className="hud-label" style={{ fontSize: "10px" }}>
                            {CORNER_PARAM_LABELS[key]} {range ? `(${range.unit})` : ""}
                          </label>
                          <input
                            className="hud-input"
                            type="number"
                            min={range?.min_value}
                            max={range?.max_value}
                            step={range?.step_value || 1}
                            value={draftCorners[corner]?.[key] ?? ""}
                            onChange={(e) => updateCorner(corner, key, e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Panel>

            {CAR_PARAM_SECTIONS.map((section) => (
              <Panel key={section.key} title={section.label} className="sm-full lg-2">
                <div className="hud-body hud-form">
                  {section.params.map((key) => {
                    const range = byScope.CAR?.[key];
                    return (
                      <div className="hud-field" key={key}>
                        <label className="hud-label">
                          {CAR_PARAM_LABELS[key]} {range ? `(${range.unit})` : ""}
                        </label>
                        <input
                          className="hud-input"
                          type="number"
                          min={range?.min_value}
                          max={range?.max_value}
                          step={range?.step_value || 1}
                          value={draftCar[key] ?? ""}
                          onChange={(e) =>
                            setDraftCar((c) => ({ ...c, [key]: e.target.value === "" ? "" : Number(e.target.value) }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ))}

            <Panel title="Gearing" className="sm-full lg-2">
              <div className="hud-body hud-form">
                <div className="hud-field">
                  <label className="hud-label" htmlFor="final-drive">Final Drive</label>
                  <input
                    id="final-drive"
                    className="hud-input"
                    type="number"
                    step="0.01"
                    value={finalDrive}
                    onChange={(e) => setFinalDrive(e.target.value)}
                  />
                </div>
              </div>
              <div className="hud-stack" style={{ gap: "6px", padding: "0 14px 14px" }}>
                {gearRatios.map((ratio, i) => (
                  <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="hud-status" style={{ minWidth: "48px" }}>Gear {i + 1}</span>
                    <input
                      className="hud-input"
                      type="number"
                      step="0.001"
                      value={ratio}
                      onChange={(e) => updateGear(i, e.target.value)}
                    />
                    <button type="button" className="hud-link" onClick={() => removeGear(i)} aria-label="Remove gear">
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" className="hud-btn hud-btn--ghost" onClick={addGear}>
                  <Icon name="plus" size={14} color={C.ink} /> Add Gear
                </button>
              </div>
            </Panel>

            <Panel title="Save Version" tone="or" className="span-full">
              <div className="hud-body hud-form">
                <div className="hud-field wide">
                  <label className="hud-label" htmlFor="setup-name">Setup Name</label>
                  <input
                    id="setup-name"
                    className="hud-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="hud-field">
                  <span className="hud-label">Purpose</span>
                  <CustomSelect
                    value={form.purpose}
                    onChange={(purpose) => setForm((f) => ({ ...f, purpose }))}
                    options={SETUP_PURPOSE_OPTIONS}
                  />
                </div>
                <div className="hud-field wide">
                  <label className="hud-label" htmlFor="setup-summary">What changed</label>
                  <input
                    id="setup-summary"
                    className="hud-input"
                    value={form.change_summary}
                    onChange={(e) => setForm((f) => ({ ...f, change_summary: e.target.value }))}
                    placeholder="e.g. Stiffened front springs for higher downforce load"
                  />
                </div>
                <div className="hud-field wide">
                  <label className="hud-label" htmlFor="setup-notes">Notes</label>
                  <textarea
                    id="setup-notes"
                    className="hud-input"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <button type="button" className="hud-btn" onClick={handleSave} disabled={saving}>
                <Icon name="save" size={16} color="#fff" />
                {saving ? "Saving..." : activeVersionId ? "Save as New Version" : "Save Baseline"}
              </button>
              {saveError && <Status color={C.orange}>{saveError}</Status>}
              {saved && !saveError && <Status color={C.cyan}>Saved to the garage.</Status>}
            </Panel>

            <div className="span-full">
              <p className="hud-empty" style={{ padding: "10px", textTransform: "none" }}>
                Log a stint on this setup, then open History for a calculator preview and a crew
                chief debrief — both read what the car actually did on track.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GarageScreen;
