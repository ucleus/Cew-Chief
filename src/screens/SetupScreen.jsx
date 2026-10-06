import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import { BikesApi, SetupsApi, TracksApi } from "../api/client";
import {
  CHOICE_LABELS,
  CHOICE_PARAMS,
  PARAM_LABELS,
  SETUP_PURPOSE_OPTIONS,
  SETUP_SECTIONS,
  defaultChoicesFromOptions,
  defaultValuesFromParams,
} from "../data/setupParams";
import { suggestBaseline } from "../utils/motoMath";
import { C } from "../styles/theme";

const SetupScreen = ({ settings }) => {
  const [tracks, setTracks] = useState([]);
  const [tracksError, setTracksError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState(null);

  const [bike, setBike] = useState(null);
  const [bikeError, setBikeError] = useState("");

  const [chain, setChain] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState(null);

  const [draftValues, setDraftValues] = useState({});
  const [draftChoices, setDraftChoices] = useState({});
  const [form, setForm] = useState({ name: "", purpose: "PRACTICE", change_summary: "", notes: "" });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [baselineReasons, setBaselineReasons] = useState(null);

  useEffect(() => {
    TracksApi.list()
      .then(setTracks)
      .catch((e) => setTracksError(e.message));
  }, []);

  useEffect(() => {
    if (!settings?.bikeId) {
      setBike(null);
      return;
    }
    BikesApi.get(settings.bikeId)
      .then(setBike)
      .catch((e) => setBikeError(e.message));
  }, [settings?.bikeId]);

  const track = tracks.find((t) => t.id === selectedTrackId);

  useEffect(() => {
    if (!bike || !selectedTrackId) {
      setChain([]);
      setActiveVersionId(null);
      return;
    }
    setChainLoading(true);
    SetupsApi.chain(bike.id, selectedTrackId)
      .then((rows) => {
        setChain(rows);
        selectVersion(rows[0] || null);
      })
      .finally(() => setChainLoading(false));
  }, [bike, selectedTrackId]);

  const selectVersion = (version) => {
    setActiveVersionId(version?.id ?? null);
    if (version) {
      setDraftValues({ ...version.values });
      setDraftChoices({ ...version.choices });
      setForm({
        name: `${bike.name} v${version.version + 1}`,
        purpose: version.purpose,
        change_summary: "",
        notes: "",
      });
    } else if (bike) {
      setDraftValues(defaultValuesFromParams(bike.params));
      setDraftChoices(defaultChoicesFromOptions(bike.options));
      setForm({
        name: `${bike.name} Baseline`,
        purpose: "PRACTICE",
        change_summary: "Stock starting point",
        notes: "",
      });
      setBaselineReasons(null);
    }
    setSaved(false);
  };

  const applyRecommendedBaseline = () => {
    if (!bike || !track) return;
    const { values, choices, reasons } = suggestBaseline({ bike, track });
    setDraftValues((v) => ({ ...v, ...values }));
    setDraftChoices((c) => ({ ...c, ...choices }));
    setBaselineReasons(reasons);
    setForm((f) => ({ ...f, change_summary: `Recommended starting point for ${track.name}` }));
  };

  const choiceOptions = useMemo(() => {
    const byKey = {};
    for (const key of CHOICE_PARAMS) {
      byKey[key] = (bike?.options || []).filter((o) => o.param_key === key);
    }
    return byKey;
  }, [bike]);

  const paramMeta = useMemo(() => {
    const byKey = {};
    for (const p of bike?.params || []) byKey[p.param_key] = p;
    return byKey;
  }, [bike]);

  const handleSave = async () => {
    if (!bike || !selectedTrackId) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await SetupsApi.create({
        bike_id: bike.id,
        track_id: selectedTrackId,
        parent_setup_id: activeVersionId || null,
        name: form.name || `${bike.name} Setup`,
        purpose: form.purpose,
        change_summary: form.change_summary || null,
        notes: form.notes || null,
        values: draftValues,
        choices: draftChoices,
      });
      const rows = await SetupsApi.chain(bike.id, selectedTrackId);
      setChain(rows);
      const created = rows.find((r) => r.id === res.id) || rows[0];
      selectVersion(created);
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
        <span className="hud-pagehead__meta">{settings?.class_ || "MotoGP"}</span>
      </div>

      <div className="hud-grid">
        <Panel
          title="Select Circuit"
          icon={<Icon name="map" size={14} color={C.cyan} />}
          className="sm-full md-full lg-2"
          style={{ position: "relative", zIndex: 20 }}
        >
          <CustomSelect
            value={selectedTrackId || ""}
            onChange={setSelectedTrackId}
            placeholder="Choose your battleground..."
            options={tracks.map((t) => ({
              value: t.id,
              label: t.name,
              meta: t.country || "",
            }))}
          />
          {tracksError && <Status color={C.orange}>Couldn't load tracks: {tracksError}</Status>}
          {track ? (
            <div className="hud-cells">
              {[
                ["Length", track.length_m ? `${(track.length_m / 1000).toFixed(2)}km` : "—"],
                ["Corners", track.medium_corners ?? "—"],
              ].map(([k, v]) => (
                <div className="hud-cell" key={k}>
                  <div className="hud-cell__val">{v}</div>
                  <div className="hud-cell__cap">{k}</div>
                </div>
              ))}
            </div>
          ) : (
            <Status color={C.ink3}>No circuit selected</Status>
          )}
        </Panel>

        <Panel
          title="Bike"
          icon={<Icon name="motorcycle" size={14} color={C.orange} />}
          className="sm-full md-full lg-2"
        >
          {bike ? (
            <>
              <div className="hud-kicker cy" style={{ fontSize: "18px" }}>
                {bike.name}
              </div>
              <Status>{bike.class} · {bike.game}</Status>
            </>
          ) : (
            <Status color={C.ink3}>
              {bikeError || "Pick a bike in Settings to load its setup ranges."}
            </Status>
          )}
        </Panel>

        {bike && selectedTrackId && (
          <Panel
            title="Setup Chain"
            icon={<Icon name="chart" size={14} color={C.cyan} />}
            className="span-full"
          >
            {chainLoading ? (
              <Status color={C.ink3}>Loading saved setups...</Status>
            ) : chain.length === 0 ? (
              <>
                <Status color={C.ink3}>
                  No saved setup yet for this bike and track — editing the stock baseline below.
                </Status>
                <button type="button" className="hud-btn hud-btn--ghost" onClick={applyRecommendedBaseline} style={{ marginTop: "8px" }}>
                  Use recommended starting point for this track
                </button>
                {baselineReasons && Object.keys(baselineReasons).length > 0 && (
                  <div className="hud-stack" style={{ gap: "4px", marginTop: "8px" }}>
                    {Object.entries(baselineReasons).map(([key, reason]) => (
                      <p className="hud-text" key={key} style={{ color: C.ink2 }}>
                        <b>{PARAM_LABELS[key] || CHOICE_LABELS[key] || key}:</b> {reason}
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

        {bike && selectedTrackId && (
          <>
            {SETUP_SECTIONS.map((section) => (
              <Panel key={section.key} title={section.label} className="sm-full lg-2">
                <div className="hud-body hud-form">
                  {section.params.map((key) => {
                    const meta = paramMeta[key];
                    if (!meta) return null;
                    return (
                      <div className="hud-field" key={key}>
                        <label className="hud-label" htmlFor={`param-${key}`}>
                          {PARAM_LABELS[key] || key}
                        </label>
                        <input
                          id={`param-${key}`}
                          className="hud-input"
                          type="number"
                          min={meta.min_value}
                          max={meta.max_value}
                          step={meta.step_value}
                          value={draftValues[key] ?? ""}
                          onChange={(e) =>
                            setDraftValues((v) => ({ ...v, [key]: Number(e.target.value) }))
                          }
                        />
                        <span className="hud-status" style={{ color: C.ink3 }}>
                          {meta.min_value}–{meta.max_value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ))}

            <Panel title="Tyres" className="sm-full lg-2">
              <div className="hud-body hud-form">
                {CHOICE_PARAMS.map((key) => (
                  <div className="hud-field wide" key={key}>
                    <span className="hud-label">{CHOICE_LABELS[key]}</span>
                    <CustomSelect
                      value={draftChoices[key] || ""}
                      onChange={(optionId) =>
                        setDraftChoices((c) => ({ ...c, [key]: optionId }))
                      }
                      options={choiceOptions[key].map((o) => ({ value: o.id, label: o.label }))}
                      placeholder="Select compound"
                    />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Save Version" tone="or" className="sm-full lg-2">
              <div className="hud-body hud-form">
                <div className="hud-field wide">
                  <label className="hud-label" htmlFor="setup-name">
                    Setup Name
                  </label>
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
                  <label className="hud-label" htmlFor="setup-summary">
                    What changed
                  </label>
                  <input
                    id="setup-summary"
                    className="hud-input"
                    value={form.change_summary}
                    onChange={(e) => setForm((f) => ({ ...f, change_summary: e.target.value }))}
                    placeholder="e.g. Softened rear to fix exit slide"
                  />
                </div>
                <div className="hud-field wide">
                  <label className="hud-label" htmlFor="setup-notes">
                    Notes
                  </label>
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
                Log a session on this setup, then open History and ask your Crew Chief for a
                debrief — the AI reads what actually happened on track and suggests the next
                version.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SetupScreen;
