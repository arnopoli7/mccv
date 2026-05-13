import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CheckCircle, X, CalendarPlus } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import { genId } from '../utils/id'
import { getVacancesForAnnee } from '../utils/vacancesData'

const STEPS = [
  { num: 1, label: 'Nouvelle année' },
  { num: 2, label: 'Vacances' },
  { num: 3, label: 'Ruban pédagogique' },
  { num: 4, label: 'Confirmation' },
]

const DEFAULT_VACANCES_B_2026_2027 = getVacancesForAnnee('2026-2027', 'B')

function formatDateFr(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export default function NouvelleAnneeWizard({ onClose }) {
  const navigate = useNavigate()
  const { classes, anneesScolaires, get, add, update, rubanPedagogique } = useData()
  const toast = useToast()

  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)

  // Étape 1
  const [annee, setAnnee] = useState({
    label: '2026-2027',
    dateDebut: '2026-09-01',
    dateFin: '2027-06-30',
  })

  // Étape 2 — vacances éditables
  const [vacances, setVacances] = useState(
    DEFAULT_VACANCES_B_2026_2027.map(v => ({ ...v }))
  )

  // Étape 3 — choix par classe
  const classList = classes()
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(classList.map(cl => [cl.id, 'dupliquer']))
  )

  const anneeActiveId = anneesScolaires().find(a => a.active)?.id || anneesScolaires()[0]?.id

  function updateVac(i, field, value) {
    setVacances(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v))
  }

  async function finish() {
    const newAnneeId = genId('as')

    // Archiver toutes les années existantes
    anneesScolaires().forEach(a => {
      update('anneesScolaires', a.id, { active: false, archived: true })
    })

    // Créer la nouvelle année
    add('anneesScolaires', {
      id: newAnneeId,
      label: annee.label,
      dateDebut: annee.dateDebut,
      dateFin: annee.dateFin,
      active: true,
      archived: false,
    })

    // Ajouter les vacances
    vacances.forEach((v, i) => {
      add('vacances', {
        id: `v_${newAnneeId}_${i}`,
        anneeScolaireId: newAnneeId,
        nom: v.nom,
        dateDebut: v.dateDebut,
        dateFin: v.dateFin,
      })
    })

    // Dupliquer les rubans selon le choix
    classList.forEach(cl => {
      if (choices[cl.id] !== 'dupliquer') return

      const rubanSource = get('rubanPedagogique').find(
        r => r.classeId === cl.id && r.anneeScolaireId === anneeActiveId
      )
      if (!rubanSource) return

      const nouvellesSequences = (rubanSource.sequences || []).map(seq => ({
        id: genId('seq'),
        titre: seq.titre,
        objectifs: seq.objectifs || '',
        competences: seq.competences || '',
        documentSupport: null,
        seances: (seq.seances || []).map(s => ({
          id: genId('s'),
          titre: s.titre,
          type: s.type,
          objectif: s.objectif || '',
          duree: s.duree ?? 1,
        })),
      }))

      add('rubanPedagogique', {
        id: genId('rb'),
        anneeScolaireId: newAnneeId,
        classeId: cl.id,
        matiereId: rubanSource.matiereId || null,
        sequences: nouvellesSequences,
      })
    })

    setDone(true)

    setTimeout(() => {
      toast.success(`Année ${annee.label} créée avec succès !`)
      navigate('/')
      onClose()
    }, 1800)
  }

  // ── Rendu étapes ─────────────────────────────────────────────────────────────

  function renderStep() {
    if (done) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <CheckCircle size={56} className="text-green-500" />
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
            Année {annee.label} créée avec succès !
          </p>
          <p className="text-sm text-gray-400">Redirection en cours…</p>
        </div>
      )
    }

    if (step === 1) return (
      <div className="space-y-5">
        <div>
          <label className="label">Intitulé de l'année</label>
          <input
            className="input"
            placeholder="ex: 2026-2027"
            value={annee.label}
            onChange={e => setAnnee(a => ({ ...a, label: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Date de début</label>
            <input
              type="date"
              className="input"
              value={annee.dateDebut}
              onChange={e => setAnnee(a => ({ ...a, dateDebut: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Date de fin</label>
            <input
              type="date"
              className="input"
              value={annee.dateFin}
              onChange={e => setAnnee(a => ({ ...a, dateFin: e.target.value }))}
            />
          </div>
        </div>
      </div>
    )

    if (step === 2) return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Dates de vacances zone B pré-remplies pour {annee.label}. Modifiez si nécessaire.
        </p>
        <div className="space-y-3">
          {vacances.map((v, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr_1fr] gap-3 items-center">
              <input
                className="input text-sm font-medium"
                value={v.nom}
                onChange={e => updateVac(i, 'nom', e.target.value)}
              />
              <div>
                <label className="text-xs text-gray-400 mb-0.5 block">Début</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={v.dateDebut}
                  onChange={e => updateVac(i, 'dateDebut', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-0.5 block">Fin</label>
                <input
                  type="date"
                  className="input text-sm"
                  value={v.dateFin}
                  onChange={e => updateVac(i, 'dateFin', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    )

    if (step === 3) {
      if (classList.length === 0) {
        return (
          <div className="text-center py-8 text-gray-400">
            Aucune classe créée. Vous pourrez en ajouter après la création de l'année.
          </div>
        )
      }
      return (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choisissez comment initialiser le ruban pédagogique pour chaque classe.
          </p>
          {classList.map(cl => {
            const hasRuban = get('rubanPedagogique').some(
              r => r.classeId === cl.id && r.anneeScolaireId === anneeActiveId &&
                (r.sequences || []).length > 0
            )
            return (
              <div key={cl.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                  style={{ backgroundColor: cl.couleur }}
                >
                  {cl.nom[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{cl.nom}</p>
                  {!hasRuban && (
                    <p className="text-xs text-gray-400 italic">Aucun ruban en {anneesScolaires().find(a => a.id === anneeActiveId)?.label || 'cours'}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setChoices(c => ({ ...c, [cl.id]: 'dupliquer' }))}
                    disabled={!hasRuban}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${choices[cl.id] === 'dupliquer' && hasRuban
                        ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300 bg-white dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                  >
                    Dupliquer le ruban
                  </button>
                  <button
                    onClick={() => setChoices(c => ({ ...c, [cl.id]: 'zero' }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                      ${choices[cl.id] === 'zero' || !hasRuban
                        ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300 bg-white dark:bg-gray-700'
                      }`}
                  >
                    Repartir de zéro
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    if (step === 4) {
      const duplication = classList.filter(cl => choices[cl.id] === 'dupliquer')
      const deZero = classList.filter(cl => choices[cl.id] !== 'dupliquer' || !get('rubanPedagogique').some(
        r => r.classeId === cl.id && r.anneeScolaireId === anneeActiveId && (r.sequences || []).length > 0
      ))
      return (
        <div className="space-y-5">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-blue-800 dark:text-blue-200">
              Nouvelle année : {annee.label}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Du {formatDateFr(annee.dateDebut)} au {formatDateFr(annee.dateFin)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Vacances</p>
            <div className="space-y-1">
              {vacances.map((v, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">{v.nom}</span>
                  <span className="text-gray-400">{formatDateFr(v.dateDebut)} → {formatDateFr(v.dateFin)}</span>
                </div>
              ))}
            </div>
          </div>

          {classList.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ruban pédagogique</p>
              <div className="space-y-1">
                {classList.map(cl => {
                  const hasRuban = get('rubanPedagogique').some(
                    r => r.classeId === cl.id && r.anneeScolaireId === anneeActiveId && (r.sequences || []).length > 0
                  )
                  const isDup = choices[cl.id] === 'dupliquer' && hasRuban
                  return (
                    <div key={cl.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cl.couleur }} />
                      <span className="font-medium text-gray-700 dark:text-gray-200">{cl.nom}</span>
                      <span className="text-gray-400">—</span>
                      <span className={isDup ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>
                        {isDup ? 'Ruban dupliqué (séquences sans calendrier)' : 'Repartir de zéro'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              L'emploi du temps sera vierge pour la nouvelle année (à re-saisir). L'année précédente passera en consultation uniquement.
            </p>
          </div>
        </div>
      )
    }
  }

  const canNext = step === 1
    ? annee.label.trim() && annee.dateDebut && annee.dateFin
    : true

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}>

        {/* En-tête */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <CalendarPlus size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Nouvelle année scolaire</h2>
            <p className="text-xs text-gray-400">Étape {step} sur {STEPS.length}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center px-6 py-3 gap-1 border-b border-gray-100 dark:border-gray-700 shrink-0">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1 flex-1 last:flex-none">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors
                ${done || step > s.num ? 'bg-green-500 text-white'
                  : step === s.num ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                {done || step > s.num ? <CheckCircle size={14} /> : s.num}
              </div>
              <span className={`text-xs hidden sm:block ${step === s.num ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 bg-gray-100 dark:bg-gray-700 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Contenu étape */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderStep()}
        </div>

        {/* Pied */}
        {!done && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
            <button
              onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
              className="btn-secondary flex items-center gap-2"
            >
              <ChevronLeft size={16} />
              {step === 1 ? 'Annuler' : 'Précédent'}
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={finish}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle size={16} /> Créer l'année {annee.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
