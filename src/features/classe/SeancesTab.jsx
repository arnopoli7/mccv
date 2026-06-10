import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Clock, BookOpen, Star, Trash2 } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { MultiFileUpload } from '../../components/ui/FileUpload'
import { formatDate, formatDateLong, parseISO, isBefore, isSameDay } from '../../utils/dateUtils'
import { statutBadge } from '../../components/ui/Badge'

const TYPE_BADGE = {
  'Cours': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'TD / Exercices': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Évaluation': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const ETOILES_LABELS = ['', 'Séance difficile / à revoir', 'Séance correcte', 'Très bonne séance / à reproduire']

function StarRating({ value = 0, onChange, readOnly = false }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange && onChange(value === n ? 0 : n)}
          className={`transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          title={ETOILES_LABELS[n]}
        >
          <Star
            size={18}
            className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}
          />
        </button>
      ))}
    </div>
  )
}

function useDebounce(callback, delay) {
  const timerRef = useRef(null)
  return (...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => callback(...args), delay)
  }
}

export default function SeancesTab({ classe, anneeId, onGoToRuban }) {
  const { rubanPedagogique, seancesCalendrier, update, remove, get, set } = useData()
  const toast = useToast()
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState(new Set()) // rubanSeance.id
  const [confirmType, setConfirmType] = useState(null) // 'single' | 'all' | 'selection'
  const [pendingDelete, setPendingDelete] = useState(null) // { seqId, seanceId, calEntryId? }
  const orphanCheckedRef = useRef(false)

  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const ruban = rubanList[0] || null
  const calEntries = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = ruban?.sequences || []
  const totalSeances = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)

  // Build two flat sections early (needed by handlers)
  const allDeployed = []
  const allUndeployed = []
  for (const seq of sequences) {
    for (const rs of (seq.seances || [])) {
      const calEntry = calEntries.find(c => c.seanceRubanId === rs.id) || null
      const item = { rubanSeance: rs, seq, calEntry }
      if (calEntry) allDeployed.push(item)
      else allUndeployed.push(item)
    }
  }
  allDeployed.sort((a, b) => {
    const da = a.calEntry.date + (a.calEntry.heureDebut || '')
    const db = b.calEntry.date + (b.calEntry.heureDebut || '')
    return da.localeCompare(db)
  })
  const allItems = [...allDeployed, ...allUndeployed]
  const undeployedCount = allUndeployed.length

  // Nettoyage des séances orphelines au chargement
  useEffect(() => {
    if (orphanCheckedRef.current) return
    orphanCheckedRef.current = true
    const validIds = new Set(sequences.flatMap(seq => (seq.seances || []).map(s => s.id)))
    const orphans = calEntries.filter(c => !validIds.has(c.seanceRubanId))
    if (orphans.length > 0) {
      orphans.forEach(o => remove('seancesCalendrier', o.id))
      const n = orphans.length
      toast.info(`${n} séance${n > 1 ? 's' : ''} orpheline${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''} automatiquement.`)
    }
  }, []) // eslint-disable-line

  if (!ruban || totalSeances === 0) {
    return (
      <div className="card p-12 text-center">
        <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
        <p className="text-gray-500 font-medium mb-1">Aucun ruban pédagogique</p>
        <p className="text-sm text-gray-400 mb-4">
          Créez votre ruban pédagogique pour voir les séances apparaître ici
        </p>
        {onGoToRuban && (
          <button className="btn-primary" onClick={onGoToRuban}>Aller au Ruban</button>
        )}
      </div>
    )
  }

  function getStatut(item) {
    const { rubanSeance, calEntry } = item
    if (calEntry) {
      if (calEntry.statut === 'faite') return 'faite'
      try {
        const d = parseISO(calEntry.date)
        if (isBefore(d, new Date()) && !isSameDay(d, new Date())) return 'en retard'
      } catch {}
      return 'à faire'
    }
    return rubanSeance.statut === 'faite' ? 'faite' : 'à faire'
  }

  function updateRubanSeance(seqId, seanceId, changes) {
    const newSeqs = sequences.map(s => {
      if (s.id !== seqId) return s
      return { ...s, seances: (s.seances || []).map(rs => rs.id === seanceId ? { ...rs, ...changes } : rs) }
    })
    update('rubanPedagogique', ruban.id, { sequences: newSeqs })
  }

  function toggleStatut(item) {
    const current = getStatut(item)
    const newStatut = current === 'faite' ? 'à faire' : 'faite'
    const { rubanSeance, seq, calEntry } = item
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { statut: newStatut })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, statut: newStatut } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { statut: newStatut })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, statut: newStatut } } : null)
    }
    toast.success(newStatut === 'faite' ? 'Séance marquée faite ✓' : 'Séance remise à faire.')
  }

  function getDocs(item) {
    const { rubanSeance, calEntry } = item
    if (calEntry) return calEntry.documents || []
    return rubanSeance.documents || []
  }

  function addDoc(item, doc) {
    const { rubanSeance, seq, calEntry } = item
    const docs = [...getDocs(item), doc]
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { documents: docs })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, documents: docs } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { documents: docs })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, documents: docs } } : null)
    }
    toast.success('Document ajouté.')
  }

  function removeDoc(item, idx) {
    const { rubanSeance, seq, calEntry } = item
    const docs = getDocs(item).filter((_, i) => i !== idx)
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { documents: docs })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, documents: docs } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { documents: docs })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, documents: docs } } : null)
    }
    toast.info('Document supprimé.')
  }

  function getNote(item) {
    if (item.calEntry) return item.calEntry.noteCours || ''
    return item.rubanSeance.noteCours || ''
  }

  function getEtoiles(item) {
    if (item.calEntry) return item.calEntry.etoiles || 0
    return item.rubanSeance.etoiles || 0
  }

  function saveNote(item, note) {
    const { rubanSeance, seq, calEntry } = item
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { noteCours: note })
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { noteCours: note })
    }
  }

  function saveEtoiles(item, etoiles) {
    const { rubanSeance, seq, calEntry } = item
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { etoiles })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, etoiles } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { etoiles })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, etoiles } } : null)
    }
  }

  // Suppression individuelle (deployed → retire du calendrier ; non-deployed → retire du ruban)
  function deleteSingle({ seqId, seanceId, calEntryId }) {
    if (calEntryId) remove('seancesCalendrier', calEntryId)
    const newSeqs = sequences.map(s =>
      s.id !== seqId ? s : { ...s, seances: (s.seances || []).filter(r => r.id !== seanceId) }
    )
    update('rubanPedagogique', ruban.id, { sequences: newSeqs })
    if (selectedItem?.rubanSeance?.id === seanceId) setSelectedItem(null)
    toast.success('Séance supprimée.')
  }

  // Suppression de toutes les séances (calendrier + ruban)
  function deleteAll() {
    const allCal = get('seancesCalendrier')
    set('seancesCalendrier', allCal.filter(c => !(c.classeId === classe.id && c.anneeScolaireId === anneeId)))
    update('rubanPedagogique', ruban.id, { sequences: sequences.map(s => ({ ...s, seances: [] })) })
    setSelected(new Set())
    setSelectedItem(null)
    setSelectionMode(false)
    toast.success('Toutes les séances ont été supprimées.')
  }

  // Suppression groupée
  function deleteSelection() {
    const count = selected.size
    // Retire les calEntries des séances déployées sélectionnées
    const calIdsToRemove = new Set()
    allItems.forEach(item => { if (selected.has(item.rubanSeance.id) && item.calEntry) calIdsToRemove.add(item.calEntry.id) })
    const allCal = get('seancesCalendrier')
    set('seancesCalendrier', allCal.filter(c => !calIdsToRemove.has(c.id)))
    // Retire du ruban
    const newSeqs = sequences.map(s => ({ ...s, seances: (s.seances || []).filter(r => !selected.has(r.id)) }))
    update('rubanPedagogique', ruban.id, { sequences: newSeqs })
    if (selectedItem && selected.has(selectedItem.rubanSeance.id)) setSelectedItem(null)
    setSelected(new Set())
    setSelectionMode(false)
    toast.success(`${count} séance${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}.`)
  }

  function toggleSelect(rubanSeanceId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(rubanSeanceId) ? next.delete(rubanSeanceId) : next.add(rubanSeanceId)
      return next
    })
  }

  const selItem = selectedItem
  const selStatut = selItem ? getStatut(selItem) : null
  const selDocs = selItem ? getDocs(selItem) : []
  const selNote = selItem ? getNote(selItem) : ''
  const selEtoiles = selItem ? getEtoiles(selItem) : 0

  return (
    <div className="space-y-4">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-2">
        {selectionMode && selected.size > 0 && (
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            onClick={() => setConfirmType('selection')}
          >
            <Trash2 size={14} />
            Supprimer la sélection ({selected.size})
          </button>
        )}
        {selectionMode && (
          <button
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors"
            onClick={() => { setSelectionMode(false); setSelected(new Set()) }}
          >
            Annuler
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
              ${selectionMode
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200'
              }`}
            onClick={() => { setSelectionMode(m => !m); setSelected(new Set()) }}
          >
            ☑️ Sélection multiple
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            onClick={() => setConfirmType('all')}
          >
            <Trash2 size={14} />
            Effacer toutes les séances
          </button>
        </div>
      </div>

      {/* ── Section : Séances planifiées ─────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-sm">
            📅 Séances planifiées
            <span className="ml-2 text-blue-500 dark:text-blue-400 font-normal">({allDeployed.length})</span>
          </h3>
        </div>
        {allDeployed.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Aucune séance déployée sur le calendrier.
            {onGoToRuban && (
              <button className="ml-2 text-blue-500 hover:underline" onClick={onGoToRuban}>Déployer le ruban →</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {allDeployed.map(item => (
              <SeanceRow
                key={item.rubanSeance.id}
                item={item}
                statut={getStatut(item)}
                etoiles={getEtoiles(item)}
                docs={getDocs(item)}
                isSelected={selected.has(item.rubanSeance.id)}
                selectionMode={selectionMode}
                showSeqLabel
                onOpen={() => setSelectedItem(item)}
                onToggleStatut={e => { e.stopPropagation(); toggleStatut(item) }}
                onDelete={e => {
                  e.stopPropagation()
                  setPendingDelete({ seqId: item.seq.id, seanceId: item.rubanSeance.id, calEntryId: item.calEntry?.id || null })
                  setConfirmType('single')
                }}
                onToggleSelect={() => toggleSelect(item.rubanSeance.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Section : Séances du ruban non planifiées ────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800 flex items-center justify-between">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
            📋 Séances du ruban (non planifiées)
            <span className="ml-2 text-amber-500 dark:text-amber-400 font-normal">({allUndeployed.length})</span>
          </h3>
          {allUndeployed.length > 0 && onGoToRuban && (
            <button
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0"
              onClick={onGoToRuban}
            >
              Déployer le ruban
            </button>
          )}
        </div>
        {allUndeployed.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            Toutes les séances du ruban sont planifiées.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {allUndeployed.map(item => (
              <SeanceRow
                key={item.rubanSeance.id}
                item={item}
                statut={getStatut(item)}
                etoiles={getEtoiles(item)}
                docs={getDocs(item)}
                isSelected={selected.has(item.rubanSeance.id)}
                selectionMode={selectionMode}
                showSeqLabel
                onOpen={() => setSelectedItem(item)}
                onToggleStatut={e => { e.stopPropagation(); toggleStatut(item) }}
                onDelete={e => {
                  e.stopPropagation()
                  setPendingDelete({ seqId: item.seq.id, seanceId: item.rubanSeance.id, calEntryId: null })
                  setConfirmType('single')
                }}
                onToggleSelect={() => toggleSelect(item.rubanSeance.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmations suppression */}
      <ConfirmDialog
        isOpen={confirmType === 'single'}
        onClose={() => { setConfirmType(null); setPendingDelete(null) }}
        onConfirm={() => deleteSingle(pendingDelete)}
        title="Supprimer cette séance"
        message={pendingDelete?.calEntryId
          ? "Supprimer cette séance du calendrier et du ruban pédagogique ?"
          : "Supprimer cette séance du ruban pédagogique ? Elle n'est pas encore planifiée."}
        confirmLabel="Oui, supprimer"
        danger
      />
      <ConfirmDialog
        isOpen={confirmType === 'all'}
        onClose={() => setConfirmType(null)}
        onConfirm={deleteAll}
        title="Effacer toutes les séances"
        message="Supprimer TOUTES les séances de cette classe (calendrier + ruban pédagogique) ? Cette action est irréversible."
        confirmLabel="Oui, tout supprimer"
        danger
      />
      <ConfirmDialog
        isOpen={confirmType === 'selection'}
        onClose={() => setConfirmType(null)}
        onConfirm={deleteSelection}
        title="Supprimer la sélection"
        message={`Supprimer les ${selected.size} séance${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''} (calendrier + ruban) ?`}
        confirmLabel="Oui, supprimer"
        danger
      />

      {/* Modal fiche séance */}
      <Modal
        isOpen={!!selItem}
        onClose={() => setSelectedItem(null)}
        title={selItem?.rubanSeance.titre || 'Fiche séance'}
        size="md"
      >
        {selItem && (
          <SeanceModalContent
            selItem={selItem}
            selStatut={selStatut}
            selDocs={selDocs}
            selNote={selNote}
            selEtoiles={selEtoiles}
            classe={classe}
            onToggleStatut={() => toggleStatut(selItem)}
            onAddDoc={doc => addDoc(selItem, doc)}
            onRemoveDoc={idx => removeDoc(selItem, idx)}
            onSaveNote={note => saveNote(selItem, note)}
            onSaveEtoiles={e => saveEtoiles(selItem, e)}
          />
        )}
      </Modal>
    </div>
  )
}

