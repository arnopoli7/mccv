import { useState, useEffect, useRef, useCallback } from 'react'

const COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#FF9FF3',
  '#54A0FF', '#00D2D3', '#1DD1A1', '#A29BFE', '#FD79A8',
]

const INACTIVITY_DELAY = 30000

export default function Screensaver() {
  const [active, setActive] = useState(false)
  const [color, setColor] = useState(COLORS[0])

  const timerRef = useRef(null)
  const posRef = useRef({ x: 120, y: 120 })
  const velRef = useRef({ dx: 1.5, dy: 1.1 })
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
      velRef.current = { dx: 1.5, dy: 1.1 }
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

  // Animation DVD bounce via rAF
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
      if (y <= 0)          { y = 0;         dy = Math.abs(dy);  bounced = true }
      if (y + bh >= ch - 40) { y = ch - bh - 40; dy = -Math.abs(dy); bounced = true }

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

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
      onClick={resetTimer}
    >
      {/* Logo bouncing */}
      <div
        ref={boxRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          textAlign: 'center',
          willChange: 'transform',
          padding: '8px 16px',
        }}
      >
        <p style={{
          fontSize: '90px',
          fontWeight: 900,
          color: color,
          lineHeight: 1,
          margin: 0,
          letterSpacing: '-2px',
          textShadow: `0 0 40px ${color}88, 0 0 80px ${color}44`,
          transition: 'color 0.2s ease, text-shadow 0.2s ease',
        }}>
          MCCV
        </p>
        <p style={{
          fontSize: '16px',
          fontWeight: 500,
          color: color,
          margin: '4px 0 0',
          letterSpacing: '0.1em',
          opacity: 0.85,
          textShadow: `0 0 16px ${color}66`,
          transition: 'color 0.2s ease',
          whiteSpace: 'nowrap',
        }}>
          Mon Cahier de Cours Virtuel
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
          color: 'rgba(255,255,255,0.3)',
          fontSize: '0.8rem',
          letterSpacing: '0.12em',
          margin: 0,
          animation: 'hintPulse 3s ease-in-out infinite',
        }}>
          Cliquez ou bougez la souris pour continuer
        </p>
        <style>{`
          @keyframes hintPulse {
            0%, 100% { opacity: 0.3; }
            50%       { opacity: 0.6; }
          }
        `}</style>
      </div>
    </div>
  )
}
