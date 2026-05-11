import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarDays,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const USER_LINKS = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', end: true },
  { to: '/classes', icon: BookOpen, label: 'Classes' },
  { to: '/generateur', icon: Sparkles, label: 'Générateur' },
  { to: '/calendrier', icon: CalendarDays, label: 'Calendrier' },
  { to: '/emploi-du-temps', icon: Calendar, label: 'Emploi du temps' },
  { to: '/parametres', icon: Settings, label: 'Paramètres' },
]

const ADMIN_LINKS = [
  ...USER_LINKS,
  { to: '/administration', icon: ShieldCheck, label: 'Administration' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { isAdmin } = useAuth()
  const links = isAdmin() ? ADMIN_LINKS : USER_LINKS

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col bg-gray-900 dark:bg-gray-950
        text-white transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'}`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-700/50
        ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
          <BookOpen size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-sm leading-none">MCCV</div>
            <div className="text-xs text-gray-400 leading-none mt-0.5">Cahier virtuel</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${collapsed ? 'justify-center' : ''}
              ${isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 mx-2 mb-4 px-3 py-2.5 rounded-lg text-sm text-gray-400
          hover:bg-gray-800 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? 'Déplier la sidebar' : 'Réduire la sidebar'}
      >
        {collapsed ? <ChevronRight size={18} /> : (
          <>
            <ChevronLeft size={18} />
            <span>Réduire</span>
          </>
        )}
      </button>
    </aside>
  )
}
