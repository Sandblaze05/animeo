import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import gsap from 'gsap'
import { getProfiles, createProfile } from '../utils/actions';

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

  // Refs for our GSAP wave targets
  const wave1Ref = useRef(null);
  const wave2Ref = useRef(null);

  const fetchProfiles = async () => {
    try {
      const p = await getProfiles();
      setProfiles(p || []);
      return;
    } catch (e) {
      console.error('getProfiles failed', e && e.message);
      try {
        if (window?.animeo?.db?.getProfiles) {
          const profiles = await window.animeo.db.getProfiles();
          setProfiles(profiles || []);
          return;
        }
      } catch (err) {
        console.error('IPC fallback getProfiles failed', err && err.message);
      }
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  // GSAP Mouse Tracking Effect
  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Normalize X from -1 (left) to 1 (right)
      const normX = (clientX / width - 0.5) * 2;
      // Normalize Y from 0 (bottom) to 1 (top)
      const normY = 1 - (clientY / height);

      // 1. Move the wave center towards the mouse X (max 25% of screen width)
      const moveX = normX * (width * 0.25);
      
      // 2. Skew it slightly so it "bends" towards the mouse like a flame
      const skew = normX * -12; 
      
      // 3. Stretch it taller when the mouse is moving higher (base scale 1 + stretch)
      const stretch = 1 + (normY * 0.6);

      // Animate Primary Wave
      gsap.to(wave1Ref.current, {
        x: moveX,
        skewX: skew,
        scaleY: stretch,
        duration: 2,
        ease: "power2.out",
        overwrite: 'auto',
        transformOrigin: "center bottom"
      });

      // Animate Secondary Wave (slightly exaggerated for a parallax/layered effect)
      gsap.to(wave2Ref.current, {
        x: moveX * 1.3,
        skewX: skew * 1.2,
        scaleY: stretch * 1.15,
        duration: 3,
        ease: "power2.out",
        overwrite: 'auto',
        transformOrigin: "center bottom"
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createProfile(name, avatar || null);
      setName(''); setAvatar(''); setShowForm(false);
      fetchProfiles();
      return;
    } catch (e) {
      console.error('createProfile failed', e && e.message);
      try {
        if (window?.animeo?.db?.createProfile) {
          await window.animeo.db.createProfile(name, avatar || null);
          setName(''); setAvatar(''); setShowForm(false);
          fetchProfiles();
          return;
        }
      } catch (err) {
        console.error('IPC fallback createProfile failed', err && err.message);
      }
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,600;1,9..40,300&family=Bebas+Neue&display=swap');

        @keyframes wave-glow {
          0%, 100% {
            opacity: 0.35;
            transform: translateY(0) scaleY(1) scaleX(1);
          }
          50% {
            opacity: 0.6;
            transform: translateY(-30px) scaleY(1.15) scaleX(1.05);
          }
        }

        .wave-glow {
          animation: wave-glow 8s ease-in-out infinite;
        }

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

      {/* Main Pinkish Wave (CSS + GSAP combo) */}
      <div className="wave-glow" style={{
        position: 'absolute',
        bottom: '-100px',
        left: '-10%',
        right: '-10%',
        height: '500px',
        filter: 'blur(100px)',
        pointerEvents: 'none',
        zIndex: 0,
      }}>
        {/* GSAP Target Inner Div */}
        <div ref={wave1Ref} style={{
          width: '100%',
          height: '100%',
          background: 'radial-gradient(ellipse at center bottom, rgba(230, 0, 118, 0.5) 0%, rgba(230, 0, 118, 0.2) 30%, rgba(75, 0, 130, 0.1) 60%, transparent 80%)',
          borderRadius: '50% 50% 0 0 / 150px 150px 0 0',
        }} />
      </div>

      {/* Secondary Subtle Wave */}
      <div className="wave-glow" style={{
        position: 'absolute',
        bottom: '-50px',
        left: '-20%',
        right: '-20%',
        height: '350px',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: 0,
        animationDelay: '-4s',
      }}>
         {/* GSAP Target Inner Div */}
         <div ref={wave2Ref} style={{
          width: '100%',
          height: '100%',
          background: 'radial-gradient(ellipse at center bottom, rgba(255, 77, 179, 0.3) 0%, rgba(230, 0, 118, 0.15) 40%, transparent 70%)',
          borderRadius: '50% 50% 0 0 / 100px 100px 0 0',
        }} />
      </div>

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
                  <line x1="11" y1="2" x2="11" y2="20" stroke="#e60076" strokeWidth="2.5" strokeLinecap="round" />
                  <line x1="2" y1="11" x2="20" y2="11" stroke="#e60076" strokeWidth="2.5" strokeLinecap="round" />
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