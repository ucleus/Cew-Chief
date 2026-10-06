import { SessionsApi } from "../api/client";

function avg(values) {
  const nums = values.filter((n) => n != null).map(Number);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function diffSetups(parent, child) {
  const changes = [];
  const keys = new Set([...Object.keys(parent.values || {}), ...Object.keys(child.values || {})]);
  for (const key of keys) {
    const from = parent.values?.[key];
    const to = child.values?.[key];
    if (from != null && to != null && Number(from) !== Number(to)) {
      changes.push({ param_key: key, from: Number(from), to: Number(to) });
    }
  }
  const choiceKeys = new Set([...Object.keys(parent.choices || {}), ...Object.keys(child.choices || {})]);
  for (const key of choiceKeys) {
    const from = parent.choices?.[key];
    const to = child.choices?.[key];
    if (from != null && to != null && from !== to) {
      changes.push({ param_key: key, from, to });
    }
  }
  return changes;
}

/**
 * Same intent as the AC side's buildHistory: for a bike+track setup chain,
 * report what changed between consecutive versions and what it did to lap
 * time, so the AI debrief doesn't repeat something that already made the
 * bike slower.
 */
export async function buildHistory(chain) {
  const sorted = [...chain].sort((a, b) => a.version - b.version);
  const sessionsBySetup = {};
  await Promise.all(
    sorted.map(async (s) => {
      sessionsBySetup[s.id] = await SessionsApi.listBySetup(s.id);
    }),
  );

  const entries = [];
  for (let i = 1; i < sorted.length; i++) {
    const parent = sorted[i - 1];
    const child = sorted[i];
    const changes = diffSetups(parent, child);
    if (!changes.length) continue;

    const parentSessions = sessionsBySetup[parent.id] || [];
    const childSessions = sessionsBySetup[child.id] || [];
    if (!parentSessions.length || !childSessions.length) continue;

    const parentBest = Math.min(...parentSessions.map((s) => s.best_lap_ms));
    const childBest = Math.min(...childSessions.map((s) => s.best_lap_ms));
    const parentAvg = avg(parentSessions.map((s) => s.avg_lap_ms || s.best_lap_ms));
    const childAvg = avg(childSessions.map((s) => s.avg_lap_ms || s.best_lap_ms));

    const latestParent = parentSessions[0];
    const latestChild = childSessions[0];
    const conditionsComparable = Math.abs(Number(latestParent.track_temp_c || 0) - Number(latestChild.track_temp_c || 0)) <= 3;

    entries.push({
      from_version: parent.version,
      to_version: child.version,
      changes,
      best_lap_delta_ms: childBest - parentBest,
      avg_lap_delta_ms: Math.round(childAvg - parentAvg),
      conditions_comparable: conditionsComparable,
      driver_verdict: latestChild.driver_notes || "",
    });
  }
  return entries;
}
