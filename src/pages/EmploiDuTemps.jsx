import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { genId } from '../utils/id'
import { formatDate } from '../utils/dateUtils'
import { getVacancesForZone } from '../utils/vacancesData'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

// Heures de référence de l'établissement
const GRID_HOURS = [
  '08:20', '09:15', '10:10', '10:30', '11:25',
  '12:20', '13:00', '13:55', '14:50', '15:05',
  '16:00', '16:55', '17:50',
]
const GRID_START  = 8 * 60 + 20  // 500 min
const GRID_END    = 18 * 60      // 1080 min
const GRID_TOTAL  = GRID_END - GRID_START // 580 min
const GRID_HEIGHT = 700 // px

function timeToMin(t) {
  if (!t) return GRID_START
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function topPct(t) {
  const m = Math.max(GRID_START, Math.min(GRID_END, timeToMin(t)))
  return `${(((m - GRID_START) / GRID_TOTAL) * 100).toFixed(3)}%`
}
function heightPct(start, end) {
  const s = Math.max(GRID_START, Math.min(GRID_END, timeToMin(start)))
  const e = Math.max(GRID_START, Math.min(GRID_END, timeToMin(end)))
  return `${(Math.max(0, e - s) / GRID_TOTAL * 100).toFixed(3)}%`
}

export default function EmploiDuTemps() {
  const { emploiDuTemps, vacances, stages, classes, getAnneeActive, add, update, remove, setParams, getParams } = useData()
  const toast = useToast()

  const anneeActive = getAnneeActive()
  const anneeId = anneeActive?.id
  const periodes = emploiDuTemps(anneeId)
  const vacancesList = vacances(anneeId)
  const stagesList = stages(anneeId)
  const classList = classes()
  const params = getParams()

  const [tab, setTab] = useState('periodes')

  // ── Périodes
  const [showPeriodeModal, setShowPeriodeModal] = useState(false)
  const [editPeriode, setEditPeriode] = useState(null)
  const [periodeForm, setPeriodeForm] = useState({ nom: '', dateDebut: '', dateFin: '' })
  const [deletePeriode, setDeletePeriode] = useState(null)

  // ── Créneaux
  const [showCreneauModal, setShowCreneauModal] = useState(false)
  const [editCreneau, setEditCreneau] = useState(null)
  const [creneauPeriodeId, setCreneauPeriodeId] = useState(null)
  const [creneauForm, setCreneauForm] = useState({ classeId: '', matiereId: '', jour: 'lundi', heureDebut: '08:20', heureFin: '09:15' })

  // ── Vacances
  const [showVacModal, setShowVacModal] = useState(false)
  const [editVac, setEditVac] = useState(null)
  const [vacForm, setVacForm] = useState({ nom: '', dateDebut: '', dateFin: '' })
  const [deleteVac, setDeleteVac] = useState(null)

  // ── Stages
  const [showStageModal, setShowStageModal] = useState(false)
  const [editStage, setEditStage] = useState(null)
  const [stageForm, setStageForm] = useState({ nom: '', dateDebut: '', dateFin: '', classeIds: [] })
  const [deleteStage, setDeleteStage] = useState(null)

  // ── Vue planning
  const [selectedPeriodeId, setSelectedPeriodeId] = useState(null)
  const [mobileDayIdx, setMobileDayIdx] = useState(0)

  // ── Ligne "maintenant"
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])
  const nowVisible = nowMin > GRID_START && nowMin < GRID_END
  const nowTopPct = `${((nowMin - GRID_START) / GRID_TOTAL * 100).toFixed(3)}%`

  if (!anneeActive) {
    return (
      <div className="card p-12 text-center max-w-lg mx-auto">
        <p className="text-gray-500 dark:text-gray-400">Aucune année scolaire configurée.</p>
        <a href="/parametres" className="text-blue-500 hover:underline text-sm mt-2 block">
          → Créer une année dans les Paramètres
        </a>
      </div>
    )
  }

  const selectedPeriode = periodes.find(p => p.id === selectedPeriodeId) ?? periodes[0]

  // ── PÉRIODES
  function openCreatePeriode() {
    setEditPeriode(null)
    setPeriodeForm({ nom: '', dateDebut: '', dateFin: '' })
    setShowPeriodeModal(true)
  }
  function openEditPeriode(p) {
    setEditPeriode(p)
    setPeriodeForm({ nom: p.nom, dateDebut: p.dateDebut, dateFin: p.dateFin })
    setShowPeriodeModal(true)
  }
  function savePeriode() {
    if (!periodeForm.nom.trim()) return
    if (editPeriode) {
      update('emploiDuTemps', editPeriode.id, periodeForm)
      toast.success('Période mise à jour.')
    } else {
      const newId = genId('p')
      add('emploiDuTemps', { id: newId, anneeScolaireId: anneeId, creneaux: [], ...periodeForm })
      setSelectedPeriodeId(newId)
      toast.success(`Période "${periodeForm.nom}" créée.`)
    }
    setShowPeriodeModal(false)
  }

  // ── CRÉNEAUX
  function openAddCreneau(periodeId) {
    setCreneauPeriodeId(periodeId)
    setEditCreneau(null)
    const defaultClasse = classList[0]
    setCreneauForm({
      classeId: defaultClasse?.id || '',
      matiereId: defaultClasse?.matieres?.[0]?.id || '',
      jour: JOURS[mobileDayIdx] || 'lundi',
      heureDebut: '08:20',
      heureFin: '09:15',
    })
    setShowCreneauModal(true)
  }
  function openEditCreneau(periodeId, cr) {
    setCreneauPeriodeId(periodeId)
    setEditCreneau(cr)
    setCreneauForm({ classeId: cr.classeId, matiereId: cr.matiereId || '', jour: cr.jour, heureDebut: cr.heureDebut, heureFin: cr.heureFin })
    setShowCreneauModal(true)
  }
  function saveCreneau() {
    const periode = periodes.find(p => p.id === creneauPeriodeId)
    if (!periode) return
    let creneaux = [...(periode.creneaux || [])]
    if (editCreneau) {
      const idx = creneaux.findIndex(c => c.id === editCreneau.id)
      if (idx >= 0) creneaux[idx] = { ...creneaux[idx], ...creneauForm }
    } else {
      creneaux.push({ id: genId('cr'), ...creneauForm })
    }
    update('emploiDuTemps', creneauPeriodeId, { creneaux })
    setShowCreneauModal(false)
    toast.success('Créneau enregistré.')
  }
  function deleteCreneau(periodeId, crId) {
    const periode = periodes.find(p => p.id === periodeId)
    if (!periode) return
    const creneaux = (periode.creneaux || []).filter(c => c.id !== crId)
    update('emploiDuTemps', periodeId, { creneaux })
    toast.info('Créneau supprimé.')
  }

  // ── VACANCES
  function resetVacances() {
    const existing = vacancesList.map(v => v.id)
    existing.forEach(id => remove('vacances', id))
    const zone = params.zoneVacances || 'B'
    const newVac = getVacancesForZone(zone, anneeId)
    newVac.forEach(v => add('vacances', v))
    toast.success('Vacances réinitialisées selon la zone ' + zone + '.')
  }
  function openCreateVac() {
    setEditVac(null)
    setVacForm({ nom: '', dateDebut: '', dateFin: '' })
    setShowVacModal(true)
  }
  function openEditVac(v) {
    setEditVac(v)
    setVacForm({ nom: v.nom, dateDebut: v.dateDebut, dateFin: v.dateFin })
    setShowVacModal(true)
  }
  function saveVac() {
    if (!vacForm.nom.trim()) return
    if (editVac) {
      update('vacances', editVac.id, vacForm)
    } else {
      add('vacances', { id: genId('v'), anneeScolaireId: anneeId, ...vacForm })
    }
    setShowVacModal(false)
    toast.success('Vacances enregistrées.')
  }

  // ── STAGES
  function openCreateStage() {
    setEditStage(null)
    setStageForm({ nom: '', dateDebut: '', dateFin: '', classeIds: [] })
    setShowStageModal(true)
  }
  function openEditStage(s) {
    setEditStage(s)
    setStageForm({ nom: s.nom, dateDebut: s.dateDebut, dateFin: s.dateFin, classeIds: s.classeIds || [] })
    setShowStageModal(true)
  }
  function saveStage() {
    if (!stageForm.nom.trim() || !stageForm.dateDebut || !stageForm.dateFin) return
    if (editStage) {
      update('stages', editStage.id, stageForm)
      toast.success('Période de stage mise à jour.')
    } else {
      add('stages', { id: genId('stg'), anneeScolaireId: anneeId, ...stageForm })
      toast.success(`Période de stage "${stageForm.nom}" créée.`)
    }
    setShowStageModal(false)
  }
  function toggleStageClasse(classeId) {
    setStageForm(f => ({
      ...f,
      classeIds: f.classeIds.includes(classeId)
        ? f.classeIds.filter(id => id !== classeId)
        : [...f.classeIds, classeId],
    }))
  }

  const getClasse = (id) => classList.find(c => c.id === id)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Emploi du temps</h2>
          <p className="text-sm text-gray-400">{anneeActive.label}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
        {[['periodes', 'Planning horaire'], ['vacances', 'Vacances scolaires'], ['stages', 'Périodes de stage']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
              ${tab === key ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── PÉRIODES / PLANNING ── */}
      {tab === 'periodes' && (
        <div className="space-y-4">
          {/* Sélecteur de période + bouton créer */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap flex-1">
              {periodes.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriodeId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                    ${selectedPeriode?.id === p.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {p.nom}
                </button>
              ))}
            </div>
            <button onClick={openCreatePeriode} className="btn-primary flex items-center gap-1 text-sm shrink-0">
              <Plus size={14} /> Nouvelle période
            </button>
          </div>

          {periodes.length === 0 && (
            <div className="card p-10 text-center text-gray-400">
              Aucune période. Créez une période (ex&nbsp;: Période 1 — Trimestre 1).
            </div>
          )}

          {selectedPeriode && (
            <div className="card overflow-hidden">
              {/* En-tête de la période sélectionnée */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{selectedPeriode.nom}</h3>
                  <p className="text-xs text-gray-400">
                    {formatDate(selectedPeriode.dateDebut)} → {formatDate(selectedPeriode.dateFin)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openAddCreneau(selectedPeriode.id)}
                    className="btn-secondary text-xs flex items-center gap-1 py-1.5"
                  >
                    <Plus size={13} /> Ajouter un créneau
                  </button>
                  <button onClick={() => openEditPeriode(selectedPeriode)} className="p-1.5 btn-secondary text-xs">
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => setDeletePeriode(selectedPeriode)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* Navigation mobile (1 jour à la fois) */}
                <div className="flex items-center justify-between mb-3 md:hidden">
                  <button
                    onClick={() => setMobileDayIdx(i => Math.max(0, i - 1))}
                    disabled={mobileDayIdx === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-300"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-semibold capitalize text-gray-800 dark:text-gray-100">
                    {JOURS_LABELS[mobileDayIdx]}
                  </span>
                  <button
                    onClick={() => setMobileDayIdx(i => Math.min(4, i + 1))}
                    disabled={mobileDayIdx === 4}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-300"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {/* En-têtes jours — desktop uniquement */}
                <div className="hidden md:flex mb-1">
                  <div className="shrink-0" style={{ width: 56 }} />
                  {JOURS_LABELS.map(j => (
                    <div key={j} className="flex-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-1 uppercase tracking-wide">
                      {j}
                    </div>
                  ))}
                </div>

                {/* Grille horaire */}
                <div className="flex" style={{ height: GRID_HEIGHT }}>

                  {/* Axe des heures */}
                  <div className="shrink-0 relative" style={{ width: 56 }}>
                    {GRID_HOURS.map(h => (
                      <div
                        key={h}
                        className="absolute right-2 text-xs text-gray-400 dark:text-gray-500 leading-none select-none"
                        style={{ top: topPct(h), transform: 'translateY(-50%)' }}
                      >
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Zone grille */}
                  <div className="flex-1 relative rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">

                    {/* Fond pause déjeuner */}
                    <div
                      className="absolute inset-x-0 bg-amber-50 dark:bg-amber-900/10 z-0 pointer-events-none"
                      style={{ top: topPct('12:20'), height: heightPct('12:20', '13:00') }}
                    />

                    {/* Lignes en pointillés pour chaque heure */}
                    {GRID_HOURS.filter(h => h !== '12:20').map(h => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-dashed border-gray-200 dark:border-gray-600 z-0 pointer-events-none"
                        style={{ top: topPct(h) }}
                      />
                    ))}

                    {/* Ligne pleine à midi */}
                    <div
                      className="absolute inset-x-0 border-t-2 border-amber-300 dark:border-amber-600 z-10 pointer-events-none"
                      style={{ top: topPct('12:20') }}
                    />

                    {/* Ligne "maintenant" */}
                    {nowVisible && (
                      <div
                        className="absolute inset-x-0 z-20 pointer-events-none flex items-center"
                        style={{ top: nowTopPct }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow shrink-0 -ml-1.5" />
                        <div className="flex-1 border-t-2 border-red-500" />
                      </div>
                    )}

                    {/* Colonnes jours */}
                    <div className="absolute inset-0 flex">
                      {JOURS.map((jour, ji) => {
                        const crs = (selectedPeriode.creneaux || []).filter(c => c.jour === jour)
                        return (
                          <div
                            key={jour}
                            className={`relative flex-1 border-l border-gray-200 dark:border-gray-700 first:border-l-0
                              ${ji !== mobileDayIdx ? 'hidden md:block' : 'block'}`}
                          >
                            {crs.map(cr => {
                              const cl = getClasse(cr.classeId)
                              const mat = cl?.matieres?.find(m => m.id === cr.matiereId)
                              const startMin = timeToMin(cr.heureDebut)
                              const endMin = timeToMin(cr.heureFin)
                              if (startMin >= endMin) return null
                              const slotMinutes = endMin - startMin

                              // Taille de police et contenu adaptés à la durée
                              const fontSize = slotMinutes >= 40 ? 11 : slotMinutes >= 20 ? 10 : 9
                              const showTime = slotMinutes >= 18
                              const showMat  = slotMinutes >= 38 && !!mat?.nom

                              return (
                                // Wrapper externe : group + overflow visible pour le tooltip
                                <div
                                  key={cr.id}
                                  className="absolute group"
                                  style={{
                                    top: topPct(cr.heureDebut),
                                    height: heightPct(cr.heureDebut, cr.heureFin),
                                    left: 4, right: 4,
                                    zIndex: 20,
                                  }}
                                >
                                  {/* Tooltip (au-dessus, hors overflow-hidden du slot) */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-gray-900 dark:bg-gray-950 text-white text-xs rounded-xl p-2.5 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-relaxed whitespace-nowrap">
                                    <div className="font-bold text-[12px]">{cl?.nom || '?'}</div>
                                    <div className="opacity-75 mt-0.5">{cr.heureDebut} – {cr.heureFin}</div>
                                    {mat?.nom && <div className="italic opacity-60 mt-0.5">{mat.nom}</div>}
                                  </div>

                                  {/* Créneau */}
                                  <div
                                    className="absolute inset-0 rounded-lg shadow-md overflow-hidden cursor-pointer transition-transform group-hover:scale-[1.02]"
                                    style={{ backgroundColor: cl?.couleur || '#94a3b8', borderRadius: 8 }}
                                  >
                                    {/* Contenu texte */}
                                    <div className="p-1.5 h-full flex flex-col text-white overflow-hidden" style={{ fontSize }}>
                                      <div className="font-bold leading-tight truncate">{cl?.nom || '?'}</div>
                                      {showTime && (
                                        <div className="leading-tight mt-0.5 opacity-80" style={{ fontSize: fontSize - 1 }}>
                                          {cr.heureDebut}–{cr.heureFin}
                                        </div>
                                      )}
                                      {showMat && (
                                        <div className="italic leading-tight mt-auto opacity-70 truncate" style={{ fontSize: fontSize - 1 }}>
                                          {mat.nom}
                                        </div>
                                      )}
                                    </div>

                                    {/* Actions au survol */}
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-30">
                                      <button
                                        onClick={e => { e.stopPropagation(); openEditCreneau(selectedPeriode.id, cr) }}
                                        className="p-1 bg-white rounded shadow text-gray-700 hover:text-blue-600"
                                      >
                                        <Edit2 size={11} />
                                      </button>
                                      <button
                                        onClick={e => { e.stopPropagation(); deleteCreneau(selectedPeriode.id, cr.id) }}
                                        className="p-1 bg-white rounded shadow text-red-500 hover:text-red-700"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Légende */}
                {(selectedPeriode.creneaux || []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center mt-4">
                    Aucun créneau. Cliquez sur « Ajouter un créneau » pour commencer.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VACANCES ── */}
      {tab === 'vacances' && (
        <div className="space-y-4">
          <div className="flex gap-3 justify-end">
            <button onClick={resetVacances} className="btn-secondary text-sm py-1.5">
              Réinitialiser (Zone {params.zoneVacances || 'B'})
            </button>
            <button onClick={openCreateVac} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> Ajouter
            </button>
          </div>

          <div className="card overflow-hidden table-scroll-wrapper">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Nom</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Début</th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fin</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {vacancesList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center px-4 py-6 text-gray-400">Aucune vacance configurée.</td>
                  </tr>
                )}
                {vacancesList.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{v.nom}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(v.dateDebut)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(v.dateFin)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEditVac(v)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteVac(v)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STAGES ── */}
      {tab === 'stages' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreateStage} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> Nouvelle période de stage
            </button>
          </div>

          <div className="card p-4 text-sm text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
            Les périodes de stage sont affichées en orange sur les calendriers. Lors du déploiement du ruban pédagogique, les créneaux tombant pendant un stage sont automatiquement sautés pour les classes concernées.
          </div>

          {stagesList.length === 0 && (
            <div className="card p-10 text-center text-gray-400">
              Aucune période de stage. Créez une période (ex : Stage S1).
            </div>
          )}

          <div className="card overflow-hidden">
            {stagesList.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Nom</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Début</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Fin</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Classes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {stagesList.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />
                          {s.nom}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(s.dateDebut)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(s.dateFin)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {(s.classeIds || []).length === 0
                          ? <span className="text-gray-400 italic">Toutes</span>
                          : (s.classeIds || []).map(id => getClasse(id)?.nom || id).join(', ')
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEditStage(s)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => setDeleteStage(s)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal période */}
      <Modal isOpen={showPeriodeModal} onClose={() => setShowPeriodeModal(false)}
        title={editPeriode ? 'Modifier la période' : 'Nouvelle période'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Période 1 / Trimestre 1..." value={periodeForm.nom}
              onChange={e => setPeriodeForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Début</label>
              <input type="date" className="input" value={periodeForm.dateDebut}
                onChange={e => setPeriodeForm(f => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fin</label>
              <input type="date" className="input" value={periodeForm.dateFin}
                onChange={e => setPeriodeForm(f => ({ ...f, dateFin: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowPeriodeModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={savePeriode}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Modal créneau */}
      <Modal isOpen={showCreneauModal} onClose={() => setShowCreneauModal(false)}
        title={editCreneau ? 'Modifier le créneau' : 'Nouveau créneau'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Classe</label>
            <select className="input" value={creneauForm.classeId}
              onChange={e => {
                const nc = classList.find(c => c.id === e.target.value)
                setCreneauForm(f => ({ ...f, classeId: e.target.value, matiereId: nc?.matieres?.[0]?.id || '' }))
              }}>
              {classList.map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Matière <span className="text-red-400 font-normal">*</span></label>
            {(classList.find(c => c.id === creneauForm.classeId)?.matieres || []).length === 0 ? (
              <p className="text-sm text-orange-500 dark:text-orange-400">
                Ajoutez d'abord des matières à cette classe.
              </p>
            ) : (
              <select className="input" value={creneauForm.matiereId}
                onChange={e => setCreneauForm(f => ({ ...f, matiereId: e.target.value }))}>
                {(classList.find(c => c.id === creneauForm.classeId)?.matieres || []).map(m => (
                  <option key={m.id} value={m.id}>{m.nom}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">Jour</label>
            <select className="input" value={creneauForm.jour}
              onChange={e => setCreneauForm(f => ({ ...f, jour: e.target.value }))}>
              {JOURS.map(j => <option key={j} value={j} className="capitalize">{j}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Heure début</label>
              <select className="input" value={creneauForm.heureDebut}
                onChange={e => setCreneauForm(f => ({ ...f, heureDebut: e.target.value }))}>
                {GRID_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Heure fin</label>
              <select className="input" value={creneauForm.heureFin}
                onChange={e => setCreneauForm(f => ({ ...f, heureFin: e.target.value }))}>
                {[...GRID_HOURS, '18:00'].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowCreneauModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={saveCreneau}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Modal vacances */}
      <Modal isOpen={showVacModal} onClose={() => setShowVacModal(false)}
        title={editVac ? 'Modifier les vacances' : 'Ajouter des vacances'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Toussaint, Noël..." value={vacForm.nom}
              onChange={e => setVacForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Début</label>
              <input type="date" className="input" value={vacForm.dateDebut}
                onChange={e => setVacForm(f => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fin</label>
              <input type="date" className="input" value={vacForm.dateFin}
                onChange={e => setVacForm(f => ({ ...f, dateFin: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowVacModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={saveVac}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Modal stage */}
      <Modal isOpen={showStageModal} onClose={() => setShowStageModal(false)}
        title={editStage ? 'Modifier la période de stage' : 'Nouvelle période de stage'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Stage S1, Stage entreprise..." value={stageForm.nom}
              onChange={e => setStageForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Début</label>
              <input type="date" className="input" value={stageForm.dateDebut}
                onChange={e => setStageForm(f => ({ ...f, dateDebut: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fin</label>
              <input type="date" className="input" value={stageForm.dateFin}
                onChange={e => setStageForm(f => ({ ...f, dateFin: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Classes concernées</label>
            {classList.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune classe configurée.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                {classList.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={stageForm.classeIds.includes(c.id)}
                      onChange={() => toggleStageClasse(c.id)}
                      className="rounded"
                    />
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.couleur || '#94a3b8' }} />
                    <span className="text-gray-800 dark:text-gray-100">{c.nom}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Si aucune classe sélectionnée, le stage s'applique à toutes.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowStageModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={saveStage}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Confirms */}
      <ConfirmDialog isOpen={!!deletePeriode} onClose={() => setDeletePeriode(null)}
        onConfirm={() => { remove('emploiDuTemps', deletePeriode.id); setSelectedPeriodeId(null); toast.info('Période supprimée.') }}
        title="Supprimer la période" message={`Supprimer "${deletePeriode?.nom}" et tous ses créneaux ?`}
        confirmLabel="Supprimer" danger />
      <ConfirmDialog isOpen={!!deleteVac} onClose={() => setDeleteVac(null)}
        onConfirm={() => { remove('vacances', deleteVac.id); toast.info('Vacances supprimées.') }}
        title="Supprimer" message={`Supprimer "${deleteVac?.nom}" ?`}
        confirmLabel="Supprimer" danger />
      <ConfirmDialog isOpen={!!deleteStage} onClose={() => setDeleteStage(null)}
        onConfirm={() => { remove('stages', deleteStage.id); toast.info('Période de stage supprimée.') }}
        title="Supprimer la période de stage" message={`Supprimer "${deleteStage?.nom}" ?`}
        confirmLabel="Supprimer" danger />
    </div>
  )
}
