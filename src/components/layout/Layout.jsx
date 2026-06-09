import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from './BottomNav'
import Screensaver from '../ui/Screensaver'

// ─── Bannière hors-ligne ──────────────────────────────────────────────────────

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [lastSync] = useState(() => {
    try {
      const d = localStorage.getItem('mccv_last_online')
      return d ? new Date(d).toLocaleString('fr-FR') : null
    } catch { return null }
  })

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => {
      setOffline(false)
      localStorage.setItem('mccv_last_online', new Date().toISOString())
    }
    if (navigator.onLine) localStorage.setItem('mccv_last_online', new Date().toISOString())
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-amber-500 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-2">
      <span>Mode hors ligne</span>
      {lastSync && <span className="opacity-80">· Derniere synchronisation : {lastSync}</span>}
    </div>
  )
}

// ─── Layout principal ─────────────────────────────────────────────────────────

export default function Layout({ children }) {
  // Collapsed by default on small screens (< 1024px)
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  )
  const sidebarWidth = collapsed ? 64 : 224 // px (w-16=64, w-56=224)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <Header sidebarWidth={sidebarWidth} />
      <OfflineBanner />
      <main
        className="pt-14 min-h-screen transition-all duration-300 pb-20 md:pb-0 layout-main"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomNav />
      <Screensaver />
    </div>
  )
}
