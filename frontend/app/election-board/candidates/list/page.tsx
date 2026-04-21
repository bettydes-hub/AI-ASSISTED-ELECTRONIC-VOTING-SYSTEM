'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getApiBase, getPublicAssetOrigin } from '../../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../../lib/electionBoardMessages';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../../lib/electionBoardSession';

type Election = { id: number; title: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' };
type Party = { id: number; name: string };
type Candidate = {
  id: number;
  name: string;
  party_id: number;
  running_position?: string;
  candidate_status?: string;
  region_district?: string;
  profile_info?: string;
  photo_url?: string | null;
};

export default function ElectionBoardCandidatesListPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );
  const editingLocked = selectedElection?.status === 'ACTIVE';
  const partiesById = useMemo(
    () => Object.fromEntries(parties.map((party) => [party.id, party.name])),
    [parties]
  );

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadBaseData().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedElectionId) return;
    loadCandidates(selectedElectionId).catch((e: Error) => setError(e.message));
  }, [selectedElectionId]);

  async function loadBaseData() {
    setError('');
    const [eRes, pRes] = await Promise.all([
      fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/parties`, { headers: getElectionBoardHeaders() }),
    ]);
    const eData = await eRes.json();
    const pData = await pRes.json();
    if (!eRes.ok) throw new Error(toElectionBoardMessage(eData.error ?? 'Failed elections'));
    if (!pRes.ok) throw new Error(toElectionBoardMessage(pData.error ?? 'Failed parties'));
    const electionRows: Election[] = eData.items ?? [];
    setElections(electionRows);
    setParties(pData.items ?? []);
    if (electionRows.length > 0) setSelectedElectionId((prev) => prev ?? electionRows[0].id);
  }

  async function loadCandidates(electionId: number) {
    const res = await fetch(`${getApiBase()}/candidates?election_id=${electionId}`, { headers: getElectionBoardHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(toElectionBoardMessage(data.error ?? 'Failed candidates'));
    setCandidates(data.items ?? []);
  }

  async function deleteCandidate(candidateId: number) {
    if (!window.confirm('Delete this candidate?')) return;
    setError('');
    setMessage('');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${getApiBase()}/candidates/${candidateId}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Delete candidate failed'));
    setMessage('Candidate deleted.');
    if (selectedElectionId) await loadCandidates(selectedElectionId);
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
        <h1>Candidate List</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Candidate List</h1>
          <p className="muted">View candidates by election and manage records.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties/list">Political Parties</Link>
        <Link href="/election-board/candidates">Add Candidate</Link>
        <Link href="/election-board/candidates/list" className="active">Candidate List</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel">
        <div className="form-row">
          <label htmlFor="candidateElection">Election</label>
          <select id="candidateElection" value={selectedElectionId ?? ''} onChange={(e) => setSelectedElectionId(Number(e.target.value))}>
            <option value="" disabled>Select election</option>
            {elections.map((item) => (
              <option key={item.id} value={item.id}>{item.title} ({item.status})</option>
            ))}
          </select>
          {selectedElection ? <span className={`pill pill-${selectedElection.status.toLowerCase()}`}>{selectedElection.status}</span> : null}
        </div>
      </div>

      <div className="panel">
        <h2>Candidate Registry</h2>
        {candidates.length === 0 ? <p className="muted">No candidates found for selected election.</p> : null}
        {candidates.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Party</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th>Region</th>
                  <th>Biography</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>{candidate.id}</td>
                    <td>{candidate.name}</td>
                    <td>{partiesById[candidate.party_id] ?? candidate.party_id}</td>
                    <td>{candidate.running_position || '-'}</td>
                    <td>{candidate.candidate_status || '-'}</td>
                    <td>{candidate.region_district || '-'}</td>
                    <td>{candidate.profile_info || '-'}</td>
                    <td>
                      {candidate.photo_url ? (
                        <>
                          <a href={`${getPublicAssetOrigin()}${candidate.photo_url}`} target="_blank" rel="noreferrer">Photo</a>{' '}
                        </>
                      ) : null}
                      <button type="button" onClick={() => deleteCandidate(candidate.id)} disabled={editingLocked}>
                        Delete
                      </button>{' '}
                      <Link href="/election-board/candidates">Add / Edit page</Link>
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
