// ─── Service Google Agenda ────────────────────────────────────────────────────
// Utilise Google Identity Services (GIS) pour l'OAuth2
// et l'API REST Google Calendar pour les événements.
//
// Variables d'environnement requises :
//   VITE_GOOGLE_CLIENT_ID  → ID client OAuth depuis Google Cloud Console
//   VITE_GOOGLE_API_KEY    → Clé API (optionnelle pour les requêtes authentifiées)

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

const TOKEN_KEY = 'mccv_gcal_token'
const CALENDAR_ID_KEY = 'mccv_gcal_calendar_id'
const MAPPING_KEY = 'mccv_gcal_mapping'
const AUTO_SYNC_KEY = 'mccv_gcal_auto_sync'

// ─── Token management ────────────────────────────────────────────────────────

function getStoredToken() {
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) return null
    const { access_token, expires_at } = JSON.parse(stored)
    if (Date.now() >= expires_at - 60000) return null // expire dans < 1 min
    return access_token
  } catch {
    return null
  }
}

function storeToken(response) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: response.access_token,
    expires_at: Date.now() + (Number(response.expires_in) * 1000),
  }))
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CALENDAR_ID_KEY)
  localStorage.removeItem(MAPPING_KEY)
}

export function isConnected() {
  return !!getStoredToken()
}

export function isAutoSyncEnabled() {
  return localStorage.getItem(AUTO_SYNC_KEY) === 'true'
}

export function setAutoSync(enabled) {
  if (enabled) {
    localStorage.setItem(AUTO_SYNC_KEY, 'true')
  } else {
    localStorage.removeItem(AUTO_SYNC_KEY)
  }
}

export function getCalendarId() {
  return localStorage.getItem(CALENDAR_ID_KEY) || null
}

// ─── Connexion OAuth ─────────────────────────────────────────────────────────

export function requestToken() {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID non configure dans les variables d\'environnement'))
      return
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services non charge. Veuillez rafraichir la page.'))
      return
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        storeToken(response)
        resolve(response.access_token)
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Connexion Google annulee'))
      },
    })
    client.requestAccessToken({ prompt: 'consent' })
  })
}

// ─── Appels API REST ─────────────────────────────────────────────────────────

async function apiCall(method, path, body = null) {
  const token = getStoredToken()
  if (!token) throw new Error('Session Google expiree. Reconnectez-vous.')

  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    throw new Error('Session Google expiree. Reconnectez-vous dans les Parametres.')
  }
  if (res.status === 404) {
    throw new Error('Ressource introuvable (404)')
  }
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erreur API Google ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Gestion du calendrier MCCV ──────────────────────────────────────────────

export async function ensureCalendar(etablissement) {
  const stored = localStorage.getItem(CALENDAR_ID_KEY)
  if (stored) {
    try {
      await apiCall('GET', `/calendars/${encodeURIComponent(stored)}`)
      return stored
    } catch {
      localStorage.removeItem(CALENDAR_ID_KEY)
    }
  }

  const calendarName = etablissement ? `MCCV - ${etablissement}` : 'MCCV'
  const calendar = await apiCall('POST', '/calendars', {
    summary: calendarName,
    description: 'Calendrier synchronise depuis Mon Cahier de Cours Virtuel (MCCV)',
    timeZone: 'Europe/Paris',
  })
  localStorage.setItem(CALENDAR_ID_KEY, calendar.id)
  return calendar.id
}

// ─── Conversion séance → événement Google ────────────────────────────────────

