'use client';

import { useEffect } from 'react';

export default function VoterLogoutPage() {
  useEffect(() => {
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
  }, []);

  return (
    <section>
      <h1>Logged Out</h1>
      <p>Your local session data has been cleared.</p>
    </section>
  );
}
