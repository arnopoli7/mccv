import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useData } from '../../contexts/DataContext'

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const sidebarWidth = collapsed ? 64 : 224 // px (w-16=64, w-56=224)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <Header sidebarWidth={sidebarWidth} />
      <main
        className="pt-14 min-h-screen transition-all duration-300"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