function seanceToEvent(seance, classe) {
  const classeNom = classe?.nom || 'Classe inconnue'
  const titre = seance.titre || seance.seanceTitre || seance.seancetitre || 'Seance'

  const lignesDesc = [
    seance.type ? `Type : ${seance.type}` : '',
    seance.objectif ? `Objectif : ${seance.objectif}` : '',
    seance.matiere || (classe?.matieres?.find(m => m.id === seance.matiereId)?.nom)
      ? `Matiere : ${seance.matiere || classe?.matieres?.find(m => m.id === seance.matiereId)?.nom}`
      : '',
    'Genere par MCCV',
  ].filter(Boolean)

  return {
    summary: `${classeNom} - ${titre}`,
    description: lignesDesc.join('\n'),
    start: { dateTime: seance.start, timeZone: 'Europe/Paris' },
    end: { dateTime: seance.end, timeZone: 'Europe/Paris' },
    colorId: classeColorToGcal(classe?.couleur),
    extendedProperties: {
      private: { mccv_seance_id: seance.id, mccv_app: 'true' },
    },
  }
}

// Correspondance approximative couleur hex → colorId Google Calendar
function classeColorToGcal(hex) {
  if (!hex) return '8' // graphite
  const h = hex.toLowerCase()
  if (h.includes('2196') || h.includes('3b82') || h.includes('1e3a')) return '1'  // bleu ciel
  if (h.includes('4caf') || h.includes('10b9') || h.includes('22c5')) return '2'  // sauge
  if (h.includes('9c27') || h.includes('8b5c') || h.includes('a855')) return '3'  // raisin
  if (h.includes('f4a2') || h.includes('f59e') || h.includes('fb92')) return '6'  // banane
  if (h.includes('f443') || h.includes('ef44') || h.includes('e535')) return '11' // tomate
  if (h.includes('00bc') || h.includes('06b6') || h.includes('22d3')) return '7'  // paon
  return '8'
}

// ─── Synchronisation complète ─────────────────────────────────────────────────

export async function syncSeances(seances, classes, etablissement, onProgress) {
  const calendarId = await ensureCalendar(etablissement)

  let mapping = {}
  try { mapping = JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}') } catch { }

  const results = { created: 0, updated: 0, deleted: 0, errors: 0 }

  // Identifier les séances à supprimer (dans mapping mais plus dans la liste)
  const seanceIds = new Set(seances.map(s => s.id))
  const toDelete = Object.keys(mapping).filter(id => !seanceIds.has(id))

  for (const id of toDelete) {
    try {
      await apiCall('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${mapping[id]}`)
      delete mapping[id]
      results.deleted++
    } catch (err) {
      if (!err.message.includes('404')) results.errors++
      else delete mapping[id] // déjà supprimé côté Google
    }
  }

  // Créer ou mettre à jour les séances
  for (let i = 0; i < seances.length; i++) {
    const seance = seances[i]
    onProgress?.(Math.round((i / seances.length) * 90))

    if (!seance.start || !seance.end) continue

    const classe = classes.find(c => c.id === seance.classeId)
    const eventBody = seanceToEvent(seance, classe)

    try {
      const existingEventId = mapping[seance.id]
      if (existingEventId) {
        await apiCall('PUT', `/calendars/${encodeURIComponent(calendarId)}/events/${existingEventId}`, eventBody)
        results.updated++
      } else {
        const created = await apiCall('POST', `/calendars/${encodeURIComponent(calendarId)}/events`, eventBody)
        mapping[seance.id] = created.id
        results.created++
      }
    } catch (err) {
      console.error('[GCal] Erreur sync seance', seance.id, err.message)
      results.errors++
    }
  }

  localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping))
  onProgress?.(100)
  return results
}

// ─── Suppression d'un événement unique ───────────────────────────────────────

export async function deleteSeanceEvent(seanceId) {
  const calendarId = localStorage.getItem(CALENDAR_ID_KEY)
  if (!calendarId) return

  let mapping = {}
  try { mapping = JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}') } catch { }

  const eventId = mapping[seanceId]
  if (!eventId) return

  try {
    await apiCall('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`)
    delete mapping[seanceId]
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping))
  } catch (err) {
    console.error('[GCal] Erreur suppression evenement', err.message)
  }
}
