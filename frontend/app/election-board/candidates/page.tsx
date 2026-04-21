'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../lib/electionBoardMessages';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';

type Election = {
  id: number;
  title: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
  election_scope?: 'NATIONAL' | 'REGIONAL';
  region_id?: number | null;
};
type Party = { id: number; name: string; scope_level?: 'NATIONAL' | 'REGIONAL'; region_id?: number | null };
type Region = { id: number; name: string };

export default function ElectionBoardCandidatesPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [newRegionName, setNewRegionName] = useState('');
  const [selectedRegionToRemove, setSelectedRegionToRemove] = useState<number | null>(null);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateGender, setCandidateGender] = useState('');
  const [candidateDob, setCandidateDob] = useState('');
  const [candidateAge, setCandidateAge] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePartyId, setCandidatePartyId] = useState<number | null>(null);
  const [candidatePosition, setCandidatePosition] = useState('');
  const [candidateElectionYear, setCandidateElectionYear] = useState('');
  const [candidateRegionDistrict, setCandidateRegionDistrict] = useState('');
  const [candidateProfile, setCandidateProfile] = useState('');
  const [candidateStatus, setCandidateStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [candidatePhoto, setCandidatePhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );
  const editingLocked = selectedElection?.status === 'ACTIVE';
  const isRegionalElection = selectedElection?.election_scope === 'REGIONAL';

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadBaseData().catch((e: Error) => setError(e.message));
  }, []);

  async function loadBaseData() {
    setError('');
    const [eRes, pRes, rRes] = await Promise.all([
      fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/parties`, { headers: getElectionBoardHeaders() }),
      fetch(`${getApiBase()}/regions`, { headers: getElectionBoardHeaders() }),
    ]);
    const eData = await eRes.json();
    const pData = await pRes.json();
    const rData = await rRes.json();
    if (!eRes.ok) throw new Error(toElectionBoardMessage(eData.error ?? 'Failed elections'));
    if (!pRes.ok) throw new Error(toElectionBoardMessage(pData.error ?? 'Failed parties'));
    if (!rRes.ok) throw new Error(toElectionBoardMessage(rData.error ?? 'Failed regions'));
    const electionRows: Election[] = eData.items ?? [];
    setElections(electionRows);
    setParties(pData.items ?? []);
    setRegions(rData.items ?? []);
    if (!selectedElectionId && electionRows.length > 0) setSelectedElectionId(electionRows[0].id);
  }

  useEffect(() => {
    if (!selectedElectionId) return;
    fetch(`${getApiBase()}/parties?election_id=${selectedElectionId}`, {
      headers: getElectionBoardHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.items)) setParties(data.items);
      })
      .catch(() => {});
  }, [selectedElectionId]);

  function clearCandidateForm() {
    setCandidateName('');
    setCandidateGender('');
    setCandidateDob('');
    setCandidateAge('');
    setCandidatePhone('');
    setCandidateEmail('');
    setCandidatePartyId(null);
    setCandidatePosition('');
    setCandidateElectionYear('');
    setCandidateRegionDistrict('');
    setCandidateProfile('');
    setCandidateStatus('PENDING');
    setCandidatePhoto(null);
  }

  async function saveCandidate(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (editingLocked) return setError('Editing is locked for active election');
    if (!selectedElectionId || !candidatePartyId) return setError('Select election and party first');
    if (!candidateName.trim()) return setError('Candidate name is required.');
    if (!candidatePosition.trim()) return setError('Position is required.');
    if (!candidateProfile.trim()) return setError('Biography / description is required.');

    const formData = new FormData();
    formData.append('name', candidateName.trim());
    formData.append('profile_info', candidateProfile.trim());
    formData.append('party_id', String(candidatePartyId));
    formData.append('gender', candidateGender.trim());
    formData.append('date_of_birth', candidateDob.trim());
    formData.append('age', candidateAge.trim());
    formData.append('phone_number', candidatePhone.trim());
    formData.append('email_address', candidateEmail.trim());
    formData.append('running_position', candidatePosition.trim());
    formData.append('election_year', candidateElectionYear.trim());
    formData.append('region_district', candidateRegionDistrict.trim());
    if (isRegionalElection && selectedElection?.region_id) {
      formData.append('region_id', String(selectedElection.region_id));
    }
    formData.append('candidate_status', candidateStatus);
    formData.append('election_id', String(selectedElectionId));
    if (candidatePhoto) {
      formData.append('photo', candidatePhoto);
    }
    const res = await fetch(`${getApiBase()}/candidates`, {
      method: 'POST',
      headers: getElectionBoardHeaders(),
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Save candidate failed'));
    setMessage(`Candidate created: ${data.name}`);
    clearCandidateForm();
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
    await loadBaseData();
    setMessage(data.name ? `Region ready: ${data.name}` : 'Region already existed and was loaded.');
  }

  async function removeRegion() {
    setError('');
    setMessage('');
    if (!selectedRegionToRemove) return setError('Select a region to remove first.');
    if (!window.confirm('Remove this region? This works only if no election, party, or candidate is using it.')) return;
    const res = await fetch(`${getApiBase()}/regions/${selectedRegionToRemove}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Remove region failed'));
    setSelectedRegionToRemove(null);
    setMessage('Region removed.');
    await loadBaseData();
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
        <h1>Candidates</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Candidates</h1>
          <p className="muted">Register candidates and manage candidate details by election.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties/list">Political Parties</Link>
        <Link href="/election-board/candidates" className="active">Add Candidate</Link>
        <Link href="/election-board/candidates/list">Candidate List</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel">
        <h2>Working Election</h2>
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
        {isRegionalElection ? (
          <p className="muted small">
            Regional election: {regions.find((region) => region.id === selectedElection?.region_id)?.name ?? 'Region not set'}.
            Candidates and parties are filtered to this region.
          </p>
        ) : null}
      </div>

      <div className="panel">
        <form className="party-form" onSubmit={saveCandidate}>
          <h2>Add Candidate</h2>
          <details open className="party-section">
            <summary>1. Basic Information</summary>
            <div className="form-row">
              <label>Candidate name *</label>
              <input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Candidate name" disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Gender</label>
              <select value={candidateGender} onChange={(e) => setCandidateGender(e.target.value)} disabled={editingLocked}>
                <option value="">Optional</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-row">
              <label>Date of birth</label>
              <input type="date" value={candidateDob} onChange={(e) => setCandidateDob(e.target.value)} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Age</label>
              <input value={candidateAge} onChange={(e) => setCandidateAge(e.target.value)} inputMode="numeric" placeholder="e.g. 42" disabled={editingLocked} />
            </div>
          </details>

          <details open className="party-section">
            <summary>2. Contact Information</summary>
            <div className="form-row">
              <label>Phone number</label>
              <input value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} placeholder="+251..." disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Email address</label>
              <input type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} placeholder="candidate@example.com" disabled={editingLocked} />
            </div>
          </details>

          <details open className="party-section">
            <summary>3. Political Information</summary>
            <div className="form-row">
              <label>Political party *</label>
              <select value={candidatePartyId ?? ''} onChange={(e) => setCandidatePartyId(Number(e.target.value))} disabled={editingLocked}>
                <option value="" disabled>Select party</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Position running for *</label>
              <input value={candidatePosition} onChange={(e) => setCandidatePosition(e.target.value)} placeholder="President / MP / Mayor ..." disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Election year</label>
              <input value={candidateElectionYear} onChange={(e) => setCandidateElectionYear(e.target.value)} inputMode="numeric" placeholder="e.g. 2026" disabled={editingLocked} />
            </div>
          </details>

          <details open className="party-section">
            <summary>4. Location / Representation</summary>
            <div className="form-row">
              <label>Region / district</label>
              <input value={candidateRegionDistrict} onChange={(e) => setCandidateRegionDistrict(e.target.value)} placeholder="Where candidate is running" disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Add region</label>
              <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
                <input value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} placeholder="Type new region name" />
                <button type="button" onClick={addRegion} disabled={editingLocked}>Add Region</button>
              </div>
            </div>
            <div className="form-row">
              <label>Remove region</label>
              <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
                <select value={selectedRegionToRemove ?? ''} onChange={(e) => setSelectedRegionToRemove(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Select region</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
                <button type="button" onClick={removeRegion} disabled={editingLocked || !selectedRegionToRemove}>Remove Selected Region</button>
              </div>
            </div>
          </details>

          <details open className="party-section">
            <summary>5. Candidate Profile</summary>
            <div className="form-row">
              <label>Photo</label>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,image/*" onChange={(e) => setCandidatePhoto(e.target.files?.[0] ?? null)} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Biography / description *</label>
              <textarea
                value={candidateProfile}
                onChange={(e) => setCandidateProfile(e.target.value)}
                placeholder="Candidate biography"
                disabled={editingLocked}
                rows={3}
              />
            </div>
          </details>

          <details open className="party-section">
            <summary>6. Status</summary>
            <div className="form-row">
              <label>Status</label>
              <select value={candidateStatus} onChange={(e) => setCandidateStatus(e.target.value as 'PENDING' | 'APPROVED' | 'REJECTED')} disabled={editingLocked}>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </details>

          <div className="toolbar">
            <button type="submit" disabled={editingLocked}>Add Candidate</button>
            <button
              type="button"
              onClick={clearCandidateForm}
            >
              Clear form
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
