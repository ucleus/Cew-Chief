import { StintsApi } from "../api/client";
import { CAR_PARAM_LABELS, CORNERS, CORNER_PARAM_LABELS } from "../data/acParams";

const CAR_KEYS = Object.keys(CAR_PARAM_LABELS);
const CORNER_KEYS = Object.keys(CORNER_PARAM_LABELS);

function avg(values) {
  const nums = values.filter((n) => n != null).map(Number);
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function diffSetups(parent, child) {
  const changes = [];
  for (const key of CAR_KEYS) {
    const from = parent[key];
    const to = child[key];
    if (from != null && to != null && Number(from) !== Number(to)) {
      changes.push({ param_key: key, scope: "CAR", from: Number(from), to: Number(to) });
    }
  }
  for (const corner of CORNERS) {
    const pFrom = parent.corners?.[corner] || {};
    const pTo = child.corners?.[corner] || {};
    for (const key of CORNER_KEYS) {
      const from = pFrom[key];
      const to = pTo[key];
      if (from != null && to != null && Number(from) !== Number(to)) {
        changes.push({ param_key: key, scope: corner, from: Number(from), to: Number(to) });
      }
    }
  }
  return changes;
}

/**
 * For a setup chain (oldest to newest), finds each consecutive pair with
 * changes and stints on both sides, and reports what changed plus what it
 * did to lap time — so the AI debrief can avoid repeating something that
 * already made the car slower.
 */
export async function buildHistory(chain) {
  const sorted = [...chain].sort((a, b) => a.version - b.version);
  const stintsBySetup = {};
  await Promise.all(
    sorted.map(async (s) => {
      stintsBySetup[s.id] = await StintsApi.listBySetup(s.id);
    }),
  );

  const entries = [];
  for (let i = 1; i < sorted.length; i++) {
    const parent = sorted[i - 1];
    const child = sorted[i];
    const changes = diffSetups(parent, child);
    if (!changes.length) continue;

    const parentStints = stintsBySetup[parent.id] || [];
    const childStints = stintsBySetup[child.id] || [];
    if (!parentStints.length || !childStints.length) continue;

    const parentBest = Math.min(...parentStints.map((s) => s.best_lap_ms));
    const childBest = Math.min(...childStints.map((s) => s.best_lap_ms));
    const parentAvg = avg(parentStints.map((s) => s.avg_lap_ms || s.best_lap_ms));
    const childAvg = avg(childStints.map((s) => s.avg_lap_ms || s.best_lap_ms));

    const latestParent = parentStints[0];
    const latestChild = childStints[0];
    const conditionsComparable = Math.abs(Number(latestParent.track_temp_c) - Number(latestChild.track_temp_c)) <= 3;

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
