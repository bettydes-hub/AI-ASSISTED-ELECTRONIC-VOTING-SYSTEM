'use client';

import { useEffect, useState } from 'react';

import { getApiBase } from '../../../lib/apiBase';

type Election = { id: number; title: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' };
type ResultRow = {
  candidate_id: number;
  candidate_name: string;
  party_name: string;
  total_votes: number;
};
type ResultPayload = {
  election_id: number;
  election_title: string;
  election_status: string;
  rows: ResultRow[];
  total_votes_cast: number;
  abstentions: number;
  counted_candidate_votes: number;
};

export default function ElectionOfficerResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadElections() {
    const res = await fetch(`${getApiBase()}/results/elections/closed`, { headers: getOfficerHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed elections');
    const items: Election[] = data.items ?? [];
    setElections(items);
    if (!selectedElectionId && items.length > 0) setSelectedElectionId(items[0].id);
  }

  async function loadResult(electionId: number) {
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${electionId}`, { headers: getOfficerHeaders() });
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

  async function printResults(forceFail = false) {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/print`, {
      method: 'POST',
      headers: { ...getOfficerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_fail: forceFail }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Print failed');
    if (data.print_result?.status === 'print_failed') {
      setMessage(`Print failed. Export fallback generated at ${data.export_fallback?.exported_at}.`);
      return;
    }
    setMessage(`Printed successfully at ${data.print_result?.printed_at}.`);
  }

  async function signResults() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/sign`, {
      method: 'POST',
      headers: { ...getOfficerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ signed_by: signedBy }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Sign failed');
    setMessage('Results signed.');
  }

  async function submitToBoard() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/submit-to-board`, {
      method: 'POST',
      headers: { ...getOfficerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ signed_by: signedBy }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Submission failed');
    setMessage('Signed results submitted to Election Board.');
  }

  async function reportDiscrepancy() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/report-discrepancy`, {
      method: 'POST',
      headers: { ...getOfficerHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: discrepancyReason }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Discrepancy report failed');
    setMessage('Discrepancy reported. Audit process triggered.');
  }

  return (
    <section>
      <h1>Result Viewing and Verification</h1>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <label>
        Select Election:{' '}
        <select value={selectedElectionId ?? ''} onChange={(e) => setSelectedElectionId(Number(e.target.value))}>
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
        <button type="button" onClick={() => printResults(false)}>
          Print Results
        </button>{' '}
        <button type="button" onClick={() => printResults(true)}>
          Simulate Print Failure
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Officer name/signature" />
        <button type="button" onClick={signResults} style={{ marginLeft: 8 }}>
          Sign Results
        </button>
        <button type="button" onClick={submitToBoard} style={{ marginLeft: 8 }}>
          Submit to Election Board
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={discrepancyReason}
          onChange={(e) => setDiscrepancyReason(e.target.value)}
          placeholder="Discrepancy reason"
        />
        <button type="button" onClick={reportDiscrepancy} style={{ marginLeft: 8 }}>
          Report Discrepancy
        </button>
      </div>

      {result ? (
        <>
          <h2>Result Summary</h2>
          <p>Total Votes Cast: {result.total_votes_cast}</p>
          <p>Counted Candidate Votes: {result.counted_candidate_votes}</p>
          <p>Abstentions: {result.abstentions}</p>
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

function getOfficerHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'X-Role': 'ElectionOfficer' };
  if (typeof window === 'undefined') return headers;
  const raw = localStorage.getItem('evoting.user');
  if (!raw) return headers;
  try {
    const user = JSON.parse(raw) as { id?: number };
    if (user?.id) headers['X-User-Id'] = String(user.id);
  } catch {
    return headers;
  }
  return headers;
}
