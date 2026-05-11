// Helpers de migration localStorage → Firestore
// Ces fonctions permettent de lire les données localStorage existantes
// lors du premier login après la migration, puis de les effacer.

const USERS_KEY = 'mccv_users'
const DATA_PREFIX = 'mccv_data_'
const SESSION_KEY = 'mccv_session'

export function getLegacyUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') } catch { return [] }
}

export function getLegacyUserData(userId) {
  try { return JSON.parse(localStorage.getItem(DATA_PREFIX + userId) || 'null') } catch { return null }
}

export function clearLegacyStorage() {
  const keys = Object.keys(localStorage).filter(k =>
    k === USERS_KEY || k === SESSION_KEY || k.startsWith(DATA_PREFIX)
  )
  keys.forEach(k => localStorage.removeItem(k))
}
