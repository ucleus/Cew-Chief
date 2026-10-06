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
import { C, chart } from "../styles/theme";

const Dashboard = ({ settings, stints, onAddStint }) => {
  const chrono = [...stints].sort((a, b) => new Date(a.run_at) - new Date(b.run_at));

  const totalStints = stints.length;
  const totalLaps = stints.reduce((a, s) => a + (s.lap_count || 0), 0);
  const bestLapDelta =
    chrono.length > 1
      ? ((chrono[chrono.length - 1].best_lap_ms - chrono[0].best_lap_ms) / 1000).toFixed(3)
      : null;

  const today = new Date().toDateString();
  const minutesToday =
    stints
      .filter((s) => new Date(s.run_at).toDateString() === today)
      .reduce((ms, s) => ms + (s.lap_count || 0) * (s.avg_lap_ms || s.best_lap_ms || 0), 0) / 60000;

  const sparkData = chrono.slice(-10).map((s, i) => ({
    stint: i + 1,
    lap: s.best_lap_ms ? Number((s.best_lap_ms / 1000).toFixed(3)) : 0,
  }));

  const goalMinutes = Math.min(minutesToday, 60).toFixed(0);
  const goalPct = Math.min(minutesToday / 60, 1);

  const stats = [
    { label: "Stints", short: "Stints", value: totalStints },
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
      ? "Log 2 stints for lap delta"
      : bestLapDelta < 0
        ? "Faster than first stint"
        : bestLapDelta > 0
          ? "Slower than first stint"
          : "Level with first stint";

  return (
    <div>
      <section className="hud-hero" aria-label="Car">
        <div className="hud-hero__main">
          <div className="hud-hero__left">
            <span className="hud-hero__tab hud-hero__tab--top">Stints</span>
            <div className="hud-hero__big">{totalStints}</div>
            <span className="hud-hero__tab hud-hero__tab--bot">Logged</span>
          </div>

          <div className="hud-hero__hex">
            <Hex pct={goalPct} text={goalMinutes} sub="MIN / 60" label={`Daily track time goal: ${goalMinutes} of 60 minutes`} />
          </div>

          <div className="hud-hero__right">
            <div className="hud-hero__slab hud-hero__slab--top cy">
              <span>{settings?.carName || "No Car Set"}</span>
            </div>
            <div className="hud-hero__slab hud-hero__slab--bot hud-hero__slab--sm">
              <span>Assetto Corsa</span>
            </div>
          </div>
        </div>
      </section>

      <div className="hud-grid">
        <Panel title="Stint Stats" className="dash-stats">
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
                <span className="hud-row__num" style={{ color: stat.color }}>{stat.value}</span>
              </div>
            ))}
          </div>
          <div className="hud-grow" />
          <Status>{trend}</Status>
        </Panel>

        <Panel title="Daily Goal" align="left">
          <div className="hud-body">
            <div className="hud-kicker cy" style={{ fontSize: "20px" }}>{goalMinutes}m / 60m</div>
            <p className="hud-text" style={{ marginTop: "6px" }}>
              Time on track today, computed from laps actually logged.
            </p>
          </div>
          <div className="hud-grow" />
          <div className="hud-bar" role="progressbar" aria-valuemin={0} aria-valuemax={60} aria-valuenow={Number(goalMinutes)}>
            <div className="hud-bar__fill" style={{ width: `${Math.min((minutesToday / 60) * 100, 100)}%` }} />
          </div>
        </Panel>

        <Panel title="Pace Trend" className="span-full">
          <div className="hud-well hud-grow" style={{ minHeight: "150px" }}>
            {sparkData.length > 1 ? (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={sparkData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} />
                  <XAxis dataKey="stint" tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
                  <YAxis width={36} tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
                  <Tooltip contentStyle={chart.tooltip} cursor={{ stroke: C.cyanFill }} formatter={(v) => [v.toFixed(3) + "s", "Best Lap"]} />
                  <Line type="linear" dataKey="lap" stroke={C.cyan} strokeWidth={2} dot={{ fill: C.cyan, r: 3, strokeWidth: 0 }} activeDot={{ fill: C.orange, r: 5, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="hud-empty" style={{ paddingTop: "52px" }}>Log 2 stints to plot pace</div>
            )}
          </div>
          <div className="hud-status" style={{ color: C.ink2, fontSize: "11px" }}>Last 10 stints</div>
        </Panel>

        <div className="span-full">
          <button type="button" className="hud-btn" onClick={onAddStint}>
            <Icon name="plus" size={16} color="#fff" /> Log Stint
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
