import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const QUOTES = [
  { text: "Je suis fatiguée ! 😩", author: "S.D", date: "01/09/2025" },
  { text: "Super, ton tableau ! Tu peux le partager ? NON il est à moi ! 😤", author: "R.P", date: "05/10/2025" },
  { text: "Les tiers temps ça ne sert à rien ! 🙄", author: "C.G", date: "12/05/2026" },
  { text: "Les 4ème, ils font quoi l'année prochaine ?! Car la classe des 3ème n'existe pas ! 🤔", author: "S.D", date: "12/12/2025" },
  { text: "Moi je ne suis pas d'accord, je ne suis pas d'accord ! 😤", author: "A.S", date: "12/05/2026" },
  { text: "Salut les becs à foin ! 🌾😂", author: "Y.W", date: "02/09/2025" },
  { text: "Tout va bien, l'AJA a gagné ! ⚽🎉", author: "A.P", date: "11/05/2026" },
  { text: "J'ai les pépites de 4ème ! 💎😍", author: "S.C", date: "07/05/2026" },
  { text: "Les femmes sont faites pour faire la vaisselle ! 🍽️😱", author: "F.S", date: "01/09/2025" },
]

const COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#FF9FF3',
  '#54A0FF', '#00D2D3', '#1DD1A1', '#A29BFE', '#FD79A8',
]

const INACTIVITY_DELAY = 30000

function StarField() {
  const stars = useMemo(() => (
    Array.from({ length: 120 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      delay: Math.random() * 4,
      duration: Math.random() * 3 + 2,
    }))
  ), [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map(s => (
        <div
          key={s.id}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            opacity: 0.7,
            animation: `starTwinkle ${s.duration}s ${s.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes starTwinkle {
          from { opacity: 0.1; transform: scale(0.8); }
          to   { opacity: 0.9; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}

export default function Screensaver() {
  const [active, setActive] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)
  const [color, setColor] = useState(COLORS[0])

  const timerRef = useRef(null)
  const posRef = useRef({ x: 120, y: 120 })
  const velRef = useRef({ dx: 1.3, dy: 0.9 })
  const frameRef = useRef(null)
  const boxRef = useRef(null)
  const containerRef = useRef(null)
  const colorIdxRef = useRef(0)
  const activeRef = useRef(false)

  const deactivate = useCallback(() => {
    if (activeRef.current) {
      activeRef.current = false
      setActive(false)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const resetTimer = useCallback(() => {
    deactivate()
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      activeRef.current = true
      posRef.current = { x: 120, y: 120 }
      velRef.current = { dx: 1.3, dy: 0.9 }
      setQuoteIndex(0)
      setFadeIn(true)
      setColor(COLORS[0])
      colorIdxRef.current = 0
      setActive(true)
    }, INACTIVITY_DELAY)
  }, [deactivate])

  // Listeners d'inactivité
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      clearTimeout(timerRef.current)
    }
  }, [resetTimer])

  // Rotation des citations toutes les 4 secondes
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setQuoteIndex(i => (i + 1) % QUOTES.length)
        setFadeIn(true)
      }, 500)
    }, 4000)
    return () => clearInterval(interval)
  }, [active])

  // Animation DVD bounce via rAF (pas de re-render pour la position)
  useEffect(() => {
    if (!active) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      return
    }

    const animate = () => {
      const container = containerRef.current
      const box = boxRef.current
      if (!container || !box) {
        frameRef.current = requestAnimationFrame(animate)
        return
      }

      const cw = container.clientWidth
      const ch = container.clientHeight
      const bw = box.offsetWidth
      const bh = box.offsetHeight

      let { x, y } = posRef.current
      let { dx, dy } = velRef.current

      x += dx
      y += dy

      let bounced = false
      if (x <= 0)          { x = 0;        dx = Math.abs(dx);  bounced = true }
      if (x + bw >= cw)    { x = cw - bw;  dx = -Math.abs(dx); bounced = true }
      if (y <= 90)         { y = 90;        dy = Math.abs(dy);  bounced = true }
      if (y + bh >= ch - 50) { y = ch - bh - 50; dy = -Math.abs(dy); bounced = true }

      if (bounced) {
        colorIdxRef.current = (colorIdxRef.current + 1) % COLORS.length
        setColor(COLORS[colorIdxRef.current])
      }

      posRef.current = { x, y }
      velRef.current = { dx, dy }
      box.style.transform = `translate(${x}px, ${y}px)`

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [active])

  if (!active) return null

  const quote = QUOTES[quoteIndex]

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.97)',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
      onClick={resetTimer}
    >
      <StarField />

      {/* Titre fixe */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '20px 16px 0',
        zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 'clamp(1.3rem, 3vw, 2rem)',
          color: '#ffffff',
          margin: 0,
          fontWeight: 400,
          letterSpacing: '0.05em',
          textShadow: '0 0 24px rgba(255, 200, 50, 0.6), 0 2px 8px rgba(0,0,0,0.8)',
        }}>
          Brèves de salle des profs 😂
        </h1>
        <div style={{
          width: 80,
          height: 2,
          background: 'linear-gradient(90deg, transparent, #FFD700, transparent)',
          margin: '10px auto 0',
        }} />
      </div>

      {/* Citation rebondissante */}
      <div
        ref={boxRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          maxWidth: 'min(480px, 85vw)',
          padding: '20px 24px',
          textAlign: 'center',
          willChange: 'transform',
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      >
        <p style={{
          fontSize: 'clamp(1.1rem, 2.5vw, 1.75rem)',
          fontWeight: 700,
          color: color,
          lineHeight: 1.45,
          margin: 0,
          textShadow: `0 0 32px ${color}99, 0 0 8px ${color}55`,
        }}>
          &ldquo;{quote.text}&rdquo;
        </p>
        <p style={{
          marginTop: 12,
          fontSize: 'clamp(0.85rem, 1.5vw, 1rem)',
          color: '#FFD700',
          fontStyle: 'italic',
          letterSpacing: '0.06em',
          margin: '12px 0 0',
          textShadow: '0 0 12px rgba(255,215,0,0.5)',
        }}>
          — {quote.author} &bull; {quote.date}
        </p>
      </div>

      {/* Hint bas de page */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: '0 16px 16px',
        zIndex: 10,
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.35)',
          fontSize: '0.8rem',
          letterSpacing: '0.12em',
          margin: 0,
          animation: 'hintPulse 3s ease-in-out infinite',
        }}>
          Cliquez ou bougez la souris pour continuer
        </p>
        <style>{`
          @keyframes hintPulse {
            0%, 100% { opacity: 0.35; }
            50%       { opacity: 0.7; }
          }
        `}</style>
      </div>
    </div>
  )
}
