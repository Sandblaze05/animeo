"use client"
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

const COLORS = {
  bg: '#0b001f',
  pink: '#e60076',
  white: '#ffffff',
}

export default function ProfileSelector({ onSelect }) {
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [hoveredId, setHoveredId] = useState(null);

  const fetchProfiles = async () => {
    const res = await fetch('/api/profiles');
    if (res.ok) setProfiles(await res.json());
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar: avatar || null }),
    });
    if (res.ok) {
      setName(''); setAvatar(''); setShowForm(false);
      fetchProfiles();
    }
  }

  const selectProfile = (profile) => {
    localStorage.setItem('profileId', profile.id);
    localStorage.setItem('profileName', profile.name);
    localStorage.setItem('profileAvatar', profile.avatar || '');
    if (onSelect) onSelect(profile);
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: COLORS.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* Google Font Import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600;1,9..40,300&family=Bebas+Neue&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .profile-btn {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 0;
          position: relative;
        }

        .avatar-ring {
          position: relative;
          width: 112px;
          height: 112px;
        }

        .avatar-ring::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          // background: conic-gradient(from 0deg, #e60076, #ff4db3, #0b001f, #e60076);
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 0;
        }

        .avatar-ring:hover::before {
          opacity: 1;
          z-index: -1;
        }

        .avatar-inner {
          position: relative;
          z-index: 1;
          width: 112px;
          height: 112px;
          border-radius: 50%;
          overflow: hidden;
          background: linear-gradient(135deg, #1a0040 0%, #2d0060 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(230, 0, 118, 0.15);
          transition: border-color 0.3s ease;
          margin: 3px;
          width: calc(112px - 6px);
          height: calc(112px - 6px);
        }

        .avatar-ring:hover .avatar-inner {
          border-color: transparent;
          margin: 3px;
        }

        .profile-name {
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.65);
          text-transform: uppercase;
          transition: color 0.3s ease;
        }

        .profile-btn:hover .profile-name {
          color: #ffffff;
        }

        .add-btn {
          background: none;
          border: 2px dashed rgba(230, 0, 118, 0.35);
          cursor: pointer;
          width: calc(112px - 6px);
          height: calc(112px - 6px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          margin: 3px;
        }

        .add-btn:hover {
          border-color: #e60076;
          background: rgba(230, 0, 118, 0.08);
        }

        .styled-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(230, 0, 118, 0.25);
          border-radius: 8px;
          padding: 12px 16px;
          width: 100%;
          color: #fff;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.03em;
          outline: none;
          transition: border-color 0.25s ease, background 0.25s ease;
        }

        .styled-input::placeholder {
          color: rgba(255,255,255,0.25);
        }

        .styled-input:focus {
          border-color: #e60076;
          background: rgba(230, 0, 118, 0.06);
        }

        .btn-primary {
          background: #e60076;
          color: #fff;
          border: none;
          padding: 11px 28px;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          background: #ff1a8a;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(230, 0, 118, 0.35);
        }

        .btn-secondary {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.6);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 11px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          font-weight: 400;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
      `}</style>

      {/* Ambient glow blobs */}
      <div style={{
        position: 'absolute',
        top: '10%', left: '15%',
        width: 420, height: 420,
        background: 'radial-gradient(circle, rgba(230,0,118,0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
        filter: 'blur(40px)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '15%', right: '10%',
        width: 360, height: 360,
        background: 'radial-gradient(circle, rgba(75,0,130,0.2) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none',
        filter: 'blur(60px)',
      }} />

      {/* Noise texture overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
        backgroundSize: '200px 200px',
        pointerEvents: 'none',
        opacity: 0.6,
      }} />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          maxWidth: 680,
          width: '100%',
          padding: '52px 48px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
          }}>
            <div style={{
              width: 28, height: 3,
              background: '#e60076',
              borderRadius: 2,
            }} />
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: '#e60076',
              textTransform: 'uppercase',
            }}>Profile Selection</span>
          </div>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(42px, 6vw, 60px)',
            color: '#ffffff',
            letterSpacing: '0.04em',
            lineHeight: 1,
            fontWeight: 400,
          }}>
            Who&apos;s Watching?
          </h1>
        </div>

        {/* Profile grid */}
        <div style={{
          display: 'flex',
          gap: 32,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 44,
        }}>
          {profiles.length === 0 && !showForm && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 14,
                fontStyle: 'italic',
                letterSpacing: '0.02em',
              }}
            >
              No profiles yet — create one to get started.
            </motion.p>
          )}

          {profiles.map((p, i) => (
            <motion.button
              key={p.id}
              className="profile-btn"
              onClick={() => selectProfile(p)}
              onHoverStart={() => setHoveredId(p.id)}
              onHoverEnd={() => setHoveredId(null)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <div className="avatar-ring">
                <div className="avatar-inner">
                  {p.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 38,
                      color: hoveredId === p.id ? '#e60076' : 'rgba(255,255,255,0.7)',
                      transition: 'color 0.3s ease',
                      letterSpacing: '0.05em',
                    }}>
                      {p.name?.charAt(0)?.toUpperCase() ?? 'U'}
                    </span>
                  )}
                </div>
              </div>
              <span className="profile-name">{p.name}</span>
            </motion.button>
          ))}

          {/* Add profile button */}
          <motion.div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: profiles.length * 0.08 + 0.08, duration: 0.4 }}
          >
            <div className="avatar-ring">
              <button
                className="add-btn"
                onClick={() => setShowForm(true)}
                aria-label="Add profile"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <line x1="11" y1="2" x2="11" y2="20" stroke="#e60076" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="2" y1="11" x2="20" y2="11" stroke="#e60076" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <span className="profile-name" style={{ color: 'rgba(255,255,255,0.3)' }}>Add Profile</span>
          </motion.div>
        </div>

        {/* Create form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(230, 0, 118, 0.18)',
                borderRadius: 14,
                padding: '32px 28px',
                backdropFilter: 'blur(12px)',
              }}>
                <h3 style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22,
                  color: '#fff',
                  letterSpacing: '0.08em',
                  marginBottom: 24,
                  fontWeight: 400,
                }}>
                  Create Profile
                </h3>

                <form onSubmit={handleCreate}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
                    <input
                      className="styled-input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Profile name"
                      required
                      autoFocus
                    />
                    <input
                      className="styled-input"
                      value={avatar}
                      onChange={e => setAvatar(e.target.value)}
                      placeholder="Avatar URL (optional)"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" className="btn-primary">Create</button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => { setShowForm(false); setName(''); setAvatar(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}