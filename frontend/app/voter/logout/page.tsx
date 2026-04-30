'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function SuccessPage() {
  const router = useRouter();
  const params = useSearchParams();

  const candidate = params.get('candidate') || 'N/A';
  const party = params.get('party') || 'N/A';
  const symbol = params.get('symbol') || '🗳️';

  const [showVVPAT, setShowVVPAT] = useState(false);

  const now = new Date();
  const dateTime = now.toLocaleString();

  function handlePrint() {
    setShowVVPAT(true);

    setTimeout(() => {
      window.print();

      setTimeout(() => {
        router.push('/voter/dashboard');
      }, 1200);
    }, 300);
  }

  return (
    <>
      {/* SCREEN UI */}
      <div style={styles.container} className="no-print">
        <div style={styles.card}>
          <h1 style={styles.success}>✅ Vote Submitted Successfully</h1>
          <p>Thank you for participating in the election</p>

          <button style={styles.button} onClick={handlePrint}>
            🖨️ Print VVPAT Slip
          </button>
        </div>
      </div>

      {/* PRINTABLE VVPAT */}
      {showVVPAT && (
        <div className="print-area" style={styles.vvpatPaper}>
          <h2 style={styles.title}>🗳️ VVPAT SLIP</h2>

          <div style={styles.row}>
            <span>Candidate:</span>
            <strong>{candidate}</strong>
          </div>

          <div style={styles.row}>
            <span>Party:</span>
            <strong>{party}</strong>
          </div>

          <div style={styles.symbol}>{symbol}</div>

          <div style={styles.footer}>
            <p>Date & Time</p>
            <strong>{dateTime}</strong>
          </div>

          <div style={styles.note}>
            ✔ This slip is for audit verification only
          </div>
        </div>
      )}

      {/* PRINT CSS */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          /* Hide everything except print area */
          body * {
            visibility: hidden !important;
          }

          .print-area,
          .print-area * {
            visibility: visible !important;
          }

          .print-area {
            position: absolute;
            top: 0;
            left: 0;

            width: 100%;
            height: 100vh;

            display: flex;
            flex-direction: column;
            justify-content: center;

            align-items: center;
            text-align: center;

            background: white;

            /* FORCE SINGLE PAGE */
            page-break-inside: avoid;
            overflow: hidden;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}

/* ================= STYLES ================= */
const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#f4f6f9',
  },

  card: {
    padding: '30px',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
    width: '350px',
  },

  success: {
    color: 'green',
    marginBottom: '10px',
  },

  button: {
    marginTop: '15px',
    padding: '12px',
    width: '100%',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },

  vvpatPaper: {
    width: '320px',
    margin: '0 auto',
    padding: '25px',
    border: '2px dashed black',
    borderRadius: '10px',
    fontFamily: 'monospace',
    background: '#fff',
  },

  title: {
    marginBottom: '15px',
    fontSize: '20px',
  },

  row: {
    display: 'flex',
    justifyContent: 'space-between',
    margin: '8px 0',
    fontSize: '14px',
  },

  symbol: {
    fontSize: '60px',
    margin: '15px 0',
  },

  footer: {
    marginTop: '10px',
    fontSize: '12px',
  },

  note: {
    marginTop: '10px',
    fontSize: '11px',
    color: '#555',
  },
};
