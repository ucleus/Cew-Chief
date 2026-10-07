import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import NumberStepper from "../components/ui/NumberStepper";
import { CarsApi, SetupsApi, TracksApi } from "../api/client";
import {
  AXLE_OF_CORNER,
  CAR_PARAM_LABELS,
  CAR_PARAM_SECTIONS,
  CORNERS,
  CORNER_LABELS,
  CORNER_PARAM_LABELS,
  CORNER_PARAM_SECTIONS,
  FEEDBACK_SYMPTOMS,
  SETUP_PURPOSE_OPTIONS,
  defaultCarValues,
  defaultCornerValues,
  rangesByScope,
} from "../data/acParams";
import { applyDriverProfileNudges, composeDriverProfileText } from "../data/driverProfile";
import { ComputeApi } from "../api/client";
import PhysicsCompareChart from "../components/garage/PhysicsCompareChart";
import { C } from "../styles/theme";

const CAR_KEYS = CAR_PARAM_SECTIONS.flatMap((s) => s.params);
const DIAGNOSE_MODEL = "claude-sonnet-4-6";
const labelFor = (paramKey) => CAR_PARAM_LABELS[paramKey] || CORNER_PARAM_LABELS[paramKey] || paramKey;

function buildAdjustable(car) {
  return (car.ranges || []).map((r) => ({
    param_key: r.param_key,
    scope: r.scope,
    min: Number(r.min_value),
    max: Number(r.max_value),
    step: Number(r.step_value),
    unit: r.unit,
    higher_means: r.higher_means,
  }));
}

function buildDiagnosePrompt({ car, track, draftCar, draftCorners, problems, driverProfile }) {
  const system = `You are the race engineer for a sim racing team running Assetto Corsa (the original Kunos title, not Assetto Corsa Competizione). This request has no stint data — no lap times, no tire temps, no telemetry. You are working from the driver's description of the problem alone, plus their standing profile. Say so plainly if that limits your confidence.

Only recommend settings listed in adjustable. Every suggested_value must sit between min and max and on the step grid, in the unit given. Give absolute values, never deltas — report current_value exactly as given and state the new suggested_value. Read higher_means before deciding direction. Recommend one primary change and at most three secondary changes. With no stint data, confidence should rarely be HIGH.

Respond with a single JSON object and nothing else: no markdown, no code fences. The object must have exactly these fields:
{
  "diagnosis": "string, two to four sentences",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "expected_tradeoff": "string, net effect of the whole package",
  "adjustments": [
    {"priority": 1, "param_key": "string, from adjustable", "scope": "FL|FR|RL|RR|FRONT|REAR|CAR", "current_value": number, "suggested_value": number, "unit": "string", "addresses": "string", "rationale": "string", "tradeoff": "string"}
  ]
}`;

  const carValues = {};
  for (const key of CAR_KEYS) carValues[key] = draftCar[key];

  const user = JSON.stringify({
    car: { name: car.name, car_class: car.car_class, drivetrain: car.drivetrain },
    track: { name: track.name, downforce_demand: track.downforce_demand, bumpiness: track.bumpiness },
    setup: { values: { car: carValues, corners: draftCorners }, adjustable: buildAdjustable(car) },
    problems,
    driver_profile: composeDriverProfileText(driverProfile) || "none given",
  });

  return { system, user };
}

