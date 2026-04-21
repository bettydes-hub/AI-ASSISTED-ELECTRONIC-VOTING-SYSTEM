'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getApiBase } from '../../../lib/apiBase';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';
import { toElectionBoardMessage } from '../../../lib/electionBoardMessages';

type Region = { id: number; name: string };
type Election = {
  id: number;
  title: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  election_type?: string;
  election_scope?: 'NATIONAL' | 'REGIONAL';
  region_id?: number | null;
  schedule?: { voting_at?: string | null };
};
type ResultRow = {
  candidate_id: number;
  candidate_name: string;
  party_name: string;
  position?: string;
  total_votes: number;
  percentage?: number;
  region_id?: number | null;
  region_name?: string | null;
  region_district?: string | null;
};
type Winner = {
  name: string;
  party: string;
  position?: string;
  total_votes: number;
  percentage: number;
  status: 'WINNER';
};
type RegionBreakdown = {
  region_district: string;
  total_votes: number;
};
type ResultPayload = {
  election_id: number;
  election_title?: string;
  election_type?: string;
  election_scope?: 'NATIONAL' | 'REGIONAL';
  region_id?: number | null;
  region_name?: string | null;
  election_date?: string | null;
  election_status?: string;
  rows: ResultRow[];
  winner?: Winner | null;
  total_votes_cast?: number;
  total_voters?: number;
  turnout_percentage?: number | null;
  abstentions?: number;
  counted_candidate_votes?: number;
  region_breakdown?: RegionBreakdown[];
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
};

