'use client';

import { FormEvent, useState } from 'react';

import { apiPost } from '../../../lib/apiClient';

export default function VoterRegistrationPage() {
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [updatedContact, setUpdatedContact] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function startOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/voters/register/start-otp', 'ElectionOfficer', {
        full_name: fullName,
        contact,
        national_id: nationalId,
      });
      setGeneratedOtp(data.otp ?? '');
      setMessage(`OTP sent via ${data.channel ?? 'sms/email'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function resendOtp() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/voters/register/resend-otp', 'ElectionOfficer', {
        national_id: nationalId,
        contact,
        updated_contact: updatedContact || undefined,
      });
      setGeneratedOtp(data.otp ?? '');
      setMessage(`OTP resent via ${data.channel ?? 'sms/email'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function completeRegistration(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/voters/register/verify-otp', 'ElectionOfficer', {
        contact,
        otp,
        full_name: fullName,
        national_id: nationalId,
        username,
        password,
      });
      setMessage(
        `Voter registered. User ID: ${data.user_id}, Voter ID: ${data.voter_id}, Username: ${data.credentials?.username}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Voter Registration</h1>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <form onSubmit={startOtp}>
        <h2>Step 1: Start OTP</h2>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
        <input value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="National ID" />
        <button type="submit">Generate OTP</button>
        <input
          value={updatedContact}
          onChange={(e) => setUpdatedContact(e.target.value)}
          placeholder="Updated contact if OTP fails"
        />
        <button type="button" onClick={resendOtp} style={{ marginLeft: 8 }}>
          Resend OTP
        </button>
        {generatedOtp ? <p>OTP (dev mode): {generatedOtp}</p> : null}
      </form>

      <form onSubmit={completeRegistration}>
        <h2>Step 2: Verify OTP and Register</h2>
        <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        <button type="submit">Register Voter</button>
      </form>
    </section>
  );
}
