import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from './BottomNav'

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
      <main
        className="pt-14 min-h-screen transition-all duration-300 pb-20 md:pb-0 layout-main"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
