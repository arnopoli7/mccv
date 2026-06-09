// ─── Service Worker MCCV ─────────────────────────────────────────────────────
// Stratégie : Cache First pour les assets statiques
//             Network First avec fallback pour la navigation SPA
//             Ignoré pour Firebase / Anthropic / Google APIs

const CACHE_NAME = 'mccv-v2'

// Assets mis en cache à l'installation
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg',
]

// Hôtes à ignorer (API externes)
const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebaseapp.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'api.anthropic.com',
  'accounts.google.com',
  'www.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'accounts.google.com',
]

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Ignorer les méthodes non-GET
  if (req.method !== 'GET') return

  // Ignorer les API externes
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return

  // Ignorer les requêtes chrome-extension etc.
  if (!url.protocol.startsWith('http')) return

  // Navigation SPA → toujours renvoyer index.html si offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Assets statiques (JS, CSS, fonts, images) → Cache First
  const isStaticAsset = /\.(js|css|woff2?|svg|png|ico|jpg|jpeg|webp|gif)$/.test(url.pathname)
  if (isStaticAsset || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached
        return fetch(req).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(c => c.put(req, clone))
          }
          return res
        }).catch(() => caches.match('/index.html'))
      })
    )
    return
  }
})

// ─── Messages de l'application ────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
