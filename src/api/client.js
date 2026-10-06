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
  findOrCreate: (name, styleNotes) => api.post("drivers.php", { name, style_notes: styleNotes }),
};

export const TracksApi = {
  list: () => api.get("mg_tracks.php"),
};

export const BikesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`mg_bikes.php${qs ? `?${qs}` : ""}`);
  },
  get: (id) => api.get(`mg_bikes.php?id=${id}`),
};

export const SetupsApi = {
  chain: (bikeId, trackId) => api.get(`mg_setups.php?bike_id=${bikeId}&track_id=${trackId}`),
  get: (id) => api.get(`mg_setups.php?id=${id}`),
  create: (payload) => api.post("mg_setups.php", payload),
};

export const SessionsApi = {
  listBySetup: (setupId) => api.get(`mg_sessions.php?setup_id=${setupId}`),
  listByBike: (bikeId, trackId) =>
    api.get(`mg_sessions.php?bike_id=${bikeId}${trackId ? `&track_id=${trackId}` : ""}`),
  create: (payload) => api.post("mg_sessions.php", payload),
};

export const RecommendationsApi = {
  listBySession: (sessionId) => api.get(`mg_recommendations.php?session_id=${sessionId}`),
  create: (payload) => api.post("mg_recommendations.php", payload),
  updateStatus: (id, payload) => api.patch(`mg_recommendations.php?id=${id}`, payload),
};

export const RecItemsApi = {
  setAccepted: (id, accepted) => api.patch(`mg_rec_items.php?id=${id}`, { accepted }),
};
