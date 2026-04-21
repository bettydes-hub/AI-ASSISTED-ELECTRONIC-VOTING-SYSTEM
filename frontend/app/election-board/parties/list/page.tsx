'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getApiBase, getPublicAssetOrigin } from '../../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../../lib/electionBoardMessages';
import { readApiBody } from '../../../../lib/readApiBody';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../../lib/electionBoardSession';

type Party = {
  id: number;
  name: string;
  scope_level?: 'NATIONAL' | 'REGIONAL';
  region_id?: number | null;
  abbreviation: string | null;
  registration_number: string | null;
  operational_status: string;
  approval_status: string;
  leader_name: string;
  logo_url: string | null;
  updated_at: string | null;
};
type Region = { id: number; name: string };

function fileHref(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getPublicAssetOrigin()}${url}`;
}

export default function ElectionBoardPartiesListPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [parties, setParties] = useState<Party[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadParties() {
    setLoading(true);
    setError('');
    try {
      const [partyRes, regionRes] = await Promise.all([
        fetch(`${getApiBase()}/parties`, { headers: getElectionBoardHeaders() }),
        fetch(`${getApiBase()}/regions`, { headers: getElectionBoardHeaders() }),
      ]);
      const data = await readApiBody(partyRes);
      const regionData = await readApiBody(regionRes);
      if (!partyRes.ok) throw new Error(toElectionBoardMessage(String(data.error ?? 'Failed parties')));
      if (!regionRes.ok) throw new Error(toElectionBoardMessage(String(regionData.error ?? 'Failed regions')));
      setParties((data.items as Party[]) ?? []);
      setRegions((regionData.items as Region[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parties');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadParties().catch((e: Error) => setError(e.message));
  }, []);

  async function deleteParty(partyId: number) {
    if (!window.confirm('Delete this party?')) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/parties/${partyId}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(toElectionBoardMessage(String(data.error ?? 'Delete party failed')));
    setMessage('Party deleted.');
    await loadParties();
  }

  async function onLogout() {
    await boardLogout(getApiBase());
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
    router.push('/login');
  }

  if (!sessionChecked) return <section><p>Checking session...</p></section>;
  if (!authorized) {
    return (
      <section>
        <h1>Party List</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Party List</h1>
          <p className="muted">View and manage all registered parties.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={loadParties}>Refresh</button>
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties">Add Party</Link>
        <Link href="/election-board/parties/list" className="active">Party List</Link>
        <Link href="/election-board/candidates/list">Candidates</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      {loading ? <p className="status-banner">Loading parties...</p> : null}
      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel">
        {parties.length === 0 ? <p className="muted">No parties added yet.</p> : null}
        {parties.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Scope</th>
                  <th>Region</th>
                  <th>Leader</th>
                  <th>Reg. #</th>
                  <th>Ops</th>
                  <th>Approval</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id}>
                    <td>{party.id}</td>
                    <td>
                      {party.logo_url ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileHref(party.logo_url) ?? ''} alt="" width={26} height={26} style={{ borderRadius: 4, objectFit: 'cover' }} />
                          {party.name}
                        </span>
                      ) : (
                        party.name
                      )}
                    </td>
                    <td>{party.scope_level ?? 'NATIONAL'}</td>
                    <td>
                      {party.scope_level === 'REGIONAL'
                        ? (regions.find((region) => region.id === party.region_id)?.name ?? 'Region not set')
                        : 'All regions'}
                    </td>
                    <td>{party.leader_name || '-'}</td>
                    <td>{party.registration_number || '—'}</td>
                    <td>{party.operational_status}</td>
                    <td>{party.approval_status}</td>
                    <td>{party.updated_at ? new Date(party.updated_at).toLocaleString() : '-'}</td>
                    <td>
                      <button type="button" onClick={() => deleteParty(party.id)}>Delete</button>{' '}
                      <Link href="/election-board/parties">Add / Edit page</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
