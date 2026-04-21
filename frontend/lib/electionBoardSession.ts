export type SessionUser = {
  id: number;
  full_name: string;
  username: string;
  role: string;
  account_status?: string;
};

export function getStoredUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('evoting.user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function isElectionBoardUser(user: SessionUser | null): boolean {
  return Boolean(user && user.role === 'ElectionBoard');
}

export function getElectionBoardHeaders(withJson = false): HeadersInit {
  const headers: Record<string, string> = { 'X-Role': 'ElectionBoard' };
  if (withJson) headers['Content-Type'] = 'application/json';
  const user = getStoredUser();
  if (user?.id) {
    headers['X-User-Id'] = String(user.id);
  }
  return headers;
}

export async function boardLogout(apiBase: string): Promise<void> {
  const headers = getElectionBoardHeaders(true) as Record<string, string>;
  try {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers });
  } catch {
    // Local session cleanup is still performed by the caller.
  }
}
