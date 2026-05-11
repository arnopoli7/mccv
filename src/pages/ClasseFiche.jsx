import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit2, Tag } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import { genId } from '../utils/id'

import RubanPedagogique from '../features/classe/RubanPedagogique'
import SeancesTab from '../features/classe/SeancesTab'
import ExercicesTab from '../features/classe/ExercicesTab'
import EvaluationsTab from '../features/classe/EvaluationsTab'
import CCFTab from '../features/classe/CCFTab'
import ProgressionTab from '../features/classe/ProgressionTab'

const TABS = [
  { key: 'ruban', label: '📚 Ruban pédagogique' },
  { key: 'seances', label: '📅 Séances' },
  { key: 'exercices', label: '✏️ Exercices' },
  { key: 'evaluations', label: '📝 Évaluations' },
  { key: 'ccf', label: '🎯 CCF' },
  { key: 'progression', label: '📊 Progression' },
]

export default function ClasseFiche() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { find, update, getAnneeActive, seancesCalendrier, rubanPedagogique } = useData()
  const toast = useToast()

  const [tab, setTab] = useState(searchParams.get('tab') || 'ruban')
  const [showMatiereModal, setShowMatiereModal] = useState(false)
  const [matiereNom, setMatiereNom] = useState('')
  const [selectedMatiere, setSelectedMatiere] = useState(null)

  const classe = find('classes', id)
  const anneeActive = getAnneeActive()
  const anneeId = anneeActive?.id

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t) setTab(t)
  }, [searchParams])

  useEffect(() => {
    if (classe?.matieres?.length > 0 && !selectedMatiere) {
      setSelectedMatiere(classe.matieres[0].id)
    }
  }, [classe?.id])

  if (!classe) {
    return (
      <div className="max-w-lg mx-auto card p-12 text-center">
        <p className="text-gray-400">Classe introuvable.</p>
        <button onClick={() => navigate('/classes')} className="btn-secondary mt-4">← Retour</button>
      </div>
    )
  }

  function switchTab(key) {
    setTab(key)
    setSearchParams({ tab: key })
  }

  // Progression globale
  const seances = seancesCalendrier({ classeId: id, anneeScolaireId: anneeId })
  const rubanList = rubanPedagogique({ classeId: id, anneeScolaireId: anneeId })
  const total = rubanList.flatMap(rb => rb.sequences || []).reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const done = seances.filter(s => s.statut === 'faite').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Matières
  function addMatiere() {
    if (!matiereNom.trim()) return
    const newM = { id: genId('m'), nom: matiereNom.trim() }
    const matieres = [...(classe.matieres || []), newM]
    update('classes', id, { matieres })
    if (!selectedMatiere) setSelectedMatiere(newM.id)
    setMatiereNom('')
    setShowMatiereModal(false)
    toast.success(`Matière "${newM.nom}" ajoutée.`)
  }

  function removeMatiere(mId) {
    const matieres = (classe.matieres || []).filter(m => m.id !== mId)
    update('classes', id, { matieres })
    if (selectedMatiere === mId) setSelectedMatiere(matieres[0]?.id || null)
    toast.info('Matière supprimée.')
  }

  const matieres = classe.matieres || []
  const currentMatiere = matieres.find(m => m.id === selectedMatiere) || matieres[0] || null

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* En-tête */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/classes')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 mt-1"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-gray-700 shrink-0"
                style={{ backgroundColor: classe.couleur }}
              >
                {classe.nom[0]}
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{classe.nom}</h1>
            </div>

            {/* Matières */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Tag size={13} className="text-gray-400" />
              {matieres.map(m => (
                <span
                  key={m.id}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer border transition-colors
                    ${currentMatiere?.id === m.id
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 border-transparent text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:border-gray-300'
                    }`}
                  onClick={() => setSelectedMatiere(m.id)}
                >
                  {m.nom}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeMatiere(m.id) }}
                    className="ml-0.5 text-gray-400 hover:text-red-500 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => setShowMatiereModal(true)}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600
                  text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center gap-1"
              >
                <Plus size={11} /> Matière
              </button>
            </div>

            {/* Barre de progression */}
            {total > 0 && (
              <div className="max-w-sm">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{done}/{total} séances</span>
                  <span style={{ color: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444' }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-xl p-1 no-print">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${tab === t.key
                ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu onglet */}
      <div>
        {tab === 'ruban' && (
          <RubanPedagogique
            classe={classe}
            anneeId={anneeId}
            currentMatiere={currentMatiere}
          />
        )}
        {tab === 'seances' && (
          <SeancesTab
            classe={classe}
            anneeId={anneeId}
            onGoToRuban={() => switchTab('ruban')}
          />
        )}
        {tab === 'exercices' && (
          <ExercicesTab
            classe={classe}
            anneeId={anneeId}
            onGoToRuban={() => switchTab('ruban')}
          />
        )}
        {tab === 'evaluations' && (
          <EvaluationsTab
            classe={classe}
            anneeId={anneeId}
            onGoToRuban={() => switchTab('ruban')}
          />
        )}
        {tab === 'ccf' && (
          <CCFTab
            classe={classe}
            anneeId={anneeId}
          />
        )}
        {tab === 'progression' && (
          <ProgressionTab
            classe={classe}
            anneeId={anneeId}
          />
        )}
      </div>

      {/* Modal ajout matière */}
      <Modal isOpen={showMatiereModal} onClose={() => setShowMatiereModal(false)} title="Ajouter une matière" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom de la matière</label>
            <input
              className="input"
              placeholder="ex: Économie, Mathématiques..."
              value={matiereNom}
              onChange={e => setMatiereNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMatiere() }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowMatiereModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={addMatiere}>Ajouter</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
