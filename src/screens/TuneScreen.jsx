import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "../components/ui/CustomSelect";
import CircuitMap from "../components/ui/CircuitMap";
import { Panel, Status } from "../components/ui/Hud";
import GarageSheet from "../components/tune/GarageSheet";
import RunReport, { EMPTY_REPORT, flaggedCorners, reportLaps } from "../components/tune/RunReport";
import CornerCard from "../components/tune/CornerCard";
import { BikesApi, RecommendationsApi, SessionsApi, SetupsApi, TracksApi } from "../api/client";
import { CLASS_TEAMS, TEAM_BIKE } from "../data/championship";
import { circuitFor } from "../data/circuits";
import { tunesFor } from "../data/communityTunes";
import { GARAGE_PARAMS, NEUTRAL_SETUP, PARAM_BY_KEY, displayValue } from "../data/garage26";
import { ENGINEER_MODEL, ENGINEER_PROMPT_VERSION, SYMPTOM_BY_KEY, askEngineer, changeSummary } from "../engineer/engineer";
import { formatDelta, formatTime, summarise } from "../utils/laptime";
import { C } from "../styles/theme";

const PICK_KEY = "mgp_tune";

function loadPick() {
  try {
    return JSON.parse(localStorage.getItem(PICK_KEY)) || {};
  } catch {
    return {};
  }
}

const differs = (a, b) => GARAGE_PARAMS.some((p) => (a?.[p.key] ?? null) !== (b?.[p.key] ?? null));
const garageOnly = (values) => Object.fromEntries(GARAGE_PARAMS.map((p) => [p.key, values?.[p.key] ?? NEUTRAL_SETUP[p.key]]));
const cornersOf = (feedback) => new Set((feedback || []).flatMap((f) => (String(f.corner_ref || "").match(/\d+/g) || []).map(Number)));

function parseNotes(setup) {
  try {
    const n = JSON.parse(setup?.notes || "");
    return n && typeof n === "object" ? n : null;
  } catch {
    return null;
  }
}

