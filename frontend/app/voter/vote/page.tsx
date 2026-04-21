'use client';

import { useState } from 'react';

import { getApiBase } from '../../../lib/apiBase';

type Candidate = { id: number; name: string; party_id: number };

export default function VoterVotePage() {
  const [electionId, setElectionId] = useState('');
  const [voterSystemId, setVoterSystemId] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [voterUserId, setVoterUserId] = useState<number | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [forceBiometricFail, setForceBiometricFail] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [abstain, setAbstain] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function requestOtp() {
    setError('');
    setMessage('');
    const res = await fetch(`${getApiBase()}/voting/session/request-otp`, {
      method: 'POST',
      headers: getVoterHeaders(true),
      body: JSON.stringify({ voter_id: voterSystemId }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'OTP request failed');
    setVoterUserId(data.voter_user_id);
    setMessage(`OTP sent (${data.channel}). Dev OTP: ${data.otp}`);
  }

  async function startSession() {
    setError('');
    setMessage('');
    const res = await fetch(`${getApiBase()}/voting/session/start`, {
      method: 'POST',
      headers: getVoterHeaders(true),
      body: JSON.stringify({ voter_id: voterSystemId, otp }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Session start failed');
    setSessionToken(data.voting_session_token);
    setVoterUserId(data.voter_user_id);
    setSessionExpiresAt(data.expires_at);
    localStorage.setItem('evoting.votingSession', data.voting_session_token);
    setMessage(`Voting session active until ${data.expires_at}`);
  }

  async function verifyBiometric() {
    setError('');
    setMessage('');
    if (!voterUserId) return setError('Start session first');
    const res = await fetch(`${getApiBase()}/voting/verify-biometric`, {
      method: 'POST',
      headers: getVoterHeaders(true, sessionToken),
      body: JSON.stringify({ voter_user_id: voterUserId, force_fail: forceBiometricFail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBiometricVerified(false);
      return setError(data.error ?? 'Biometric verification failed');
    }
    setBiometricVerified(true);
    setMessage('Biometric verified. You can now load ballot and vote.');
  }

  async function loadBallot() {
    setError('');
    setMessage('');
    try {
      if (!sessionToken || !voterUserId) return setError('Start session first');
      const res = await fetch(
        `${getApiBase()}/ballot?election_id=${electionId}&voter_user_id=${voterUserId}`,
        { headers: getVoterHeaders(false, sessionToken) },
      );
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? 'Failed');
      setCandidates(data.candidates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function castVote() {
    setError('');
    setMessage('');
    try {
      if (!sessionToken || !voterUserId) return setError('Start session first');
      if (!biometricVerified) return setError('Complete biometric verification first');
      if (!abstain && !candidateId) return setError('Select candidate or choose abstain');
      const confirmed = window.confirm(
        abstain
          ? 'Confirm abstention? Your abstain choice will be recorded.'
          : 'Confirm this vote selection?',
      );
      if (!confirmed) return;

      const payload = {
        election_id: Number(electionId),
        voter_user_id: voterUserId,
        candidate_id: abstain ? null : Number(candidateId),
        abstain,
      };
      const res = await fetch(`${getApiBase()}/voting/cast`, {
        method: 'POST',
        headers: getVoterHeaders(true, sessionToken),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? 'Failed');
      setMessage(`Vote submitted successfully. Hash: ${data.vote_hash}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Vote</h1>
      <h2>Step 1: Login with voter ID + OTP</h2>
      <input value={voterSystemId} onChange={(e) => setVoterSystemId(e.target.value)} placeholder="Voter ID (e.g., VOT-000001)" />
      <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" />
      <button type="button" onClick={requestOtp}>
        Request OTP
      </button>{' '}
      <button type="button" onClick={startSession}>
        Start Voting Session
      </button>
      {sessionToken ? <p>Session active. Expires at: {sessionExpiresAt}</p> : null}

      <h2>Step 2: Biometric verification</h2>
      <label>
        <input
          type="checkbox"
          checked={forceBiometricFail}
          onChange={(e) => setForceBiometricFail(e.target.checked)}
        />{' '}
        Simulate biometric failure (for testing)
      </label>{' '}
      <button type="button" onClick={verifyBiometric}>
        Verify Biometric
      </button>

      <h2>Step 3: Load ballot and vote</h2>
      <input value={electionId} onChange={(e) => setElectionId(e.target.value)} placeholder="Election ID" />
      <button type="button" onClick={loadBallot}>
        Load Ballot
      </button>
      <div>
        <label>
          <input type="checkbox" checked={abstain} onChange={(e) => setAbstain(e.target.checked)} /> Abstain
        </label>
      </div>
      {!abstain ? (
        <select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
          <option value="">Select candidate</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} (party #{candidate.party_id})
            </option>
          ))}
        </select>
      ) : null}
      <button type="button" onClick={castVote}>
        Confirm and Submit Vote
      </button>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
    </section>
  );
}

function getVoterHeaders(withJson = false, votingSessionToken?: string): HeadersInit {
  const headers: Record<string, string> = { 'X-Role': 'Voter' };
  if (withJson) headers['Content-Type'] = 'application/json';
  if (votingSessionToken) headers['X-Voting-Session'] = votingSessionToken;
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
