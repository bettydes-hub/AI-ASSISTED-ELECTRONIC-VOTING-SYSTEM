'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Election = {
  id: number;
  title: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  rules?: { eligibility?: string; ballot_format?: string };
  schedule?: { start_at?: string | null; end_at?: string | null };
};

type Party = { id: number; name: string };
type Candidate = { id: number; name: string; election_id: number; party_id: number };

const API_BASE = 'http://localhost:5000/api';
const roleHeaders = { 'X-Role': 'ElectionBoard', 'Content-Type': 'application/json' };

export default function ElectionSetupPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [electionTitle, setElectionTitle] = useState('');
  const [electionDescription, setElectionDescription] = useState('');
  const [partyName, setPartyName] = useState('');
  const [partyDescription, setPartyDescription] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [candidateProfile, setCandidateProfile] = useState('');
  const [editingCandidateId, setEditingCandidateId] = useState<number | null>(null);
  const [candidatePartyId, setCandidatePartyId] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState('');
  const [ballotFormat, setBallotFormat] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );
  const editingLocked = selectedElection?.status === 'ACTIVE';

  useEffect(() => {
    if (!selectedElection) return;
    setElectionTitle(selectedElection.title ?? '');
    setElectionDescription(selectedElection.description ?? '');
    setEligibility(selectedElection.rules?.eligibility ?? '');
    setBallotFormat(selectedElection.rules?.ballot_format ?? '');
    setStartAt(toDateTimeLocal(selectedElection.schedule?.start_at ?? ''));
    setEndAt(toDateTimeLocal(selectedElection.schedule?.end_at ?? ''));
  }, [selectedElection]);

  async function fetchAll() {
    setError('');
    const [eRes, pRes] = await Promise.all([
      fetch(`${API_BASE}/elections`, { headers: { 'X-Role': 'ElectionBoard' } }),
      fetch(`${API_BASE}/parties`, { headers: { 'X-Role': 'ElectionBoard' } }),
    ]);
    const eData = await eRes.json();
    const pData = await pRes.json();
    if (!eRes.ok) throw new Error(eData.error ?? 'Failed elections');
    if (!pRes.ok) throw new Error(pData.error ?? 'Failed parties');
    setElections(eData.items ?? []);
    setParties(pData.items ?? []);
    if (!selectedElectionId && eData.items?.length) {
      setSelectedElectionId(eData.items[0].id);
    }
  }

  async function fetchCandidates(electionId: number) {
    const res = await fetch(`${API_BASE}/candidates?election_id=${electionId}`, {
      headers: { 'X-Role': 'ElectionBoard' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed candidates');
    setCandidates(data.items ?? []);
  }

  useEffect(() => {
    fetchAll().catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedElectionId) return;
    fetchCandidates(selectedElectionId).catch((e: Error) => setError(e.message));
  }, [selectedElectionId]);

  async function onCreateElection(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    const res = await fetch(`${API_BASE}/elections`, {
      method: 'POST',
      headers: roleHeaders,
      body: JSON.stringify({ title: electionTitle, description: electionDescription }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Create election failed');
    setMessage(`Election created: ${data.title}`);
    setElectionTitle('');
    setElectionDescription('');
    await fetchAll();
    setSelectedElectionId(data.id);
  }

  async function onCreateParty(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${API_BASE}/parties`, {
      method: 'POST',
      headers: roleHeaders,
      body: JSON.stringify({ name: partyName, description: partyDescription }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Create party failed');
    setMessage(`Party created: ${data.name}`);
    setPartyName('');
    setPartyDescription('');
    await fetchAll();
  }

  async function onDeleteParty(partyId: number) {
    setMessage('');
    setError('');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${API_BASE}/parties/${partyId}`, {
      method: 'DELETE',
      headers: { 'X-Role': 'ElectionBoard' },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Delete party failed');
    setMessage('Party deleted.');
    await fetchAll();
  }

  async function onCreateCandidate(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (editingLocked) return setError('Editing is locked for active election');
    if (!selectedElectionId || !candidatePartyId) return setError('Select election and party first');
    const targetUrl = editingCandidateId
      ? `${API_BASE}/candidates/${editingCandidateId}`
      : `${API_BASE}/candidates`;
    const method = editingCandidateId ? 'PATCH' : 'POST';

    const res = await fetch(targetUrl, {
      method,
      headers: roleHeaders,
      body: JSON.stringify({
        name: candidateName,
        profile_info: candidateProfile,
        election_id: editingCandidateId ? undefined : selectedElectionId,
        party_id: candidatePartyId,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Save candidate failed');
    setMessage(editingCandidateId ? `Candidate updated: ${data.name}` : `Candidate created: ${data.name}`);
    setCandidateName('');
    setCandidateProfile('');
    setEditingCandidateId(null);
    await fetchCandidates(selectedElectionId);
  }

  async function onEditCandidate(candidate: Candidate) {
    setEditingCandidateId(candidate.id);
    setCandidateName(candidate.name);
    setCandidateProfile('');
    setCandidatePartyId(candidate.party_id);
  }

  async function onDeleteCandidate(candidateId: number) {
    setMessage('');
    setError('');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${API_BASE}/candidates/${candidateId}`, {
      method: 'DELETE',
      headers: { 'X-Role': 'ElectionBoard' },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Delete candidate failed');
    setMessage('Candidate deleted.');
    if (selectedElectionId) await fetchCandidates(selectedElectionId);
  }

  async function onSaveConfig(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${API_BASE}/elections/${selectedElectionId}/config`, {
      method: 'PATCH',
      headers: roleHeaders,
      body: JSON.stringify({
        rules: { eligibility, ballot_format: ballotFormat },
        schedule: { start_at: startAt, end_at: endAt },
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Save config failed');
    setMessage(`Configuration saved for ${data.title}`);
    await fetchAll();
  }

  async function activateElection() {
    setMessage('');
    setError('');
    if (!selectedElectionId) return setError('Select election first');
    const res = await fetch(`${API_BASE}/elections/${selectedElectionId}/activate`, {
      method: 'POST',
      headers: roleHeaders,
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Activate failed');
    setMessage(`Election activated: ${data.title}`);
    await fetchAll();
  }

  async function updateSelectedElection() {
    setMessage('');
    setError('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Editing is locked for active election');
    const res = await fetch(`${API_BASE}/elections/${selectedElectionId}`, {
      method: 'PATCH',
      headers: roleHeaders,
      body: JSON.stringify({ title: electionTitle, description: electionDescription }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Update election failed');
    setMessage(`Election updated: ${data.title}`);
    await fetchAll();
  }

  async function deleteSelectedElection() {
    setMessage('');
    setError('');
    if (!selectedElectionId) return setError('Select election first');
    if (editingLocked) return setError('Cannot delete active election');
    const res = await fetch(`${API_BASE}/elections/${selectedElectionId}`, {
      method: 'DELETE',
      headers: { 'X-Role': 'ElectionBoard' },
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Delete election failed');
    setMessage('Election deleted.');
    setSelectedElectionId(null);
    setCandidates([]);
    await fetchAll();
  }

  return (
    <section>
      <h1>Election Setup</h1>

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

      <hr />

      <form onSubmit={onCreateElection}>
        <h2>Create Election</h2>
        <input
          value={electionTitle}
          onChange={(e) => setElectionTitle(e.target.value)}
          placeholder="Election title"
        />
        <input
          value={electionDescription}
          onChange={(e) => setElectionDescription(e.target.value)}
          placeholder="Description"
        />
        <button type="submit">Create</button>
        <button
          type="button"
          onClick={updateSelectedElection}
          disabled={!selectedElectionId || editingLocked}
          style={{ marginLeft: 8 }}
        >
          Update Selected
        </button>
        <button
          type="button"
          onClick={deleteSelectedElection}
          disabled={!selectedElectionId || editingLocked}
          style={{ marginLeft: 8 }}
        >
          Delete Selected
        </button>
      </form>

      <form onSubmit={onCreateParty}>
        <h2>Add Party</h2>
        <input
          value={partyName}
          onChange={(e) => setPartyName(e.target.value)}
          placeholder="Party name"
          disabled={editingLocked}
        />
        <input
          value={partyDescription}
          onChange={(e) => setPartyDescription(e.target.value)}
          placeholder="Party description"
          disabled={editingLocked}
        />
        <button type="submit" disabled={editingLocked}>
          Add Party
        </button>
      </form>

      <h3>Parties</h3>
      <ul>
        {parties.map((party) => (
          <li key={party.id}>
            #{party.id} - {party.name}{' '}
            <button type="button" onClick={() => onDeleteParty(party.id)} disabled={editingLocked}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={onCreateCandidate}>
        <h2>{editingCandidateId ? 'Edit Candidate' : 'Add Candidate'}</h2>
        <input
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          placeholder="Candidate name"
          disabled={editingLocked}
        />
        <input
          value={candidateProfile}
          onChange={(e) => setCandidateProfile(e.target.value)}
          placeholder="Profile info"
          disabled={editingLocked}
        />
        <select
          value={candidatePartyId ?? ''}
          onChange={(e) => setCandidatePartyId(Number(e.target.value))}
          disabled={editingLocked}
        >
          <option value="" disabled>
            Select party
          </option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={editingLocked}>
          {editingCandidateId ? 'Save Candidate' : 'Add Candidate'}
        </button>
        <button
          type="button"
          disabled={!editingCandidateId}
          onClick={() => {
            setEditingCandidateId(null);
            setCandidateName('');
            setCandidateProfile('');
          }}
          style={{ marginLeft: 8 }}
        >
          Cancel Edit
        </button>
      </form>

      <form onSubmit={onSaveConfig}>
        <h2>Configure Rules and Schedule</h2>
        <input
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          placeholder="Eligibility rule"
          disabled={editingLocked}
        />
        <input
          value={ballotFormat}
          onChange={(e) => setBallotFormat(e.target.value)}
          placeholder="Ballot format"
          disabled={editingLocked}
        />
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          disabled={editingLocked}
        />
        <input
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          disabled={editingLocked}
        />
        <button type="submit" disabled={editingLocked}>
          Save Config
        </button>
      </form>

      <button type="button" onClick={activateElection} disabled={editingLocked || !selectedElectionId}>
        Activate Election
      </button>

      <h3>Candidates in selected election</h3>
      <ul>
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            #{candidate.id} - {candidate.name} (party: {candidate.party_id}){' '}
            <button type="button" onClick={() => onEditCandidate(candidate)} disabled={editingLocked}>
              Edit
            </button>{' '}
            <button type="button" onClick={() => onDeleteCandidate(candidate.id)} disabled={editingLocked}>
              Delete
            </button>
          </li>
        ))}
      </ul>
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
