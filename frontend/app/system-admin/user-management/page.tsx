'use client';

import Link from 'next/link';
import { CSSProperties, FormEvent, useEffect, useState } from 'react';

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

const ROLE_OPTIONS: ManagedRole[] = [
  'ElectionOfficer',
  'ElectionBoard',
  'AuditAuthority',
  'SystemAdmin',
  'Voter',
];

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Record<number, ManagedRole>>({});
  const [pendingDetails, setPendingDetails] = useState<
    Record<number, Pick<UserRow, 'full_name' | 'username' | 'national_id' | 'contact_info'>>
  >({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [updatingDetailsFor, setUpdatingDetailsFor] = useState<number | null>(null);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<number | null>(null);
  const [updatingStatusFor, setUpdatingStatusFor] = useState<number | null>(null);
  const [resettingCredentialsFor, setResettingCredentialsFor] = useState<number | null>(null);
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
    const rows: UserRow[] = data.items ?? [];
    setUsers(rows);
    setPendingDetails((prev) => {
      const next: Record<
        number,
        Pick<UserRow, 'full_name' | 'username' | 'national_id' | 'contact_info'>
      > = { ...prev };
      for (const user of rows) {
        if (!next[user.id]) {
          next[user.id] = {
            full_name: user.full_name,
            username: user.username,
            national_id: user.national_id,
            contact_info: user.contact_info ?? '',
          };
        }
      }
      return next;
    });
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
    setUpdatingStatusFor(userId);
    try {
      await apiPost(`/admin/users/${userId}/deactivate`, 'SystemAdmin');
      setMessage('User deactivated.');
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUpdatingStatusFor(null);
    }
  }

  async function activateUser(userId: number) {
    if (!authorized) return;
    setError('');
    setMessage('');
    setUpdatingStatusFor(userId);
    try {
      await apiPost(`/admin/users/${userId}/activate`, 'SystemAdmin');
      setMessage('User activated.');
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUpdatingStatusFor(null);
    }
  }

  async function resetCredentials(userId: number) {
    if (!authorized) return;
    setError('');
    setMessage('');
    setResettingCredentialsFor(userId);
    try {
      const data = await apiPost(`/admin/users/${userId}/reset-credentials`, 'SystemAdmin');
      setMessage(
        `Credentials reset for user #${userId}. Temporary password: ${data.temporary_password}. Ask user to change password on first login.`,
      );
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setResettingCredentialsFor(null);
    }
  }

  async function updateRole(userId: number, role: ManagedRole) {
    if (!authorized) return;
    const user = users.find((u) => u.id === userId);
    if (!user) {
      setError('User not found.');
      setMessage('');
      return;
    }
    if (user.role === role) {
      setMessage(`No change needed. User is already ${role}.`);
      setError('');
      return;
    }
    if (user.id === getCurrentUserId() && role !== 'SystemAdmin') {
      setError('You cannot change your own admin role to another role.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setUpdatingRoleFor(userId);
    try {
      await apiPatch(`/admin/users/${userId}/role`, 'SystemAdmin', { role });
      setMessage(`Role updated to ${role}.`);
      await loadUsers();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUpdatingRoleFor(null);
    }
  }

  async function updateUserDetails(userId: number) {
    if (!authorized) return;
    const user = users.find((u) => u.id === userId);
    if (!user) {
      setError('User not found.');
      setMessage('');
      return;
    }
    const draft = pendingDetails[userId];
    const candidate = {
      full_name: (draft?.full_name ?? user.full_name).trim(),
      username: (draft?.username ?? user.username).trim(),
      national_id: (draft?.national_id ?? user.national_id).trim(),
      contact_info: (draft?.contact_info ?? user.contact_info ?? '').trim(),
    };
    const payload: Record<string, string> = {};
    if (candidate.full_name !== user.full_name) payload.full_name = candidate.full_name;
    if (candidate.username !== user.username) payload.username = candidate.username;
    if (candidate.national_id !== user.national_id) payload.national_id = candidate.national_id;
    if (candidate.contact_info !== (user.contact_info ?? '')) payload.contact_info = candidate.contact_info;
    if (Object.keys(payload).length === 0) {
      setMessage('No detail changes to update.');
      setError('');
      return;
    }
    setError('');
    setMessage('');
    setUpdatingDetailsFor(userId);
    try {
      await apiPatch(`/admin/users/${userId}`, 'SystemAdmin', payload);
      setMessage('User details updated.');
      await loadUsers();
      setPendingDetails((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setUpdatingDetailsFor(null);
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
    <section style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>System Admin - User Management</h1>
          <p style={styles.subtitle}>
            Create accounts, update user details, assign roles, and disable access.
          </p>
        </div>
        <div style={styles.headerActions}>
          <Link href="/system-admin/dashboard" style={styles.backLink}>
            Back to Dashboard
          </Link>
          <button type="button" onClick={loadUsers} style={styles.secondaryButton}>
            Refresh Users
          </button>
        </div>
      </header>

      {error ? <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div> : null}
      {message ? <div style={{ ...styles.alert, ...styles.alertSuccess }}>{message}</div> : null}

      <div style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Create New User</h2>
          <p style={styles.cardDescription}>
            Required fields: full name, national ID, username, password, and role.
          </p>
          <form onSubmit={createUser} style={styles.form}>
            <label style={styles.label}>
              <span>Full Name</span>
              <input
                style={styles.input}
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="e.g. Abebe Kebede"
              />
            </label>
            <label style={styles.label}>
              <span>National ID</span>
              <input
                style={styles.input}
                value={form.national_id}
                onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))}
                placeholder="Minimum 5 characters"
              />
            </label>
            <label style={styles.label}>
              <span>Contact Information</span>
              <input
                style={styles.input}
                value={form.contact_info}
                onChange={(e) => setForm((p) => ({ ...p, contact_info: e.target.value }))}
                placeholder="Phone or email"
              />
            </label>
            <label style={styles.label}>
              <span>Username</span>
              <input
                style={styles.input}
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="Unique username"
              />
            </label>
            <label style={styles.label}>
              <span>Temporary Password</span>
              <input
                style={styles.input}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Set initial password"
                type="password"
              />
            </label>
            <label style={styles.label}>
              <span>Role</span>
              <select
                style={styles.input}
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as ManagedRole }))}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" style={styles.primaryButton}>
              Create User
            </button>
          </form>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Users ({users.length})</h2>
          <p style={styles.cardDescription}>
            Update details first, then update role or deactivate user if needed.
          </p>

          <div style={styles.userList}>
            {users.map((user) => {
              const selectedRole = pendingRoles[user.id] ?? (user.role as ManagedRole);
              const currentDetails = pendingDetails[user.id] ?? {
                full_name: user.full_name,
                username: user.username,
                national_id: user.national_id,
                contact_info: user.contact_info ?? '',
              };

              return (
                <article key={user.id} style={styles.userCard}>
                  <div style={styles.userCardHeader}>
                    <strong>
                      #{user.id} - {user.full_name}
                    </strong>
                    <div style={styles.badgeGroup}>
                      <span style={styles.roleBadge}>{user.role}</span>
                      <span
                        style={{
                          ...styles.statusBadge,
                          ...(user.account_status === 'Active'
                            ? styles.statusActive
                            : styles.statusInactive),
                        }}
                      >
                        {user.account_status}
                      </span>
                    </div>
                  </div>

                  <div style={styles.detailGrid}>
                    <label style={styles.label}>
                      <span>Full Name</span>
                      <input
                        style={styles.input}
                        value={currentDetails.full_name}
                        onChange={(e) =>
                          setPendingDetails((prev) => ({
                            ...prev,
                            [user.id]: { ...currentDetails, full_name: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={styles.label}>
                      <span>Username</span>
                      <input
                        style={styles.input}
                        value={currentDetails.username}
                        onChange={(e) =>
                          setPendingDetails((prev) => ({
                            ...prev,
                            [user.id]: { ...currentDetails, username: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={styles.label}>
                      <span>National ID</span>
                      <input
                        style={styles.input}
                        value={currentDetails.national_id}
                        onChange={(e) =>
                          setPendingDetails((prev) => ({
                            ...prev,
                            [user.id]: { ...currentDetails, national_id: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label style={styles.label}>
                      <span>Contact Info</span>
                      <input
                        style={styles.input}
                        value={currentDetails.contact_info}
                        onChange={(e) =>
                          setPendingDetails((prev) => ({
                            ...prev,
                            [user.id]: { ...currentDetails, contact_info: e.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      style={styles.primaryButton}
                      onClick={() => updateUserDetails(user.id)}
                      disabled={updatingDetailsFor === user.id}
                    >
                      {updatingDetailsFor === user.id ? 'Updating Details...' : 'Update Details'}
                    </button>

                    <select
                      style={styles.input}
                      value={selectedRole}
                      onChange={(e) =>
                        setPendingRoles((prev) => ({ ...prev, [user.id]: e.target.value as ManagedRole }))
                      }
                    >
                      {ROLE_OPTIONS.map((role) => {
                        const isOwnAccount = user.id === getCurrentUserId();
                        const disableRole = isOwnAccount && role !== 'SystemAdmin';
                        return (
                          <option key={role} value={role} disabled={disableRole}>
                            {role}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => updateRole(user.id, selectedRole)}
                      disabled={updatingRoleFor === user.id}
                    >
                      {updatingRoleFor === user.id ? 'Updating Role...' : 'Update Role'}
                    </button>

                    {user.account_status === 'Active' ? (
                      <button
                        type="button"
                        style={styles.dangerButton}
                        onClick={() => deactivateUser(user.id)}
                        disabled={updatingStatusFor === user.id}
                      >
                        {updatingStatusFor === user.id ? 'Updating Status...' : 'Deactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={styles.successButton}
                        onClick={() => activateUser(user.id)}
                        disabled={updatingStatusFor === user.id}
                      >
                        {updatingStatusFor === user.id ? 'Updating Status...' : 'Activate'}
                      </button>
                    )}
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => resetCredentials(user.id)}
                      disabled={resettingCredentialsFor === user.id}
                    >
                      {resettingCredentialsFor === user.id ? 'Resetting...' : 'Reset Credentials'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
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
    invalid_full_name: 'Please provide a valid full name.',
    invalid_username: 'Please provide a valid username.',
    no_update_fields: 'No fields provided to update.',
    role_required: 'Please select a role.',
    user_not_found: 'User not found.',
    x_user_id_required: 'System Admin login required. Please login again.',
    admin_role_required: 'Only System Admin can manage users.',
    admin_account_not_active: 'Your admin account is not active.',
    cannot_deactivate_self: 'You cannot deactivate your own admin account.',
    cannot_change_own_admin_role: 'You cannot change your own admin role to another role.',
    cannot_reset_self_credentials: 'You cannot reset your own credentials.',
    credentials_reset: 'Credentials reset successfully.',
  };
  return mappings[raw] ?? raw;
}

function getCurrentUserId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('evoting.user');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: number };
    return parsed?.id ?? null;
  } catch {
    return null;
  }
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '1.6rem',
  },
  subtitle: {
    marginTop: '6px',
    color: '#6b7280',
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  backLink: {
    textDecoration: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#111827',
    background: '#fff',
    fontWeight: 600,
  },
  grid: {
    display: 'grid',
    gap: '16px',
    gridTemplateColumns: '1fr',
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '16px',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.1rem',
  },
  cardDescription: {
    margin: '6px 0 14px 0',
    color: '#6b7280',
    fontSize: '0.95rem',
  },
  form: {
    display: 'grid',
    gap: '10px',
  },
  label: {
    display: 'grid',
    gap: '5px',
    fontSize: '0.9rem',
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#fff',
    fontSize: '0.95rem',
  },
  primaryButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #1d4ed8',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #dc2626',
    background: '#ef4444',
    color: '#fff',
    cursor: 'pointer',
  },
  successButton: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #15803d',
    background: '#16a34a',
    color: '#fff',
    cursor: 'pointer',
  },
  alert: {
    padding: '10px 12px',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '0.95rem',
  },
  alertError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
  },
  alertSuccess: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    color: '#065f46',
  },
  userList: {
    display: 'grid',
    gap: '12px',
  },
  userCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '12px',
    background: '#fafafa',
  },
  userCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  badgeGroup: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  roleBadge: {
    fontSize: '0.78rem',
    padding: '4px 8px',
    borderRadius: '999px',
    background: '#e0e7ff',
    color: '#3730a3',
    border: '1px solid #c7d2fe',
  },
  statusBadge: {
    fontSize: '0.78rem',
    padding: '4px 8px',
    borderRadius: '999px',
    border: '1px solid',
  },
  statusActive: {
    background: '#ecfdf5',
    color: '#065f46',
    borderColor: '#a7f3d0',
  },
  statusInactive: {
    background: '#fff7ed',
    color: '#9a3412',
    borderColor: '#fed7aa',
  },
  detailGrid: {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    marginBottom: '10px',
  },
  actionRow: {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: '1fr',
  },
};
