'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../../lib/apiBase';
import { toElectionBoardMessage } from '../../../lib/electionBoardMessages';
import { readApiBody } from '../../../lib/readApiBody';
import { boardLogout, getElectionBoardHeaders, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';

type Election = { id: number; title: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' };
type Region = { id: number; name: string };

const emptyForm = {
  name: '',
  scope_level: 'NATIONAL',
  region_id: '',
  abbreviation: '',
  description: '',
  mission: '',
  vision: '',
  headquarters_address: '',
  party_registered_at: '',
  operational_status: 'ACTIVE',
  leader_name: '',
  deputy_leader_name: '',
  leader_phone: '',
  leader_email: '',
  registration_number: '',
  approval_status: 'PENDING',
  regions: '',
  election_year: '',
};

export default function ElectionBoardPartiesPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [elections, setElections] = useState<Election[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [newRegionName, setNewRegionName] = useState('');
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [partyLogo, setPartyLogo] = useState<File | null>(null);
  const [leaderImage, setLeaderImage] = useState<File | null>(null);
  const [supportingDocument, setSupportingDocument] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );
  const editingLocked = selectedElection?.status === 'ACTIVE';

  async function loadData() {
    setError('');
    try {
      const eRes = await fetch(`${getApiBase()}/elections`, { headers: getElectionBoardHeaders() });
      const rRes = await fetch(`${getApiBase()}/regions`, { headers: getElectionBoardHeaders() });
      const eData = await readApiBody(eRes);
      const rData = await readApiBody(rRes);
      if (!eRes.ok) throw new Error(toElectionBoardMessage(String(eData.error ?? 'Failed elections')));
      if (!rRes.ok) throw new Error(toElectionBoardMessage(String(rData.error ?? 'Failed regions')));
      const electionRows: Election[] = (eData.items as Election[]) ?? [];
      setElections(electionRows);
      setRegions((rData.items as Region[]) ?? []);
      if (!selectedElectionId && electionRows.length > 0) setSelectedElectionId(electionRows[0].id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cannot load data';
      setError(msg.includes('Failed to fetch') ? 'Cannot reach the API. Start Flask on port 5000 and restart Next dev.' : msg);
    }
  }

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (!isBoard) return;
    loadData().catch((e: Error) => setError(e.message));
  }, []);

  function clearFormAndSelection() {
    setForm(emptyForm);
    setPartyLogo(null);
    setLeaderImage(null);
    setSupportingDocument(null);
  }

  function buildPartyFormData(): FormData {
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('scope_level', form.scope_level);
    if (form.scope_level === 'REGIONAL') {
      fd.append('region_id', form.region_id);
    }
    fd.append('registration_number', form.registration_number.trim());
    fd.append('abbreviation', form.abbreviation.trim());
    fd.append('description', form.description);
    fd.append('mission', form.mission);
    fd.append('vision', form.vision);
    fd.append('headquarters_address', form.headquarters_address);
    fd.append('party_registered_at', form.party_registered_at);
    fd.append('operational_status', form.operational_status);
    fd.append('leader_name', form.leader_name);
    fd.append('deputy_leader_name', form.deputy_leader_name);
    fd.append('leader_phone', form.leader_phone);
    fd.append('leader_email', form.leader_email);
    fd.append('approval_status', form.approval_status);
    fd.append('regions', form.regions);
    fd.append('election_year', form.election_year.trim());
    if (partyLogo) fd.append('party_logo', partyLogo);
    if (leaderImage) fd.append('leader_image', leaderImage);
    if (supportingDocument) fd.append('supporting_document', supportingDocument);
    return fd;
  }

  async function saveParty(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (editingLocked) return setError('Editing is locked for active election');
    if (!form.name.trim()) return setError('Party name is required.');
    if (!form.registration_number.trim()) return setError('Registration number is required.');
    if (form.scope_level === 'REGIONAL' && !form.region_id) return setError('Select region for regional party.');

    const fd = buildPartyFormData();
    const res = await fetch(`${getApiBase()}/parties`, {
      method: 'POST',
      headers: getElectionBoardHeaders(false),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Save failed'));
    setMessage(`Party created: ${data.name}`);
    clearFormAndSelection();
  }

  async function onLogout() {
    await boardLogout(getApiBase());
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
    router.push('/login');
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
    await loadData();
    if (data.id) {
      setForm((f) => ({ ...f, region_id: String(data.id), scope_level: 'REGIONAL' }));
      setMessage(`Region ready: ${data.name}`);
    } else {
      setMessage('Region already existed and was loaded.');
    }
  }

  async function removeRegion() {
    setError('');
    setMessage('');
    const selectedRegionId = Number(form.region_id);
    if (!selectedRegionId) return setError('Select a region first.');
    if (!window.confirm('Remove this region? This works only if no election, party, or candidate is using it.')) return;
    const res = await fetch(`${getApiBase()}/regions/${selectedRegionId}`, {
      method: 'DELETE',
      headers: getElectionBoardHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(toElectionBoardMessage(data.error ?? 'Remove region failed'));
    setForm((f) => ({ ...f, region_id: '' }));
    setMessage('Region removed.');
    await loadData();
  }

  if (!sessionChecked) return <section><p>Checking session...</p></section>;
  if (!authorized) {
    return (
      <section>
        <h1>Political Parties</h1>
        <p>This page is for Election Board members only.</p>
        <Link href="/login">Login as Election Board</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Political Parties</h1>
          <p className="muted">
            Register parties with basic details, leadership, legal verification, and participation metadata. System
            records who created each party and when it was last updated.
          </p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties" className="active">Add Party</Link>
        <Link href="/election-board/parties/list">Party List</Link>
        <Link href="/election-board/candidates/list">Candidates</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      {error ? <p className="status-banner status-error">{error}</p> : null}
      {message ? <p className="status-banner status-success">{message}</p> : null}

      <div className="panel">
        <form className="party-form" onSubmit={saveParty}>
          <h2>Add political party</h2>
          <p className="muted small">
            Created by / timestamps are stored automatically when you save.
          </p>

          <details open className="party-section">
            <summary>1. Basic information</summary>
            <div className="form-row">
              <label>Scope level *</label>
              <select
                value={form.scope_level}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    scope_level: e.target.value,
                    region_id: e.target.value === 'REGIONAL' ? f.region_id : '',
                  }))
                }
                disabled={editingLocked}
              >
                <option value="NATIONAL">National</option>
                <option value="REGIONAL">Regional</option>
              </select>
            </div>
            {form.scope_level === 'REGIONAL' ? (
              <>
                <div className="form-row">
                  <label>Region * (required for Regional scope)</label>
                  <select
                    value={form.region_id}
                    onChange={(e) => setForm((f) => ({ ...f, region_id: e.target.value }))}
                    disabled={editingLocked}
                  >
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
                    <button type="button" onClick={removeRegion} disabled={editingLocked || !form.region_id}>Remove Selected Region</button>
                  </div>
                </div>
              </>
            ) : null}
            <div className="form-row">
              <label>Party name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={editingLocked} required />
            </div>
            <div className="form-row">
              <label>Party abbreviation</label>
              <input value={form.abbreviation} onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))} disabled={editingLocked} maxLength={32} />
            </div>
            <div className="form-row">
              <label>Party logo (PNG, JPG, WebP)</label>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,image/*" onChange={(e) => setPartyLogo(e.target.files?.[0] ?? null)} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Registration date (with authority)</label>
              <input type="datetime-local" value={form.party_registered_at} onChange={(e) => setForm((f) => ({ ...f, party_registered_at: e.target.value }))} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Operational status</label>
              <select value={form.operational_status} onChange={(e) => setForm((f) => ({ ...f, operational_status: e.target.value }))} disabled={editingLocked}>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="BANNED">Banned</option>
              </select>
            </div>
          </details>

          <details open className="party-section">
            <summary>2. Leadership</summary>
            <div className="form-row">
              <label>Party leader name</label>
              <input value={form.leader_name} onChange={(e) => setForm((f) => ({ ...f, leader_name: e.target.value }))} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Deputy leader name</label>
              <input value={form.deputy_leader_name} onChange={(e) => setForm((f) => ({ ...f, deputy_leader_name: e.target.value }))} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Phone</label>
              <input value={form.leader_phone} onChange={(e) => setForm((f) => ({ ...f, leader_phone: e.target.value }))} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={form.leader_email} onChange={(e) => setForm((f) => ({ ...f, leader_email: e.target.value }))} disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Leader photo</label>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,image/*" onChange={(e) => setLeaderImage(e.target.files?.[0] ?? null)} disabled={editingLocked} />
            </div>
          </details>

          <details open className="party-section">
            <summary>3. Party details</summary>
            <div className="form-row">
              <label>Description / ideology</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={editingLocked} rows={3} />
            </div>
            <div className="form-row">
              <label>Mission</label>
              <textarea value={form.mission} onChange={(e) => setForm((f) => ({ ...f, mission: e.target.value }))} disabled={editingLocked} rows={2} />
            </div>
            <div className="form-row">
              <label>Vision</label>
              <textarea value={form.vision} onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))} disabled={editingLocked} rows={2} />
            </div>
            <div className="form-row">
              <label>Headquarters address</label>
              <textarea value={form.headquarters_address} onChange={(e) => setForm((f) => ({ ...f, headquarters_address: e.target.value }))} disabled={editingLocked} rows={2} />
            </div>
          </details>

          <details open className="party-section">
            <summary>4. Legal & verification</summary>
            <div className="form-row">
              <label>Registration number (unique) *</label>
              <input value={form.registration_number} onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))} disabled={editingLocked} required />
            </div>
            <div className="form-row">
              <label>Approval status</label>
              <select value={form.approval_status} onChange={(e) => setForm((f) => ({ ...f, approval_status: e.target.value }))} disabled={editingLocked}>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="form-row">
              <label>Supporting document (PDF)</label>
              <input type="file" accept=".pdf,application/pdf" onChange={(e) => setSupportingDocument(e.target.files?.[0] ?? null)} disabled={editingLocked} />
            </div>
          </details>

          <details open className="party-section">
            <summary>5. Election participation</summary>
            <div className="form-row">
              <label>Region(s)</label>
              <input value={form.regions} onChange={(e) => setForm((f) => ({ ...f, regions: e.target.value }))} placeholder="Optional extra coverage text" disabled={editingLocked} />
            </div>
            <div className="form-row">
              <label>Election year</label>
              <input value={form.election_year} onChange={(e) => setForm((f) => ({ ...f, election_year: e.target.value }))} placeholder="e.g. 2026" inputMode="numeric" disabled={editingLocked} />
            </div>
            <p className="muted small">Candidates are linked on the Candidates page after the party exists.</p>
          </details>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button type="submit" disabled={editingLocked}>Save party</button>
            <button type="button" onClick={clearFormAndSelection} disabled={editingLocked}>New party</button>
          </div>
        </form>
      </div>
    </section>
  );
}
