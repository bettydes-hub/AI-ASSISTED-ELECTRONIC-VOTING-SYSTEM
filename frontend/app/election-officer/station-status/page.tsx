'use client';

import { useState } from 'react';

import { apiGet, apiPost, getApiBase } from '../../../lib/apiClient';
import { OfficerPageHeader, OfficerStatusNotice } from '../../../components/officer/OfficerUi';
import { mapOfficerApiError } from '../../../lib/electionOfficerApi';

type HealthPayload = {
  status?: string;
  message?: string;
  error?: string;
};

export default function StationStatusPage() {
  const [status, setStatus] = useState<HealthPayload | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [stationCode, setStationCode] = useState('STN-001');
  const [issueType, setIssueType] = useState('network');
  const [severity, setSeverity] = useState<'low' | 'warning' | 'high' | 'critical'>('warning');
  const [description, setDescription] = useState('');

  async function checkHealth() {
    setError('');
    setMessage('');
    setIsChecking(true);
    try {
      const data = (await apiGet('/health', 'ElectionOfficer')) as HealthPayload;
      setStatus(data);
      setCheckedAt(new Date().toLocaleString());
      setMessage('Health check completed successfully.');
    } catch (err) {
      setStatus(null);
      setError(mapOfficerApiError(err));
    } finally {
      setIsChecking(false);
    }
  }

  async function reportIncident() {
    if (!description.trim()) {
      setError('Incident description is required.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setIsReporting(true);
    try {
      const data = (await apiPost('/officer/station/incidents', 'ElectionOfficer', {
        station_code: stationCode.trim(),
        issue_type: issueType.trim(),
        severity,
        description: description.trim(),
      })) as { message?: string };
      setMessage(data.message ?? 'Station incident reported successfully.');
      setDescription('');
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsReporting(false);
    }
  }

  function resetIncidentForm() {
    setStationCode('STN-001');
    setIssueType('network');
    setSeverity('warning');
    setDescription('');
    setError('');
    setMessage('');
  }

  const healthTone = status?.status === 'ok' ? 'HEALTHY' : checkedAt ? 'ISSUE DETECTED' : 'NOT CHECKED';

  return (
    <section>
      <OfficerPageHeader
        title="Station Status"
        subtitle="Simple operations view to check service health and report station incidents quickly."
        actions={
          <button type="button" onClick={checkHealth} disabled={isChecking}>
            {isChecking ? 'Checking...' : 'Run Health Check'}
          </button>
        }
      />

      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}
      {message ? <OfficerStatusNotice tone="success">{message}</OfficerStatusNotice> : null}
      {status?.status === 'ok' ? (
        <OfficerStatusNotice tone="success">Backend is healthy and accepting requests.</OfficerStatusNotice>
      ) : null}

      <div className="station-hero">
        <div>
          <h2>Service Health</h2>
          <p className="small muted">Base URL: {getApiBase()}</p>
          <p className="small muted">Last check: {checkedAt || 'No checks yet'}</p>
        </div>
        <div className="toolbar">
          <span className={`pill ${status?.status === 'ok' ? 'pill-approved' : 'pill-rejected'}`}>{healthTone}</span>
        </div>
      </div>

      <div className="station-layout">
        <div className="panel station-panel">
          <h3>Incident Report</h3>
          <div className="station-form-grid">
            <div className="form-row">
              <label htmlFor="stationCode">Station Code</label>
              <input
                id="stationCode"
                value={stationCode}
                onChange={(e) => setStationCode(e.target.value)}
                placeholder="e.g. STN-001"
              />
            </div>
            <div className="form-row">
              <label htmlFor="issueType">Issue Type</label>
              <input
                id="issueType"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                placeholder="network, power, hardware, security"
              />
            </div>
            <div className="form-row">
              <label htmlFor="severity">Severity</label>
              <select
                id="severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as 'low' | 'warning' | 'high' | 'critical')}
              >
                <option value="low">Low</option>
                <option value="warning">Warning</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="incidentDescription">Incident Description</label>
            <textarea
              id="incidentDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, impact, and immediate response."
              rows={4}
            />
          </div>
          <div className="toolbar">
            <button type="button" onClick={reportIncident} disabled={isReporting}>
              {isReporting ? 'Reporting...' : 'Submit Incident'}
            </button>
            <button type="button" onClick={resetIncidentForm}>
              Reset Form
            </button>
          </div>
        </div>

        <div className="station-side">
          <div className="panel station-panel">
            <h3>If Status is Healthy</h3>
            <div className="check-grid">
              <p>Continue voter operations normally.</p>
              <p>Run health check before critical tasks.</p>
            </div>
          </div>
          <div className="panel station-panel">
            <h3>If Status has Issues</h3>
            <div className="check-grid">
              <p>Pause registration to prevent partial records.</p>
              <p>Report incident with clear details and severity.</p>
              <p>Escalate to System Admin if unresolved.</p>
            </div>
          </div>
          <div className="panel station-panel">
            <h3>Quick Troubleshooting</h3>
            <div className="check-grid">
              <p>Check network and retry health check.</p>
              <p>Confirm officer session is active.</p>
              <p>Capture timestamp + symptom before escalation.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
