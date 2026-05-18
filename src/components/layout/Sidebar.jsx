import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
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
  LogOut,
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
  const { isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const links = isAdmin() ? ADMIN_LINKS : USER_LINKS

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className={`layout-sidebar-el fixed left-0 top-0 bottom-0 z-40 hidden md:flex flex-col bg-gray-900 dark:bg-gray-950
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

      {/* Déconnexion */}
      <div className="mx-2 mb-1">
        {showLogoutConfirm ? (
          <div className={`rounded-lg border border-red-500/40 bg-gray-800 p-3 ${collapsed ? 'text-center' : ''}`}>
            {!collapsed && (
              <p className="text-xs text-gray-300 mb-2 leading-snug">Voulez-vous quitter MCCV ?</p>
            )}
            <div className={`flex gap-2 ${collapsed ? 'flex-col' : ''}`}>
              <button
                onClick={handleLogout}
                className="flex-1 text-xs py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
                title="Confirmer la déconnexion"
              >
                {collapsed ? '✓' : 'Oui, quitter'}
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 text-xs py-1.5 px-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-medium transition-colors"
                title="Annuler"
              >
                {collapsed ? '✕' : 'Annuler'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
              text-gray-400 hover:bg-red-900/30 hover:text-red-400 transition-colors
              ${collapsed ? 'justify-center' : ''}`}
            title="Se déconnecter"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        )}
      </div>

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
