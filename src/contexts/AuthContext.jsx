import { createContext, useContext, useState, useEffect } from 'react'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore'
import { auth, db, loginToEmail } from '../firebase'
import { getLegacyUsers, getLegacyUserData, clearLegacyStorage } from '../utils/storage'

const AuthContext = createContext(null)

const ADMIN_LOGIN = 'Arnaud7'
const ADMIN_PASSWORD = 'Auxerre7!'

// ─── Helpers Firestore ────────────────────────────────────────────────────────

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? { id: uid, ...snap.data() } : null
  } catch {
    return null
  }
}

async function writeUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true })
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)      // { userId, role }
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribe = null

    async function init() {
      // S'assurer que le compte admin existe (premier lancement)
      await ensureAdminExists()

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const profile = await loadUserProfile(firebaseUser.uid)
          if (profile && profile.actif !== false) {
            setUserProfile(profile)
            setSession({ userId: firebaseUser.uid, role: profile.role })
          } else {
            // Compte désactivé ou profil manquant
            await signOut(auth)
            setSession(null)
            setUserProfile(null)
          }
        } else {
          setSession(null)
          setUserProfile(null)
        }
        setLoading(false)
      })
    }

    init().catch(err => {
      console.error('Auth init error:', err)
      setLoading(false)
    })

    return () => { if (unsubscribe) unsubscribe() }
  }, [])

  // Crée le compte admin si inexistant (premier lancement)
  async function ensureAdminExists() {
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        loginToEmail(ADMIN_LOGIN),
        ADMIN_PASSWORD
      )
      const uid = credential.user.uid
      await writeUserProfile(uid, {
        login: ADMIN_LOGIN,
        nom: 'Arnaud',
        role: 'admin',
        actif: true,
        setupDone: false,
        dateCreation: new Date().toISOString(),
        password: ADMIN_PASSWORD,
        email: loginToEmail(ADMIN_LOGIN),
      })
      await signOut(auth)
    } catch (err) {
      // auth/email-already-in-use = admin existe déjà, c'est normal
      if (err.code !== 'auth/email-already-in-use') {
        console.error('Erreur création admin:', err)
      }
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────

  async function login(loginName, password) {
    const email = loginToEmail(loginName)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const profile = await loadUserProfile(credential.user.uid)

      if (!profile) return { ok: false, error: 'Compte introuvable.' }
      if (profile.actif === false) {
        await signOut(auth)
        return { ok: false, error: 'Compte désactivé.' }
      }

      // Migration localStorage → Firestore si données locales présentes
      await migrateFromLocalStorage(credential.user.uid, loginName)

      // Recharger le profil après migration potentielle
      const freshProfile = await loadUserProfile(credential.user.uid)
      setUserProfile(freshProfile)
      setSession({ userId: credential.user.uid, role: freshProfile.role })
      return { ok: true, user: freshProfile }
    } catch (err) {
      const authErrors = [
        'auth/user-not-found',
        'auth/wrong-password',
        'auth/invalid-credential',
        'auth/invalid-email',
      ]
      if (authErrors.includes(err.code)) {
        return { ok: false, error: 'Identifiant ou mot de passe incorrect.' }
      }
      console.error('Login error:', err)
      return { ok: false, error: 'Erreur de connexion.' }
    }
  }

  // Migration one-shot des données localStorage vers Firestore
  async function migrateFromLocalStorage(uid, loginName) {
    const legacyUsers = getLegacyUsers()
    if (legacyUsers.length === 0) return

    const legacyUser = legacyUsers.find(
      u => u.login.toLowerCase() === loginName.toLowerCase()
    )
    if (!legacyUser) return

    const legacyData = getLegacyUserData(legacyUser.id)

    if (legacyData) {
      const COLLECTIONS = [
        'anneesScolaires', 'classes', 'vacances', 'emploiDuTemps',
        'rubanPedagogique', 'seancesCalendrier', 'ccf',
      ]
      // Migrer les paramètres
      if (legacyData.parametres && Object.keys(legacyData.parametres).length > 0) {
        await setDoc(doc(db, 'users', uid, 'data', 'parametres'), legacyData.parametres)
      }
      // Migrer chaque collection
      for (const col of COLLECTIONS) {
        const items = legacyData[col]
        if (Array.isArray(items) && items.length > 0) {
          await setDoc(doc(db, 'users', uid, 'data', col), { items })
        }
      }
    }

    // Migrer setupDone si applicable
    if (legacyUser.setupDone) {
      await writeUserProfile(uid, { setupDone: true, nom: legacyUser.nom || legacyUser.login })
    }

    clearLegacyStorage()
    console.log('Migration localStorage → Firestore terminée.')
  }

  // ─── Logout ──────────────────────────────────────────────────────────────

  async function logout() {
    await signOut(auth)
    setSession(null)
    setUserProfile(null)
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function getCurrentUser() {
    return userProfile
  }

  function isAdmin() {
    return session?.role === 'admin'
  }

  function needsSetup() {
    return userProfile ? !userProfile.setupDone : false
  }

  async function updateCurrentUserProfile(updates) {
    if (!session?.userId) return
    await writeUserProfile(session.userId, updates)
    setUserProfile(p => ({ ...p, ...updates }))
  }

  const value = {
    session,
    loading,
    login,
    logout,
    getCurrentUser,
    isAdmin,
    needsSetup,
    updateCurrentUserProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

// Exporté pour Administration.jsx (listing utilisateurs)
export { loadUserProfile, writeUserProfile }
