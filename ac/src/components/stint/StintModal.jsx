import { useEffect, useState } from "react";
import CustomSelect from "../ui/CustomSelect";
import Icon from "../ui/Icon";
import { Panel, Status } from "../ui/Hud";
import NumberStepper from "../ui/NumberStepper";
import { CarsApi, DriversApi, SetupsApi, TracksApi } from "../../api/client";
import {
  CORNERS,
  CORNER_LABELS,
  FEEDBACK_PHASES,
  FEEDBACK_SPEED_RANGES,
  FEEDBACK_SYMPTOMS,
  SESSION_TYPE_OPTIONS,
  defaultCarValues,
  defaultCornerValues,
  rangesByScope,
} from "../../data/acParams";
import { C } from "../../styles/theme";

const secondsToMs = (s) => (s === "" || s === null ? null : Math.round(parseFloat(s) * 1000));

const StintModal = ({ settings, onClose, onSave }) => {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [car, setCar] = useState(null);
  const [chain, setChain] = useState([]);
  const [setupId, setSetupId] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    session_type: "PRACTICE",
    ambient_temp_c: "",
    track_temp_c: "",
    grip_pct: "",
    fuel_start_l: "",
    fuel_end_l: "",
    top_speed_kmh: "",
    lap_count: "",
    best_lap_s: "",
    avg_lap_s: "",
    driver_notes: "",
  });
  const [laps, setLaps] = useState([]);
  const [tires, setTires] = useState(
    Object.fromEntries(CORNERS.map((c) => [c, { hot_psi: "", temp_in_c: "", temp_mid_c: "", temp_out_c: "", wear_pct: "" }])),
  );
  const [feedback, setFeedback] = useState([]);

  useEffect(() => {
    TracksApi.list().then(setTracks).catch((e) => setLoadError(e.message));
    DriversApi.list().then(setDrivers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings?.carId) return;
    CarsApi.get(settings.carId).then(setCar).catch((e) => setLoadError(e.message));
  }, [settings?.carId]);

  useEffect(() => {
    if (!car || !trackId) {
      setChain([]);
      setSetupId(null);
      return;
    }
    SetupsApi.chain(car.id, trackId).then((rows) => {
      setChain(rows);
      setSetupId(rows[0]?.id ?? null);
    });
  }, [car, trackId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updateTire = (corner, key, value) =>
    setTires((t) => ({ ...t, [corner]: { ...t[corner], [key]: value } }));

  const addLap = () =>
    setLaps((l) => [...l, { lap_no: l.length + 1, lap_s: "", sector1_s: "", sector2_s: "", sector3_s: "", is_valid: true }]);
  const updateLap = (i, patch) => setLaps((l) => l.map((lap, idx) => (idx === i ? { ...lap, ...patch } : lap)));
  const removeLap = (i) =>
    setLaps((l) => l.filter((_, idx) => idx !== i).map((lap, idx) => ({ ...lap, lap_no: idx + 1 })));

  const addFeedback = () =>
    setFeedback((f) => [
      ...f,
      { phase: "MID", speed_range: "ALL", symptom: "UNDERSTEER", severity: 3, corner_ref: "", note: "" },
    ]);
  const updateFeedback = (i, patch) => setFeedback((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeFeedback = (i) => setFeedback((f) => f.filter((_, idx) => idx !== i));

  const ensureSetupId = async () => {
    if (setupId) return setupId;
    if (!car) throw new Error("Pick a car in Settings first.");
    const byScope = rangesByScope(car.ranges || []);
    const corners = defaultCornerValues(byScope);
    const carValues = defaultCarValues(byScope);
    const created = await SetupsApi.create({
      car_id: car.id,
      track_id: trackId,
      name: `${car.name} Baseline`,
      purpose: "BASELINE",
      change_summary: "Auto-created from first logged stint",
      compound_id: car.compounds?.[0]?.id,
      fuel_l: car.fuel_tank_l ? Math.round(car.fuel_tank_l / 2) : 50,
      corners,
      ...carValues,
    });
    return created.id;
  };

  const handleSave = async () => {
    if (!trackId) {
      setSaveError("Pick a track.");
      return;
    }
    if (!form.ambient_temp_c || !form.track_temp_c) {
      setSaveError("Ambient and track temperature are required.");
      return;
    }

    const validLaps = laps.filter((l) => l.lap_s !== "");
    const lapMsList = validLaps.map((l) => secondsToMs(l.lap_s)).filter((v) => v != null);
    const validOnlyMs = validLaps.filter((l) => l.is_valid).map((l) => secondsToMs(l.lap_s));

    const lapCount = lapMsList.length || Number(form.lap_count) || 0;
    if (!lapCount) {
      setSaveError("Enter a lap count or log individual laps.");
      return;
    }

    let bestLapMs = form.best_lap_s ? secondsToMs(form.best_lap_s) : null;
    let avgLapMs = form.avg_lap_s ? secondsToMs(form.avg_lap_s) : null;
    let lapStdevMs = null;
    if (validOnlyMs.length) {
      bestLapMs = Math.min(...validOnlyMs);
      const mean = validOnlyMs.reduce((a, b) => a + b, 0) / validOnlyMs.length;
      avgLapMs = Math.round(mean);
      const variance = validOnlyMs.reduce((a, b) => a + (b - mean) ** 2, 0) / validOnlyMs.length;
      lapStdevMs = Math.round(Math.sqrt(variance));
    }
    if (!bestLapMs) {
      setSaveError("Enter a best lap time.");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      const resolvedSetupId = await ensureSetupId();
      const tiresPayload = {};
      for (const corner of CORNERS) {
        const t = tires[corner];
        if (t.hot_psi !== "" && t.temp_in_c !== "" && t.temp_mid_c !== "" && t.temp_out_c !== "") {
          tiresPayload[corner] = {
            hot_psi: Number(t.hot_psi),
            temp_in_c: Number(t.temp_in_c),
            temp_mid_c: Number(t.temp_mid_c),
            temp_out_c: Number(t.temp_out_c),
            wear_pct: t.wear_pct === "" ? null : Number(t.wear_pct),
          };
        }
      }

      const payload = {
        setup_id: resolvedSetupId,
        driver_id: driverId || null,
        session_type: form.session_type,
        lap_count: lapCount,
        best_lap_ms: bestLapMs,
        avg_lap_ms: avgLapMs,
        lap_stdev_ms: lapStdevMs,
        ambient_temp_c: form.ambient_temp_c,
        track_temp_c: form.track_temp_c,
        grip_pct: form.grip_pct || null,
        fuel_start_l: form.fuel_start_l || null,
        fuel_end_l: form.fuel_end_l || null,
        top_speed_kmh: form.top_speed_kmh || null,
        driver_notes: form.driver_notes || null,
        laps: validLaps.map((l, i) => ({
          lap_no: l.lap_no ?? i + 1,
          lap_ms: secondsToMs(l.lap_s),
          sector1_ms: secondsToMs(l.sector1_s),
          sector2_ms: secondsToMs(l.sector2_s),
          sector3_ms: secondsToMs(l.sector3_s),
          is_valid: l.is_valid,
        })),
        tires: tiresPayload,
        feedback: feedback.map((f) => ({ ...f, corner_ref: f.corner_ref || null, note: f.note || null })),
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="hud-modal">
      <Panel title="Log Stint" className="hud-modal__sheet" role="dialog" aria-modal="true" aria-label="Log stint">
        <div className="hud-body hud-form">
          <div className="hud-field wide">
            <span className="hud-label">Track</span>
            <CustomSelect
              value={trackId || ""}
              onChange={setTrackId}
              placeholder="Select circuit"
              options={tracks.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>

          {chain.length > 0 && (
            <div className="hud-field wide">
              <span className="hud-label">Setup Used</span>
              <CustomSelect
                value={setupId || ""}
                onChange={setSetupId}
                options={chain.map((c) => ({ value: c.id, label: `v${c.version} · ${c.name}` }))}
              />
            </div>
          )}
          {trackId && chain.length === 0 && (
            <Status color={C.ink3}>No saved setup yet — a stock baseline will be created.</Status>
          )}
          {loadError && <Status color={C.orange}>{loadError}</Status>}

          <div className="hud-field">
            <span className="hud-label">Driver</span>
            <CustomSelect
              value={driverId || ""}
              onChange={setDriverId}
              options={drivers.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Optional"
            />
          </div>
          <div className="hud-field">
            <span className="hud-label">Session Type</span>
            <CustomSelect value={form.session_type} onChange={(v) => set("session_type", v)} options={SESSION_TYPE_OPTIONS} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-ambient">Ambient °C *</label>
            <NumberStepper id="stint-ambient" step={0.5} value={form.ambient_temp_c} onChange={(v) => set("ambient_temp_c", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-tracktemp">Track °C *</label>
            <NumberStepper id="stint-tracktemp" step={0.5} value={form.track_temp_c} onChange={(v) => set("track_temp_c", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-grip">Track Grip %</label>
            <NumberStepper id="stint-grip" step={0.5} min={0} max={100} value={form.grip_pct} onChange={(v) => set("grip_pct", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-topspeed">Top Speed km/h</label>
            <NumberStepper id="stint-topspeed" min={0} value={form.top_speed_kmh} onChange={(v) => set("top_speed_kmh", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-fuelstart">Fuel Start (L)</label>
            <NumberStepper id="stint-fuelstart" step={0.5} min={0} value={form.fuel_start_l} onChange={(v) => set("fuel_start_l", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-fuelend">Fuel End (L)</label>
            <NumberStepper id="stint-fuelend" step={0.5} min={0} value={form.fuel_end_l} onChange={(v) => set("fuel_end_l", v)} />
          </div>

          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-lapcount">Lap Count</label>
            <NumberStepper id="stint-lapcount" min={0} value={form.lap_count} onChange={(v) => set("lap_count", v)} placeholder="Used if no laps logged below" />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-best">Best Lap (s)</label>
            <NumberStepper id="stint-best" step={0.001} min={0} value={form.best_lap_s} onChange={(v) => set("best_lap_s", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="stint-avg">Avg Lap (s)</label>
            <NumberStepper id="stint-avg" step={0.001} min={0} value={form.avg_lap_s} onChange={(v) => set("avg_lap_s", v)} />
          </div>

          <div className="hud-field wide">
            <span className="hud-label">Lap-by-Lap, with Sector Splits (optional, overrides best/avg above)</span>
            <div className="hud-stack" style={{ gap: "6px" }}>
              {laps.map((lap, i) => (
                <div key={i} className="hud-fix" style={{ padding: "8px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="hud-status" style={{ minWidth: "28px" }}>#{lap.lap_no}</span>
                    <NumberStepper step={0.001} min={0} value={lap.lap_s} onChange={(v) => updateLap(i, { lap_s: v })} placeholder="lap total, seconds" />
                    <label style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px", color: C.ink2 }}>
                      <input type="checkbox" checked={lap.is_valid} onChange={(e) => updateLap(i, { is_valid: e.target.checked })} />
                      valid
                    </label>
                    <button type="button" className="hud-link" onClick={() => removeLap(i)} aria-label="Remove lap">✕</button>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <span className="hud-status" style={{ minWidth: "28px" }} />
                    <NumberStepper step={0.001} min={0} value={lap.sector1_s} onChange={(v) => updateLap(i, { sector1_s: v })} placeholder="S1" />
                    <NumberStepper step={0.001} min={0} value={lap.sector2_s} onChange={(v) => updateLap(i, { sector2_s: v })} placeholder="S2" />
                    <NumberStepper step={0.001} min={0} value={lap.sector3_s} onChange={(v) => updateLap(i, { sector3_s: v })} placeholder="S3" />
                  </div>
                </div>
              ))}
              <button type="button" className="hud-btn hud-btn--ghost" onClick={addLap}>
                <Icon name="plus" size={14} color={C.ink} /> Add Lap
              </button>
            </div>
          </div>

          <div className="hud-field wide">
            <span className="hud-label">Tyre Readings (fill all four fields per corner to log it)</span>
            <div className="hud-cornergrid">
              {CORNERS.map((corner) => (
                <div key={corner} className="hud-panel" style={{ padding: "8px" }}>
                  <h4 className="hud-title hud-title--left" style={{ fontSize: "11px" }}>{CORNER_LABELS[corner]}</h4>
                  {[
                    ["hot_psi", "Hot PSI"],
                    ["temp_in_c", "Temp In °C"],
                    ["temp_mid_c", "Temp Mid °C"],
                    ["temp_out_c", "Temp Out °C"],
                    ["wear_pct", "Wear %"],
                  ].map(([key, label]) => (
                    <div className="hud-field" key={key} style={{ marginBottom: "4px" }}>
                      <label className="hud-label" style={{ fontSize: "10px" }}>{label}</label>
                      <NumberStepper
                        step={0.1}
                        value={tires[corner][key]}
                        onChange={(v) => updateTire(corner, key, v)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="hud-field wide">
            <span className="hud-label">Corner Feedback</span>
            <div className="hud-stack" style={{ gap: "8px" }}>
              {feedback.map((row, i) => (
                <div key={i} className="hud-fix">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <CustomSelect value={row.phase} onChange={(v) => updateFeedback(i, { phase: v })} options={FEEDBACK_PHASES} />
                    <CustomSelect value={row.speed_range} onChange={(v) => updateFeedback(i, { speed_range: v })} options={FEEDBACK_SPEED_RANGES} />
                  </div>
                  <div style={{ marginTop: "6px" }}>
                    <CustomSelect value={row.symptom} onChange={(v) => updateFeedback(i, { symptom: v })} options={FEEDBACK_SYMPTOMS} />
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                    <span className="hud-status">Severity</span>
                    <input type="range" min="1" max="5" value={row.severity} onChange={(e) => updateFeedback(i, { severity: Number(e.target.value) })} />
                    <span className="hud-status">{row.severity}</span>
                  </div>
                  <input
                    className="hud-input"
                    value={row.corner_ref}
                    onChange={(e) => updateFeedback(i, { corner_ref: e.target.value })}
                    placeholder="Corner ref — e.g. T9"
                    style={{ marginTop: "6px" }}
                  />
                  <textarea
                    className="hud-input"
                    value={row.note}
                    onChange={(e) => updateFeedback(i, { note: e.target.value })}
                    placeholder="Note"
                    style={{ marginTop: "6px" }}
                  />
                  <button type="button" className="hud-link" onClick={() => removeFeedback(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="hud-btn hud-btn--ghost" onClick={addFeedback}>
                <Icon name="plus" size={14} color={C.ink} /> Add Feedback
              </button>
            </div>
          </div>

          <div className="hud-field wide">
            <label className="hud-label" htmlFor="stint-notes">Driver Notes</label>
            <textarea id="stint-notes" className="hud-input" value={form.driver_notes} onChange={(e) => set("driver_notes", e.target.value)} />
          </div>
        </div>

        {saveError && <Status color={C.orange}>{saveError}</Status>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button type="button" className="hud-btn hud-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="hud-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Stint"}
          </button>
        </div>
      </Panel>
    </div>
  );
};

export default StintModal;
