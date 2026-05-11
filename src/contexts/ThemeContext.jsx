import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { useData } from './DataContext'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const { session } = useAuth()
  const { getParams, setParams, dataLoading } = useData()
  const [theme, setThemeState] = useState('clair')

  // Applique le thème depuis Firestore dès que les données sont chargées
  useEffect(() => {
    if (session?.userId && !dataLoading) {
      const t = getParams()?.theme || 'clair'
      setThemeState(t)
      applyTheme(t)
    } else if (!session) {
      applyTheme('clair')
    }
  }, [session, dataLoading])

  function applyTheme(t) {
    if (t === 'sombre') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function setTheme(t) {
    setThemeState(t)
    applyTheme(t)
    if (session?.userId) {
      setParams({ theme: t })
    }
  }

  function toggleTheme() {
    setTheme(theme === 'clair' ? 'sombre' : 'clair')
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
