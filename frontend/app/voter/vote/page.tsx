'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VotingPage() {
  const router = useRouter();

  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [showPopup, setShowPopup] = useState(false);
  const ballot = [
    {
      id: 1,
      candidate: 'Abel Tesfaye',
      party: 'Unity Party',
      symbol: '🕊️',
      image: '/candidate1.png',
    },
    {
      id: 2,
      candidate: 'Sara Bekele',
      party: 'Freedom Party',
      symbol: '⭐',
      image: '/candidate2.png',
    },
    {
      id: 3,
      candidate: 'Daniel Mekonnen',
      party: 'Justice Party',
      symbol: '⚖️',
      image: '/candidate3.png',
    },
  ];

  function openConfirm(item: any) {
    setSelectedParty(item);
    setShowPopup(true);
  }

  function confirmVote() {
    setShowPopup(false);

    setTimeout(() => {
      router.push('/voter/logout');
    }, 1000);
  }

  function cancelVote() {
    setShowPopup(false);
    setSelectedParty(null);
  }

 
  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* HEADER IMAGE */}
      

      <div style={styles.header}>
  <img
    src="/ethiopia-election-pic.png"
    alt="Election"
    style={styles.headerImage}
  />
  <h2 style={styles.title}>Official Ballot</h2>
</div>

        <p>Select your candidate</p>
        <hr />
        <h3>YOUR VOTE YOUR VOICE</h3>

        <div style={styles.grid}>
          {ballot.map((item) => (
            <div key={item.id} style={styles.item}>
              <img src={item.image} style={styles.image} />

              <h3>{item.candidate}</h3>
              <p>{item.party}</p>

              <div style={styles.symbol}>{item.symbol}</div>

              <button
                style={styles.voteBtn}
                onClick={() => openConfirm(item)}
              >
                Vote
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* POPUP */}
      {showPopup && selectedParty && (
        <div style={styles.overlay}>
          <div style={styles.popup}>
            <h3>Confirm Your Vote</h3>

            <p>
              Are you sure you want to vote for{' '}
              <b>{selectedParty.party}</b>?
            </p>

            <div style={styles.popupButtons}>
              <button style={styles.yesBtn} onClick={confirmVote}>
                Yes
              </button>

              <button style={styles.noBtn} onClick={cancelVote}>
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>



  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: '#f4f6f9',
  },
  card: {
    width: '650px',
    padding: '25px',
    borderRadius: '12px',
    background: '#fff',
    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },

headerImage: {
  width: '90px',
  height: '90px',
  objectFit: 'cover' as const,
  borderRadius: '12px',
  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
},

  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginTop: '20px',
  },

  item: {
    padding: '15px',
    borderRadius: '10px',
    background: '#fafafa',
    textAlign: 'center' as const,
  },

  image: {
    width: '120px',
    height: '120px',
    objectFit: 'cover' as const,
    borderRadius: '50%',
    marginBottom: '10px',
  },

  symbol: {
    fontSize: '40px',
    margin: '10px 0',
  },

  voteBtn: {
    width: '100%',
    padding: '10px',
    background: 'green',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '10px',
  },

  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },

  popup: {
    width: '350px',
    background: '#fff',
    padding: '20px',
    borderRadius: '10px',
    textAlign: 'center' as const,
  },

  popupButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '20px',
  },

  yesBtn: {
    flex: 1,
    marginRight: '10px',
    padding: '10px',
    background: 'green',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
  },

  noBtn: {
    flex: 1,
    padding: '10px',
    background: 'red',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
  },
header: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '15px',
  marginBottom: '20px',

  // animation
  animation: 'fadeSlide 0.8s ease-in-out',
},
title: {
  fontSize: '22px',
  fontWeight: 700,
  margin: 0,
},

};

