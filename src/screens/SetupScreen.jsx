import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import NumberStepper from "../components/ui/NumberStepper";
import TrackMap from "../components/ui/TrackMap";
import { MAP_VIEWBOX, TRACK_MAPS } from "../data/trackMaps";
import { BikesApi, SetupsApi, TracksApi } from "../api/client";
import {
  CHOICE_LABELS,
  CHOICE_PARAMS,
  PARAM_LABELS,
  SETUP_PURPOSE_OPTIONS,
  SETUP_SECTIONS,
  SYMPTOM_SUGGESTIONS,
  defaultChoicesFromOptions,
  defaultValuesFromParams,
} from "../data/setupParams";
import { composeDriverProfileText } from "../data/driverProfile";
import { suggestBaseline } from "../utils/motoMath";
import { C } from "../styles/theme";

const DIAGNOSE_MODEL = "claude-sonnet-4-6";

function buildDiagnosePrompt({ bike, track, draftValues, draftChoices, problems, driverProfile }) {
  const paramLines = bike.params
    .map((p) => `- ${p.param_key}: current ${draftValues[p.param_key]} (range ${p.min_value}-${p.max_value}, step ${p.step_value})`)
    .join("\n");
  const tyreLines = CHOICE_PARAMS.map((key) => {
    const current = bike.options.find((o) => o.id === draftChoices[key]);
    const options = bike.options.filter((o) => o.param_key === key).map((o) => o.kind);
    return `- ${key}: current ${current?.kind || "unset"} (choices: ${options.join(", ")})`;
  }).join("\n");

  const system = `You are the head race engineer and crew chief for a MotoGP team — world class, no-nonsense, technical. You speak directly, like a seasoned race engineer who has won multiple world championships. You do NOT coddle the rider. You give exact numbers within the allowed ranges, explain the physics, and tell them exactly what will happen if they don't follow the setup.

This request has no session data — no lap times, no telemetry. You are working from the rider's description of the problem alone, plus their standing profile. Say so plainly if that limits your confidence.

Always respond in this EXACT JSON format (no markdown, no extra text):
{
  "headline": "One brutal honest assessment sentence",
  "diagnosis": "What the reported problem suggests, in technical detail",
  "confidence": "LOW|MEDIUM|HIGH",
  "expected_tradeoff": "What the rider gives up by taking this advice",
  "items": [
    {"priority": 1, "param_key": "<one of the numeric param_keys>", "kind": "NUM", "suggested_number": <int within its range>, "addresses": "<symptom this fixes>", "rationale": "<physics explanation>", "tradeoff": "<what gets worse>"},
    {"priority": 2, "param_key": "tyre_front or tyre_rear", "kind": "CHOICE", "suggested_option": "SOFT|MEDIUM|HARD|WET", "addresses": "...", "rationale": "...", "tradeoff": "..."}
  ],
  "coach_notes": "A brutally honest, technically deep paragraph — what the rider MUST do next session"
}
Recommend one primary change and at most three secondary changes. Only include items worth changing. Stay strictly within each param's given range. With no session data, confidence should rarely be HIGH.`;

  const user = `Bike: ${bike.name} (${bike.class}, ${bike.game})
Track: ${track.name}, ${track.country || ""}

Current setup:
${paramLines}
${tyreLines}

Reported problem(s): ${problems.length ? problems.join("; ") : "none picked"}
Driver profile (standing self-report): ${composeDriverProfileText(driverProfile) || "none given"}

Diagnose the problem and give a championship-level setup correction, working from the current setup above.`;

  return { system, user };
}

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

  const [problems, setProblems] = useState([]);
  const [customProblem, setCustomProblem] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState("");
  const [diagnoseResult, setDiagnoseResult] = useState(null);
  const toggleProblem = (p) =>
    setProblems((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

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
    const { values, choices, reasons } = suggestBaseline({ bike, track, driverProfile: settings?.driverProfile });
    setDraftValues((v) => ({ ...v, ...values }));
    setDraftChoices((c) => ({ ...c, ...choices }));
    setBaselineReasons(reasons);
    setForm((f) => ({ ...f, change_summary: `Recommended starting point for ${track.name}` }));
  };

  const runQuickDiagnose = async () => {
    if (!bike || !track) return;
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
      const { system, user } = buildDiagnosePrompt({
        bike,
        track,
        draftValues,
        draftChoices,
        problems: allProblems,
        driverProfile: settings?.driverProfile,
      });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: DIAGNOSE_MODEL,
          max_tokens: 2000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const appliedItems = [];
      for (const item of parsed.items || []) {
        if (item.kind === "CHOICE") {
          const option = bike.options.find((o) => o.param_key === item.param_key && o.kind === item.suggested_option);
          if (!option) continue;
          appliedItems.push({
            ...item,
            current_text: bike.options.find((o) => o.id === draftChoices[item.param_key])?.kind || "unset",
            suggested_text: option.kind,
          });
          setDraftChoices((c) => ({ ...c, [item.param_key]: option.id }));
        } else {
          const meta = paramMeta[item.param_key];
          if (!meta) continue;
          const suggested = Math.min(Number(meta.max_value), Math.max(Number(meta.min_value), Number(item.suggested_number)));
          appliedItems.push({
            ...item,
            current_text: String(draftValues[item.param_key] ?? ""),
            suggested_text: String(suggested),
          });
          setDraftValues((v) => ({ ...v, [item.param_key]: suggested }));
        }
      }

      setDiagnoseResult({ ...parsed, items: appliedItems });
      setForm((f) => ({ ...f, change_summary: parsed.headline || `Diagnosed: ${allProblems.join(", ")}` }));
    } catch (e) {
      setDiagnoseError(e.message);
    }
    setDiagnosing(false);
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

        {track && TRACK_MAPS[track.name] && (
          <Panel title="Track Map" icon={<Icon name="map" size={14} color={C.cyan} />} className="sm-full md-full lg-2">
            <TrackMap
              viewBox={MAP_VIEWBOX}
              path={TRACK_MAPS[track.name].path}
              direction={TRACK_MAPS[track.name].direction}
              trackName={track.name}
            />
          </Panel>
        )}

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
            <Panel title="Quick Diagnose" tone="or" icon={<Icon name="zap" size={14} color={C.orange} />} className="span-full">
              <div className="hud-body">
                <p className="hud-text" style={{ textTransform: "none", color: C.ink2 }}>
                  No session needed — pick what's wrong and the Crew Chief will adjust the setup
                  below directly. Less certain than a debrief grounded in real lap data (History
                  tab, after you've logged a session), but faster.
                </p>
                <div className="hud-chips">
                  {SYMPTOM_SUGGESTIONS.map((p) => (
                    <button
                      type="button"
                      key={p}
                      className="hud-chip"
                      aria-pressed={problems.includes(p)}
                      onClick={() => toggleProblem(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <textarea
                  className="hud-input"
                  value={customProblem}
                  onChange={(e) => setCustomProblem(e.target.value)}
                  placeholder="Describe anything else — e.g. 'I can't hold my line through Turn 9'"
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
                        <span className="hud-tag">{PARAM_LABELS[item.param_key] || CHOICE_LABELS[item.param_key] || item.param_key}</span>
                        <span>{item.current_text} → {item.suggested_text}</span>
                      </div>
                      <p className="hud-text">{item.rationale}</p>
                      {item.tradeoff && <p className="hud-text" style={{ color: C.ink2 }}>Tradeoff: {item.tradeoff}</p>}
                    </div>
                  ))}
                  <p className="hud-text" style={{ color: C.ink2 }}>
                    Applied to the setup below — adjust anything you want, then Save as New Version.
                  </p>
                </div>
              )}
            </Panel>

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
                        <NumberStepper
                          id={`param-${key}`}
                          min={meta.min_value}
                          max={meta.max_value}
                          step={meta.step_value}
                          value={draftValues[key] ?? ""}
                          onChange={(v) => setDraftValues((cur) => ({ ...cur, [key]: v }))}
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
