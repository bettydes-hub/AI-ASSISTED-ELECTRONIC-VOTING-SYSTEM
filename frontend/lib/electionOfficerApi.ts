export type VerificationState = 'VERIFIED' | 'NOT_VERIFIED';

export function normalizeVerificationStatus(value: string | null | undefined): VerificationState {
  const token = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return token === 'verified' ? 'VERIFIED' : 'NOT_VERIFIED';
}

export function mapOfficerApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Request failed';
  const mapped: Record<string, string> = {
    full_name_contact_national_id_required: 'Full name, contact, and national ID are required.',
    invalid_national_id: 'National ID format is invalid. Please verify and try again.',
    national_id_exists: 'This national ID is already registered.',
    national_id_and_contact_required: 'National ID and contact are required to resend OTP.',
    invalid_contact: 'Contact must be a valid email or phone number.',
    otp_resend_cooldown: 'Please wait a few seconds before requesting another OTP.',
    otp_delivery_not_configured: 'OTP delivery provider is not configured on backend.',
    otp_delivery_failed: 'OTP delivery failed. Please try resend or use a different contact.',
    otp_invalid_or_expired: 'OTP is invalid or expired. Resend OTP and try again.',
    username_exists: 'This username already exists. Choose a different username.',
    missing_required_fields: 'Please complete all required fields before submitting.',
    invalid_verification_status: 'Verification status must be VERIFIED or NOT_VERIFIED.',
    voter_not_found: 'Voter was not found.',
    x_user_id_required: 'Session is missing user identity. Please log in again.',
    election_officer_not_found: 'Election officer account was not found.',
    election_officer_role_required: 'Only election officers can perform this action.',
    election_officer_account_not_active: 'Election officer account is not active.',
    account_not_active: 'Your account is not active.',
    authorized_actor_required: 'Your account is not authorized for this action.',
    system_unavailable: 'System is currently unavailable. Try again later.',
    description_required: 'Incident description is required.',
    invalid_severity: 'Severity must be low, warning, high, or critical.',
    election_not_found: 'Selected election was not found.',
    election_not_closed: 'Only completed elections can be reviewed in this workflow.',
    results_not_found: 'No result data is available for the selected election.',
    signed_by_required: 'Officer signature is required.',
    reason_required: 'Discrepancy reason is required.',
  };
  return mapped[raw] ?? raw;
}
