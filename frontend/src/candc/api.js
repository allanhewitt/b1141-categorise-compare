export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const ROOT = `${API_BASE}/api/candc`;

async function request(path, options = {}) {
  const response = await fetch(`${ROOT}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const json = (value) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

const lecturer = (key) => ({ "X-GEDL-Lecturer-Key": key });

export const candcApi = {
  activity: (id) => request(`/activities/${encodeURIComponent(id)}`),
  sessionForActivity: (id) => request(`/activities/${encodeURIComponent(id)}/session`),
  openSession: (id, key) => request(`/activities/${encodeURIComponent(id)}/sessions`, { method: "POST", headers: lecturer(key) }),
  sessionState: (sessionId) => request(`/sessions/${sessionId}/state`),
  me: (sessionId, token) => request(`/sessions/${sessionId}/me?token=${encodeURIComponent(token)}`),
  saveItem: (sessionId, token, itemId, response) => request(`/sessions/${sessionId}/response`, { method: "PUT", ...json({ token, item_id: itemId, ...response }) }),
  commit: (sessionId, token) => request(`/sessions/${sessionId}/commit`, { method: "POST", ...json({ token }) }),
  aggregate: (sessionId) => request(`/sessions/${sessionId}/aggregate`),
  reveal: (sessionId, key) => request(`/sessions/${sessionId}/reveal`, { method: "POST", headers: lecturer(key) }),
  guidance: (sessionId, token) => request(`/sessions/${sessionId}/guidance?token=${encodeURIComponent(token)}`),
  resolve: (sessionId, token, payload) => request(`/sessions/${sessionId}/resolve`, { method: "POST", ...json({ token, ...payload }) }),
  close: (sessionId, key) => request(`/sessions/${sessionId}/close`, { method: "POST", headers: lecturer(key) }),
};