const TuneScreen = ({ settings }) => {
  const [tracks, setTracks] = useState([]);
  const [bikes, setBikes] = useState([]);
  const [pick, setPick] = useState(() => ({ team: settings?.team || "", ...loadPick() }));
  const [chain, setChain] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [baseId, setBaseId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [report, setReport] = useState(EMPTY_REPORT);
  const [loggedSessionId, setLoggedSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [openRun, setOpenRun] = useState(null);
  const [webSearch, setWebSearch] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    TracksApi.list().then(setTracks).catch((e) => setError(e.message));
    BikesApi.list({ game: "MotoGP 26", class: "MotoGP" }).then(setBikes).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(pick));
    } catch {}
  }, [pick]);

  const track = tracks.find((t) => t.id === pick.trackId);
  const bikeName = TEAM_BIKE[pick.team];
  const bike = bikes.find((b) => b.name === bikeName);
  const circuit = circuitFor(track?.name);
  const community = useMemo(() => tunesFor(track?.name), [track?.name]);

  const reload = useCallback(async () => {
    if (!bike || !track) return [];
    const [setups, sess] = await Promise.all([SetupsApi.chain(bike.id, track.id), SessionsApi.listByBike(bike.id, track.id)]);
    // Only this team's tunes on the MotoGP 26 garage (older placeholder-param setups are ignored).
    const mine = setups.filter((s) => s.name === pick.team && s.values?.trail != null).sort((a, b) => a.version - b.version);
    setChain(mine);
    setSessions(sess);
    return mine;
  }, [bike, track, pick.team]);

  // Switching track/team: load that tune and put its latest setup on the bike.
  useEffect(() => {
    setChain([]);
    setSessions([]);
    setDraft(null);
    setBaseId(null);
    setResult(null);
    setReport(EMPTY_REPORT);
    setLoggedSessionId(null);
    setSelected(null);
    reload()
      .then((mine) => {
        const last = mine[mine.length - 1];
        if (last) setDraft(garageOnly(last.values));
      })
      .catch((e) => setError(e.message));
  }, [reload]);

  const base = chain.find((s) => s.id === baseId) || chain[chain.length - 1] || null;
  const dirty = draft && (!base || differs(draft, base.values));

  const runs = useMemo(
    () =>
      chain.map((s) => {
        const own = sessions.filter((x) => x.setup_id === s.id);
        return {
          version: s.version,
          setup: s,
          sessions: own,
          summary: summarise(own.flatMap((x) => x.laps || [])),
          flags: cornersOf(own.flatMap((x) => x.feedback || [])),
          feel: own.flatMap((x) => x.feedback || []),
        };
      }),
    [chain, sessions],
  );
  const ridden = runs.filter((r) => r.summary);
  const lastRun = ridden[ridden.length - 1];
  const prevRun = ridden[ridden.length - 2];
  const nextRunNo = ridden.length + 1;

  // ---- what the map shows -------------------------------------------------
  const entered = summarise(reportLaps(report));
  const reportFlags = flaggedCorners(report);
  const cornerStates = useMemo(() => {
    const states = {};
    const now = reportFlags.size ? reportFlags : lastRun?.flags || new Set();
    const before = reportFlags.size ? lastRun?.flags || new Set() : prevRun?.flags || new Set();
    before.forEach((n) => !now.has(n) && (states[n] = "improved"));
    now.forEach((n) => (states[n] = "weak"));
    return states;
  }, [reportFlags, lastRun, prevRun]);

  const cur = entered || lastRun?.summary;
  const prev = entered ? lastRun?.summary : prevRun?.summary;
  const sectors = [0, 1, 2].map((i) => ({
    ms: cur?.sectors?.[i] ?? null,
    deltaMs: cur?.sectors?.[i] != null && prev?.sectors?.[i] != null ? cur.sectors[i] - prev.sectors[i] : null,
  }));

  const ridingTips = result?.riding || parseNotes(base)?.riding || [];
  const ref = circuit?.reference;

  // ---- actions ------------------------------------------------------------
  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };

  /** The setup that's on the bike, saved as a version (reuses the current one if unchanged). */
  const saveDraft = async (summary, notes) => {
    if (base && !differs(draft, base.values)) return base;
    const created = await SetupsApi.create({
      bike_id: bike.id,
      track_id: track.id,
      name: pick.team,
      parent_setup_id: base?.id ?? null,
      purpose: "PRACTICE",
      change_summary: summary,
      notes: notes ? JSON.stringify(notes) : null,
      values: draft,
    });
    const mine = await reload();
    setBaseId(created.id);
    return mine.find((s) => s.id === created.id);
  };

  const logRun = async () => {
    if (loggedSessionId) return loggedSessionId;
    const laps = reportLaps(report);
    if (!laps.length) throw new Error("Enter at least one lap time (or all three sectors) first.");
    const setup = await saveDraft(base ? "Manual changes in the garage" : "Starting setup");
    const best = Math.min(...laps.map((l) => l.lap_ms));
    const avg = Math.round(laps.reduce((a, l) => a + l.lap_ms, 0) / laps.length);
    const created = await SessionsApi.create({
      setup_id: setup.id,
      lap_count: laps.length,
      best_lap_ms: best,
      avg_lap_ms: avg,
      laps,
      feedback: report.feel.map((f) => ({
        phase: SYMPTOM_BY_KEY[f.symptom]?.phase || "MID",
        symptom: f.symptom,
        severity: 3,
        corner_ref: f.corners.length ? f.corners.join(",") : null,
      })),
      driver_notes: report.notes || null,
    });
    setLoggedSessionId(created.id);
    await reload();
    return created.id;
  };

  const history = () =>
    ridden.map((r) => ({
      version: r.version,
      change_summary: r.setup.change_summary,
      bestMs: r.summary.bestMs,
      sectors: r.summary.sectors,
      feel: r.feel.map((f) => `${SYMPTOM_BY_KEY[f.symptom]?.label || f.symptom}${f.corner_ref ? ` @T${f.corner_ref.replaceAll(",", ",T")}` : ""}`).join("; "),
    }));

  const ask = (mode) =>
    run(mode === "baseline" ? "Engineer is building a baseline…" : "Engineer is debriefing…", async () => {
      if (mode === "debrief") await logRun();
      const answer = await askEngineer({
        mode,
        apiKey: settings?.apiKey,
        webSearch,
        track: track.name,
        team: pick.team,
        bikeName,
        circuit,
        values: draft || NEUTRAL_SETUP,
        run: mode === "debrief" ? { laps: reportLaps(report), feel: report.feel, notes: report.notes } : { notes: report.notes },
        history: history(),
        community,
        profile: settings?.driverProfile,
        calibration: settings?.controllerCalibration,
      });
      setResult({ ...answer, mode });
    });

  const applyResult = () =>
    run("Saving…", async () => {
      const notes = { headline: result.headline, riding: result.riding, expected: result.expected, focus_sector: result.focus_sector };
      const parentId = base?.id ?? null;
      const created = await SetupsApi.create({
        bike_id: bike.id,
        track_id: track.id,
        name: pick.team,
        parent_setup_id: parentId,
        purpose: "PRACTICE",
        change_summary: (result.mode === "baseline" ? "Engineer baseline" : changeSummary(result.changes)) || "Engineer: no changes",
        notes: JSON.stringify(notes),
        values: result.setup,
      });
      if (loggedSessionId) {
        const conf = ["LOW", "MEDIUM", "HIGH"].includes(result.confidence) ? result.confidence : "MEDIUM";
        const rec = await RecommendationsApi.create({
          session_id: loggedSessionId,
          source: "AI",
          provider: "anthropic",
          model: ENGINEER_MODEL,
          prompt_version: ENGINEER_PROMPT_VERSION,
          request_json: JSON.stringify(result.request),
          response_json: JSON.stringify({ ...result, request: undefined }),
          diagnosis: result.diagnosis || result.headline || "—",
          confidence: conf,
          expected_tradeoff: result.expected || "—",
          status: "APPLIED",
          input_tokens: result.usage?.input_tokens ?? null,
          output_tokens: result.usage?.output_tokens ?? null,
          items: result.changes.map((c, i) => ({
            priority: i + 1,
            param_key: c.key,
            kind: PARAM_BY_KEY[c.key]?.options ? "CHOICE" : "NUM",
            current_text: displayValue(c.key, c.from),
            suggested_text: displayValue(c.key, c.to),
            suggested_number: PARAM_BY_KEY[c.key]?.options ? null : c.to,
            rationale: c.why || "—",
            tradeoff: c.tradeoff || null,
          })),
        });
        await RecommendationsApi.updateStatus(rec.id, { applied_setup_id: created.id });
      }
      await reload();
      setBaseId(created.id);
      setDraft(garageOnly(result.setup));
      setResult(null);
      setReport(EMPTY_REPORT);
      setLoggedSessionId(null);
    });

  const logOnly = () =>
    run("Saving run…", async () => {
      await logRun();
      setReport(EMPTY_REPORT);
      setLoggedSessionId(null);
    });

  const startFrom = (values, summary) =>
    run("Saving…", async () => {
      setDraft(garageOnly(values));
      const created = await SetupsApi.create({
        bike_id: bike.id,
        track_id: track.id,
        name: pick.team,
        parent_setup_id: base?.id ?? null,
        purpose: "PRACTICE",
        change_summary: summary,
        values: garageOnly(values),
      });
      await reload();
      setBaseId(created.id);
    });

  const toggleFlag = (symptom, n) => {
    if (loggedSessionId) return;
    const has = report.feel.find((f) => f.symptom === symptom);
    const feel = has
      ? report.feel
          .map((f) => (f.symptom === symptom ? { ...f, corners: f.corners.includes(n) ? f.corners.filter((c) => c !== n) : [...f.corners, n].sort((a, b) => a - b) } : f))
          .filter((f) => f.symptom !== symptom || f.corners.length || !has.corners.includes(n))
      : [...report.feel, { symptom, corners: [n] }];
    setReport({ ...report, feel });
  };

  // ---- render -------------------------------------------------------------
  const teamOptions = CLASS_TEAMS.MotoGP.map((t) => ({ value: t, label: t }));
  const trackOptions = tracks.map((t) => ({ value: t.id, label: t.name }));
  const best = lastRun?.summary;

  return (
    <div className="cc-tune">
      <div className="cc-pick">
        <div>
          <label className="hud-label">Track</label>
          <CustomSelect value={pick.trackId} onChange={(trackId) => setPick((p) => ({ ...p, trackId }))} options={trackOptions} placeholder="Pick the track" />
        </div>
        <div>
          <label className="hud-label">Team</label>
          <CustomSelect value={pick.team} onChange={(team) => setPick((p) => ({ ...p, team }))} options={teamOptions} placeholder="Pick your team" />
        </div>
        {bikeName && <div className="cc-pick__bike">{bikeName}</div>}
      </div>

      {error && (
        <div className="hud-error" role="alert" style={{ margin: "8px 0" }}>
          {error}
        </div>
      )}

      {!track || !pick.team ? (
        <Panel>
          <div className="hud-empty" style={{ padding: "40px 16px" }}>
            <p style={{ color: C.ink, margin: 0 }}>Pick a track and your team to open the tune.</p>
          </div>
        </Panel>
      ) : !bike ? (
        <Status color={C.orange}>Loading the {bikeName || "bike"} garage…</Status>
      ) : (
        <div className="cc-tune__grid">
          {/* ---------- Map column ---------- */}
          <div className="cc-tune__map">
            <Panel title={circuit ? circuit.name : track.name}>
              {circuit ? (
                <>
                  <CircuitMap circuit={circuit} cornerStates={cornerStates} sectors={sectors} selected={selected} onSelect={setSelected} />
                  <div className="cc-legend">
                    <span><i style={{ background: C.orange }} />Problem</span>
                    <span><i style={{ background: "#4CC38A" }} />Fixed / faster</span>
                    <span><i style={{ background: C.cyan }} />Sector</span>
                  </div>
                  <CornerCard circuit={circuit} selected={selected} report={report} onToggleFlag={toggleFlag} ridingTips={ridingTips} runs={ridden} />
                </>
              ) : (
                <p className="hud-text cc-hint">No interactive map for this track yet — the engineer still works from your sector times and notes.</p>
              )}
            </Panel>

            <Panel title="Overall">
              <div className="cc-overall">
                <div>
                  <span>Best lap</span>
                  <b>{formatTime(best?.bestMs)}</b>
                  {prevRun && best && <em className={best.bestMs - prevRun.summary.bestMs <= 0 ? "up" : "down"}>{formatDelta(best.bestMs - prevRun.summary.bestMs)} vs run {prevRun.version}</em>}
                </div>
                <div>
                  <span>Ideal (best sectors)</span>
                  <b>{formatTime(best?.ideal)}</b>
                </div>
                {ref && (
                  <div>
                    <span>WR {ref.by}</span>
                    <b>{formatTime(ref.lapMs)}</b>
                    {best && <em className="down">{formatDelta(best.bestMs - ref.lapMs)}</em>}
                  </div>
                )}
                <div>
                  <span>Runs</span>
                  <b>{ridden.length}</b>
                </div>
              </div>
            </Panel>
          </div>

          {/* ---------- Tuning column ---------- */}
          <div className="cc-tune__flow">
            {!draft ? (
              <Panel title="Run 1 — choose a starting setup" hot>
                <div className="hud-stack" style={{ gap: 10 }}>
                  {community.map((t) => (
                    <div key={t.id} className="cc-baseline">
                      <div>
                        <b>{t.author}</b>
                        <span>
                          {t.bike} · {formatTime(t.lapMs)} · {t.conditions}
                        </span>
                        {t.bike !== bikeName && <em>Built on the {t.bike}; good start for the {bikeName}, expect to adjust.</em>}
                      </div>
                      <button type="button" className="hud-btn" disabled={!!busy} onClick={() => startFrom(t.values, `Baseline: ${t.author.split(" (")[0]} ${formatTime(t.lapMs)}`)}>
                        Load this tune
                      </button>
                    </div>
                  ))}
                  <button type="button" className="hud-btn hud-btn--cyan" disabled={!!busy} onClick={() => ask("baseline")}>
                    Engineer baseline {webSearch ? "(searches YouTube / Reddit)" : ""}
                  </button>
                  <label className="cc-check">
                    <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} /> Let the engineer search the web
                  </label>
                  <button type="button" className="hud-link" style={{ color: C.ink3 }} disabled={!!busy} onClick={() => startFrom(NEUTRAL_SETUP, "Neutral start")}>
                    Start from the middle of every range
                  </button>
                </div>
              </Panel>
            ) : (
              <Panel title={`Setup for run ${nextRunNo}${base ? ` · v${base.version}` : ""}`} align="left">
                {base?.change_summary && <p className="cc-summary">{base.change_summary}</p>}
                {parseNotes(base)?.headline && <p className="cc-summary" style={{ color: C.ink }}>{parseNotes(base).headline}</p>}
                <GarageSheet values={draft} baseline={base?.values} onChange={(key, v) => setDraft((d) => ({ ...d, [key]: v }))} />
                {dirty && base && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="hud-btn hud-btn--ghost" onClick={() => setDraft(garageOnly(base.values))}>
                      Undo edits
                    </button>
                    <button type="button" className="hud-btn hud-btn--cyan" disabled={!!busy} onClick={() => run("Saving…", () => saveDraft("Manual changes in the garage"))}>
                      Save as v{(chain[chain.length - 1]?.version || 0) + 1}
                    </button>
                  </div>
                )}
              </Panel>
            )}

            {draft && !result && (
              <Panel title={loggedSessionId ? `Run ${nextRunNo - 1} logged` : `Report run ${nextRunNo}`} align="left" hot>
                <RunReport report={report} onChange={(r) => !loggedSessionId && setReport(r)} circuit={circuit} />
                <label className="cc-check">
                  <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} /> Engineer may search YouTube / Reddit for this track
                </label>
                <button type="button" className="hud-btn" disabled={!!busy} onClick={() => ask("debrief")}>
                  {loggedSessionId ? "Ask the engineer again" : "Debrief me — give me the next setup"}
                </button>
                {!loggedSessionId && (
                  <button type="button" className="hud-btn hud-btn--ghost" disabled={!!busy} onClick={logOnly}>
                    Just log the times
                  </button>
                )}
              </Panel>
            )}

            {busy && (
              <Status color={C.cyan}>
                <span className="hud-spin" /> {busy}
              </Status>
            )}

            {result && (
              <Panel title={result.mode === "baseline" ? "Engineer baseline" : `Engineer · setup for run ${nextRunNo}`} align="left" hot>
                <div className="cc-result">
                  <p className="cc-result__headline">{result.headline}</p>
                  <p className="cc-result__text">{result.diagnosis}</p>
                  <div className="hud-tags">
                    <span className="hud-tag hud-tag--cy">Confidence {result.confidence || "—"}</span>
                    {result.focus_sector && <span className="hud-tag">Time is in {result.focus_sector}</span>}
                    <span className="hud-tag hud-tag--cy">{result.changes.length} change{result.changes.length === 1 ? "" : "s"}</span>
                  </div>

                  {result.changes.length > 0 && (
                    <div className="cc-changes">
                      {result.changes.map((c) => (
                        <div key={c.key} className="cc-change">
                          <div className="cc-change__head">
                            <b>{PARAM_BY_KEY[c.key]?.label}</b>
                            <span>
                              {displayValue(c.key, c.from)} → <b>{displayValue(c.key, c.to)}</b>
                            </span>
                          </div>
                          {c.why && <p>{c.why}</p>}
                          {c.tradeoff && <p className="cc-change__cost">Costs: {c.tradeoff}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="hud-label">Full setup to enter in the garage</label>
                  <GarageSheet values={result.setup} baseline={result.mode === "baseline" ? null : draft} />

                  {result.riding.length > 0 && (
                    <>
                      <label className="hud-label">Riding — tap to see it on the map</label>
                      <div className="cc-riding">
                        {result.riding.map((r, i) => (
                          <button key={i} type="button" className="cc-riding__row" onClick={() => setSelected(r.corner)}>
                            <b>T{r.corner}</b>
                            <span>{r.tip}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {result.expected && (
                    <p className="cc-result__text">
                      <b>Expect:</b> {result.expected}
                    </p>
                  )}
                  {result.calibration_note && (
                    <p className="cc-result__text">
                      <b>Controller:</b> {result.calibration_note}
                    </p>
                  )}
                  {result.sources?.length > 0 && (
                    <div className="cc-sources">
                      {result.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noreferrer">
                          {s.title || s.url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="hud-btn" disabled={!!busy} onClick={applyResult}>
                  Use this setup for run {result.mode === "baseline" ? 1 : nextRunNo}
                </button>
                <button type="button" className="hud-btn hud-btn--ghost" disabled={!!busy} onClick={() => setResult(null)}>
                  Not this one
                </button>
              </Panel>
            )}

            {runs.length > 0 && (
              <Panel title="Runs on this tune" align="left">
                <div className="cc-runs">
                  {[...runs].reverse().map((r, idx, arr) => {
                    const before = arr.slice(idx + 1).find((x) => x.summary);
                    const open = openRun === r.setup.id;
                    return (
                      <div key={r.setup.id} className={`cc-run${r.setup.id === base?.id ? " is-current" : ""}`}>
                        <button type="button" className="cc-run__head" onClick={() => setOpenRun(open ? null : r.setup.id)}>
                          <span className="cc-run__v">v{r.version}</span>
                          <span className="cc-run__what">{r.setup.change_summary || "Setup"}</span>
                          <span className="cc-run__lap">
                            {r.summary ? formatTime(r.summary.bestMs) : "not run"}
                            {r.summary && before && (
                              <em className={r.summary.bestMs - before.summary.bestMs <= 0 ? "up" : "down"}>{formatDelta(r.summary.bestMs - before.summary.bestMs)}</em>
                            )}
                          </span>
                        </button>
                        {r.summary && (
                          <div className="cc-run__sectors">
                            {r.summary.sectors.map((s, i) => {
                              const d = s != null && before?.summary?.sectors?.[i] != null ? s - before.summary.sectors[i] : null;
                              return (
                                <span key={i}>
                                  S{i + 1} {formatTime(s)}
                                  {d != null && <em className={d <= 0 ? "up" : "down"}> {formatDelta(d)}</em>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {open && (
                          <div className="cc-run__body">
                            <GarageSheet values={garageOnly(r.setup.values)} baseline={chain.find((s) => s.id === r.setup.parent_setup_id)?.values} />
                            {r.setup.id !== base?.id && (
                              <button
                                type="button"
                                className="hud-btn hud-btn--cyan"
                                onClick={() => {
                                  setBaseId(r.setup.id);
                                  setDraft(garageOnly(r.setup.values));
                                  setResult(null);
                                  setOpenRun(null);
                                }}
                              >
                                Go back to v{r.version}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TuneScreen;
