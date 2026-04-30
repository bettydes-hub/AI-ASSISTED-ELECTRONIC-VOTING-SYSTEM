'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VoterLoginPage() {
  const [voterId, setVoterId] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

 function handleLogin() {
  console.log("Clicked", voterId);

  if (!voterId) {
    setError('Please enter your Voter ID');
    return;
  }

  router.push(`/voter/biometric?voterId=${voterId}`);
}


  return (
    <div style={styles.container}>
      <div style={styles.card}>
        
        {/* IMAGE */}
        <img
          src="\nebe-logo.png"
          alt="Voting"
          style={styles.image}
        />

        <h2 style={styles.title}>E-Voting Login</h2>

        <input
          style={styles.input}
          value={voterId}
          onChange={(e) => setVoterId(e.target.value)}
          placeholder="Enter your Voter ID"
        />

        <button style={styles.button} onClick={handleLogin}>
          Login
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: '#f0f4f8',
  },
  card: {
    width: '350px',
    padding: '30px',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },
  image: {
    width: '100%',
    height: '150px',
    objectFit: 'contain' as const,
    marginBottom: '15px',
  },
  title: {
    marginBottom: '20px',
  },
  input: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    marginBottom: '15px',
  },
  button: {
    width: '100%',
    padding: '10px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  error: {
    color: 'red',
    marginTop: '10px',
  },
};