function currentValueFor(item, draftCar, draftCorners) {
  if (item.scope === "CAR") return draftCar[item.param_key];
  if (["FL", "FR", "RL", "RR"].includes(item.scope)) return draftCorners[item.scope]?.[item.param_key];
  const corner = item.scope === "FRONT" ? "FL" : "RL";
  return draftCorners[corner]?.[item.param_key];
}

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
  const [baselineReasons, setBaselineReasons] = useState(null);

  const [problems, setProblems] = useState([]);
  const [customProblem, setCustomProblem] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState("");
  const [diagnoseResult, setDiagnoseResult] = useState(null);
  const [physicsBefore, setPhysicsBefore] = useState(null);
  const [physicsAfter, setPhysicsAfter] = useState(null);
  const toggleProblem = (p) =>
    setProblems((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

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
      setBaselineReasons(null);
    } else if (car) {
      const baseCorners = defaultCornerValues(byScope);
      const baseCar = defaultCarValues(byScope);
      const { carValues, corners, reasons } = applyDriverProfileNudges({
        carValues: baseCar,
        corners: baseCorners,
        byScope,
        driverProfile: settings?.driverProfile,
      });
      setDraftCorners(corners);
      setDraftCar(carValues);
      setBaselineReasons(Object.keys(reasons).length ? reasons : null);
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

  const runQuickDiagnose = async () => {
    if (!car || !track) return;
    if (!settings?.apiKey) {
      setDiagnoseError("Add your Anthropic API key in Settings first.");
      return;
    }
    const allProblems = customProblem.trim() ? [...problems, customProblem.trim()] : problems;
    if (!allProblems.length) {
      setDiagnoseError("Pick or describe at least one problem.");
      return;
    }
    setDiagnosing(true);
    setDiagnoseError("");
    try {
      const beforeSetup = { fuel_l: fuelL, arb_front: draftCar.arb_front, arb_rear: draftCar.arb_rear, corners: draftCorners };
      const before = await ComputeApi.run({ car, setup: beforeSetup, compound: null, stint: null });

      const { system, user } = buildDiagnosePrompt({ car, track, draftCar, draftCorners, problems: allProblems, driverProfile: settings?.driverProfile });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: DIAGNOSE_MODEL, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const nextCar = { ...draftCar };
      const nextCorners = Object.fromEntries(Object.entries(draftCorners).map(([k, v]) => [k, { ...v }]));
      const appliedItems = [];

      for (const item of parsed.adjustments || []) {
        const current = currentValueFor(item, draftCar, draftCorners);
        if (current == null) continue;
        appliedItems.push({ ...item, current_value: current });

        if (item.scope === "CAR") {
          nextCar[item.param_key] = item.suggested_value;
        } else if (["FL", "FR", "RL", "RR"].includes(item.scope)) {
          nextCorners[item.scope][item.param_key] = item.suggested_value;
        } else {
          const pair = item.scope === "FRONT" ? ["FL", "FR"] : ["RL", "RR"];
          for (const corner of pair) nextCorners[corner][item.param_key] = item.suggested_value;
        }
      }

      const afterSetup = { fuel_l: fuelL, arb_front: nextCar.arb_front, arb_rear: nextCar.arb_rear, corners: nextCorners };
      const after = await ComputeApi.run({ car, setup: afterSetup, compound: null, stint: null });

      setDraftCar(nextCar);
      setDraftCorners(nextCorners);
      setDiagnoseResult({ ...parsed, items: appliedItems });
      setPhysicsBefore(before);
      setPhysicsAfter(after);
      setForm((f) => ({ ...f, change_summary: parsed.diagnosis?.slice(0, 120) || `Diagnosed: ${allProblems.join(", ")}` }));
    } catch (e) {
      setDiagnoseError(e.message);
    }
    setDiagnosing(false);
  };

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
              <>
                <Status color={C.ink3}>No saved setup yet — editing the stock baseline below.</Status>
                {baselineReasons && Object.keys(baselineReasons).length > 0 && (
                  <div className="hud-stack" style={{ gap: "4px", marginTop: "8px" }}>
                    {Object.entries(baselineReasons).map(([key, reason]) => (
                      <p className="hud-text" key={key} style={{ color: C.ink2 }}>
                        <b>{CAR_PARAM_LABELS[key] || CORNER_PARAM_LABELS[key] || key}:</b> {reason}
                      </p>
                    ))}
                  </div>
                )}
              </>
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
            <Panel title="Quick Diagnose" tone="or" icon={<Icon name="zap" size={14} color={C.orange} />} className="span-full">
              <div className="hud-body">
                <p className="hud-text" style={{ textTransform: "none", color: C.ink2 }}>
                  No stint needed — pick what's wrong and the Crew Chief will adjust the setup
                  below directly. Less certain than a debrief grounded in real stint data (History
                  tab, after you've logged a stint), but faster.
                </p>
                <div className="hud-chips">
                  {FEEDBACK_SYMPTOMS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="hud-chip"
                      aria-pressed={problems.includes(s)}
                      onClick={() => toggleProblem(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <textarea
                  className="hud-input"
                  value={customProblem}
                  onChange={(e) => setCustomProblem(e.target.value)}
                  placeholder="Describe anything else — e.g. 'Can't hold the line through the final chicane'"
                  style={{ marginTop: "8px" }}
                />
                <button type="button" className="hud-btn hud-btn--cyan" onClick={runQuickDiagnose} disabled={diagnosing} style={{ marginTop: "8px" }}>
                  <Icon name="zap" size={16} color={C.ink} />
                  {diagnosing ? "Engineer is thinking..." : "Ask Crew Chief"}
                </button>
                {diagnoseError && <Status color={C.orange}>{diagnoseError}</Status>}
              </div>

              {diagnoseResult && (
                <div className="hud-body hud-stack" style={{ gap: "8px" }}>
                  <div className="hud-fix hud-fix--high">
                    <div className="hud-fix__head">
                      <span className="hud-tag">{diagnoseResult.confidence}</span>
                    </div>
                    <p className="hud-text">{diagnoseResult.diagnosis}</p>
                    {diagnoseResult.expected_tradeoff && (
                      <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {diagnoseResult.expected_tradeoff}</p>
                    )}
                  </div>
                  {diagnoseResult.items.map((item, i) => (
                    <div className="hud-fix" key={i}>
                      <div className="hud-fix__head">
                        <span className="hud-tag">[{item.scope}] {labelFor(item.param_key)}</span>
                        <span>{item.current_value}{item.unit} → {item.suggested_value}{item.unit}</span>
                      </div>
                      <p className="hud-text">{item.rationale}</p>
                      {item.tradeoff && <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {item.tradeoff}</p>}
                    </div>
                  ))}
                  {(physicsBefore || physicsAfter) && <PhysicsCompareChart before={physicsBefore} after={physicsAfter} />}
                  <p className="hud-text" style={{ color: C.ink2 }}>
                    Applied to the setup below — adjust anything you want, then Save as New Version.
                  </p>
                </div>
              )}
            </Panel>

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
                  <NumberStepper
                    id="fuel-l"
                    step={0.5}
                    min={0}
                    value={fuelL}
                    onChange={(v) => setFuelL(v)}
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
                          <NumberStepper
                            min={range?.min_value}
                            max={range?.max_value}
                            step={range?.step_value || 1}
                            value={draftCorners[corner]?.[key] ?? ""}
                            onChange={(v) => updateCorner(corner, key, v)}
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
                        <NumberStepper
                          min={range?.min_value}
                          max={range?.max_value}
                          step={range?.step_value || 1}
                          value={draftCar[key] ?? ""}
                          onChange={(v) => setDraftCar((c) => ({ ...c, [key]: v }))}
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
                  <NumberStepper
                    id="final-drive"
                    step={0.01}
                    min={0}
                    value={finalDrive}
                    onChange={(v) => setFinalDrive(v)}
                  />
                </div>
              </div>
              <div className="hud-stack" style={{ gap: "6px", padding: "0 14px 14px" }}>
                {gearRatios.map((ratio, i) => (
                  <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="hud-status" style={{ minWidth: "48px" }}>Gear {i + 1}</span>
                    <NumberStepper
                      step={0.001}
                      value={ratio}
                      onChange={(v) => updateGear(i, v)}
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