export default function ElectionResultsPage() {
  const router = useRouter();
  const [elections, setElections] = useState<Election[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [filterRegionId, setFilterRegionId] = useState<number | null>(null);
  const [filterDistrict, setFilterDistrict] = useState('');
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  async function loadElections() {
    const [eRes, rRes] = await Promise.all([
      fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/regions`, { headers: getElectionBoardHeaders() }),
    ]);
    const data = await eRes.json();
    const regionsData = await rRes.json();
    if (!eRes.ok) throw new Error(toElectionBoardMessage(data.error ?? 'Failed elections'));
    if (!rRes.ok) throw new Error(toElectionBoardMessage(regionsData.error ?? 'Failed regions'));
    const items: Election[] = data.items ?? [];
    setElections(items);
    setRegions(regionsData.items ?? []);
    if (!selectedElectionId && items.length > 0) setSelectedElectionId(items[0].id);
  }

  async function loadResult(electionId: number) {
    setMessage('');
    setError('');
    const qs = new URLSearchParams();
    if (filterRegionId) qs.set('region_id', String(filterRegionId));
    if (filterDistrict.trim()) qs.set('region_district', filterDistrict.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await fetch(`${getApiBase()}/results/${electionId}${suffix}`, { headers: getElectionBoardHeaders() });
    const data = await res.json();
    if (!res.ok) {
      setResult(null);
      throw new Error(toElectionBoardMessage(data.error ?? 'Failed result'));
    }
    setResult(data);
  }

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadElections().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedElectionId) return;
    loadResult(selectedElectionId).catch((e: Error) => setError(e.message));
  }, [selectedElectionId, filterRegionId, filterDistrict]);

  async function closeElection() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/elections/${selectedElectionId}/close`, {
      method: 'POST',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Close failed'));
    setMessage('Election closed and results generated.');
    await loadElections();
    await loadResult(selectedElectionId);
  }

  async function approveFinalResults() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/approve`, {
      method: 'POST',
      headers: { ...getElectionBoardHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'Election Board' }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Approval failed'));
    setResult(data);
    setMessage('Final results approved.');
  }

  async function printResults(forceFail = false) {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/print`, {
      method: 'POST',
      headers: { ...getElectionBoardHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ force_fail: forceFail }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Print failed'));
    if (data.print_result?.status === 'print_failed') {
      setMessage('Printing failed. Export fallback is available in API response.');
      return;
    }
    setMessage(`Result printed at ${data.print_result?.printed_at}.`);
  }

  async function reportDiscrepancy() {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    const res = await fetch(`${getApiBase()}/results/${selectedElectionId}/report-discrepancy`, {
      method: 'POST',
      headers: { ...getElectionBoardHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: discrepancyReason }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Discrepancy report failed'));
    setMessage('Discrepancy reported; audit process triggered.');
  }

  const selectedElection = elections.find((item) => item.id === selectedElectionId);
  const isRegionalElection = (selectedElection?.election_scope ?? result?.election_scope) === 'REGIONAL';
  const resolvedRegionName =
    regions.find((r) => r.id === (result?.region_id ?? selectedElection?.region_id ?? 0))?.name ??
    result?.region_name ??
    '-';

  useEffect(() => {
    if (!selectedElection) return;
    if (selectedElection.election_scope === 'REGIONAL' && selectedElection.region_id) {
      setFilterRegionId(selectedElection.region_id);
      return;
    }
    setFilterRegionId(null);
  }, [selectedElectionId, selectedElection]);

  async function onLogout() {
    await boardLogout(getApiBase());
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
    router.push('/login');
  }

  if (!sessionChecked) {
    return (
      <section>
        <p>Checking session...</p>
      </section>
    );
  }
  if (!authorized) {
    return (
      <section>
        <h1>Election Results</h1>
        <p>This page is for Election Board members only.</p>
        <p>
          <Link href="/login">Login as Election Board</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Election Results</h1>
          <p className="muted">Close active elections, review result table, and approve final outcomes.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties/list">Political Parties</Link>
        <Link href="/election-board/candidates/list">Candidates</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results" className="active">Election Results</Link>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel">
        <h2>Step 1: Election Information</h2>
        <div className="form-row">
          <label htmlFor="resultsElection">Election</label>
          <select
            id="resultsElection"
            value={selectedElectionId ?? ''}
            onChange={(e) => setSelectedElectionId(Number(e.target.value))}
          >
            <option value="" disabled>
              Select election
            </option>
            {elections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({item.status})
              </option>
            ))}
          </select>
          {selectedElection ? (
            <span className={`pill pill-${selectedElection.status.toLowerCase()}`}>{selectedElection.status}</span>
          ) : null}
        </div>
        {selectedElection ? (
          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Election Name</span>
              <strong>{selectedElection.title}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Election Type</span>
              <strong>{selectedElection.election_type ?? '-'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Level</span>
              <strong>{selectedElection.election_scope ?? '-'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Region (if regional)</span>
              <strong>{selectedElection.election_scope === 'REGIONAL' ? resolvedRegionName : 'Not required'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Date</span>
              <strong>{result?.election_date ? new Date(result.election_date).toLocaleString() : '-'}</strong>
            </article>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <h2>Step 2: Verification Actions</h2>
        <div className="toolbar">
          <button
            type="button"
            onClick={() => {
              if (!selectedElectionId) return;
              loadResult(selectedElectionId).catch((e: Error) => setError(e.message));
            }}
          >
            Refresh Results
          </button>
          <button type="button" onClick={closeElection} disabled={selectedElection?.status !== 'ACTIVE'}>
            Close Election
          </button>
          <button
            type="button"
            onClick={approveFinalResults}
            disabled={!result || result.approved || selectedElection?.status !== 'COMPLETED'}
          >
            Approve Final Results
          </button>
          <button type="button" onClick={() => printResults(false)}>
            Print
          </button>
          <button type="button" onClick={() => printResults(true)}>
            Simulate Print Failure
          </button>
        </div>
        <div className="form-row">
          <label>Discrepancy reason</label>
          <input
            value={discrepancyReason}
            onChange={(e) => setDiscrepancyReason(e.target.value)}
            placeholder="Explain discrepancy details"
          />
          <button type="button" onClick={reportDiscrepancy}>
            Report Discrepancy
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Result Summary</h2>
        {!result ? <p className="muted">No results available yet for the selected election.</p> : null}
        {result ? (
          <>
            <div
              style={{
                border: '2px solid #f59e0b',
                background: '#fffbeb',
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Winner Information</h3>
              {result.winner ? (
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {result.winner.name} ({result.winner.party}) - {result.winner.total_votes} votes ({result.winner.percentage}%)
                  {' '}[{result.winner.status}]
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No winner data available yet.</p>
              )}
            </div>
            <div className="metric-grid">
              <article className="metric-card">
                <span className="metric-label">Total Votes Cast</span>
                <strong>{result.total_votes_cast ?? 0}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Total Voters</span>
                <strong>{result.total_voters ?? 0}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Voter Turnout</span>
                <strong>{result.turnout_percentage != null ? `${result.turnout_percentage}%` : '-'}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Candidate Votes Counted</span>
                <strong>{result.counted_candidate_votes ?? 0}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Abstentions</span>
                <strong>{result.abstentions ?? 0}</strong>
              </article>
              <article className="metric-card">
                <span className="metric-label">Approval Status</span>
                <strong>{result.approved ? 'Approved' : 'Pending'}</strong>
              </article>
            </div>
            <p className="muted">
              Approved By: {result.approved_by ?? '-'} | Approved At: {result.approved_at ?? '-'}
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Party</th>
                    <th>Position</th>
                    <th>Votes</th>
                    <th>Percentage (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.candidate_id}>
                      <td>{row.candidate_name}</td>
                      <td>{row.party_name}</td>
                      <td>{row.position || '-'}</td>
                      <td>{row.total_votes}</td>
                      <td>{row.percentage != null ? `${row.percentage}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14 }}>
              <h3>Region-Based Results</h3>
              <div className="form-row">
                <label>Filter by region</label>
                <select
                  value={filterRegionId ?? ''}
                  onChange={(e) => setFilterRegionId(e.target.value ? Number(e.target.value) : null)}
                  disabled={isRegionalElection}
                >
                  <option value="">All regions</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Filter by district</label>
                <input
                  value={filterDistrict}
                  onChange={(e) => setFilterDistrict(e.target.value)}
                  placeholder="Enter district name"
                />
              </div>
              {result.region_breakdown && result.region_breakdown.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Region / District</th>
                        <th>Total Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.region_breakdown.map((row) => (
                        <tr key={row.region_district}>
                          <td>{row.region_district}</td>
                          <td>{row.total_votes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No region/district breakdown available.</p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
