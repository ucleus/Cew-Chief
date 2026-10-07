const BASE = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
};

export const DriversApi = {
  list: () => api.get("drivers.php"),
  findOrCreate: (name, styleNotes) => api.post("drivers.php", { name, style_notes: styleNotes }),
  updateStyleNotes: (id, styleNotes) => api.patch(`drivers.php?id=${id}`, { style_notes: styleNotes }),
};

export const CarsApi = {
  list: () => api.get("ac_cars.php"),
  get: (id) => api.get(`ac_cars.php?id=${id}`),
  create: (payload) => api.post("ac_cars.php", payload),
  update: (id, payload) => api.patch(`ac_cars.php?id=${id}`, payload),
};

export const CarRangesApi = {
  list: (carId) => api.get(`ac_car_ranges.php?car_id=${carId}`),
  upsert: (payload) => api.post("ac_car_ranges.php", payload),
  update: (id, payload) => api.patch(`ac_car_ranges.php?id=${id}`, payload),
};

export const TireCompoundsApi = {
  list: (carId) => api.get(`ac_tire_compounds.php?car_id=${carId}`),
  create: (payload) => api.post("ac_tire_compounds.php", payload),
};

export const TracksApi = {
  list: () => api.get("ac_tracks.php"),
  get: (id) => api.get(`ac_tracks.php?id=${id}`),
  create: (payload) => api.post("ac_tracks.php", payload),
  update: (id, payload) => api.patch(`ac_tracks.php?id=${id}`, payload),
};

export const SetupsApi = {
  chain: (carId, trackId) => api.get(`ac_setups.php?car_id=${carId}&track_id=${trackId}`),
  get: (id) => api.get(`ac_setups.php?id=${id}`),
  create: (payload) => api.post("ac_setups.php", payload),
};

export const StintsApi = {
  listBySetup: (setupId) => api.get(`ac_stints.php?setup_id=${setupId}`),
  listByCar: (carId, trackId) =>
    api.get(`ac_stints.php?car_id=${carId}${trackId ? `&track_id=${trackId}` : ""}`),
  create: (payload) => api.post("ac_stints.php", payload),
};

export const RecommendationsApi = {
  listByStint: (stintId) => api.get(`ac_recommendations.php?stint_id=${stintId}`),
  create: (payload) => api.post("ac_recommendations.php", payload),
  updateStatus: (id, payload) => api.patch(`ac_recommendations.php?id=${id}`, payload),
};

export const RecItemsApi = {
  setAccepted: (id, accepted) => api.patch(`ac_rec_items.php?id=${id}`, { accepted }),
};

export const ComputeApi = {
  run: (payload) => api.post("ac_compute.php", payload),
};
