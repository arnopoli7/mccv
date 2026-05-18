import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Clock, BookOpen, Star } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
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
  const { rubanPedagogique, seancesCalendrier, update } = useData()
  const toast = useToast()
  const [selectedItem, setSelectedItem] = useState(null)

  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const ruban = rubanList[0] || null
  const calEntries = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = ruban?.sequences || []
  const totalSeances = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)

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

  // Build per-sequence item lists: deployed (sorted by date) then undeployed
  const seqItems = sequences.map(seq => {
    const deployed = []
    const undeployed = []
    for (const rs of (seq.seances || [])) {
      const calEntry = calEntries.find(c => c.seanceRubanId === rs.id) || null
      const item = { rubanSeance: rs, seq, calEntry }
      if (calEntry) deployed.push(item)
      else undeployed.push(item)
    }
    deployed.sort((a, b) => {
      const da = a.calEntry.date + (a.calEntry.heureDebut || '')
      const db = b.calEntry.date + (b.calEntry.heureDebut || '')
      return da.localeCompare(db)
    })
    return { seq, items: [...deployed, ...undeployed] }
  }).filter(s => s.items.length > 0)

  const selItem = selectedItem
  const selStatut = selItem ? getStatut(selItem) : null
  const selDocs = selItem ? getDocs(selItem) : []
  const selNote = selItem ? getNote(selItem) : ''
  const selEtoiles = selItem ? getEtoiles(selItem) : 0

  return (
    <div className="space-y-4">
      {seqItems.map(({ seq, items }) => (
        <div key={seq.id} className="card overflow-hidden">
          <div className="px-5 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-sm">{seq.titre}</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map(item => {
              const { rubanSeance, calEntry } = item
              const statut = getStatut(item)
              const deployed = !!calEntry
              const etoiles = getEtoiles(item)
              return (
                <div
                  key={rubanSeance.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-100">
                        {rubanSeance.titre}
                      </span>
                      {rubanSeance.type && (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${TYPE_BADGE[rubanSeance.type] || 'bg-gray-100 text-gray-600'}`}>
                          {rubanSeance.type}
                        </span>
                      )}
                      {!deployed && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 italic">
                          Non planifiée
                        </span>
                      )}
                      {deployed && statutBadge(statut)}
                      {etoiles > 0 && (
                        <span className="flex gap-0.5">
                          {[1, 2, 3].map(n => (
                            <Star key={n} size={12} className={n <= etoiles ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 dark:text-gray-700'} />
                          ))}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {deployed
                        ? `${formatDate(calEntry.date)} · ${calEntry.heureDebut}–${calEntry.heureFin}`
                        : 'Date non définie'
                      }
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleStatut(item) }}
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
            })}
          </div>
        </div>
      ))}

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
