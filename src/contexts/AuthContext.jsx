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

  // Vérifie que le compte admin existe dans Firebase Auth ET dans Firestore.
  // Stratégie :
  //   1. Tenter une connexion → si OK, vérifier/recréer le profil Firestore si absent
  //   2. Si la connexion échoue (compte inexistant) → créer compte + profil Firestore
  async function ensureAdminExists() {
    const email = loginToEmail(ADMIN_LOGIN)
    const adminProfile = {
      login: ADMIN_LOGIN,
      nom: 'Arnaud',
      role: 'admin',
      actif: true,
      setupDone: false,
      dateCreation: new Date().toISOString(),
      password: ADMIN_PASSWORD,
      email,
    }

    try {
      // Étape 1 : connexion test pour vérifier Auth + récupérer l'uid
      const credential = await signInWithEmailAndPassword(auth, email, ADMIN_PASSWORD)
      // Auth OK → vérifier que le profil Firestore existe
      const profile = await loadUserProfile(credential.user.uid)
      if (!profile) {
        // Profil manquant (cas fréquent après réinitialisation Firestore) → le recréer
        await writeUserProfile(credential.user.uid, adminProfile)
        console.log('Profil admin Firestore recréé.')
      }
      await signOut(auth)
    } catch (loginErr) {
      // Étape 2 : compte Auth inexistant → créer compte + profil
      const needsCreation = [
        'auth/user-not-found',
        'auth/invalid-credential',
        'auth/wrong-password',
      ].includes(loginErr.code)

      if (needsCreation) {
        try {
          const credential = await createUserWithEmailAndPassword(auth, email, ADMIN_PASSWORD)
          await writeUserProfile(credential.user.uid, adminProfile)
          await signOut(auth)
          console.log('Compte admin créé.')
        } catch (createErr) {
          // Race condition très rare : ignorer si déjà créé entre les deux appels
          if (createErr.code !== 'auth/email-already-in-use') {
            console.error('Erreur création compte admin:', createErr)
          }
        }
      } else {
        console.error('Erreur vérification compte admin:', loginErr)
      }
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────

  async function login(loginName, password) {
    const email = loginToEmail(loginName)
    console.log('Login tenté — identifiant:', loginName, '| email:', email)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      console.log('Auth Firebase OK — uid:', credential.user.uid)
      const profile = await loadUserProfile(credential.user.uid)
      console.log('Profil Firestore:', profile)

      if (!profile) {
        console.error('Profil Firestore absent pour uid:', credential.user.uid)
        return { ok: false, error: 'Compte introuvable (profil Firestore absent). Contactez l\'administrateur.' }
      }
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
      console.error('Login error — code:', err.code, '| message:', err.message)
      const authErrors = [
        'auth/user-not-found',
        'auth/wrong-password',
        'auth/invalid-credential',
        'auth/invalid-email',
      ]
      if (authErrors.includes(err.code)) {
        return { ok: false, error: `Identifiant ou mot de passe incorrect. (${err.code})` }
      }
      return { ok: false, error: `Erreur de connexion. (${err.code})` }
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
