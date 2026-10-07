import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, chart } from "../../styles/theme";

// Real numbers from RaceMath (api/ac_compute.php) — current setup vs the
// Quick Diagnose suggestion. Two separate charts because Hz and Nm/deg
// don't belong on the same axis.
const PhysicsCompareChart = ({ before, after }) => {
  if (!before || !after) return null;

  const freqData = ["front", "rear"].map((axle) => ({
    axle: axle === "front" ? "Front" : "Rear",
    Current: before.ride_frequency_hz?.[axle] ?? null,
    Suggested: after.ride_frequency_hz?.[axle] ?? null,
  }));

  const rollData = ["front", "rear"].map((axle) => ({
    axle: axle === "front" ? "Front" : "Rear",
    Current: before.roll_stiffness?.[`${axle}_nm_per_deg`] ?? null,
    Suggested: after.roll_stiffness?.[`${axle}_nm_per_deg`] ?? null,
  }));

  const hasFreq = freqData.some((d) => d.Current != null || d.Suggested != null);
  const hasRoll = rollData.some((d) => d.Current != null || d.Suggested != null);
  if (!hasFreq && !hasRoll) return null;

  const renderChart = (data, label, unit) => (
    <div>
      <div className="hud-status" style={{ marginBottom: "4px" }}>{label} ({unit})</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} vertical={false} />
          <XAxis dataKey="axle" tick={chart.tick} axisLine={chart.axisLine} tickLine={false} />
          <YAxis tick={chart.tick} axisLine={chart.axisLine} tickLine={false} width={40} />
          <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.grid }} formatter={(v) => [v, unit]} />
          <Legend wrapperStyle={{ fontSize: 11, color: C.ink2, textTransform: "uppercase" }} />
          <Bar dataKey="Current" fill={C.cyan} radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Suggested" fill={C.orange} radius={[2, 2, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="hud-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
      {hasFreq && <div>{renderChart(freqData, "Ride Frequency", "Hz")}</div>}
      {hasRoll && <div>{renderChart(rollData, "Roll Stiffness", "Nm/deg")}</div>}
    </div>
  );
};

export default PhysicsCompareChart;
