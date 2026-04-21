'use client';

import { useState } from 'react';

import { apiGet, apiPost } from '../../../lib/apiClient';

export default function MaintenancePage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [patchLabel, setPatchLabel] = useState('security_patch_v1');
  const [securityNote, setSecurityNote] = useState('');
  const [severity, setSeverity] = useState('high');
  const [failureCategory, setFailureCategory] = useState('infrastructure');
  const [failureDescription, setFailureDescription] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [requiresReschedule, setRequiresReschedule] = useState(false);
  const [extendHours, setExtendHours] = useState('24');
  const [backupLabel, setBackupLabel] = useState('latest');

  async function loadStatus() {
    setError('');
    try {
      const data = await apiGet('/system/status', 'SystemAdmin');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function runAction(path: string) {
    setError('');
    setMessage('');
    try {
      const data = await apiPost(path, 'SystemAdmin');
      setMessage(data.message ?? data.status ?? 'Action completed');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function applyUpdate(forceFail = false) {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/updates/apply', 'SystemAdmin', {
        label: patchLabel,
        force_fail: forceFail,
      });
      setMessage(data.message ?? 'Update action completed');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      await loadStatus();
    }
  }

  async function reportSecurityEvent() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/security-events', 'SystemAdmin', {
        description: securityNote,
        severity,
      });
      setMessage(data.message ?? 'Security event recorded');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function reportFailure() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/failures/report', 'SystemAdmin', {
        category: failureCategory,
        description: failureDescription,
      });
      setMessage(data.message ?? 'Failure reported');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function diagnoseFailure() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/failures/diagnose', 'SystemAdmin', {
        diagnosis,
        requires_reschedule: requiresReschedule,
      });
      setMessage(data.message ?? 'Diagnosis saved');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function verifyAndResume() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/failures/verify-and-resume', 'SystemAdmin');
      setMessage(data.message ?? 'System resumed');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      await loadStatus();
    }
  }

  async function rescheduleElections() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/failures/reschedule', 'SystemAdmin', {
        extend_hours: Number(extendHours),
      });
      setMessage(`${data.message ?? 'Rescheduled'}: ${data.rescheduled_election_ids?.length ?? 0} election(s).`);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function restoreAfterCorruption() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/system/failures/restore-backup', 'SystemAdmin', {
        label: backupLabel,
      });
      setMessage(data.message ?? 'Backup restored');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Maintenance</h1>
      <button type="button" onClick={loadStatus}>
        Load Status
      </button>{' '}
      <button type="button" onClick={() => runAction('/system/suspend')}>
        Suspend
      </button>{' '}
      <button type="button" onClick={() => runAction('/system/resume')}>
        Resume
      </button>{' '}
      <button type="button" onClick={() => runAction('/system/integrity-check')}>
        Integrity Check
      </button>{' '}
      <button type="button" onClick={() => runAction('/system/backup/restore')}>
        Restore Backup
      </button>
      <div style={{ marginTop: 12 }}>
        <input
          value={patchLabel}
          onChange={(e) => setPatchLabel(e.target.value)}
          placeholder="Patch label"
        />
        <button type="button" onClick={() => applyUpdate(false)} style={{ marginLeft: 8 }}>
          Apply Update
        </button>
        <button type="button" onClick={() => applyUpdate(true)} style={{ marginLeft: 8 }}>
          Simulate Update Failure
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <input
          value={securityNote}
          onChange={(e) => setSecurityNote(e.target.value)}
          placeholder="Security breach/event description"
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ marginLeft: 8 }}>
          <option value="warning">warning</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="button" onClick={reportSecurityEvent} style={{ marginLeft: 8 }}>
          Report Security Event
        </button>
      </div>
      <hr />
      <h2>System Failure Handling</h2>
      <div>
        <select value={failureCategory} onChange={(e) => setFailureCategory(e.target.value)}>
          <option value="infrastructure">infrastructure</option>
          <option value="database">database</option>
          <option value="network">network</option>
          <option value="application">application</option>
        </select>
        <input
          value={failureDescription}
          onChange={(e) => setFailureDescription(e.target.value)}
          placeholder="Failure description"
        />
        <button type="button" onClick={reportFailure} style={{ marginLeft: 8 }}>
          Report Failure (Auto Suspend)
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <input
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Diagnosis and fix summary"
        />
        <label style={{ marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={requiresReschedule}
            onChange={(e) => setRequiresReschedule(e.target.checked)}
          />{' '}
          Prolonged failure requires reschedule
        </label>
        <button type="button" onClick={diagnoseFailure} style={{ marginLeft: 8 }}>
          Save Diagnosis
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <input
          value={extendHours}
          onChange={(e) => setExtendHours(e.target.value)}
          placeholder="Reschedule extend hours"
        />
        <button type="button" onClick={rescheduleElections} style={{ marginLeft: 8 }}>
          Reschedule Elections
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <input value={backupLabel} onChange={(e) => setBackupLabel(e.target.value)} placeholder="Backup label" />
        <button type="button" onClick={restoreAfterCorruption} style={{ marginLeft: 8 }}>
          Restore After Corruption
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={verifyAndResume}>
          Verify Integrity and Resume Operations
        </button>
      </div>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {status ? <pre>{JSON.stringify(status, null, 2)}</pre> : null}
    </section>
  );
}