function SeanceRow({ item, statut, etoiles, docs, isSelected, selectionMode, showSeqLabel, onOpen, onToggleStatut, onDelete, onToggleSelect }) {
  const { rubanSeance, calEntry, seq } = item
  const deployed = !!calEntry

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors
        ${isSelected ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}
      onClick={onOpen}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 shrink-0 accent-red-500 cursor-pointer"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
            {rubanSeance.titre}
          </span>
          {rubanSeance.type && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${TYPE_BADGE[rubanSeance.type] || 'bg-gray-100 text-gray-600'}`}>
              {rubanSeance.type}
            </span>
          )}
          {deployed ? statutBadge(statut) : (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium shrink-0">
              Non planifiée
            </span>
          )}
          {etoiles > 0 && (
            <span className="flex gap-0.5 shrink-0">
              {[1, 2, 3].map(n => (
                <Star key={n} size={12} className={n <= etoiles ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 dark:text-gray-700'} />
              ))}
            </span>
          )}
          {docs.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">
              📎 {docs.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {showSeqLabel && <span className="text-gray-500 dark:text-gray-400">{seq.titre} · </span>}
          {deployed
            ? `${formatDate(calEntry.date)} · ${calEntry.heureDebut}–${calEntry.heureFin}`
            : 'Date non définie'
          }
        </p>
      </div>

      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
        title="Supprimer cette séance"
      >
        <Trash2 size={14} />
      </button>

      <button
        onClick={onToggleStatut}
        className={`p-1.5 rounded-lg transition-colors shrink-0
          ${statut === 'faite'
            ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
            : 'text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-500'
          }`}
        title={statut === 'faite' ? 'Marquer à faire' : 'Marquer faite'}
      >
        <CheckCircle size={16} />
      </button>
    </div>
  )
}

function SeanceModalContent({ selItem, selStatut, selDocs, selNote, selEtoiles, classe, onToggleStatut, onAddDoc, onRemoveDoc, onSaveNote, onSaveEtoiles }) {
  const [noteValue, setNoteValue] = useState(selNote)
  const debouncedSave = useDebounce(onSaveNote, 1000)

  // Reset quand l'item change
  useEffect(() => {
    setNoteValue(selNote)
  }, [selItem?.rubanSeance?.id, selItem?.calEntry?.id]) // eslint-disable-line

  function handleNoteChange(e) {
    setNoteValue(e.target.value)
    debouncedSave(e.target.value)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400 mb-0.5">Séquence</p>
          <p className="font-medium text-gray-800 dark:text-gray-100">{selItem.seq.titre}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Type</p>
          <p className="font-medium">
            {selItem.rubanSeance.type && (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[selItem.rubanSeance.type] || 'bg-gray-100 text-gray-600'}`}>
                {selItem.rubanSeance.type}
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Date</p>
          <p className="font-medium text-gray-800 dark:text-gray-100">
            {selItem.calEntry ? formatDateLong(selItem.calEntry.date) : 'Date non définie'}
          </p>
        </div>
        {selItem.calEntry && (
          <div>
            <p className="text-gray-400 mb-0.5">Horaire</p>
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {selItem.calEntry.heureDebut} – {selItem.calEntry.heureFin}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm text-gray-400 mb-2">Statut</p>
        <button
          onClick={onToggleStatut}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border-2 transition-all
            ${selStatut === 'faite'
              ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
            }`}
        >
          {selStatut === 'faite'
            ? <><CheckCircle size={16} /> Faite — cliquer pour remettre à faire</>
            : <><Clock size={16} /> À faire — cliquer pour marquer faite</>
          }
        </button>
      </div>

      {/* Note de cours */}
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">📝 Note de cours</p>
        <textarea
          className="input resize-none text-sm"
          rows={4}
          placeholder="Comment s'est passée cette séance ?"
          value={noteValue}
          onChange={handleNoteChange}
        />
        <p className="text-xs text-gray-400 mt-1">Sauvegarde automatique</p>
      </div>

      {/* Étoiles */}
      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Évaluation de la séance</p>
        <div className="flex items-center gap-3">
          <StarRating value={selEtoiles} onChange={onSaveEtoiles} />
          {selEtoiles > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{ETOILES_LABELS[selEtoiles]}</span>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
          Documents ({selDocs.length})
        </p>
        <MultiFileUpload
          files={selDocs}
          onAdd={onAddDoc}
          onRemove={onRemoveDoc}
          storagePath={`${classe.id}/seances/${selItem.calEntry?.id || selItem.rubanSeance?.id}`}
        />
      </div>
    </div>
  )
}
