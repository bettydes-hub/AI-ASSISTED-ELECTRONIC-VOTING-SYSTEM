'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getApiBase } from '../../lib/apiBase';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupChecked, setSetupChecked] = useState(false);
  const [needsFirstSetup, setNeedsFirstSetup] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [setupForm, setSetupForm] = useState({
    full_name: '',
    national_id: '',
    contact_info: '',
    username: '',
    password: '',
  });

  useEffect(() => {
    async function loadSetupStatus() {
      try {
        const res = await fetch(`${getApiBase()}/auth/setup/status`);
        const data = await res.json();
        setNeedsFirstSetup(Boolean(data.needs_first_setup));
      } catch {
        setError('Cannot connect to backend');
      } finally {
        setSetupChecked(true);
      }
    }
    loadSetupStatus();
  }, []);

  async function onFirstSetup(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${getApiBase()}/auth/setup/first-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(toUserMessage(data.error ?? 'First setup failed'));
        return;
      }
      setMessage('First System Admin created. You can now log in.');
      setNeedsFirstSetup(false);
      setUsername(setupForm.username);
      setPassword('');
    } catch {
      setError('Cannot connect to backend');
    }
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      localStorage.setItem('evoting.user', JSON.stringify(data.user));
      localStorage.setItem('evoting.role', data.user.role);
      setMessage(`Login success as ${data.user.role}.`);
      if (data.user.must_change_password) {
        router.push('/change-password');
        return;
      }
      if (data.user.role === 'ElectionBoard') {
        router.push('/election-board/dashboard');
      } else if (data.user.role === 'SystemAdmin') {
        router.push('/system-admin/dashboard');
      } else if (data.user.role === 'ElectionOfficer') {
        router.push('/election-officer/dashboard');
      } else if (data.user.role === 'AuditAuthority') {
        router.push('/audit/dashboard');
      } else if (data.user.role === 'Voter') {
        router.push('/voter/dashboard');
      }
    } catch {
      setError('Cannot connect to backend');
    }
  }

  return (
    <section>
      <h1>Login</h1>
      <p>This phase uses role header based RBAC for fast development.</p>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      {!setupChecked ? <p>Checking first setup status...</p> : null}
      {setupChecked && needsFirstSetup ? (
        <form onSubmit={onFirstSetup}>
          <h2>First Setup: Create System Admin</h2>
          <input
            value={setupForm.full_name}
            onChange={(e) => setSetupForm((prev) => ({ ...prev, full_name: e.target.value }))}
            placeholder="Full name"
          />
          <input
            value={setupForm.national_id}
            onChange={(e) => setSetupForm((prev) => ({ ...prev, national_id: e.target.value }))}
            placeholder="National ID (min 5 chars)"
          />
          <input
            value={setupForm.contact_info}
            onChange={(e) => setSetupForm((prev) => ({ ...prev, contact_info: e.target.value }))}
            placeholder="Contact information (phone/email)"
          />
          <input
            value={setupForm.username}
            onChange={(e) => setSetupForm((prev) => ({ ...prev, username: e.target.value }))}
            placeholder="Admin username"
          />
          <input
            value={setupForm.password}
            onChange={(e) => setSetupForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Admin password"
            type="password"
          />
          <button type="submit">Create First Admin</button>
        </form>
      ) : null}

      <form onSubmit={onLogin}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
        />
        <button type="submit">Login</button>
      </form>
    </section>
  );
}

function toUserMessage(raw: string): string {
  const mappings: Record<string, string> = {
    missing_required_fields: 'Please fill all fields for first setup.',
    invalid_national_id: 'Invalid national ID. Use at least 5 characters.',
    username_exists: 'Username already exists. Use a different username.',
    national_id_exists: 'National ID already exists. Use a different national ID.',
    first_setup_already_completed: 'First setup is already completed. Please login.',
  };
  return mappings[raw] ?? raw;
}
