// Thin fetch wrapper: JSON in/out, cookie session, typed errors with per-field messages,
// and the server's X-Response-Time captured for the speed badge.

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

let lastMs: number | null = null;
const listeners = new Set<(ms: number) => void>();
export const onTiming = (fn: (ms: number) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const lastTiming = () => lastMs;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  const ms = Number(res.headers.get('X-Response-Time'));
  if (ms) { lastMs = ms; listeners.forEach((l) => l(ms)); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.fields ?? {});
  return data as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const put = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; summary?: Record<string, number> }

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
};
