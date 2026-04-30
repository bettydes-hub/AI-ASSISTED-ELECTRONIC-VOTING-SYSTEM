'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function BiometricPage() {
  const params = useSearchParams();
  const router = useRouter();
  const voterId = params.get('voterId');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [status, setStatus] = useState<any>(null);
  const [captured, setCaptured] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState('');


  useEffect(() => {
    if (!voterId) return;

    const votersDB: Record<string, any> = {
      '0001': { status: 'Active', hasVoted: false },
      '0002': { status: 'Active', hasVoted: false },
      '0003': { status: 'Active', hasVoted: true },
      '0004': { status: 'Active', hasVoted: true },
    };

    const voter = votersDB[voterId];

    if (voter) {
      setStatus(voter);
    } else {
      setStatus({
        status: 'Invalid',
        hasVoted: true,
      });
    }
  }, [voterId]);

  
  useEffect(() => {
    async function startCamera() {
      if (!videoRef.current) return;

      if (status?.hasVoted || status?.status === 'Invalid') return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error('Camera error', err);
      }
    }

    startCamera();
  }, [status]);

 function captureImage() {
  if (!videoRef.current || !canvasRef.current) return;

  const canvas = canvasRef.current;
  const video = videoRef.current;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx?.drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  setImageData(dataUrl);
  setCaptured(true);

  // ✅ SAFE STOP CAMERA (FIXED)
  const stream = video.srcObject;
  if (stream && stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}


 
  function handleScan() {

    if (status?.hasVoted || status?.status === 'Invalid') {
      setMessage('❌ You are not allowed to vote');
      return;
    }

    if (!captured) {
      setMessage('⚠️ Please capture your face first');
      return;
    }

    setScanning(true);
    setMessage('Analyzing captured image...');

    setTimeout(() => {
      setMessage('Matching with database...');

      setTimeout(() => {
        setMessage('Verification Successful ✅');

        setTimeout(() => {
          router.push('/voter/vote');
        }, 1500);
      }, 1500);
    }, 1500);
  }

 async function retake() {
  setCaptured(false);
  setImageData(null);
  setMessage('');
  setScanning(false);

  // ✅ restart camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  } catch (err) {
    console.error('Camera restart error', err);
  }
}


  return (
    <div style={styles.container}>

      {/* ✅ STATUS CARD */}
      <div
        style={{
          ...styles.statusCard,
          borderLeft:
            status?.hasVoted || status?.status === 'Invalid'
              ? '6px solid #ff4d4f'
              : '6px solid #2ecc71',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>🪪 Voter Status</h3>

          <p style={{ margin: '6px 0', color: '#555' }}>
            Voter ID: <b>{voterId}</b>
          </p>

          <p
            style={{
              marginTop: '10px',
              fontWeight: 'bold',
              fontSize: '14px',
              color:
                status?.hasVoted || status?.status === 'Invalid'
                  ? '#ff4d4f'
                  : '#2ecc71',
            }}
          >
            {status?.status === 'Invalid'
              ? '⚠️ Invalid Voter ID'
              : status?.hasVoted
              ? '❌ You cannot vote. You already voted.'
              : '✅ You can vote only once'}
          </p>
        </div>

        <div
          style={{
            padding: '10px 16px',
            borderRadius: '20px',
            fontWeight: 'bold',
            fontSize: '12px',
            background:
              status?.hasVoted || status?.status === 'Invalid'
                ? '#ff4d4f'
                : '#2ecc71',
            color: '#fff',
          }}
        >
          {status?.status === 'Invalid'
            ? 'INVALID'
            : status?.hasVoted
            ? 'BLOCKED'
            : 'ELIGIBLE'}
        </div>
      </div>

      {/* 🎥 CAMERA CARD */}
      <div style={styles.card}>
        <h2>Face Verification</h2>

        <div style={styles.cameraBox}>
          {/* show camera OR captured image */}
          {!captured ? (
            <video ref={videoRef} autoPlay style={styles.video} />
          ) : (
            <img src={imageData!} style={styles.video} />
          )}

          {scanning && <div style={styles.scanLine}></div>}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* ❌ BLOCKED → disable buttons */}
        {status?.hasVoted || status?.status === 'Invalid' ? (
          <p style={{ color: 'red', fontWeight: 'bold' }}>
            You are not allowed to proceed
          </p>
        ) : (
          <>
            {!captured ? (
              <button style={styles.captureBtn} onClick={captureImage}>
                📷 Capture Face
              </button>
            ) : (
              <>
                <button
                  style={styles.button}
                  onClick={handleScan}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning...' : 'Verify Face'}
                </button>

                <button
                  style={{ ...styles.captureBtn, background: '#6c757d' }}
                  onClick={retake}
                >
                  🔄 Retake
                </button>
              </>
            )}
          </>
        )}

        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#eef2f7',
    gap: '20px',
  },

  statusCard: {
    width: '420px',
    padding: '20px',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  card: {
    width: '420px',
    padding: '25px',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },

  cameraBox: {
    position: 'relative' as const,
    height: '250px',
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '20px',
  },

  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },

  scanLine: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '4px',
    background: 'lime',
    animation: 'scan 2s linear infinite',
  },

  button: {
    width: '100%',
    padding: '10px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '10px',
  },

  captureBtn: {
    width: '100%',
    padding: '10px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '10px',
  },

  message: {
    marginTop: '15px',
    fontWeight: 'bold',
  },
};
