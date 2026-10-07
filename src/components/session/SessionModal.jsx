import { useEffect, useState } from "react";
import CustomSelect from "../ui/CustomSelect";
import Icon from "../ui/Icon";
import { Panel, Status } from "../ui/Hud";
import NumberStepper from "../ui/NumberStepper";
import { BikesApi, SetupsApi, TracksApi } from "../../api/client";
import {
  FEEDBACK_CORNER_TYPES,
  FEEDBACK_PHASES,
  SESSION_TYPE_OPTIONS,
  SYMPTOM_SUGGESTIONS,
  TYRE_TEMP_OPTIONS,
  WEATHER_OPTIONS,
  defaultChoicesFromOptions,
  defaultValuesFromParams,
} from "../../data/setupParams";
import { C } from "../../styles/theme";

const secondsToMs = (s) => (s === "" || s === null ? null : Math.round(parseFloat(s) * 1000));

const SessionModal = ({ settings, onClose, onSave }) => {
  const [tracks, setTracks] = useState([]);
  const [trackId, setTrackId] = useState(null);
  const [bike, setBike] = useState(null);
  const [chain, setChain] = useState([]);
  const [setupId, setSetupId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    session_type: "PRACTICE",
    weather: "DRY",
    ambient_temp_c: "",
    track_temp_c: "",
    race_laps: "",
    lap_count: "",
    best_lap_s: "",
    avg_lap_s: "",
    tyre_front_temp: "",
    tyre_rear_temp: "",
    tyre_front_wear_pct: "",
    tyre_rear_wear_pct: "",
    brake_front_temp: "",
    brake_rear_temp: "",
    hit_limiter: false,
    driver_notes: "",
  });
  const [laps, setLaps] = useState([]);
  const [feedback, setFeedback] = useState([]);

  useEffect(() => {
    TracksApi.list().then(setTracks).catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!settings?.bikeId) return;
    BikesApi.get(settings.bikeId).then(setBike).catch((e) => setLoadError(e.message));
  }, [settings?.bikeId]);

  useEffect(() => {
    if (!bike || !trackId) {
      setChain([]);
      setSetupId(null);
      return;
    }
    SetupsApi.chain(bike.id, trackId).then((rows) => {
      setChain(rows);
      setSetupId(rows[0]?.id ?? null);
    });
  }, [bike, trackId]);

  const addLap = () =>
    setLaps((l) => [...l, { lap_no: l.length + 1, lap_s: "", sector1_s: "", sector2_s: "", sector3_s: "", is_valid: true }]);
  const updateLap = (i, patch) =>
    setLaps((l) => l.map((lap, idx) => (idx === i ? { ...lap, ...patch } : lap)));
  const removeLap = (i) =>
    setLaps((l) => l.filter((_, idx) => idx !== i).map((lap, idx) => ({ ...lap, lap_no: idx + 1 })));

  const addFeedback = () =>
    setFeedback((f) => [
      ...f,
      { phase: "MID", corner_type: "ALL", symptom: "", severity: 3, corner_ref: "", note: "" },
    ]);
  const updateFeedback = (i, patch) =>
    setFeedback((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeFeedback = (i) => setFeedback((f) => f.filter((_, idx) => idx !== i));

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const ensureSetupId = async () => {
    if (setupId) return setupId;
    if (!bike) throw new Error("Pick a bike in Settings first.");
    const created = await SetupsApi.create({
      bike_id: bike.id,
      track_id: trackId,
      name: `${bike.name} Baseline`,
      purpose: "PRACTICE",
      change_summary: "Auto-created from first logged session",
      values: defaultValuesFromParams(bike.params),
      choices: defaultChoicesFromOptions(bike.options),
    });
    return created.id;
  };

  const handleSave = async () => {
    if (!trackId) {
      setSaveError("Pick a track.");
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
      const variance =
        validOnlyMs.reduce((a, b) => a + (b - mean) ** 2, 0) / validOnlyMs.length;
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
      const payload = {
        setup_id: resolvedSetupId,
        session_type: form.session_type,
        lap_count: lapCount,
        best_lap_ms: bestLapMs,
        avg_lap_ms: avgLapMs,
        lap_stdev_ms: lapStdevMs,
        ambient_temp_c: form.ambient_temp_c || null,
        track_temp_c: form.track_temp_c || null,
        weather: form.weather,
        race_laps: form.race_laps || null,
        tyre_front_temp: form.tyre_front_temp || null,
        tyre_rear_temp: form.tyre_rear_temp || null,
        tyre_front_wear_pct: form.tyre_front_wear_pct || null,
        tyre_rear_wear_pct: form.tyre_rear_wear_pct || null,
        brake_front_temp: form.brake_front_temp || null,
        brake_rear_temp: form.brake_rear_temp || null,
        hit_limiter: form.hit_limiter,
        driver_notes: form.driver_notes || null,
        laps: validLaps.map((l, i) => ({
          lap_no: l.lap_no ?? i + 1,
          lap_ms: secondsToMs(l.lap_s),
          sector1_ms: secondsToMs(l.sector1_s),
          sector2_ms: secondsToMs(l.sector2_s),
          sector3_ms: secondsToMs(l.sector3_s),
          is_valid: l.is_valid,
        })),
        feedback: feedback
          .filter((f) => f.symptom.trim())
          .map((f) => ({ ...f, corner_ref: f.corner_ref || null, note: f.note || null })),
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
      <Panel
        title="Log Session"
        className="hud-modal__sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Log session"
      >
        <div className="hud-body hud-form">
          <div className="hud-field wide">
            <span className="hud-label">Track</span>
            <CustomSelect
              value={trackId || ""}
              onChange={setTrackId}
              placeholder="Select circuit"
              options={tracks.map((t) => ({ value: t.id, label: t.name, meta: t.country || "" }))}
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
            <span className="hud-label">Session Type</span>
            <CustomSelect
              value={form.session_type}
              onChange={(v) => set("session_type", v)}
              options={SESSION_TYPE_OPTIONS}
            />
          </div>
          <div className="hud-field">
            <span className="hud-label">Weather</span>
            <CustomSelect value={form.weather} onChange={(v) => set("weather", v)} options={WEATHER_OPTIONS} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-ambient">Ambient °C</label>
            <NumberStepper
              id="sess-ambient"
              step={0.5}
              value={form.ambient_temp_c}
              onChange={(v) => set("ambient_temp_c", v)}
            />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-track-temp">Track °C</label>
            <NumberStepper
              id="sess-track-temp"
              step={0.5}
              value={form.track_temp_c}
              onChange={(v) => set("track_temp_c", v)}
            />
          </div>

          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-lapcount">Lap Count</label>
            <NumberStepper
              id="sess-lapcount"
              min={0}
              value={form.lap_count}
              onChange={(v) => set("lap_count", v)}
              placeholder="Used if no laps logged below"
            />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-racelaps">Race Laps Planned</label>
            <NumberStepper
              id="sess-racelaps"
              min={0}
              value={form.race_laps}
              onChange={(v) => set("race_laps", v)}
            />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-best">Best Lap (s)</label>
            <NumberStepper
              id="sess-best"
              step={0.001}
              min={0}
              value={form.best_lap_s}
              onChange={(v) => set("best_lap_s", v)}
              placeholder="e.g. 92.456"
            />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-avg">Avg Lap (s)</label>
            <NumberStepper
              id="sess-avg"
              step={0.001}
              min={0}
              value={form.avg_lap_s}
              onChange={(v) => set("avg_lap_s", v)}
            />
          </div>

          <div className="hud-field wide">
            <span className="hud-label">Lap-by-Lap, with Sector Splits (optional, overrides best/avg above)</span>
            <div className="hud-stack" style={{ gap: "6px" }}>
              {laps.map((lap, i) => (
                <div key={i} className="hud-fix" style={{ padding: "8px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="hud-status" style={{ minWidth: "28px" }}>#{lap.lap_no}</span>
                    <NumberStepper
                      step={0.001}
                      min={0}
                      value={lap.lap_s}
                      onChange={(v) => updateLap(i, { lap_s: v })}
                      placeholder="lap total, seconds"
                    />
                    <label style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "11px", color: C.ink2 }}>
                      <input
                        type="checkbox"
                        checked={lap.is_valid}
                        onChange={(e) => updateLap(i, { is_valid: e.target.checked })}
                      />
                      valid
                    </label>
                    <button type="button" className="hud-link" onClick={() => removeLap(i)} aria-label="Remove lap">
                      ✕
                    </button>
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

          <div className="hud-field">
            <span className="hud-label">Front Tyre Temp</span>
            <CustomSelect value={form.tyre_front_temp} onChange={(v) => set("tyre_front_temp", v)} options={TYRE_TEMP_OPTIONS} placeholder="—" />
          </div>
          <div className="hud-field">
            <span className="hud-label">Rear Tyre Temp</span>
            <CustomSelect value={form.tyre_rear_temp} onChange={(v) => set("tyre_rear_temp", v)} options={TYRE_TEMP_OPTIONS} placeholder="—" />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-fwear">Front Wear %</label>
            <NumberStepper id="sess-fwear" step={0.5} min={0} max={100} value={form.tyre_front_wear_pct} onChange={(v) => set("tyre_front_wear_pct", v)} />
          </div>
          <div className="hud-field">
            <label className="hud-label" htmlFor="sess-rwear">Rear Wear %</label>
            <NumberStepper id="sess-rwear" step={0.5} min={0} max={100} value={form.tyre_rear_wear_pct} onChange={(v) => set("tyre_rear_wear_pct", v)} />
          </div>
          <div className="hud-field">
            <span className="hud-label">Front Brake Temp</span>
            <CustomSelect value={form.brake_front_temp} onChange={(v) => set("brake_front_temp", v)} options={TYRE_TEMP_OPTIONS} placeholder="—" />
          </div>
          <div className="hud-field">
            <span className="hud-label">Rear Brake Temp</span>
            <CustomSelect value={form.brake_rear_temp} onChange={(v) => set("brake_rear_temp", v)} options={TYRE_TEMP_OPTIONS} placeholder="—" />
          </div>
          <div className="hud-field wide">
            <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.hit_limiter}
                onChange={(e) => set("hit_limiter", e.target.checked)}
              />
              <span className="hud-label" style={{ margin: 0 }}>Hit the rev limiter on a straight</span>
            </label>
          </div>

          <div className="hud-field wide">
            <span className="hud-label">Corner Feedback</span>
            <div className="hud-stack" style={{ gap: "8px" }}>
              {feedback.map((row, i) => (
                <div key={i} className="hud-fix">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <CustomSelect value={row.phase} onChange={(v) => updateFeedback(i, { phase: v })} options={FEEDBACK_PHASES} />
                    <CustomSelect value={row.corner_type} onChange={(v) => updateFeedback(i, { corner_type: v })} options={FEEDBACK_CORNER_TYPES} />
                  </div>
                  <input
                    className="hud-input"
                    list="symptom-suggestions"
                    value={row.symptom}
                    onChange={(e) => updateFeedback(i, { symptom: e.target.value })}
                    placeholder="Symptom — e.g. Rear slides on decel"
                    style={{ marginTop: "6px" }}
                  />
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                    <span className="hud-status">Severity</span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={row.severity}
                      onChange={(e) => updateFeedback(i, { severity: Number(e.target.value) })}
                    />
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
                  <button type="button" className="hud-link" onClick={() => removeFeedback(i)}>
                    Remove
                  </button>
                </div>
              ))}
              <datalist id="symptom-suggestions">
                {SYMPTOM_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button type="button" className="hud-btn hud-btn--ghost" onClick={addFeedback}>
                <Icon name="plus" size={14} color={C.ink} /> Add Feedback
              </button>
            </div>
          </div>

          <div className="hud-field wide">
            <label className="hud-label" htmlFor="sess-notes">
              Session Notes
            </label>
            <textarea
              id="sess-notes"
              className="hud-input"
              value={form.driver_notes}
              onChange={(e) => set("driver_notes", e.target.value)}
              placeholder="How did it feel? What worked, what didn't?"
            />
          </div>
        </div>

        {saveError && <Status color={C.orange}>{saveError}</Status>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button type="button" className="hud-btn hud-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="hud-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Session"}
          </button>
        </div>
      </Panel>
    </div>
  );
};

export default SessionModal;
