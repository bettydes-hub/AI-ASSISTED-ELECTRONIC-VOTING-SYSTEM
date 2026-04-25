/**
 * API URL for browser and server.
 *
 * Default (no env): same-origin `/api` so Next.js can rewrite to Flask — avoids CORS and
 * "Failed to fetch" when you open the UI as 127.0.0.1, a LAN IP, or another hostname.
 *
 * Set NEXT_PUBLIC_API_BASE_URL if the API is elsewhere (e.g. http://192.168.1.5:5000/api).
 */
export function getApiBase(): string {
  const env = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_BASE_URL?.trim() : undefined;
  if (env) {
    const base = env.replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return 'http://127.0.0.1:5000/api';
}

/** Origin for static file URLs (e.g. party logos) — matches API host when using env override. */
export function getPublicAssetOrigin(): string {
  const env = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_BASE_URL?.trim() : undefined;
  if (env) {
    try {
      const withoutTrailing = env.replace(/\/+$/, '');
      const withoutApi = withoutTrailing.endsWith('/api') ? withoutTrailing.slice(0, -4) : withoutTrailing;
      return new URL(withoutApi).origin;
    } catch {
      return 'http://127.0.0.1:5000';
    }
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://127.0.0.1:5000';
}
