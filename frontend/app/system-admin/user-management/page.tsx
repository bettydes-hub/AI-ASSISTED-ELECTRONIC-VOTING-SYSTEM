'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPatch, apiPost } from '../../../lib/apiClient';

type ManagedRole = 'Voter' | 'ElectionOfficer' | 'ElectionBoard' | 'SystemAdmin' | 'AuditAuthority';

type UserRow = {
  id: number;
  full_name: string;
  username: string;
  national_id: string;
  contact_info?: string;
  role: string;
  account_status: string;
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<number, ManagedRole>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    national_id: '',
    contact_info: '',
    username: '',
    password: '',
    role: 'ElectionOfficer' as ManagedRole,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('evoting.user');
    if (!raw) {
      setAuthorized(false);
      setSessionChecked(true);
      return;
    }
    try {
      const user = JSON.parse(raw) as { id?: number; role?: string };
      const isSystemAdmin = Boolean(user?.id && user?.role === 'SystemAdmin');
      setAuthorized(isSystemAdmin);
      setSessionChecked(true);
      if (isSystemAdmin) {
        loadUsers().catch((err: unknown) => {
          const text = err instanceof Error ? err.message : 'Failed';
          if (text === 'x_user_id_required') {
            setError('System Admin login required. Please login again.');
            return;
          }
          setError(text);
        });
      }
    } catch {
      setAuthorized(false);
      setSessionChecked(true);
    }
  }, []);

  async function loadUsers() {
    setError('');
    const data = await apiGet('/admin/users', 'SystemAdmin');
    setUsers(data.items ?? []);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!authorized) return;
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/admin/users', 'SystemAdmin', form);
      const username = data?.credentials_delivery?.username;
      setMessage(
        username
          ? `User created (system ID ${data.system_id}). Credentials sent for username: ${username}.`
          : 'User created.',
      );
      setForm({
        full_name: '',
        national_id: '',
        contact_info: '',
        username: '',
        password: '',
        role: 'ElectionOfficer',
      });
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function deactivateUser(userId: number) {
    if (!authorized) return;
    setError('');
    setMessage('');
    try {
      await apiPost(`/admin/users/${userId}/deactivate`, 'SystemAdmin');
      setMessage('User deactivated.');
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  async function updateRole(userId: number, role: ManagedRole) {
    if (!authorized) return;
    setError('');
    setMessage('');
    try {
      await apiPatch(`/admin/users/${userId}/role`, 'SystemAdmin', { role });
      setMessage(`Role updated to ${role}.`);
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  if (!sessionChecked) {
    return (
      <section>
        <h1>User Management</h1>
        <p>Checking session...</p>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section>
        <h1>User Management</h1>
        <p>System Admin login required for this page.</p>
        <p>
          <Link href="/login">Login as SystemAdmin</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>User Management</h1>
      <p>Each user must have a unique username and unique national ID.</p>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <form onSubmit={createUser}>
        <input
          value={form.full_name}
          onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
          placeholder="Full name"
        />
        <input
          value={form.national_id}
          onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))}
          placeholder="National ID (min 5 chars)"
        />
        <input
          value={form.contact_info}
          onChange={(e) => setForm((p) => ({ ...p, contact_info: e.target.value }))}
          placeholder="Contact information (phone/email)"
        />
        <input
          value={form.username}
          onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
          placeholder="Username"
        />
        <input
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          placeholder="Password"
          type="password"
        />
        <select
          value={form.role}
          onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as ManagedRole }))}
        >
          <option value="Voter">Voter</option>
          <option value="ElectionOfficer">ElectionOfficer</option>
          <option value="ElectionBoard">ElectionBoard</option>
          <option value="SystemAdmin">SystemAdmin</option>
          <option value="AuditAuthority">AuditAuthority</option>
        </select>
        <button type="submit">Create User</button>
        <button type="button" onClick={loadUsers} style={{ marginLeft: 8 }}>
          Refresh
        </button>
      </form>

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            #{user.id} - {user.full_name} ({user.role}/{user.account_status}){' '}
            <select
              value={pendingRoles[user.id] ?? (user.role as ManagedRole)}
              onChange={(e) =>
                setPendingRoles((prev) => ({ ...prev, [user.id]: e.target.value as ManagedRole }))
              }
            >
              <option value="Voter">Voter</option>
              <option value="ElectionOfficer">ElectionOfficer</option>
              <option value="ElectionBoard">ElectionBoard</option>
              <option value="SystemAdmin">SystemAdmin</option>
              <option value="AuditAuthority">AuditAuthority</option>
            </select>{' '}
            <button
              type="button"
              onClick={() => updateRole(user.id, pendingRoles[user.id] ?? (user.role as ManagedRole))}
            >
              Update Role
            </button>{' '}
            <button type="button" onClick={() => deactivateUser(user.id)}>
              Deactivate
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function toUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Failed';
  const mappings: Record<string, string> = {
    username_exists: 'Username already exists. Use a different username.',
    national_id_exists: 'National ID already exists. Use a different national ID.',
    missing_required_fields: 'Please fill all required fields before creating the user.',
    invalid_national_id: 'Invalid national ID. It must be at least 5 characters.',
    invalid_role: 'Invalid role selected.',
    x_user_id_required: 'System Admin login required. Please login again.',
    admin_role_required: 'Only System Admin can manage users.',
    admin_account_not_active: 'Your admin account is not active.',
  };
  return mappings[raw] ?? raw;
}
