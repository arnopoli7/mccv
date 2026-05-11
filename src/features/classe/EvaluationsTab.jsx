import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
import { MultiFileUpload } from '../../components/ui/FileUpload'
import { formatDate, parseISO, isBefore, isSameDay } from '../../utils/dateUtils'
import { statutBadge } from '../../components/ui/Badge'

export default function EvaluationsTab({ classe, anneeId, onGoToRuban }) {
  const { rubanPedagogique, seancesCalendrier, update } = useData()
  const toast = useToast()
  const [selectedItem, setSelectedItem] = useState(null)

  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const ruban = rubanList[0] || null
  const calEntries = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = ruban?.sequences || []
  const hasAnyEval = sequences.some(seq => (seq.seances || []).some(s => s.type === 'Évaluation'))

  if (!ruban || !hasAnyEval) {
    return (
      <div className="card p-12 text-center">
        <div className="text-4xl mb-3">📝</div>
        <p className="text-gray-500 font-medium mb-1">
          {!ruban ? 'Aucun ruban pédagogique' : 'Aucune séance de type "Évaluation"'}
        </p>
        <p className="text-sm text-gray-400 mb-4">
          {!ruban
            ? 'Créez votre ruban pédagogique pour voir les séances apparaître ici'
            : 'Ajoutez des séances de type "Évaluation" dans votre ruban pédagogique'
          }
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
    toast.success(newStatut === 'faite' ? 'Évaluation marquée faite ✓' : 'Évaluation remise à faire.')
  }

  function getDocs(item) {
    const { rubanSeance, calEntry } = item
    if (calEntry) return calEntry.documentsEval || calEntry.documents || []
    return rubanSeance.documentsEval || rubanSeance.documents || []
  }

  function addDoc(item, doc) {
    const { rubanSeance, seq, calEntry } = item
    const docs = [...getDocs(item), doc]
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { documentsEval: docs })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, documentsEval: docs } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { documentsEval: docs })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, documentsEval: docs } } : null)
    }
    toast.success('Document ajouté.')
  }

  function removeDoc(item, idx) {
    const { rubanSeance, seq, calEntry } = item
    const docs = getDocs(item).filter((_, i) => i !== idx)
    if (calEntry) {
      update('seancesCalendrier', calEntry.id, { documentsEval: docs })
      setSelectedItem(prev => prev ? { ...prev, calEntry: { ...prev.calEntry, documentsEval: docs } } : null)
    } else {
      updateRubanSeance(seq.id, rubanSeance.id, { documentsEval: docs })
      setSelectedItem(prev => prev ? { ...prev, rubanSeance: { ...prev.rubanSeance, documentsEval: docs } } : null)
    }
    toast.info('Document supprimé.')
  }

  // Build per-sequence item lists (Évaluation only): deployed (sorted) then undeployed
  const seqItems = sequences.map(seq => {
    const deployed = []
    const undeployed = []
    for (const rs of (seq.seances || [])) {
      if (rs.type !== 'Évaluation') continue
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
  const selDocs = selItem ? getDocs(selItem) : []

  return (
    <div className="space-y-6">
      {seqItems.map(({ seq, items }) => (
        <div key={seq.id} className="card overflow-hidden">
          <div className="px-5 py-3 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800">
            <h3 className="font-semibold text-orange-800 dark:text-orange-200 text-sm">{seq.titre}</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map(item => {
              const { rubanSeance, calEntry } = item
              const statut = getStatut(item)
              const deployed = !!calEntry
              const docCount = getDocs(item).length
              return (
                <div key={rubanSeance.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-100">
                        {rubanSeance.titre}
                      </span>
                      {deployed
                        ? statutBadge(statut)
                        : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 italic">Non planifiée</span>
                      }
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {deployed
                        ? `${formatDate(calEntry.date)} · ${calEntry.heureDebut}–${calEntry.heureFin}`
                        : 'Date non définie'
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      {docCount > 0 ? `📎 ${docCount} doc.` : '+ PDF'}
                    </button>
                    <button
                      onClick={() => toggleStatut(item)}
                      className={`p-1.5 rounded-lg transition-colors
                        ${statut === 'faite'
                          ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                          : 'text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-500'
                        }`}
                      title={statut === 'faite' ? 'Marquer à faire' : 'Marquer faite'}
                    >
                      <CheckCircle size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <Modal
        isOpen={!!selItem}
        onClose={() => setSelectedItem(null)}
        title="Documents évaluation"
        size="sm"
      >
        {selItem && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <strong className="text-gray-800 dark:text-gray-100">{selItem.rubanSeance.titre}</strong>
              <br />
              {selItem.calEntry
                ? `${formatDate(selItem.calEntry.date)} · ${selItem.calEntry.heureDebut}–${selItem.calEntry.heureFin}`
                : 'Date non définie'
              }
            </div>
            <MultiFileUpload
              files={selDocs}
              onAdd={doc => addDoc(selItem, doc)}
              onRemove={idx => removeDoc(selItem, idx)}
            />
            <div className="flex justify-end">
              <button className="btn-secondary" onClick={() => setSelectedItem(null)}>Fermer</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
