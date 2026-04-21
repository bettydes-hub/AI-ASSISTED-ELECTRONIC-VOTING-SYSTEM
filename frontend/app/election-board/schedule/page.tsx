'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../lib/electionBoardMessages';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';

type Region = { id: number; name: string };
type Party = { id: number; name: string };
type Election = {
  id: number;
  title: string;
  description: string;
  election_type?: string;
  election_scope?: 'NATIONAL' | 'REGIONAL';
  region_id?: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  rules?: {
    eligibility?: string;
    ballot_format?: string;
    minimum_candidate_age?: number | null;
    max_candidates_per_party?: number | null;
  };
  participants?: { positions?: string[]; allowed_party_ids?: number[] };
  schedule?: {
    registration_start_at?: string | null;
    registration_end_at?: string | null;
    campaign_start_at?: string | null;
    campaign_end_at?: string | null;
    voting_at?: string | null;
    result_at?: string | null;
  };
};

export default function ElectionBoardSchedulePage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [elections, setElections] = useState<Election[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [electionTitle, setElectionTitle] = useState('');
  const [electionDescription, setElectionDescription] = useState('');
  const [electionType, setElectionType] = useState('PRESIDENTIAL');
  const [electionScope, setElectionScope] = useState<'NATIONAL' | 'REGIONAL'>('NATIONAL');
  const [regionId, setRegionId] = useState<number | null>(null);
  const [newRegionName, setNewRegionName] = useState('');
  const [eligibility, setEligibility] = useState('');
  const [ballotFormat, setBallotFormat] = useState('');
  const [minimumCandidateAge, setMinimumCandidateAge] = useState('');
  const [maxCandidatesPerParty, setMaxCandidatesPerParty] = useState('');
  const [positionsInput, setPositionsInput] = useState('');
  const [allowedPartyIds, setAllowedPartyIds] = useState<number[]>([]);
  const [registrationStartAt, setRegistrationStartAt] = useState('');
  const [registrationEndAt, setRegistrationEndAt] = useState('');
  const [campaignStartAt, setCampaignStartAt] = useState('');
  const [campaignEndAt, setCampaignEndAt] = useState('');
  const [votingAt, setVotingAt] = useState('');
  const [resultAt, setResultAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );
  const editingLocked = selectedElection?.status === 'ACTIVE';

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadElections().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedElection) return;
    setElectionTitle(selectedElection.title ?? '');
    setElectionDescription(selectedElection.description ?? '');
    setElectionType(selectedElection.election_type ?? 'PRESIDENTIAL');
    setElectionScope((selectedElection.election_scope ?? 'NATIONAL') as 'NATIONAL' | 'REGIONAL');
    setRegionId(selectedElection.region_id ?? null);
    setEligibility(selectedElection.rules?.eligibility ?? '');
    setBallotFormat(selectedElection.rules?.ballot_format ?? '');
    setMinimumCandidateAge(
      selectedElection.rules?.minimum_candidate_age != null ? String(selectedElection.rules.minimum_candidate_age) : ''
    );
    setMaxCandidatesPerParty(
      selectedElection.rules?.max_candidates_per_party != null ? String(selectedElection.rules.max_candidates_per_party) : ''
    );
    setPositionsInput((selectedElection.participants?.positions ?? []).join(', '));
    setAllowedPartyIds(selectedElection.participants?.allowed_party_ids ?? []);
    setRegistrationStartAt(toDateTimeLocal(selectedElection.schedule?.registration_start_at ?? ''));
    setRegistrationEndAt(toDateTimeLocal(selectedElection.schedule?.registration_end_at ?? ''));
    setCampaignStartAt(toDateTimeLocal(selectedElection.schedule?.campaign_start_at ?? ''));
    setCampaignEndAt(toDateTimeLocal(selectedElection.schedule?.campaign_end_at ?? ''));
    setVotingAt(toDateTimeLocal(selectedElection.schedule?.voting_at ?? ''));
    setResultAt(toDateTimeLocal(selectedElection.schedule?.result_at ?? ''));
  }, [selectedElection]);

  async function loadElections() {
    setError('');
    const [electionsRes, regionsRes, partiesRes] = await Promise.all([
      fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/regions`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/parties`, { headers: getElectionBoardHeaders() }),
    ]);
    const data = await electionsRes.json();
    const regionsData = await regionsRes.json();
    const partiesData = await partiesRes.json();
    if (!regionsRes.ok) throw new Error(toElectionBoardMessage(regionsData.error ?? 'Failed regions'));
    if (!partiesRes.ok) throw new Error(toElectionBoardMessage(partiesData.error ?? 'Failed parties'));
    setRegions(regionsData.items ?? []);
    setParties(partiesData.items ?? []);
    if (!electionsRes.ok) throw new Error(toElectionBoardMessage(data.error ?? 'Failed elections'));
    const rows: Election[] = data.items ?? [];
    setElections(rows);
    if (!selectedElectionId && rows.length > 0) setSelectedElectionId(rows[0].id);
  }

  async function createElection(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch(`${getApiBase()}/elections`, {
      method: 'POST',
      headers: getElectionBoardHeaders(true),
      body: JSON.stringify({
        title: electionTitle,
        description: electionDescription,
        election_type: electionType,
        election_scope: electionScope,
        region_id: electionScope === 'REGIONAL' ? regionId : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Create election failed'));
    setMessage(`Election created: ${data.title}`);
    await loadElections();
    setSelectedElectionId(data.id);
  }

  async function updateElection() {
    setError('');
    setMessage('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${getApiBase()}/elections/${selectedElectionId}`, {
      method: 'PATCH',
      headers: getElectionBoardHeaders(true),
      body: JSON.stringify({
        title: electionTitle,
        description: electionDescription,
        election_type: electionType,
        election_scope: electionScope,
        region_id: electionScope === 'REGIONAL' ? regionId : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Update election failed'));
    setMessage(`Election updated: ${data.title}`);
    await loadElections();
  }

  async function deleteElection() {
    setError('');
    setMessage('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Cannot delete active election');
    const res = await fetch(`${getApiBase()}/elections/${selectedElectionId}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Delete election failed'));
    setMessage('Election deleted.');
    setSelectedElectionId(null);
    await loadElections();
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${getApiBase()}/elections/${selectedElectionId}/config`, {
      method: 'PATCH',
      headers: getElectionBoardHeaders(true),
      body: JSON.stringify({
        election_scope: electionScope,
        region_id: electionScope === 'REGIONAL' ? regionId : null,
        rules: {
          eligibility,
          ballot_format: ballotFormat,
          minimum_candidate_age: minimumCandidateAge.trim() || null,
          max_candidates_per_party: maxCandidatesPerParty.trim() || null,
        },
        participants: {
          positions: positionsInput
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          allowed_party_ids: allowedPartyIds,
        },
        schedule: {
          registration_start_at: registrationStartAt,
          registration_end_at: registrationEndAt,
          campaign_start_at: campaignStartAt,
          campaign_end_at: campaignEndAt,
          voting_at: votingAt,
          result_at: resultAt,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Save config failed'));
    setMessage(`Configuration saved for ${data.title}`);
    await loadElections();
  }

  async function addRegion() {
    setError('');
    setMessage('');
    if (!newRegionName.trim()) return setError('Enter region name first.');
    const res = await fetch(`${getApiBase()}/regions`, {
      method: 'POST',
      headers: getElectionBoardHeaders(true),
      body: JSON.stringify({ name: newRegionName.trim() }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 409) return setError(toElectionBoardMessage(data.error ?? 'Add region failed'));
    setNewRegionName('');
    await loadElections();
    const resolvedRegionId = data.id as number | undefined;
    if (resolvedRegionId) {
      setRegionId(resolvedRegionId);
      setMessage(`Region ready: ${data.name}`);
    } else {
      setMessage('Region already existed, loaded from list.');
    }
  }

  async function removeRegion() {
    setError('');
    setMessage('');
    if (!regionId) return setError('Select a region first.');
    if (!window.confirm('Remove this region? This works only if no election, party, or candidate is using it.')) return;
    const res = await fetch(`${getApiBase()}/regions/${regionId}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Remove region failed'));
    setRegionId(null);
    setMessage('Region removed.');
    await loadElections();
  }

  function onToggleAllowedParty(partyId: number, checked: boolean) {
    setAllowedPartyIds((prev) => {
      if (checked) return [...prev, partyId];
      return prev.filter((id) => id !== partyId);
    });
  }

  async function activateElection() {
    setError('');
    setMessage('');
    if (!selectedElectionId) return setError('Select election first');
    const res = await fetch(`${getApiBase()}/elections/${selectedElectionId}/activate`, {
      method: 'POST',
      headers: getElectionBoardHeaders(true),
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Activate failed'));
    setMessage(`Election activated: ${data.title}`);
    await loadElections();
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
        <h1>Schedule & Activate</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Schedule & Activate</h1>
          <p className="muted">Create elections, define rules and schedule, then activate for voting.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties/list">Political Parties</Link>
        <Link href="/election-board/candidates/list">Candidates</Link>
        <Link href="/election-board/schedule" className="active">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel-grid">
        <form className="panel" onSubmit={createElection}>
          <h2>Create / Update Election</h2>
          <div className="form-row">
            <label htmlFor="scheduleElection">Working election</label>
            <select id="scheduleElection" value={selectedElectionId ?? ''} onChange={(e) => setSelectedElectionId(Number(e.target.value))}>
              <option value="" disabled>Select election</option>
              {elections.map((item) => (
                <option key={item.id} value={item.id}>{item.title} ({item.status})</option>
              ))}
            </select>
            {selectedElection ? <span className={`pill pill-${selectedElection.status.toLowerCase()}`}>{selectedElection.status}</span> : null}
          </div>
          <div className="form-row">
            <label>Election title</label>
            <input value={electionTitle} onChange={(e) => setElectionTitle(e.target.value)} placeholder="Election title" />
          </div>
          <div className="form-row">
            <label>Description</label>
            <input value={electionDescription} onChange={(e) => setElectionDescription(e.target.value)} placeholder="Description" />
          </div>
          <div className="form-row">
            <label>Election type</label>
            <input value={electionType} onChange={(e) => setElectionType(e.target.value)} placeholder="Presidential / Parliamentary / Local" />
          </div>
          <div className="form-row">
            <label>Election scope</label>
            <select
              value={electionScope}
              onChange={(e) => {
                const scope = e.target.value as 'NATIONAL' | 'REGIONAL';
                setElectionScope(scope);
                if (scope === 'NATIONAL') setRegionId(null);
              }}
            >
              <option value="NATIONAL">National</option>
              <option value="REGIONAL">Regional</option>
            </select>
          </div>
          {electionScope === 'REGIONAL' ? (
            <>
              <div className="form-row">
                <label>Region *</label>
                <select value={regionId ?? ''} onChange={(e) => setRegionId(Number(e.target.value))}>
                  <option value="" disabled>Select region</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Add region</label>
                <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
                  <input value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder="Type new region name" />
                  <button type="button" onClick={addRegion} disabled={editingLocked}>Add Region</button>
                  <button type="button" onClick={removeRegion} disabled={editingLocked || !regionId}>Remove Selected Region</button>
                </div>
              </div>
            </>
          ) : null}
          <div className="toolbar">
            <button type="submit">Create</button>
            <button type="button" onClick={updateElection} disabled={!selectedElectionId || editingLocked}>Update Selected</button>
            <button type="button" onClick={deleteElection} disabled={!selectedElectionId || editingLocked}>Delete Selected</button>
          </div>
        </form>

        <form className="panel" onSubmit={saveConfig}>
          <h2>Rules & Schedule</h2>
          <div className="form-row">
            <label>Eligibility rule</label>
            <input value={eligibility} onChange={(e) => setEligibility(e.target.value)} placeholder="Eligibility rule" disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Ballot format</label>
            <input value={ballotFormat} onChange={(e) => setBallotFormat(e.target.value)} placeholder="Ballot format" disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Minimum candidate age</label>
            <input value={minimumCandidateAge} onChange={(e) => setMinimumCandidateAge(e.target.value)} placeholder="e.g. 21" inputMode="numeric" disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Max candidates per party</label>
            <input value={maxCandidatesPerParty} onChange={(e) => setMaxCandidatesPerParty(e.target.value)} placeholder="optional" inputMode="numeric" disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Positions to be elected</label>
            <input
              value={positionsInput}
              onChange={(e) => setPositionsInput(e.target.value)}
              placeholder="President, MP, Mayor"
              disabled={editingLocked}
            />
          </div>
          <div className="form-row">
            <label>Allowed parties</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {parties.map((party) => (
                <label key={party.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={allowedPartyIds.includes(party.id)}
                    onChange={(e) => onToggleAllowedParty(party.id, e.target.checked)}
                    disabled={editingLocked}
                  />
                  {party.name}
                </label>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label>Registration start</label>
            <input type="datetime-local" value={registrationStartAt} onChange={(e) => setRegistrationStartAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Registration end</label>
            <input type="datetime-local" value={registrationEndAt} onChange={(e) => setRegistrationEndAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Campaign start</label>
            <input type="datetime-local" value={campaignStartAt} onChange={(e) => setCampaignStartAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Campaign end</label>
            <input type="datetime-local" value={campaignEndAt} onChange={(e) => setCampaignEndAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Voting date/time</label>
            <input type="datetime-local" value={votingAt} onChange={(e) => setVotingAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="form-row">
            <label>Result publication</label>
            <input type="datetime-local" value={resultAt} onChange={(e) => setResultAt(e.target.value)} disabled={editingLocked} />
          </div>
          <div className="toolbar">
            <button type="submit" disabled={editingLocked}>Save Config</button>
            <button type="button" onClick={activateElection} disabled={editingLocked || !selectedElectionId}>Activate Election</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function toDateTimeLocal(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
