'use client';

import { FormEvent, useState } from 'react';

import { apiPost } from '../../../lib/apiClient';
import { OfficerPageHeader, OfficerStatusNotice } from '../../../components/officer/OfficerUi';
import { mapOfficerApiError } from '../../../lib/electionOfficerApi';

type StartOtpPayload = {
  otp?: string;
  channel?: string;
  message?: string;
};

type VerifyOtpPayload = {
  message?: string;
  user_id?: number;
  voter_id?: string;
  credentials?: { username?: string };
};

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
  const [step, setStep] = useState<1 | 2>(1);
  const [isStartingOtp, setIsStartingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const canComplete = step === 2 && !isCompleting;

  function goToStepTwo() {
    setStep(2);
    if (!generatedOtp) {
      setMessage('Continue with OTP verification after you receive OTP on contact.');
    }
  }

  async function startOtp(event: FormEvent) {
    event.preventDefault();
    const validationError = validateIdentityFields({ fullName, contact, nationalId });
    if (validationError) {
      setError(validationError);
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setIsStartingOtp(true);
    try {
      const data = (await apiPost('/voters/register/start-otp', 'ElectionOfficer', {
        full_name: fullName,
        contact,
        national_id: nationalId,
      })) as StartOtpPayload;
      setGeneratedOtp(data.otp ?? '');
      setStep(2);
      setMessage(formatOtpMessage(data.message, data.channel, false));
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsStartingOtp(false);
    }
  }

  async function resendOtp() {
    const target = updatedContact.trim() || contact.trim();
    if (!nationalId.trim() || !target) {
      setError('National ID and contact are required to resend OTP.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setIsResendingOtp(true);
    try {
      const data = (await apiPost('/voters/register/resend-otp', 'ElectionOfficer', {
        national_id: nationalId,
        contact,
        updated_contact: updatedContact || undefined,
      })) as StartOtpPayload;
      setGeneratedOtp(data.otp ?? '');
      if (updatedContact.trim()) setContact(updatedContact.trim());
      setMessage(formatOtpMessage(data.message, data.channel, true));
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsResendingOtp(false);
    }
  }

  async function completeRegistration(event: FormEvent) {
    event.preventDefault();
    if (step !== 2) {
      setError('Generate OTP first before final registration.');
      setMessage('');
      return;
    }
    const validationError = validateFinalStep({ otp, username, password });
    if (validationError) {
      setError(validationError);
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setIsCompleting(true);
    try {
      const data = (await apiPost('/voters/register/verify-otp', 'ElectionOfficer', {
        contact,
        otp,
        full_name: fullName,
        national_id: nationalId,
        username,
        password,
      })) as VerifyOtpPayload;
      setMessage(
        `Voter registered successfully. User ID: ${data.user_id}, Voter ID: ${data.voter_id}, Username: ${data.credentials?.username ?? username}.`,
      );
      setOtp('');
      setGeneratedOtp('');
      setUsername('');
      setPassword('');
      setUpdatedContact('');
      setContact('');
      setFullName('');
      setNationalId('');
      setStep(1);
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsCompleting(false);
    }
  }

  function resetRegistrationFlow() {
    setStep(1);
    setError('');
    setMessage('');
    setGeneratedOtp('');
    setOtp('');
    setUsername('');
    setPassword('');
    setUpdatedContact('');
  }

  return (
    <section>
      <OfficerPageHeader
        title="Voter Registration"
        subtitle="Simple 2-step registration: issue OTP, verify OTP, and create voter credentials."
      />
      <div className="registration-step-tabs">
        <button
          type="button"
          className={`registration-step-tab ${step === 1 ? 'active' : ''}`}
          onClick={() => setStep(1)}
        >
          1. Issue OTP
        </button>
        <button
          type="button"
          className={`registration-step-tab ${step === 2 ? 'active' : ''}`}
          onClick={goToStepTwo}
        >
          2. Verify & Register
        </button>
        <button type="button" className="registration-step-tab ghost" onClick={resetRegistrationFlow}>
          Reset
        </button>
      </div>

      <div className="officer-kpi-grid">
        <div className="officer-kpi">
          <strong>Step {step}/2</strong>
          <span>Current stage</span>
        </div>
        <div className="officer-kpi">
          <strong>{generatedOtp ? 'Issued' : 'Pending'}</strong>
          <span>OTP status</span>
        </div>
      </div>

      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}
      {message ? <OfficerStatusNotice tone="success">{message}</OfficerStatusNotice> : null}

      <div className="registration-layout">
        <div className="registration-main">
          {step === 1 ? (
            <form onSubmit={startOtp} className="panel registration-panel">
              <h2>Step 1: Issue OTP</h2>
              <div className="form-row">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter voter full name"
                />
              </div>
              <div className="form-row">
                <label htmlFor="contact">Phone or Email</label>
                <input
                  id="contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Enter contact for OTP delivery"
                  type="text"
                />
              </div>
              <div className="form-row">
                <label htmlFor="nationalId">National ID</label>
                <input
                  id="nationalId"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="Enter voter national ID"
                />
              </div>
              <div className="toolbar">
                <button type="submit" disabled={isStartingOtp}>
                  {isStartingOtp ? 'Issuing OTP...' : 'Generate OTP'}
                </button>
                <button type="button" onClick={goToStepTwo}>
                  Continue to Step 2
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={completeRegistration} className="panel registration-panel">
              <h2>Step 2: Verify OTP and Register</h2>
              <div className="form-row">
                <label htmlFor="otp">OTP</label>
                <input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter received OTP" />
              </div>
              <div className="form-row">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Set login username"
                />
              </div>
              <div className="form-row">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set initial password"
                  type="password"
                />
              </div>
              <div className="toolbar">
                <button type="button" onClick={() => setStep(1)}>
                  Back to Step 1
                </button>
                <button type="submit" disabled={!canComplete}>
                  {isCompleting ? 'Registering...' : 'Register Voter'}
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="registration-side">
          <div className="panel registration-panel">
            <h3>Resend OTP</h3>
            <p className="small muted">Use this only when OTP was not delivered or contact changed.</p>
            <div className="form-row">
              <label htmlFor="updatedContact">Updated contact (optional)</label>
              <input
                id="updatedContact"
                value={updatedContact}
                onChange={(e) => setUpdatedContact(e.target.value)}
                placeholder="Provide new phone/email only if changed"
              />
            </div>
            <button type="button" onClick={resendOtp} disabled={isResendingOtp}>
              {isResendingOtp ? 'Resending OTP...' : 'Resend OTP'}
            </button>
            {generatedOtp ? <p className="small muted">Dev OTP preview: {generatedOtp}</p> : null}
          </div>

          <div className="panel registration-panel">
            <h3>Quick Checklist</h3>
            <div className="check-grid">
              <p>Confirm name and national ID against records.</p>
              <p>Use fresh OTP only, then complete registration.</p>
              <p>Share credentials securely with the voter.</p>
            </div>
          </div>
          <div className="panel registration-panel">
            <h3>Current Input Summary</h3>
            <p className="small muted">Name: {fullName || '-'}</p>
            <p className="small muted">Contact: {contact || '-'}</p>
            <p className="small muted">National ID: {nationalId || '-'}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function validateIdentityFields(input: { fullName: string; contact: string; nationalId: string }) {
  if (!input.fullName.trim()) return 'Full name is required.';
  if (!input.contact.trim()) return 'Contact is required.';
  if (!isLikelyEmailOrPhone(input.contact)) return 'Contact must be a valid phone number or email.';
  if (!input.nationalId.trim()) return 'National ID is required.';
  if (input.nationalId.trim().length < 6) return 'National ID must be at least 6 characters.';
  return '';
}

function validateFinalStep(input: { otp: string; username: string; password: string }) {
  if (!input.otp.trim()) return 'OTP is required.';
  if (!/^\d{4,8}$/.test(input.otp.trim())) return 'OTP must be 4 to 8 digits.';
  if (!input.username.trim()) return 'Username is required.';
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(input.username.trim())) return 'Username must be 3-30 characters (letters, numbers, . _ -).';
  if (input.password.length < 6) return 'Password must be at least 6 characters.';
  return '';
}

function isLikelyEmailOrPhone(value: string) {
  const trimmed = value.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const isPhone = /^[+]?[\d\s()-]{7,20}$/.test(trimmed);
  return isEmail || isPhone;
}

function formatOtpMessage(rawMessage: string | undefined, channel: string | undefined, resent: boolean) {
  if (rawMessage && rawMessage !== 'otp_sent') return rawMessage;
  const target = channel ?? 'sms/email';
  return resent ? `OTP resent via ${target}.` : `OTP sent via ${target}. Continue to Step 2.`;
}
