import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "../components/ui/Icon";
import { Panel, Status } from "../components/ui/Hud";
import RecommendationPanel from "../components/session/RecommendationPanel";
import TrackMap from "../components/ui/TrackMap";
import { MAP_VIEWBOX, TRACK_MAPS } from "../data/trackMaps";
import { BikesApi, SetupsApi, TracksApi } from "../api/client";
import { C, chart } from "../styles/theme";

function bestSectors(laps) {
  const best = {};
  for (const lap of laps || []) {
    if (!lap.is_valid) continue;
    for (const key of ["sector1_ms", "sector2_ms", "sector3_ms"]) {
      if (lap[key] != null && (best[key] == null || lap[key] < best[key])) best[key] = lap[key];
    }
  }
  return Object.keys(best).length ? best : null;
}

const HistoryScreen = ({ settings, sessions, onSetupApplied }) => {
  const [tracks, setTracks] = useState([]);
  const [bike, setBike] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [setupsById, setSetupsById] = useState({});
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    TracksApi.list().then(setTracks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings?.bikeId) return;
    BikesApi.get(settings.bikeId).then(setBike).catch(() => {});
  }, [settings?.bikeId]);

  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));

  const data = sessions
    .slice()
    .reverse()
    .map((s, i) => ({
      name: `S${i + 1}`,
      lap: s.best_lap_ms ? s.best_lap_ms / 1000 : 0,
    }));

  const toggleExpand = async (session) => {
    if (expandedId === session.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(session.id);
    if (!setupsById[session.setup_id]) {
      setSetupLoading(true);
      try {
        const setup = await SetupsApi.get(session.setup_id);
        setSetupsById((m) => ({ ...m, [session.setup_id]: setup }));
      } finally {
        setSetupLoading(false);
      }
    }
  };

  return (
    <div>
      <div className="hud-pagehead">
        <Icon name="chart" size={16} color={C.orange} />
        <h2>Progress Archive</h2>
        <span className="hud-pagehead__meta">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
        </span>
      </div>

      {sessions.length === 0 ? (
        <Panel>
          <div className="hud-empty" style={{ padding: "48px 16px" }}>
            <Icon name="chart" size={40} color={C.cyanFill} />
            <p style={{ margin: "16px 0 6px", color: C.ink }}>No sessions logged</p>
            <p className="hud-text" style={{ textTransform: "none", letterSpacing: 0 }}>
              Start racing and log your sessions to track progress.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="hud-grid">
          {data.some((d) => d.lap > 0) && (
            <Panel
              title="Best Lap Progression"
              className="sm-full md-full lg-2"
              style={{ alignSelf: "start" }}
            >
              <div className="hud-well">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} />
                    <XAxis dataKey="name" tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
                    <YAxis width={36} tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
                    <Tooltip
                      contentStyle={chart.tooltip}
                      cursor={{ stroke: C.cyanFill }}
                      formatter={(v) => [v.toFixed(3) + "s", "Best Lap"]}
                    />
                    <Line
                      type="linear"
                      dataKey="lap"
                      stroke={C.cyan}
                      strokeWidth={2}
                      dot={{ fill: C.cyan, r: 4, strokeWidth: 0 }}
                      activeDot={{ fill: C.orange, r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          <Panel
            title="Session Log"
            className={data.some((d) => d.lap > 0) ? "sm-full md-full lg-2" : "span-full"}
          >
            <div className="hud-entries hud-stack" style={{ gap: 0 }}>
              {[...sessions].reverse().map((s) => {
                const track = trackById[s.track_id];
                const setup = setupsById[s.setup_id];
                const expanded = expandedId === s.id;
                return (
                  <article key={s.id} className="hud-entry">
                    <div className="hud-entry__head">
                      <div style={{ minWidth: 0 }}>
                        <div className="hud-entry__title">{track?.name || "Unknown Track"}</div>
                        <div className="hud-entry__sub">
                          {new Date(s.run_at).toLocaleDateString()} · {s.session_type} ·{" "}
                          {s.setup_name ? `v${s.setup_version} ${s.setup_name}` : "setup"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="hud-entry__lap">{(s.best_lap_ms / 1000).toFixed(3)}s</div>
                        <div className="hud-entry__sub" style={{ whiteSpace: "nowrap" }}>
                          {s.lap_count} laps · {s.weather}
                        </div>
                      </div>
                    </div>

                    <div className="hud-tags">
                      {s.tyre_front_temp && <span className="hud-tag">Front tyre {s.tyre_front_temp}</span>}
                      {s.tyre_rear_temp && <span className="hud-tag">Rear tyre {s.tyre_rear_temp}</span>}
                      {s.hit_limiter ? <span className="hud-tag hud-tag--solid">Hit limiter</span> : null}
                      {(s.feedback || []).map((f) => (
                        <span key={f.id} className="hud-tag">
                          {f.symptom} ({f.severity}/5)
                        </span>
                      ))}
                    </div>
                    {s.driver_notes && <p className="hud-entry__notes">{s.driver_notes}</p>}

                    {track && TRACK_MAPS[track.name] && bestSectors(s.laps) && (
                      <div style={{ maxWidth: "320px", margin: "8px 0" }}>
                        <TrackMap
                          viewBox={MAP_VIEWBOX}
                          path={TRACK_MAPS[track.name].path}
                          direction={TRACK_MAPS[track.name].direction}
                          trackName={track.name}
                          sectorTimes={bestSectors(s.laps)}
                        />
                      </div>
                    )}

                    <button type="button" className="hud-link" onClick={() => toggleExpand(s)}>
                      {expanded ? "Hide debrief" : "Crew chief debrief"}
                    </button>

                    {expanded && (
                      <div style={{ marginTop: "8px" }}>
                        {setupLoading && !setup ? (
                          <Status color={C.ink3}>Loading setup data...</Status>
                        ) : setup && bike && track ? (
                          <RecommendationPanel
                            apiKey={settings?.apiKey}
                            driverProfile={settings?.driverProfile}
                            calibration={settings?.controllerCalibration}
                            bike={bike}
                            track={track}
                            setup={setup}
                            session={s}
                            onApplied={onSetupApplied}
                          />
                        ) : (
                          <Status color={C.orange}>
                            Pick your bike in Settings to enable debriefs.
                          </Status>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default HistoryScreen;
