'use client';

import { useState } from 'react';

import { getApiBase } from '../../../lib/apiBase';

type GuidePayload = {
  assistant_name: string;
  steps: string[];
  tips: string[];
};

export default function VoterAiPage() {
  const [guide, setGuide] = useState<GuidePayload | null>(null);
  const [error, setError] = useState('');

  async function loadGuide() {
    setError('');
    const res = await fetch(`${getApiBase()}/voting/assistant-guide`, {
      headers: getVoterHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? 'Failed to load guide');
    setGuide(data);
  }

  return (
    <section>
      <h1>AI Assistant</h1>
      <p>Guided voting assistant for secure step-by-step voting.</p>
      <button type="button" onClick={loadGuide}>
        Load Voting Guide
      </button>
      {error ? <p>{error}</p> : null}
      {guide ? (
        <>
          <h2>{guide.assistant_name}</h2>
          <h3>Steps</h3>
          <ul>
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <h3>Security Tips</h3>
          <ul>
            {guide.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function getVoterHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'X-Role': 'Voter' };
  if (typeof window === 'undefined') return headers;
  const raw = localStorage.getItem('evoting.user');
  if (!raw) return headers;
  try {
    const user = JSON.parse(raw) as { id?: number };
    if (user?.id) headers['X-User-Id'] = String(user.id);
  } catch {
    return headers;
  }
  return headers;
}
