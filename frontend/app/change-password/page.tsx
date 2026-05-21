'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiPost } from '../../lib/apiClient';

type SessionUser = {
  id: number;
  role: 'Voter' | 'ElectionOfficer' | 'ElectionBoard' | 'SystemAdmin' | 'AuditAuthority';
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password must match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    const raw = localStorage.getItem('evoting.user');
    if (!raw) {
      setError('Login required.');
      return;
    }
    let user: SessionUser;
    try {
      user = JSON.parse(raw) as SessionUser;
    } catch {
      setError('Invalid session. Please login again.');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/auth/change-password', user.role, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      const updated = { ...user, must_change_password: false };
      localStorage.setItem('evoting.user', JSON.stringify(updated));
      setMessage('Password changed successfully.');
      if (user.role === 'SystemAdmin') router.push('/system-admin/dashboard');
      else if (user.role === 'ElectionBoard') router.push('/election-board/dashboard');
      else if (user.role === 'ElectionOfficer') router.push('/election-officer/dashboard');
      else if (user.role === 'AuditAuthority') router.push('/audit/dashboard');
      else router.push('/voter/dashboard');
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ maxWidth: 480, margin: '20px auto', padding: 16 }}>
      <h1>Change Password</h1>
      <p>Your password was reset. Change it before continuing.</p>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
      {message ? <p style={{ color: '#047857' }}>{message}</p> : null}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current (temporary) password"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Change Password'}
        </button>
      </form>
    </section>
  );
}

function toUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Failed';
  const mappings: Record<string, string> = {
    current_and_new_password_required: 'Current and new password are required.',
    invalid_current_password: 'Current password is incorrect.',
    weak_password: 'Use at least 8 characters for the new password.',
    password_reuse_not_allowed: 'New password must be different from current password.',
    x_user_id_required: 'Session expired. Please login again.',
    user_not_found: 'User account not found.',
  };
  return mappings[raw] ?? raw;
}
