'use client';

import { useEffect, useState } from 'react';

type Election = { id: number; title: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' };
type ResultRow = {
  candidate_id: number;
  candidate_name: string;
  party_name: string;
  total_votes: number;
};
type ResultPayload = {
  election_id: number;
  rows: ResultRow[];
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
};

const API_BASE = 'http://localhost:5000/api';
const roleHeaders = { 'X-Role': 'ElectionBoard' };

export default function ElectionResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadElections() {
    const res = await fetch(`${API_BASE}/elections`, { headers: roleHeaders });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed elections');
    const items: Election[] = data.items ?? [];
    setElections(items);
    if (!selectedElectionId && items.length > 0) setSelectedElectionId(items[0].id);
  }

  async function loadResult(electionId: number) {
    setMessage('');
    setError('');
    const res = await fetch(`${API_BASE}/results/${electionId}`, { headers: roleHeaders });
    const data = await res.json();
    if (!res.ok) {
      setResult(null);
      throw new Error(data.error ?? 'Failed result');
    }
    setResult(data);
  }

  useEffect(() => {
    loadElections().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedElectionId) return;
    loadResult(selectedElectionId).catch((e: Error) => setError(e.message));
  }, [selectedElectionId]);

  async function closeElection() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${API_BASE}/elections/${selectedElectionId}/close`, {
      method: 'POST',
      headers: roleHeaders,
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Close failed');
    setMessage('Election closed and results generated.');
    await loadElections();
    await loadResult(selectedElectionId);
  }

  async function approveFinalResults() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${API_BASE}/results/${selectedElectionId}/approve`, {
      method: 'POST',
      headers: { ...roleHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Election Board' }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Approval failed');
    setResult(data);
    setMessage('Final results approved.');
  }

  const selectedElection = elections.find((item) => item.id === selectedElectionId);

  return (
    <section>
      <h1>Election Results</h1>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <label>
        Select Election:{' '}
        <select
          value={selectedElectionId ?? ''}
          onChange={(e) => setSelectedElectionId(Number(e.target.value))}
        >
          <option value="" disabled>
            Select
          </option>
          {elections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.status})
            </option>
          ))}
        </select>
      </label>

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={closeElection} disabled={selectedElection?.status !== 'ACTIVE'}>
          Close Election
        </button>
        <button
          type="button"
          onClick={approveFinalResults}
          disabled={!result || result.approved || selectedElection?.status !== 'COMPLETED'}
          style={{ marginLeft: 8 }}
        >
          Approve Final Results
        </button>
      </div>

      <h2 style={{ marginTop: 16 }}>Result Table</h2>
      {!result ? <p>No results yet.</p> : null}
      {result ? (
        <>
          <p>Approved: {result.approved ? 'Yes' : 'No'}</p>
          <p>Approved By: {result.approved_by ?? '-'}</p>
          <p>Approved At: {result.approved_at ?? '-'}</p>
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Party</th>
                <th>Votes</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.candidate_id}>
                  <td>{row.candidate_name}</td>
                  <td>{row.party_name}</td>
                  <td>{row.total_votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
