import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, CalendarDays, Sparkles, Settings } from 'lucide-react'

const LINKS = [
  { to: '/', icon: LayoutDashboard, label: 'Accueil', end: true },
  { to: '/classes', icon: BookOpen, label: 'Classes' },
  { to: '/calendrier', icon: CalendarDays, label: 'Calendrier' },
  { to: '/generateur', icon: Sparkles, label: 'Générateur' },
  { to: '/parametres', icon: Settings, label: 'Paramètres' },
]

export default function BottomNav() {
  return (
    <nav className="layout-bottom-nav fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex md:hidden safe-bottom">
      {LINKS.map(({ to, icon: Icon, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors
            ${isActive
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span style={{ fontSize: 10 }} className="font-medium">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
