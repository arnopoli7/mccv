import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Sun, Moon, ChevronDown, Archive, Smartphone } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { genId } from '../../utils/id'

const PAGE_TITLES = {
  '/': 'Tableau de bord',
  '/classes': 'Classes',
  '/emploi-du-temps': 'Emploi du temps',
  '/parametres': 'Paramètres',
  '/administration': 'Administration',
}

export default function Header({ sidebarWidth }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { getCurrentUser } = useAuth()
  const { anneesScolaires, getAnneeActive, update, refresh } = useData()
  const { theme, toggleTheme } = useTheme()
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSearch, setShowSearch] = useState(false)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const searchRef = useRef()
  const yearRef = useRef()

  // Capture l'événement beforeinstallprompt pour le bouton PWA
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstallPrompt(null))
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    installPrompt.userChoice.then(() => setInstallPrompt(null))
  }

  const user = getCurrentUser()
  const annees = anneesScolaires()
  const anneeActive = getAnneeActive()

  // Page title
  const pathname = location.pathname
  let title = PAGE_TITLES[pathname] || ''
  if (pathname.startsWith('/classes/')) title = 'Fiche classe'

  // Search logic
  const { rubanPedagogique, seancesCalendrier, ccf, classes } = useData()

  function doSearch(q) {
    setSearchQ(q)
    if (!q.trim() || q.length < 2) {
      setSearchResults([])
      return
    }
    const ql = q.toLowerCase()
    const results = []
    const classList = classes()

    // Séquences & séances
    rubanPedagogique().forEach(rb => {
      const classe = classList.find(c => c.id === rb.classeId)
      rb.sequences?.forEach(seq => {
        if (seq.titre.toLowerCase().includes(ql)) {
          results.push({
            type: 'Séquence',
            titre: seq.titre,
            classe: classe?.nom || '',
            link: `/classes/${rb.classeId}?tab=ruban`,
          })
        }
        seq.seances?.forEach(s => {
          if (s.titre.toLowerCase().includes(ql)) {
            results.push({
              type: 'Séance',
              titre: s.titre,
              classe: classe?.nom || '',
              link: `/classes/${rb.classeId}?tab=seances`,
            })
          }
        })
      })
    })

    // CCF
    ccf().forEach(c => {
      const classe = classList.find(cl => cl.id === c.classeId)
      if (c.titre.toLowerCase().includes(ql)) {
        results.push({
          type: 'CCF',
          titre: c.titre,
          classe: classe?.nom || '',
          link: `/classes/${c.classeId}?tab=ccf`,
        })
      }
    })

    setSearchResults(results.slice(0, 8))
  }

  function switchAnnee(id) {
    annees.forEach(a => {
      update('anneesScolaires', a.id, { active: a.id === id })
    })
    setShowYearPicker(false)
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearch(false)
      }
      if (yearRef.current && !yearRef.current.contains(e.target)) {
        setShowYearPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header
      className="fixed top-0 right-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
        flex items-center gap-2 md:gap-4 px-3 md:px-6 h-14 layout-header"
      style={{ left: sidebarWidth }}
    >
      {/* Titre page */}
      <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">
        {title}
      </h1>

      {/* Bandeau année archivée */}
      {anneeActive?.archived && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 rounded-full">
          <Archive size={13} />
          {anneeActive.label} — Consultation uniquement
        </div>
      )}

      <div className="flex-1" />

      {/* Recherche globale */}
      <div ref={searchRef} className="relative hidden sm:block">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5">
          <Search size={15} className="text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQ}
            onChange={e => doSearch(e.target.value)}
            onFocus={() => setShowSearch(true)}
            className="bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200 w-36 md:w-48
              placeholder:text-gray-400"
          />
        </div>
        {showSearch && searchResults.length > 0 && (
          <div className="absolute top-full mt-1 right-0 w-80 card shadow-xl z-50 overflow-hidden">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => { navigate(r.link); setShowSearch(false); setSearchQ(''); setSearchResults([]) }}
                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700
                  text-left border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <span className="text-xs font-medium text-blue-500 mt-0.5 shrink-0 w-16">{r.type}</span>
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.titre}</div>
                  {r.classe && <div className="text-xs text-gray-400">{r.classe}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sélecteur année */}
      {annees.length > 0 && (
        <div ref={yearRef} className="relative">
          <button
            onClick={() => setShowYearPicker(!showYearPicker)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200
              bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {anneeActive?.label || 'Année'}
            <ChevronDown size={14} />
          </button>
          {showYearPicker && (
            <div className="absolute top-full mt-1 right-0 w-44 card shadow-xl z-50 py-1">
              {annees.map(a => (
                <button
                  key={a.id}
                  onClick={() => switchAnnee(a.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                    ${a.id === anneeActive?.id ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}
                >
                  {a.label}
                  {!a.active && <span className="ml-1 text-xs text-gray-400">(archivée)</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bouton installation PWA */}
      {installPrompt && (
        <button
          onClick={handleInstall}
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400
            bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700
            px-2.5 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
          title="Installer l'application sur cet écran"
        >
          <Smartphone size={13} />
          Installer
        </button>
      )}

      {/* Toggle thème */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title={theme === 'clair' ? 'Mode sombre' : 'Mode clair'}
      >
        {theme === 'clair'
          ? <Moon size={18} className="text-gray-500" />
          : <Sun size={18} className="text-yellow-400" />
        }
      </button>

      {/* Avatar utilisateur */}
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center
        text-blue-700 dark:text-blue-300 text-sm font-semibold">
        {user?.nom?.[0] || '?'}
      </div>
    </header>
  )
}
