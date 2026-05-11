import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

const COLLECTIONS = [
  'anneesScolaires', 'classes', 'vacances', 'emploiDuTemps',
  'rubanPedagogique', 'seancesCalendrier', 'ccf',
]

const DEFAULT_DATA = {
  parametres: {},
  anneesScolaires: [],
  classes: [],
  vacances: [],
  emploiDuTemps: [],
  rubanPedagogique: [],
  seancesCalendrier: [],
  ccf: [],
}

// ─── Helpers Firestore ────────────────────────────────────────────────────────

function colRef(userId, collection) {
  return doc(db, 'users', userId, 'data', collection)
}

async function saveCollectionToFirestore(userId, collection, items) {
  try {
    await setDoc(colRef(userId, collection), { items })
  } catch (err) {
    console.error(`Firestore write error [${collection}]:`, err)
  }
}

async function saveParametresToFirestore(userId, params) {
  try {
    await setDoc(colRef(userId, 'parametres'), params)
  } catch (err) {
    console.error('Firestore write error [parametres]:', err)
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DataProvider({ children }) {
  const { session } = useAuth()
  const userId = session?.userId

  // localDataRef permet des lectures synchrones à jour entre plusieurs mutations
  // appelées dans le même cycle d'événement (ex: Setup.finish())
  const localDataRef = useRef({ ...DEFAULT_DATA })
  const [localData, setLocalData] = useState({ ...DEFAULT_DATA })
  const [dataLoading, setDataLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Synchronise le state React → ref (sens React → ref)
  useEffect(() => {
    localDataRef.current = localData
  }, [localData])

  // Chargement Firestore quand userId change
  useEffect(() => {
    if (!userId) {
      localDataRef.current = { ...DEFAULT_DATA }
      setLocalData({ ...DEFAULT_DATA })
      return
    }

    async function loadData() {
      setDataLoading(true)
      try {
        const newData = { ...DEFAULT_DATA }

        // Paramètres
        const paramsSnap = await getDoc(colRef(userId, 'parametres'))
        if (paramsSnap.exists()) newData.parametres = paramsSnap.data()

        // Collections
        await Promise.all(
          COLLECTIONS.map(async col => {
            const snap = await getDoc(colRef(userId, col))
            if (snap.exists()) newData[col] = snap.data().items || []
          })
        )

        localDataRef.current = newData
        setLocalData(newData)
      } catch (err) {
        console.error('Firestore load error:', err)
      } finally {
        setDataLoading(false)
      }
    }

    loadData()
  }, [userId])

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // ─── Helpers internes ───────────────────────────────────────────────────────

  function applyMutation(collection, newItems) {
    localDataRef.current = { ...localDataRef.current, [collection]: newItems }
    setLocalData({ ...localDataRef.current })
    setRefreshKey(k => k + 1)
  }

  // ─── API collections ────────────────────────────────────────────────────────

  function get(collection) {
    // Lecture via ref pour cohérence dans les mutations synchrones
    return localDataRef.current[collection] || []
  }

  function set(collection, items) {
    if (!userId) return
    applyMutation(collection, items)
    saveCollectionToFirestore(userId, collection, items)
  }

  function add(collection, item) {
    if (!userId) return
    const newItems = [...(localDataRef.current[collection] || []), item]
    applyMutation(collection, newItems)
    saveCollectionToFirestore(userId, collection, newItems)
  }

  function update(collection, id, updates) {
    if (!userId) return
    const newItems = (localDataRef.current[collection] || []).map(i =>
      i.id === id ? { ...i, ...updates } : i
    )
    applyMutation(collection, newItems)
    saveCollectionToFirestore(userId, collection, newItems)
  }

  function remove(collection, id) {
    if (!userId) return
    const newItems = (localDataRef.current[collection] || []).filter(i => i.id !== id)
    applyMutation(collection, newItems)
    saveCollectionToFirestore(userId, collection, newItems)
  }

  function find(collection, id) {
    return (localDataRef.current[collection] || []).find(i => i.id === id) || null
  }

  // ─── Paramètres ─────────────────────────────────────────────────────────────

  function getParams() {
    return localDataRef.current.parametres || {}
  }

  function setParams(updates) {
    if (!userId) return
    const merged = { ...localDataRef.current.parametres, ...updates }
    localDataRef.current = { ...localDataRef.current, parametres: merged }
    setLocalData({ ...localDataRef.current })
    setRefreshKey(k => k + 1)
    saveParametresToFirestore(userId, merged)
  }

  // ─── Raccourcis ─────────────────────────────────────────────────────────────

  const anneesScolaires = () => get('anneesScolaires')
  const getAnneeActive = () => anneesScolaires().find(a => a.active) || anneesScolaires()[0] || null

  const classes = () => get('classes')

  const vacances = (anneeScolaireId) => {
    const all = get('vacances')
    return anneeScolaireId ? all.filter(v => v.anneeScolaireId === anneeScolaireId) : all
  }

  const emploiDuTemps = (anneeScolaireId) => {
    const all = get('emploiDuTemps')
    return anneeScolaireId ? all.filter(e => e.anneeScolaireId === anneeScolaireId) : all
  }

  const rubanPedagogique = (filters = {}) => {
    let all = get('rubanPedagogique')
    if (filters.anneeScolaireId) all = all.filter(r => r.anneeScolaireId === filters.anneeScolaireId)
    if (filters.classeId) all = all.filter(r => r.classeId === filters.classeId)
    return all
  }

  const seancesCalendrier = (filters = {}) => {
    let all = get('seancesCalendrier')
    if (filters.anneeScolaireId) all = all.filter(s => s.anneeScolaireId === filters.anneeScolaireId)
    if (filters.classeId) all = all.filter(s => s.classeId === filters.classeId)
    return all
  }

  const ccf = (filters = {}) => {
    let all = get('ccf')
    if (filters.anneeScolaireId) all = all.filter(c => c.anneeScolaireId === filters.anneeScolaireId)
    if (filters.classeId) all = all.filter(c => c.classeId === filters.classeId)
    return all
  }

  function cleanOrphanCalendarEvents(anneeId) {
    const allCal = get('seancesCalendrier')
    const allRuban = get('rubanPedagogique').filter(rb => !anneeId || rb.anneeScolaireId === anneeId)
    const validIds = new Set(
      allRuban.flatMap(rb => (rb.sequences || []).flatMap(seq => (seq.seances || []).map(s => s.id)))
    )
    const toKeep = allCal.filter(sc => {
      if (anneeId && sc.anneeScolaireId !== anneeId) return true
      return validIds.has(sc.seanceRubanId)
    })
    if (toKeep.length < allCal.length) {
      set('seancesCalendrier', toKeep)
    }
  }

  const value = {
    refreshKey, refresh, dataLoading,
    get, set, add, update, remove, find,
    getParams, setParams,
    anneesScolaires, getAnneeActive,
    classes, vacances, emploiDuTemps,
    rubanPedagogique, seancesCalendrier, ccf,
    cleanOrphanCalendarEvents,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  return useContext(DataContext)
}
