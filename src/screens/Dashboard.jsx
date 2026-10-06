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
import { Hex, Panel, Status, Triple } from "../components/ui/Hud";
import Tachometer from "../components/ui/Tachometer";
import { C, chart } from "../styles/theme";

const Dashboard = ({ settings, sessions, onAddSession }) => {
  const chrono = [...sessions].sort((a, b) => new Date(a.run_at) - new Date(b.run_at));

  const totalSessions = sessions.length;
  const totalLaps = sessions.reduce((a, s) => a + (s.lap_count || 0), 0);
  const bestLapDelta =
    chrono.length > 1
      ? ((chrono[chrono.length - 1].best_lap_ms - chrono[0].best_lap_ms) / 1000).toFixed(3)
      : null;
  const standing = settings?.standing || "P—";

  const today = new Date().toDateString();
  const minutesToday = sessions
    .filter((s) => new Date(s.run_at).toDateString() === today)
    .reduce((ms, s) => ms + (s.lap_count || 0) * (s.avg_lap_ms || s.best_lap_ms || 0), 0) / 60000;

  const sparkData = chrono.slice(-10).map((s, i) => ({
    session: i + 1,
    lap: s.best_lap_ms ? Number((s.best_lap_ms / 1000).toFixed(3)) : 0,
  }));

  const goalMinutes = Math.min(minutesToday, 60).toFixed(0);
  const goalPct = Math.min(minutesToday / 60, 1);

  const riderNumber = settings?.riderNumber
    ? "#" + String(settings.riderNumber).replace(/^#/, "")
    : "#0";

  const stats = [
    { label: "Sessions", short: "Sessions", value: totalSessions },
    { label: "Total Laps", short: "Laps", value: totalLaps },
    {
      label: "Lap Delta",
      short: "Lap Delta",
      value: bestLapDelta ? (bestLapDelta > 0 ? "+" : "") + bestLapDelta + "s" : "—",
      color: bestLapDelta === null ? C.ink : bestLapDelta < 0 ? C.cyan : C.orange,
    },
  ];

  const trend =
    bestLapDelta === null
      ? "Log 2 sessions for lap delta"
      : bestLapDelta < 0
        ? "Faster than first session"
        : bestLapDelta > 0
          ? "Slower than first session"
          : "Level with first session";

  return (
    <div>
      {/* Rider hero */}
      <section className="hud-hero" aria-label="Rider">
        <div className="hud-hero__main">
          <div className="hud-hero__left">
            <span className="hud-hero__tab hud-hero__tab--top">Standing</span>
            <div className="hud-hero__big">{standing}</div>
            <span className="hud-hero__tab hud-hero__tab--bot">{riderNumber}</span>
          </div>

          <div className="hud-hero__hex">
            <Hex
              pct={goalPct}
              text={goalMinutes}
              sub="MIN / 60"
              label={`Daily session goal: ${goalMinutes} of 60 minutes`}
            />
          </div>

          <div className="hud-hero__right">
            <div className="hud-hero__slab hud-hero__slab--top cy">
              <span>{settings?.riderName || "Rider"}</span>
            </div>
            <div className="hud-hero__slab hud-hero__slab--bot hud-hero__slab--sm">
              <span>{settings?.team || "No Team Set"}</span>
            </div>
          </div>
        </div>
        <div className="hud-hero__foot">
          <span>{settings?.class_ || "MotoGP"} Rider</span>
          <span className="cy">{settings?.bikeName || "—"}</span>
        </div>
      </section>

      <div className="hud-grid">
        {/* Stats */}
        <Panel title="Session Stats" className="dash-stats">
          <div className="dash-stats__triple">
            <Triple
              items={[
                { label: stats[0].short, value: stats[0].value },
                { label: stats[1].short, value: stats[1].value },
                { label: stats[2].short, value: stats[2].value, color: stats[2].color },
              ]}
            />
          </div>
          <div className="hud-rows hud-rows--nohead dash-stats__rows">
            {stats.map((stat) => (
              <div className="hud-row" key={stat.label}>
                <span>{stat.label}</span>
                <span className="hud-row__num" style={{ color: stat.color }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
          <div className="hud-grow" />
          <Status>{trend}</Status>
        </Panel>

        {/* Gauges */}
        <Panel title="Performance">
          <div className="hud-gauges">
            <Tachometer value={settings?.consistency || 72} max={100} label="Consistency" color={C.cyan} />
            <Tachometer value={settings?.aggression || 85} max={100} label="Aggression" color={C.orange} />
            <Tachometer value={settings?.setup || 60} max={100} label="Setup Score" color={C.ink} />
          </div>
        </Panel>

        {/* Daily goal */}
        <Panel title="Daily Goal" align="left">
          <div className="hud-body">
            <div className="hud-kicker cy" style={{ fontSize: "20px" }}>
              {goalMinutes}m / 60m
            </div>
            <p className="hud-text" style={{ marginTop: "6px" }}>
              Time on track today, computed from laps actually logged. 1 hour daily keeps your
              muscle memory sharp — log every session to keep this accurate.
            </p>
          </div>
          <div className="hud-grow" />
          <div
            className="hud-bar"
            role="progressbar"
            aria-label="Daily session goal"
            aria-valuemin={0}
            aria-valuemax={60}
            aria-valuenow={Number(goalMinutes)}
          >
            <div className="hud-bar__fill" style={{ width: `${Math.min((minutesToday / 60) * 100, 100)}%` }} />
          </div>
        </Panel>

        {/* Pace chart */}
        <Panel title="Pace Trend">
          <div className="hud-well hud-grow" style={{ minHeight: "150px" }}>
            {sparkData.length > 1 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={sparkData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} />
                  <XAxis dataKey="session" tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
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
                    dot={{ fill: C.cyan, r: 3, strokeWidth: 0 }}
                    activeDot={{ fill: C.orange, r: 5, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="hud-empty" style={{ paddingTop: "52px" }}>
                Log 2 sessions to plot pace
              </div>
            )}
          </div>
          <div className="hud-status" style={{ color: C.ink2, fontSize: "11px" }}>
            Last 10 sessions
          </div>
        </Panel>

        <div className="span-full">
          <button type="button" className="hud-btn" onClick={onAddSession}>
            <Icon name="plus" size={16} color="#fff" /> Log Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
