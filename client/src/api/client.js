import axios from 'axios';

let accessToken = null;
let onSessionExpired = () => {};

export const setAccessToken = (t) => {
  accessToken = t;
};

export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  // never send empty filters (?status=): the API rejects empty enum values
  if (cfg.params && typeof cfg.params === 'object') {
    cfg.params = Object.fromEntries(
      Object.entries(cfg.params).filter(([, v]) => v !== '' && v !== undefined && v !== null)
    );
  }
  if (accessToken) {
    cfg.headers.Authorization = `Bearer ${accessToken}`;
  }
  return cfg;
});

let refreshing = null;

/** One refresh call at a time, shared by the interceptor and AuthContext */
export function refreshSession() {
  refreshing ??= api.post('/auth/refresh').finally(() => {
    refreshing = null;
  });
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        const { data } = await refreshSession();
        setAccessToken(data.accessToken);
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired();
      }
    }
    return Promise.reject(err);
  }
);

/** Normalise any API error into { code, message, field } for the UI */
export function toApiError(err) {
  const e = err?.response?.data?.error;
  return {
    code: e?.code ?? 'NETWORK',
    message: e?.message ?? 'Something went wrong. Please try again.',
    field: e?.details?.field,
    details: e?.details,
  };
}

