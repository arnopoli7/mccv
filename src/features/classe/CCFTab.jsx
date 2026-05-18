import { useState } from 'react'
import { Plus, Trash2, Edit2, ChevronDown, ChevronRight, UserPlus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FileUpload from '../../components/ui/FileUpload'
import Badge from '../../components/ui/Badge'
import { genId } from '../../utils/id'

const CCF_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#eab308', '#ec4899']

export default function CCFTab({ classe, anneeId }) {
  const { ccf, add, update, remove } = useData()
  const toast = useToast()

  const ccfList = ccf({ classeId: classe.id, anneeScolaireId: anneeId })

  const [expanded, setExpanded] = useState({})
  const [showCCFModal, setShowCCFModal] = useState(false)
  const [editCCF, setEditCCF] = useState(null)
  const [ccfForm, setCCFForm] = useState({ titre: '' })
  const [deleteCCF, setDeleteCCF] = useState(null)

  const [showEleveModal, setShowEleveModal] = useState(false)
  const [editEleve, setEditEleve] = useState(null)
  const [currentCCFId, setCurrentCCFId] = useState(null)
  const [eleveForm, setEleveForm] = useState({ nom: '', horaire: '', note: '', statut: 'à venir' })

  function toggleCCF(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  // ── CCF CRUD
  function openCreateCCF() {
    setEditCCF(null)
    setCCFForm({ titre: '' })
    setShowCCFModal(true)
  }
  function openEditCCF(c) {
    setEditCCF(c)
    setCCFForm({ titre: c.titre })
    setShowCCFModal(true)
  }
  function saveCCF() {
    if (!ccfForm.titre.trim()) return
    if (editCCF) {
      update('ccf', editCCF.id, { titre: ccfForm.titre })
      toast.success('CCF mis à jour.')
    } else {
      add('ccf', {
        id: genId('ccf'),
        anneeScolaireId: anneeId,
        classeId: classe.id,
        titre: ccfForm.titre.trim(),
        ordrePassage: [],
        sujet: null,
        grilleEvaluation: null,
      })
      toast.success(`CCF "${ccfForm.titre}" créé.`)
    }
    setShowCCFModal(false)
  }

  // ── Élèves
  function openAddEleve(ccfId) {
    setCurrentCCFId(ccfId)
    setEditEleve(null)
    setEleveForm({ nom: '', horaire: '', note: '', statut: 'à venir' })
    setShowEleveModal(true)
  }
  function openEditEleve(ccfId, eleve) {
    setCurrentCCFId(ccfId)
    setEditEleve(eleve)
    setEleveForm({ nom: eleve.nom, horaire: eleve.horaire || '', note: eleve.note ?? '', statut: eleve.statut })
    setShowEleveModal(true)
  }
  function saveEleve() {
    if (!eleveForm.nom.trim()) return
    const ccfItem = ccfList.find(c => c.id === currentCCFId)
    if (!ccfItem) return
    let ordrePassage = [...(ccfItem.ordrePassage || [])]
    const eleveData = {
      ...eleveForm,
      note: eleveForm.note !== '' ? parseFloat(eleveForm.note) : null,
    }
    if (editEleve) {
      const idx = ordrePassage.findIndex(e => e.id === editEleve.id)
      if (idx >= 0) ordrePassage[idx] = { ...ordrePassage[idx], ...eleveData }
    } else {
      ordrePassage.push({ id: genId('op'), ...eleveData })
    }
    update('ccf', currentCCFId, { ordrePassage })
    setShowEleveModal(false)
    toast.success('Élève enregistré.')
  }
  function deleteEleve(ccfId, eleveId) {
    const ccfItem = ccfList.find(c => c.id === ccfId)
    if (!ccfItem) return
    const ordrePassage = ccfItem.ordrePassage.filter(e => e.id !== eleveId)
    update('ccf', ccfId, { ordrePassage })
    toast.info('Élève supprimé.')
  }

  // ── Documents
  function updateDoc(ccfId, field, doc) {
    update('ccf', ccfId, { [field]: doc })
    toast.success(doc ? 'Document enregistré.' : 'Document supprimé.')
  }

  // ── Synthèse
  function getSynthese(ccfItem) {
    const notes = (ccfItem.ordrePassage || [])
      .filter(e => e.note !== null && e.note !== undefined && e.note !== '')
      .map(e => parseFloat(e.note))
    if (notes.length === 0) return null
    const moyenne = (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2)
    const superieur10 = notes.filter(n => n >= 10).length
    return { moyenne, superieur10, total: notes.length }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{ccfList.length} CCF configuré(s)</p>
        <button onClick={openCreateCCF} className="btn-primary flex items-center gap-2 text-sm py-2">
          <Plus size={14} /> Ajouter un CCF
        </button>
      </div>

      {ccfList.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-gray-400">Aucun CCF configuré.</p>
        </div>
      )}

      {ccfList.map(c => {
        const synthese = getSynthese(c)
        return (
          <div key={c.id} className="card overflow-hidden">
            {/* En-tête CCF */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              onClick={() => toggleCCF(c.id)}
            >
              <div className="text-gray-400">
                {expanded[c.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{c.titre}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span>{c.ordrePassage?.length || 0} élève(s)</span>
                  {synthese && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      Moy. {synthese.moyenne}/20 · {synthese.superieur10}/{synthese.total} ≥ 10
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => openEditCCF(c)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => setDeleteCCF(c)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {expanded[c.id] && (
              <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-5">
                {/* Documents */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Sujet (PDF)</label>
                    <FileUpload value={c.sujet} onChange={f => updateDoc(c.id, 'sujet', f)} label="Déposer le sujet"
                      storagePath={`${classe.id}/ccf/${c.id}`} />
                  </div>
                  <div>
                    <label className="label">Grille d'évaluation (PDF)</label>
                    <FileUpload value={c.grilleEvaluation} onChange={f => updateDoc(c.id, 'grilleEvaluation', f)} label="Déposer la grille"
                      storagePath={`${classe.id}/ccf/${c.id}`} />
                  </div>
                </div>

                {/* Ordre de passage */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Ordre de passage</p>
                    <button onClick={() => openAddEleve(c.id)}
                      className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700">
                      <UserPlus size={13} /> Ajouter un élève
                    </button>
                  </div>

                  {(!c.ordrePassage || c.ordrePassage.length === 0) ? (
                    <p className="text-sm text-gray-400">Aucun élève.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700/40">
                            <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-l">Élève</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Horaire</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Note /20</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium">Statut</th>
                            <th className="px-3 py-2 rounded-r"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {c.ordrePassage.map(e => (
                            <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{e.nom}</td>
                              <td className="px-3 py-2 text-gray-500">{e.horaire || '—'}</td>
                              <td className="px-3 py-2">
                                {e.note !== null && e.note !== undefined && e.note !== ''
                                  ? <span className={`font-semibold ${parseFloat(e.note) >= 10 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                                      {e.note}
                                    </span>
                                  : <span className="text-gray-300">—</span>
                                }
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant={e.statut === 'passé' ? 'green' : 'gray'}>
                                  {e.statut}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => openEditEleve(c.id, e)}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                                    <Edit2 size={12} />
                                  </button>
                                  <button onClick={() => deleteEleve(c.id, e.id)}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Synthèse */}
                  {synthese && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex gap-6 text-sm">
                      <div>
                        <p className="text-gray-400 text-xs">Moyenne classe</p>
                        <p className="font-bold text-blue-700 dark:text-blue-300 text-lg">{synthese.moyenne}<span className="text-sm font-normal">/20</span></p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Notes ≥ 10</p>
                        <p className="font-bold text-green-600 dark:text-green-400 text-lg">{synthese.superieur10}<span className="text-sm font-normal">/{synthese.total}</span></p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* ── BILAN ÉLÈVES ── */}
      {(() => {
        // Construire le jeu de données : une entrée par élève avec sa note par CCF
        const allEleves = new Map() // nom → { [ccfTitre]: note }
        ccfList.forEach(c => {
          ;(c.ordrePassage || []).forEach(e => {
            if (!allEleves.has(e.nom)) allEleves.set(e.nom, {})
            if (e.note !== null && e.note !== undefined && e.note !== '') {
              allEleves.get(e.nom)[c.titre] = parseFloat(e.note)
            }
          })
        })

        if (allEleves.size === 0) return null

        // Données graphique
        const chartData = Array.from(allEleves.entries()).map(([nom, notes]) => ({
          nom: nom.length > 12 ? nom.slice(0, 11) + '…' : nom,
          nomFull: nom,
          ...notes,
        }))

        // Moyennes par élève
        const eleveMoyennes = Array.from(allEleves.entries()).map(([nom, notes]) => {
          const vals = Object.values(notes)
          const moy = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
          return { nom, moy }
        }).filter(e => e.moy !== null).sort((a, b) => a.moy - b.moy)

        const elevesASurveiller = eleveMoyennes.filter(e => e.moy < 10)

        function indicateur(moy) {
          if (moy < 8) return '🔴'
          if (moy <= 10) return '🟡'
          return '🟢'
        }

        return (
          <div className="card p-5 space-y-5">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">📊 Bilan élèves</h3>

            {/* Graphique */}
            {chartData.length > 0 && ccfList.some(c => (c.ordrePassage || []).some(e => e.note !== null && e.note !== undefined && e.note !== '')) && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Notes par élève (toutes CCF confondues)</p>
                <div style={{ height: Math.max(220, chartData.length * 28) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        dataKey="nom"
                        tick={{ fontSize: 11 }}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                        height={70}
                      />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} tickCount={5} />
                      <Tooltip
                        formatter={(value, name) => [`${value}/20`, name]}
                        labelFormatter={label => {
                          const entry = chartData.find(d => d.nom === label)
                          return entry?.nomFull || label
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      {ccfList.map((c, i) => (
                        <Bar key={c.id} dataKey={c.titre} fill={CCF_COLORS[i % CCF_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={30} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Indicateurs par élève */}
            {eleveMoyennes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-3">Indicateur par élève</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {eleveMoyennes.map(({ nom, moy }) => (
                    <div key={nom} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                      <span className="text-base">{indicateur(moy)}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{nom}</p>
                        <p className="text-xs text-gray-500">{moy.toFixed(1)}/20</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Élèves à surveiller */}
            {elevesASurveiller.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                  Élèves à surveiller (moyenne &lt; 10)
                </p>
                <div className="space-y-1">
                  {elevesASurveiller.map(({ nom, moy }) => (
                    <div key={nom} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40">
                      <div className="flex items-center gap-2">
                        <span>{moy < 8 ? '🔴' : '🟡'}</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{nom}</span>
                      </div>
                      <span className={`text-sm font-bold ${moy < 8 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                        {moy.toFixed(1)}/20
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal CCF */}
      <Modal isOpen={showCCFModal} onClose={() => setShowCCFModal(false)}
        title={editCCF ? 'Modifier le CCF' : 'Nouveau CCF'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Titre</label>
            <input className="input" placeholder="ex: CCF n°1 — Situation professionnelle" value={ccfForm.titre}
              onChange={e => setCCFForm(f => ({ ...f, titre: e.target.value }))} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveCCF() }} />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowCCFModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={saveCCF}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Modal élève */}
      <Modal isOpen={showEleveModal} onClose={() => setShowEleveModal(false)}
        title={editEleve ? 'Modifier l\'élève' : 'Ajouter un élève'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Nom Prénom" value={eleveForm.nom}
              onChange={e => setEleveForm(f => ({ ...f, nom: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">Horaire de passage</label>
            <input type="time" className="input" value={eleveForm.horaire}
              onChange={e => setEleveForm(f => ({ ...f, horaire: e.target.value }))} />
          </div>
          <div>
            <label className="label">Note (/20)</label>
            <input type="number" min="0" max="20" step="0.5" className="input"
              placeholder="ex: 14.5" value={eleveForm.note}
              onChange={e => setEleveForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div>
            <label className="label">Statut</label>
            <select className="input" value={eleveForm.statut}
              onChange={e => setEleveForm(f => ({ ...f, statut: e.target.value }))}>
              <option value="à venir">À venir</option>
              <option value="passé">Passé</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowEleveModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={saveEleve}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* Confirm suppression CCF */}
      <ConfirmDialog isOpen={!!deleteCCF} onClose={() => setDeleteCCF(null)}
        onConfirm={() => { remove('ccf', deleteCCF.id); toast.info('CCF supprimé.') }}
        title="Supprimer le CCF"
        message={`Supprimer "${deleteCCF?.titre}" ?`}
        confirmLabel="Supprimer" danger />
    </div>
  )
}
