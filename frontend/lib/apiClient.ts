import { getApiBase } from './apiBase';

export { getApiBase, getPublicAssetOrigin } from './apiBase';

export type Role = 'Voter' | 'ElectionOfficer' | 'ElectionBoard' | 'SystemAdmin' | 'AuditAuthority';

export async function apiGet(path: string, role: Role) {
  const res = await safeFetch(`${getApiBase()}${path}`, {
    headers: withAuthHeaders({ 'X-Role': role }),
  });
  return parseResponse(res);
}

export async function apiPost(path: string, role: Role, body?: unknown) {
  const res = await safeFetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: withAuthHeaders({
      'X-Role': role,
      'Content-Type': 'application/json',
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse(res);
}

export async function apiPatch(path: string, role: Role, body?: unknown) {
  const res = await safeFetch(`${getApiBase()}${path}`, {
    method: 'PATCH',
    headers: withAuthHeaders({
      'X-Role': role,
      'Content-Type': 'application/json',
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse(res);
}

export async function apiDelete(path: string, role: Role) {
  const res = await safeFetch(`${getApiBase()}${path}`, {
    method: 'DELETE',
    headers: withAuthHeaders({ 'X-Role': role }),
  });
  return parseResponse(res);
}

function withAuthHeaders(baseHeaders: Record<string, string>) {
  if (typeof window === 'undefined') return baseHeaders;
  const raw = localStorage.getItem('evoting.user');
  if (!raw) return baseHeaders;
  try {
    const user = JSON.parse(raw) as { id?: number };
    if (user?.id) {
      return { ...baseHeaders, 'X-User-Id': String(user.id) };
    }
  } catch {
    return baseHeaders;
  }
  return baseHeaders;
}

async function parseResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? 'Request failed');
  }
  return data;
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Backend API is not reachable. Start Flask (e.g. python backend/app.py on port 5000) and ensure Next rewrites /api to the backend, or set NEXT_PUBLIC_API_BASE_URL.'
      );
    }
    throw error;
  }
}
