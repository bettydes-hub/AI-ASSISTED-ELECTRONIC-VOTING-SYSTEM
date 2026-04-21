'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getApiBase, getPublicAssetOrigin } from '../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../lib/electionBoardMessages';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';
import { readApiBody } from '../../../lib/readApiBody';

type Election = {
  id: number;
  title: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
};

type Summary = {
  total_elections: number;
  draft_elections: number;
  active_elections: number;
  completed_elections: number;
  total_parties: number;
  total_candidates: number;
  total_voters: number;
};

type Party = {
  id: number;
  name: string;
  abbreviation: string | null;
  leader_name: string;
  operational_status: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  logo_url: string | null;
  description: string;
  regions: string;
  election_year: number | null;
};

type Candidate = {
  id: number;
  name: string;
  party_id: number;
  running_position?: string;
  region_district?: string;
};

type ClosedElection = { id: number; title: string; status: 'COMPLETED' };

type ResultRow = {
  party_name: string;
  total_votes: number;
};

type ResultPayload = {
  rows: ResultRow[];
  total_votes_cast?: number;
  abstentions?: number;
};

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
};

function toPublicFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${getPublicAssetOrigin()}${url}`;
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export default function ElectionBoardDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [latestResult, setLatestResult] = useState<ResultPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [searchText, setSearchText] = useState('');

  const partyNameById = useMemo(
    () => Object.fromEntries(parties.map((party) => [party.id, party.name])),
    [parties]
  );

  const candidatesPerParty = useMemo(() => {
    const counts = new Map<number, number>();
    for (const candidate of candidates) {
      counts.set(candidate.party_id, (counts.get(candidate.party_id) ?? 0) + 1);
    }
    return parties
      .map((party) => ({
        partyId: party.id,
        partyName: party.name,
        total: counts.get(party.id) ?? 0,
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [candidates, parties]);

  const votesPerParty = useMemo(() => {
    if (!latestResult?.rows) return [] as { partyName: string; total: number }[];
    const rollup = new Map<string, number>();
    for (const row of latestResult.rows) {
      rollup.set(row.party_name, (rollup.get(row.party_name) ?? 0) + Number(row.total_votes ?? 0));
    }
    return Array.from(rollup.entries())
      .map(([partyName, total]) => ({ partyName, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [latestResult]);

  const turnout = useMemo(() => {
    const votes = Number(latestResult?.total_votes_cast ?? 0);
    const abstentions = Number(latestResult?.abstentions ?? 0);
    const total = votes + abstentions;
    return {
      votes,
      abstentions,
      total,
      turnoutPct: percent(votes, total),
    };
  }, [latestResult]);

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const activity: ActivityItem[] = [];
    const latestParty = [...parties].sort((a, b) => b.id - a.id)[0];
    const latestCandidate = [...candidates].sort((a, b) => b.id - a.id)[0];
    const activeElection = elections.find((e) => e.status === 'ACTIVE');
    const completedElection = [...elections].filter((e) => e.status === 'COMPLETED').sort((a, b) => b.id - a.id)[0];

    if (latestParty) {
      activity.push({
        id: `party-${latestParty.id}`,
        label: 'New party added',
        detail: latestParty.name,
      });
    }
    if (latestCandidate) {
      activity.push({
        id: `candidate-${latestCandidate.id}`,
        label: 'Candidate registered',
        detail: `${latestCandidate.name} (${partyNameById[latestCandidate.party_id] ?? 'Party'})`,
      });
    }
    if (activeElection) {
      activity.push({
        id: `active-${activeElection.id}`,
        label: 'Election started',
        detail: activeElection.title,
      });
    }
    if (completedElection) {
      activity.push({
        id: `completed-${completedElection.id}`,
        label: 'Election completed',
        detail: completedElection.title,
      });
    }
    return activity.slice(0, 5);
  }, [candidates, elections, parties, partyNameById]);

  const filteredPartyRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter(
      (party) =>
        party.name.toLowerCase().includes(q) ||
        (party.leader_name || '').toLowerCase().includes(q) ||
        (party.operational_status || '').toLowerCase().includes(q)
    );
  }, [parties, searchText]);

  const filteredCandidateRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (candidate) =>
        candidate.name.toLowerCase().includes(q) ||
        (candidate.running_position || '').toLowerCase().includes(q) ||
        (candidate.region_district || '').toLowerCase().includes(q) ||
        (partyNameById[candidate.party_id] || '').toLowerCase().includes(q)
    );
  }, [candidates, partyNameById, searchText]);

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, electionRes, partyRes, candidateRes, closedRes] = await Promise.all([
        fetch(`${getApiBase()}/dashboard/election-board/summary`, { headers: getElectionBoardHeaders() }),
        fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() }),
        fetch(`${getApiBase()}/parties`, { headers: getElectionBoardHeaders() }),
        fetch(`${getApiBase()}/candidates`, { headers: getElectionBoardHeaders() }),
        fetch(`${getApiBase()}/results/elections/closed`, { headers: getElectionBoardHeaders() }),
      ]);

      const summaryData = await readApiBody(summaryRes);
      const electionData = await readApiBody(electionRes);
      const partyData = await readApiBody(partyRes);
      const candidateData = await readApiBody(candidateRes);
      const closedData = await readApiBody(closedRes);

      if (!summaryRes.ok) throw new Error(toElectionBoardMessage(String(summaryData.error ?? 'Failed summary')));
      if (!electionRes.ok) throw new Error(toElectionBoardMessage(String(electionData.error ?? 'Failed elections')));
      if (!partyRes.ok) throw new Error(toElectionBoardMessage(String(partyData.error ?? 'Failed parties')));
      if (!candidateRes.ok) throw new Error(toElectionBoardMessage(String(candidateData.error ?? 'Failed candidates')));
      if (!closedRes.ok) throw new Error(toElectionBoardMessage(String(closedData.error ?? 'Failed closed elections')));

      setSummary(summaryData as Summary);
      setElections((electionData.items as Election[]) ?? []);
      setParties((partyData.items as Party[]) ?? []);
      setCandidates((candidateData.items as Candidate[]) ?? []);

      const closed = (closedData.items as ClosedElection[]) ?? [];
      if (closed.length > 0) {
        const latestClosed = closed[closed.length - 1];
        const resultsRes = await fetch(`${getApiBase()}/results/${latestClosed.id}`, {
          headers: getElectionBoardHeaders(),
        });
        const resultsData = await readApiBody(resultsRes);
        if (resultsRes.ok) {
          setLatestResult(resultsData as ResultPayload);
        } else {
          setLatestResult(null);
        }
      } else {
        setLatestResult(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cannot load dashboard';
      setError(msg.includes('Failed to fetch') ? 'Cannot reach API. Start Flask and retry.' : msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (isBoard) {
      loadDashboard();
    }
  }, []);

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
        <h1>Election Board Dashboard</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  const maxCandidateBar = Math.max(1, ...candidatesPerParty.map((item) => item.total));
  const maxVoteBar = Math.max(1, ...votesPerParty.map((item) => item.total));

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Election Board Dashboard</h1>
          <p className="muted">Clean overview of parties, candidates, elections, voters, and outcomes.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={loadDashboard}>Refresh</button>
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {loading ? <p className="status-banner">Loading dashboard...</p> : null}

      {summary ? (
        <div className="dashboard-top-stats">
          <article className="dashboard-stat-card"><span>Total Parties</span><strong>{summary.total_parties}</strong></article>
          <article className="dashboard-stat-card"><span>Total Candidates</span><strong>{summary.total_candidates}</strong></article>
          <article className="dashboard-stat-card"><span>Total Voters</span><strong>{summary.total_voters}</strong></article>
          <article className="dashboard-stat-card"><span>Total Elections</span><strong>{summary.total_elections}</strong></article>
        </div>
      ) : null}

      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <h3>Menu</h3>
          <Link href="/election-board/dashboard" className="active">Dashboard</Link>
          <Link href="/election-board/parties/list">Parties</Link>
          <Link href="/election-board/candidates/list">Candidates</Link>
          <Link href="/election-board/schedule">Elections</Link>
          <Link href="/election-officer/voters">Voters</Link>
          <Link href="/election-board/election-results">Results</Link>
          <Link href="/system-admin/system-settings">Admin / Settings</Link>

          <div className="dashboard-quick-actions">
            <h4>Quick Actions</h4>
            <Link href="/election-board/parties">➕ Add Party</Link>
            <Link href="/election-board/candidates">➕ Add Candidate</Link>
            <Link href="/election-board/schedule">➕ Create Election</Link>
          </div>
        </aside>

        <div className="dashboard-main-content">
          <div className="dashboard-grid-2">
            <div className="panel">
              <h2>📊 Candidates per Party</h2>
              {candidatesPerParty.length === 0 ? <p className="muted">No candidate data yet.</p> : null}
              {candidatesPerParty.map((item) => (
                <div key={item.partyId} className="chart-row">
                  <span>{item.partyName}</span>
                  <div className="chart-bar"><div style={{ width: `${percent(item.total, maxCandidateBar)}%` }} /></div>
                  <strong>{item.total}</strong>
                </div>
              ))}
            </div>

            <div className="panel">
              <h2>📊 Votes per Party</h2>
              {votesPerParty.length === 0 ? <p className="muted">No completed result yet.</p> : null}
              {votesPerParty.map((item) => (
                <div key={item.partyName} className="chart-row">
                  <span>{item.partyName}</span>
                  <div className="chart-bar chart-bar-votes"><div style={{ width: `${percent(item.total, maxVoteBar)}%` }} /></div>
                  <strong>{item.total}</strong>
                </div>
              ))}
              <p className="muted small" style={{ marginTop: 8 }}>Based on latest completed election.</p>
            </div>

            <div className="panel">
              <h2>📊 Voter Turnout</h2>
              <div className="turnout-ring">
                <div className="turnout-ring-value">{turnout.turnoutPct}%</div>
              </div>
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <span>Votes cast: <strong>{turnout.votes}</strong></span>
                <span>Abstentions: <strong>{turnout.abstentions}</strong></span>
              </div>
            </div>

            <div className="panel">
              <h2>🕒 Recent Activity</h2>
              {recentActivity.length === 0 ? <p className="muted">No activity yet.</p> : null}
              <div className="activity-list">
                {recentActivity.map((item) => (
                  <div key={item.id} className="activity-item">
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Main Data Tables</h2>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search party, leader, candidate, region..."
                style={{ minWidth: 280 }}
              />
            </div>

            <div className="dashboard-grid-2" style={{ marginTop: 8 }}>
              <div>
                <h3 style={{ margin: '6px 0' }}>Parties Table</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Leader</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPartyRows.slice(0, 8).map((party) => (
                        <tr key={party.id}>
                          <td>
                            {party.logo_url ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={toPublicFileUrl(party.logo_url) ?? ''}
                                  alt=""
                                  width={24}
                                  height={24}
                                  style={{ borderRadius: 4, objectFit: 'cover' }}
                                />
                                {party.name}
                              </span>
                            ) : (
                              party.name
                            )}
                          </td>
                          <td>{party.leader_name || '-'}</td>
                          <td><span className={`pill pill-${party.operational_status.toLowerCase()}`}>{party.operational_status}</span></td>
                          <td>
                            <Link href="/election-board/parties">Edit</Link>{' / '}
                            <Link href="/election-board/parties">Delete</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ margin: '6px 0' }}>Candidates Table</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Party</th>
                        <th>Position</th>
                        <th>Region</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidateRows.slice(0, 10).map((candidate) => (
                        <tr key={candidate.id}>
                          <td>{candidate.name}</td>
                          <td>{partyNameById[candidate.party_id] ?? candidate.party_id}</td>
                          <td>{candidate.running_position || '-'}</td>
                          <td>{candidate.region_district || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Election Overview</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {elections.map((election) => (
                    <tr key={election.id}>
                      <td>{election.id}</td>
                      <td>{election.title}</td>
                      <td><span className={`pill pill-${election.status.toLowerCase()}`}>{election.status}</span></td>
                      <td>{election.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
