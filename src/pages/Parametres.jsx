import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, LogOut, Plus, Archive } from 'lucide-react'
import { reauthenticateWithCredential, updatePassword, EmailAuthProvider } from 'firebase/auth'
import { auth, loginToEmail } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { getVacancesForZone } from '../utils/vacancesData'
import { genId } from '../utils/id'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const ZONES = ['A', 'B', 'C']

export default function Parametres() {
  const navigate = useNavigate()
  const { getCurrentUser, logout, updateCurrentUserProfile } = useAuth()
  const { getParams, setParams, anneesScolaires, add, update, remove } = useData()
  const { theme, setTheme } = useTheme()
  const toast = useToast()

  const user = getCurrentUser()
  const params = getParams()
  const annees = anneesScolaires()

  const [profil, setProfil] = useState({
    enseignant: params.enseignant || '',
    etablissement: params.etablissement || '',
    slogan: user?.slogan || '',
  })
  const [zoneVacances, setZoneVacances] = useState(params.zoneVacances || 'B')
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdError, setPwdError] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  const [showAnneeModal, setShowAnneeModal] = useState(false)
  const [newAnnee, setNewAnnee] = useState({ label: '', dateDebut: '', dateFin: '' })

  const [showLogout, setShowLogout] = useState(false)

  function saveProfil() {
    setParams({ enseignant: profil.enseignant, etablissement: profil.etablissement })
    if (user) updateCurrentUserProfile({ nom: profil.enseignant || user.nom, slogan: profil.slogan })
    toast.success('Profil enregistré.')
  }

  async function savePwd() {
    setPwdError('')
    if (!user || !auth.currentUser) return
    if (pwd.next.length < 4) { setPwdError('Le nouveau mot de passe est trop court.'); return }
    if (pwd.next !== pwd.confirm) { setPwdError('Les mots de passe ne correspondent pas.'); return }

    setPwdLoading(true)
    try {
      const email = loginToEmail(user.login)
      const credential = EmailAuthProvider.credential(email, pwd.current)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, pwd.next)
      await updateCurrentUserProfile({ password: pwd.next })
      setPwd({ current: '', next: '', confirm: '' })
      toast.success('Mot de passe modifié.')
    } catch (err) {
      const authErrors = ['auth/wrong-password', 'auth/invalid-credential']
      if (authErrors.includes(err.code)) {
        setPwdError('Mot de passe actuel incorrect.')
      } else {
        setPwdError('Erreur lors du changement de mot de passe.')
      }
    } finally {
      setPwdLoading(false)
    }
  }

  function createAnnee() {
    if (!newAnnee.label.trim()) return
    const id = genId('as')
    annees.forEach(a => update('anneesScolaires', a.id, { active: false }))
    add('anneesScolaires', { id, ...newAnnee, active: true })
    const vacances = getVacancesForZone(zoneVacances, id)
    vacances.forEach(v => add('vacances', v))
    setShowAnneeModal(false)
    toast.success(`Année "${newAnnee.label}" créée.`)
  }

  function setAnneeActive(id) {
    annees.forEach(a => update('anneesScolaires', a.id, { active: a.id === id }))
    toast.info('Année active mise à jour.')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Paramètres</h2>

      {/* Profil */}
      <section className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Profil</h3>
        <div>
          <label className="label">Nom de l'enseignant</label>
          <input className="input" value={profil.enseignant}
            onChange={e => setProfil(p => ({ ...p, enseignant: e.target.value }))} />
        </div>
        <div>
          <label className="label">Établissement</label>
          <input className="input" value={profil.etablissement}
            onChange={e => setProfil(p => ({ ...p, etablissement: e.target.value }))} />
        </div>
        <div>
          <label className="label">Slogan personnel</label>
          <input className="input" placeholder="Éleveur de Champions ! 🏆" value={profil.slogan}
            onChange={e => setProfil(p => ({ ...p, slogan: e.target.value }))} />
          <p className="text-xs text-gray-400 mt-1">Affiché sur votre tableau de bord.</p>
        </div>
        <button onClick={saveProfil} className="btn-primary flex items-center gap-2">
          <Save size={15} /> Enregistrer
        </button>
      </section>

      {/* Années scolaires */}
      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Années scolaires</h3>
          <button onClick={() => setShowAnneeModal(true)} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
            <Plus size={14} /> Nouvelle année
          </button>
        </div>

        {annees.length === 0 && (
          <p className="text-sm text-gray-400">Aucune année configurée.</p>
        )}

        <div className="space-y-2">
          {annees.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex-1">
                <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{a.label}</span>
                <span className="ml-2 text-xs text-gray-400">{a.dateDebut} → {a.dateFin}</span>
              </div>
              {a.active ? (
                <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                  Active
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><Archive size={11} /> Archivée</span>
                  <button onClick={() => setAnneeActive(a.id)} className="text-xs text-blue-500 hover:underline">
                    Activer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Zone vacances */}
      <section className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Zone de vacances</h3>
        <div className="flex gap-3">
          {ZONES.map(z => (
            <button
              key={z}
              type="button"
              onClick={() => { setZoneVacances(z); setParams({ zoneVacances: z }); toast.info(`Zone ${z} sélectionnée.`) }}
              className={`px-5 py-2 rounded-lg border-2 font-semibold text-sm transition-all
                ${zoneVacances === z
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300'
                }`}
            >
              Zone {z}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Zone B = Académie de Dijon (Bourgogne)</p>
      </section>

      {/* Apparence */}
      <section className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Apparence</h3>
        <div className="flex gap-3">
          {['clair', 'sombre'].map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-5 py-2 rounded-lg border-2 font-medium text-sm capitalize transition-all
                ${theme === t
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300'
                }`}
            >
              {t === 'clair' ? '☀️ Clair' : '🌙 Sombre'}
            </button>
          ))}
        </div>
      </section>

      {/* Mot de passe */}
      <section className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">Modifier le mot de passe</h3>
        <div>
          <label className="label">Mot de passe actuel</label>
          <input type="password" className="input" value={pwd.current}
            onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <input type="password" className="input" value={pwd.next}
            onChange={e => setPwd(p => ({ ...p, next: e.target.value }))} />
        </div>
        <div>
          <label className="label">Confirmer</label>
          <input type="password" className="input" value={pwd.confirm}
            onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} />
        </div>
        {pwdError && <p className="text-sm text-red-500">{pwdError}</p>}
        <button onClick={savePwd} disabled={pwdLoading} className="btn-primary flex items-center gap-2">
          <Save size={15} /> {pwdLoading ? 'Modification...' : 'Changer le mot de passe'}
        </button>
      </section>

      {/* Compte */}
      <section className="card p-6">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Compte</h3>
        <button
          onClick={() => setShowLogout(true)}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 dark:hover:text-red-400
            font-medium text-sm transition-colors"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </section>

      {/* Modal nouvelle année */}
      <Modal isOpen={showAnneeModal} onClose={() => setShowAnneeModal(false)} title="Nouvelle année scolaire" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Libellé</label>
            <input className="input" placeholder="2026-2027" value={newAnnee.label}
              onChange={e => setNewAnnee(a => ({ ...a, label: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Début</label>
              <input type="date" className="input" value={newAnnee.dateDebut}
                onChange={e => setNewAnnee(a => ({ ...a, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fin</label>
              <input type="date" className="input" value={newAnnee.dateFin}
                onChange={e => setNewAnnee(a => ({ ...a, dateFin: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowAnneeModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={createAnnee}>Créer</button>
          </div>
        </div>
      </Modal>

      {/* Confirm déconnexion */}
      <ConfirmDialog
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={() => { logout(); navigate('/login') }}
        title="Déconnexion"
        message="Voulez-vous quitter MCCV ?"
        confirmLabel="Oui, quitter"
        danger
      />
    </div>
  )
}
