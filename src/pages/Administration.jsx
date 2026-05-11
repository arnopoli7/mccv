import { useState, useEffect } from 'react'
import { UserPlus, UserCheck, UserX, Key } from 'lucide-react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth'
import { collection, getDocs, setDoc, doc } from 'firebase/firestore'
import { db, secondaryAuth, loginToEmail } from '../firebase'
import { useToast } from '../contexts/ToastContext'
import { genId } from '../utils/id'
import Modal from '../components/ui/Modal'
import Badge from '../components/ui/Badge'
import { formatDate } from '../utils/dateUtils'

export default function Administration() {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ login: '', password: '', nom: '', role: 'user' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const snap = await getDocs(collection(db, 'users'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Récupération automatique : compléter les champs manquants sur les profils incomplets
      await Promise.all(list.map(async u => {
        const missing = {}
        if (u.actif === undefined) missing.actif = true
        if (u.setupDone === undefined) missing.setupDone = false
        if (u.email === undefined && u.login) missing.email = loginToEmail(u.login)
        if (Object.keys(missing).length > 0) {
          console.log(`[Administration] Profil incomplet pour ${u.login}, complétion :`, missing)
          await setDoc(doc(db, 'users', u.id), missing, { merge: true })
          Object.assign(u, missing)
        }
      }))

      setUsers(list.sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || '')))
    } catch (err) {
      console.error('Erreur chargement utilisateurs:', err)
    }
  }

  async function toggleActif(user) {
    try {
      await setDoc(doc(db, 'users', user.id), { actif: !user.actif }, { merge: true })
      await loadUsers()
      toast.info(`Compte ${user.login} ${user.actif ? 'désactivé' : 'réactivé'}.`)
    } catch {
      toast.error('Erreur lors de la modification du compte.')
    }
  }

  function openCreate() {
    setEditUser(null)
    setForm({ login: '', password: '', nom: '', role: 'user' })
    setShowModal(true)
  }

  function openEdit(u) {
    setEditUser(u)
    setForm({ login: u.login, password: '', nom: u.nom || '', role: u.role })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.login.trim() || (!editUser && !form.password.trim())) {
      toast.error('Identifiant et mot de passe requis.')
      return
    }
    if (!editUser && form.password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    setSaving(true)
    try {
      if (!editUser) {
        await createUser()
      } else {
        await editExistingUser()
      }
      setShowModal(false)
      await loadUsers()
    } catch (err) {
      if (err?.message !== 'handled') {
        console.error('Erreur sauvegarde:', err)
        toast.error('Erreur lors de la sauvegarde.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function createUser() {
    const login = form.login.trim()
    const motDePasse = form.password   // lu directement depuis l'état React
    const email = `${login.toLowerCase()}@mccv.local`

    // Vérifier doublon côté Firestore
    const exists = users.find(u => u.login.toLowerCase() === login.toLowerCase())
    if (exists) {
      toast.error('Cet identifiant est déjà utilisé.')
      throw new Error('handled')
    }

    // Debug : confirmer ce qui est envoyé à Firebase
    console.log('PASSWORD:', motDePasse)
    console.log('EMAIL:', email)

    // Créer dans Firebase Auth via l'instance secondaire
    let uid
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, motDePasse)
      uid = credential.user.uid
      await signOut(secondaryAuth)
    } catch (err) {
      console.error('Erreur Firebase Auth:', err.code, err.message)
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Ce compte existe déjà.')
      } else if (err.code === 'auth/weak-password') {
        toast.error('Le mot de passe doit contenir au moins 6 caractères.')
      } else if (err.code === 'auth/invalid-email') {
        toast.error('Identifiant invalide.')
      } else {
        toast.error(`Erreur Firebase : ${err.message}`)
      }
      throw new Error('handled')
    }

    // Créer le profil Firestore
    await setDoc(doc(db, 'users', uid), {
      login,
      nom: form.nom.trim() || login,
      role: form.role,
      actif: true,
      setupDone: false,
      dateCreation: new Date().toISOString(),
      password: motDePasse,
      email,
    })

    // Initialiser les paramètres
    await setDoc(doc(db, 'users', uid, 'data', 'parametres'), {
      etablissement: '', enseignant: '', zoneVacances: 'B', theme: 'clair',
    })

    toast.success('Compte créé avec succès.')
  }

  async function editExistingUser() {
    const updates = {
      nom: form.nom.trim() || editUser.nom,
      role: form.role,
    }

    // Changement de mot de passe
    if (form.password.trim()) {
      try {
        // Se connecter avec l'instance secondaire et le mot de passe stocké
        const credential = await signInWithEmailAndPassword(
          secondaryAuth,
          editUser.email || loginToEmail(editUser.login),
          editUser.password
        )
        await updatePassword(credential.user, form.password)
        await signOut(secondaryAuth)
        updates.password = form.password
      } catch (err) {
        console.error('Erreur changement mdp:', err)
        toast.error('Impossible de modifier le mot de passe. Vérifiez les données du compte.')
        return
      }
    }

    await setDoc(doc(db, 'users', editUser.id), updates, { merge: true })
    toast.success(`Compte "${editUser.login}" mis à jour.`)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Administration</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{users.length} utilisateur(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <UserPlus size={16} /> Créer un compte
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Utilisateur</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Identifiant</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Rôle</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Création</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center
                      text-blue-700 dark:text-blue-300 font-semibold text-sm">
                      {(u.nom || u.login)[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{u.nom || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono">{u.login}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === 'admin' ? 'blue' : 'gray'}>
                    {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {u.dateCreation ? formatDate(u.dateCreation.slice(0, 10)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.actif !== false ? 'green' : 'red'}>
                    {u.actif !== false ? 'Actif' : 'Désactivé'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"
                      title="Modifier"
                    >
                      <Key size={15} />
                    </button>
                    <button
                      onClick={() => toggleActif(u)}
                      className={`p-1.5 rounded-lg transition-colors
                        ${u.actif !== false
                          ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500'
                          : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-400 hover:text-green-500'
                        }`}
                      title={u.actif !== false ? 'Désactiver' : 'Réactiver'}
                    >
                      {u.actif !== false ? <UserX size={15} /> : <UserCheck size={15} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal création/édition */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editUser ? `Modifier — ${editUser.login}` : 'Créer un compte'}
        size="sm"
      >
        <div className="space-y-4">
          {!editUser && (
            <div>
              <label className="label">Identifiant</label>
              <input
                className="input"
                placeholder="ex: Martin42"
                value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              />
            </div>
          )}
          <div>
            <label className="label">Nom affiché</label>
            <input
              className="input"
              placeholder="ex: Martin Dupont"
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">
              {editUser ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe'}
            </label>
            <input
              type="password"
              className="input"
              placeholder={editUser ? '••••••••' : 'Mot de passe'}
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Rôle</label>
            <select
              className="input"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : editUser ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
