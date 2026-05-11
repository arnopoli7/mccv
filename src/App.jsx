import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Classes from './pages/Classes'
import ClasseFiche from './pages/ClasseFiche'
import Calendrier from './pages/Calendrier'
import EmploiDuTemps from './pages/EmploiDuTemps'
import Parametres from './pages/Parametres'
import Administration from './pages/Administration'
import Generateur from './pages/Generateur'

function PrivateRoute({ children, adminOnly = false }) {
  const { session, loading, isAdmin, needsSetup } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>
  if (!session) return <Navigate to="/login" replace />
  if (needsSetup()) return <Navigate to="/setup" replace />
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />
  return children
}

function PublicRoute({ children }) {
  const { session, loading, needsSetup } = useAuth()
  if (loading) return null
  if (session) {
    if (needsSetup()) return <Navigate to="/setup" replace />
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const { session, loading, needsSetup } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/setup" element={
        !session ? <Navigate to="/login" replace /> :
        needsSetup() ? <Setup /> :
        <Navigate to="/" replace />
      } />

      <Route path="/" element={
        <PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>
      } />
      <Route path="/classes" element={
        <PrivateRoute><Layout><Classes /></Layout></PrivateRoute>
      } />
      <Route path="/classes/:id" element={
        <PrivateRoute><Layout><ClasseFiche /></Layout></PrivateRoute>
      } />
      <Route path="/generateur" element={
        <PrivateRoute><Layout><Generateur /></Layout></PrivateRoute>
      } />
      <Route path="/calendrier" element={
        <PrivateRoute><Layout><Calendrier /></Layout></PrivateRoute>
      } />
      <Route path="/emploi-du-temps" element={
        <PrivateRoute><Layout><EmploiDuTemps /></Layout></PrivateRoute>
      } />
      <Route path="/parametres" element={
        <PrivateRoute><Layout><Parametres /></Layout></PrivateRoute>
      } />
      <Route path="/administration" element={
        <PrivateRoute adminOnly><Layout><Administration /></Layout></PrivateRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
