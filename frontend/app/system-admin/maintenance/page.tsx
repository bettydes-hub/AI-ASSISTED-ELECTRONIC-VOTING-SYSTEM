'use client';

import Link from 'next/link';
import { CSSProperties, useEffect, useState } from 'react';

import { apiGet, apiPost } from '../../../lib/apiClient';

export default function MaintenancePage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [showStatusDetails, setShowStatusDetails] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [patchLabel, setPatchLabel] = useState('security_patch_v1');
  const [securityNote, setSecurityNote] = useState('');
  const [severity, setSeverity] = useState('high');
  const [failureCategory, setFailureCategory] = useState('infrastructure');
  const [failureDescription, setFailureDescription] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [requiresReschedule, setRequiresReschedule] = useState(false);
  const [extendHours, setExtendHours] = useState('24');
  const [backupLabel, setBackupLabel] = useState('latest');
  const [rollbackReason, setRollbackReason] = useState('manual rollback after failed update');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('evoting.user');
    if (!raw) {
      setAuthorized(false);
      setSessionChecked(true);
      return;
    }
    try {
      const user = JSON.parse(raw) as { role?: string };
      setAuthorized(user?.role === 'SystemAdmin');
    } catch {
      setAuthorized(false);
    } finally {
      setSessionChecked(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionChecked || !authorized) return;
    loadStatus();
  }, [sessionChecked, authorized]);

  async function loadStatus() {
    setError('');
    setActiveAction('load-status');
    try {
      const data = await apiGet('/system/status', 'SystemAdmin');
      setStatus(data);
      setMessage('Status loaded.');
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function runAction(path: string) {
    const requiresConfirm = new Set(['/system/suspend', '/system/resume', '/system/backup/restore']);
    if (requiresConfirm.has(path)) {
      const confirmed = window.confirm(`Are you sure you want to run this action: ${path}?`);
      if (!confirmed) return;
    }
    setError('');
    setMessage('');
    setActiveAction(path);
    try {
      const data = await apiPost(path, 'SystemAdmin');
      setMessage(data.message ?? data.status ?? 'Action completed');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function applyUpdate(forceFail = false) {
    const label = forceFail ? 'simulate update failure' : 'apply update';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setError('');
    setMessage('');
    setActiveAction(forceFail ? 'apply-update-fail' : 'apply-update');
    try {
      const data = await apiPost('/system/updates/apply', 'SystemAdmin', {
        label: patchLabel,
        force_fail: forceFail,
      });
      setMessage(data.message ?? 'Update action completed');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
      await loadStatus();
    } finally {
      setActiveAction(null);
    }
  }

  async function reportSecurityEvent() {
    if (!securityNote.trim()) {
      setError('Please enter a security event description first.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setActiveAction('security-event');
    try {
      const data = await apiPost('/system/security-events', 'SystemAdmin', {
        description: securityNote,
        severity,
      });
      setMessage(data.message ?? 'Security event recorded');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function reportFailure() {
    if (!failureDescription.trim()) {
      setError('Please enter a failure description first.');
      setMessage('');
      return;
    }
    if (!window.confirm('This action will suspend the system automatically. Continue?')) return;
    setError('');
    setMessage('');
    setActiveAction('report-failure');
    try {
      const data = await apiPost('/system/failures/report', 'SystemAdmin', {
        category: failureCategory,
        description: failureDescription,
      });
      setMessage(data.message ?? 'Failure reported');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function diagnoseFailure() {
    if (!diagnosis.trim()) {
      setError('Please enter diagnosis details first.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setActiveAction('diagnose-failure');
    try {
      const data = await apiPost('/system/failures/diagnose', 'SystemAdmin', {
        diagnosis,
        requires_reschedule: requiresReschedule,
      });
      setMessage(data.message ?? 'Diagnosis saved');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function verifyAndResume() {
    if (!window.confirm('Verify integrity and resume operations now?')) return;
    setError('');
    setMessage('');
    setActiveAction('verify-resume');
    try {
      const data = await apiPost('/system/failures/verify-and-resume', 'SystemAdmin');
      setMessage(data.message ?? 'System resumed');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
      await loadStatus();
    } finally {
      setActiveAction(null);
    }
  }

  async function rescheduleElections() {
    const parsedHours = Number(extendHours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
      setError('Reschedule hours must be a positive number.');
      setMessage('');
      return;
    }
    if (!window.confirm(`Reschedule elections by ${parsedHours} hour(s)?`)) return;
    setError('');
    setMessage('');
    setActiveAction('reschedule');
    try {
      const data = await apiPost('/system/failures/reschedule', 'SystemAdmin', {
        extend_hours: parsedHours,
      });
      setMessage(`${data.message ?? 'Rescheduled'}: ${data.rescheduled_election_ids?.length ?? 0} election(s).`);
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function restoreAfterCorruption() {
    if (!window.confirm(`Restore backup for label "${backupLabel}"?`)) return;
    setError('');
    setMessage('');
    setActiveAction('restore-corruption');
    try {
      const data = await apiPost('/system/failures/restore-backup', 'SystemAdmin', {
        label: backupLabel,
      });
      setMessage(data.message ?? 'Backup restored');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setActiveAction(null);
    }
  }

  async function rollbackUpdate() {
    if (!window.confirm('Rollback latest update using saved snapshot?')) return;
    setError('');
    setMessage('');
    setActiveAction('rollback-update');
    try {
      const data = await apiPost('/system/updates/rollback', 'SystemAdmin', {
        reason: rollbackReason,
      });
      setMessage(data.message ?? 'Rollback completed');
      await loadStatus();
    } catch (err) {
      setError(toUserMessage(err));
      await loadStatus();
    } finally {
      setActiveAction(null);
    }
  }

  if (!sessionChecked) {
    return (
      <section>
        <h1>Maintenance</h1>
        <p>Checking session...</p>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section>
        <h1>Maintenance</h1>
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
          <h1 style={styles.title}>Maintenance</h1>
          <p style={styles.subtitle}>Run maintenance actions and watch clear action feedback.</p>
        </div>
        <Link href="/system-admin/dashboard" style={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>
      <div style={styles.row}>
        <button type="button" onClick={loadStatus} style={styles.primaryBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'load-status' ? 'Loading...' : 'Load Status'}
        </button>{' '}
        <button
          type="button"
          onClick={() => runAction('/system/service/restart')}
          style={styles.warningBtn}
          disabled={Boolean(activeAction)}
        >
          {activeAction === '/system/service/restart' ? 'Restarting...' : 'Restart System Service'}
        </button>{' '}
        <button
          type="button"
          onClick={() => runAction('/system/suspend')}
          style={styles.dangerBtn}
          disabled={Boolean(activeAction)}
        >
          {activeAction === '/system/suspend' ? 'Suspending...' : 'Suspend'}
        </button>{' '}
        <button
          type="button"
          onClick={() => runAction('/system/resume')}
          style={styles.successBtn}
          disabled={Boolean(activeAction)}
        >
          {activeAction === '/system/resume' ? 'Resuming...' : 'Resume'}
        </button>{' '}
        <button
          type="button"
          onClick={() => runAction('/system/integrity-check')}
          style={styles.primaryBtn}
          disabled={Boolean(activeAction)}
        >
          {activeAction === '/system/integrity-check' ? 'Checking...' : 'Integrity Check'}
        </button>{' '}
        <button
          type="button"
          onClick={() => runAction('/system/backup/restore')}
          style={styles.primaryBtn}
          disabled={Boolean(activeAction)}
        >
          {activeAction === '/system/backup/restore' ? 'Restoring...' : 'Restore Backup'}
        </button>
      </div>
      <div style={styles.row}>
        <input
          value={patchLabel}
          onChange={(e) => setPatchLabel(e.target.value)}
          placeholder="Patch label"
          style={styles.input}
        />
        <button type="button" onClick={() => applyUpdate(false)} style={styles.primaryBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'apply-update' ? 'Applying...' : 'Apply Update'}
        </button>
        <button type="button" onClick={() => applyUpdate(true)} style={styles.dangerBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'apply-update-fail' ? 'Simulating...' : 'Simulate Update Failure'}
        </button>
      </div>
      <div style={styles.row}>
        <input
          value={rollbackReason}
          onChange={(e) => setRollbackReason(e.target.value)}
          placeholder="Rollback reason"
          style={styles.input}
        />
        <button type="button" onClick={rollbackUpdate} style={styles.warningBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'rollback-update' ? 'Rolling back...' : 'Rollback Update'}
        </button>
      </div>
      <div style={styles.row}>
        <input
          value={securityNote}
          onChange={(e) => setSecurityNote(e.target.value)}
          placeholder="Security breach/event description"
          style={styles.input}
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={styles.input}>
          <option value="warning">warning</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="button" onClick={reportSecurityEvent} style={styles.primaryBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'security-event' ? 'Reporting...' : 'Report Security Event'}
        </button>
      </div>
      <hr />
      <h2>System Failure Handling</h2>
      <div style={styles.row}>
        <select value={failureCategory} onChange={(e) => setFailureCategory(e.target.value)} style={styles.input}>
          <option value="infrastructure">infrastructure</option>
          <option value="database">database</option>
          <option value="network">network</option>
          <option value="application">application</option>
        </select>
        <input
          value={failureDescription}
          onChange={(e) => setFailureDescription(e.target.value)}
          placeholder="Failure description"
          style={styles.input}
        />
        <button type="button" onClick={reportFailure} style={styles.dangerBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'report-failure' ? 'Reporting...' : 'Report Failure (Auto Suspend)'}
        </button>
      </div>
      <div style={styles.row}>
        <input
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Diagnosis and fix summary"
          style={styles.input}
        />
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={requiresReschedule}
            onChange={(e) => setRequiresReschedule(e.target.checked)}
          />{' '}
          Prolonged failure requires reschedule
        </label>
        <button type="button" onClick={diagnoseFailure} style={styles.primaryBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'diagnose-failure' ? 'Saving...' : 'Save Diagnosis'}
        </button>
      </div>
      <div style={styles.row}>
        <input
          value={extendHours}
          onChange={(e) => setExtendHours(e.target.value)}
          placeholder="Reschedule extend hours"
          style={styles.input}
        />
        <button type="button" onClick={rescheduleElections} style={styles.warningBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'reschedule' ? 'Rescheduling...' : 'Reschedule Elections'}
        </button>
      </div>
      <div style={styles.row}>
        <input value={backupLabel} onChange={(e) => setBackupLabel(e.target.value)} placeholder="Backup label" style={styles.input} />
        <button type="button" onClick={restoreAfterCorruption} style={styles.primaryBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'restore-corruption' ? 'Restoring...' : 'Restore After Corruption'}
        </button>
      </div>
      <div style={styles.row}>
        <button type="button" onClick={verifyAndResume} style={styles.successBtn} disabled={Boolean(activeAction)}>
          {activeAction === 'verify-resume' ? 'Verifying...' : 'Verify Integrity and Resume Operations'}
        </button>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      {message ? <p style={styles.success}>{message}</p> : null}
      {activeAction ? <p style={styles.progress}>Action in progress. Please wait...</p> : null}
      {status ? (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, background: '#ffffff' }}>
          <strong>Operational Status:</strong> {String((status as Record<string, unknown>).operational_mode ?? '-')}
          <br />
          <strong>Update State:</strong>{' '}
          {String(((status as Record<string, unknown>).update_state as Record<string, unknown> | undefined)?.last_update_status ?? '-')}
          <br />
          <strong>Rollback Available:</strong>{' '}
          {String(((status as Record<string, unknown>).update_state as Record<string, unknown> | undefined)?.rollback_available ?? false)}
        </div>
      ) : null}
      {status ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setShowStatusDetails((prev) => !prev)} style={styles.secondaryBtn}>
            {showStatusDetails ? 'Hide Full Status Details' : 'Show Full Status Details'}
          </button>
          {showStatusDetails ? <pre style={styles.pre}>{JSON.stringify(status, null, 2)}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}

function toUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Failed';
  const mappings: Record<string, string> = {
    x_user_id_required: 'Your session is missing. Please login again.',
    admin_role_required: 'Only System Admin can perform this action.',
    admin_account_not_active: 'Your admin account is not active.',
    no_active_failure: 'No active failure exists for this action.',
    diagnosis_required: 'Please provide diagnosis details first.',
    description_required: 'Please provide a description first.',
    extend_hours_must_be_positive: 'Reschedule hours must be greater than zero.',
    rollback_snapshot_not_available: 'Rollback is not available right now.',
    integrity_check_failed: 'Integrity verification failed. Please investigate before resume.',
    settings_payload_required: 'Settings payload is missing.',
    configuration_update_failed: 'Configuration update failed.',
    system_unavailable: 'System is currently unavailable. Try again after restore.',
  };
  return mappings[raw] ?? raw;
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: 20,
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: '1.6rem',
    color: '#111827',
  },
  subtitle: {
    margin: '6px 0 0 0',
    color: '#374151',
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
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  input: {
    padding: '8px 10px',
    border: '1px solid #9ca3af',
    borderRadius: 8,
    minWidth: 180,
    background: '#fff',
  },
  primaryBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #1d4ed8',
    background: '#1d4ed8',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #4b5563',
    background: '#374151',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  warningBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #b45309',
    background: '#b45309',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  successBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #166534',
    background: '#166534',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #991b1b',
    background: '#991b1b',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#1f2937',
  },
  error: {
    margin: 0,
    color: '#991b1b',
    fontWeight: 600,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 10px',
  },
  success: {
    margin: 0,
    color: '#065f46',
    fontWeight: 600,
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 8,
    padding: '8px 10px',
  },
  progress: {
    margin: 0,
    color: '#1d4ed8',
    fontWeight: 600,
  },
  pre: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    background: '#111827',
    color: '#e5e7eb',
    overflowX: 'auto',
    border: '1px solid #374151',
  },
};
