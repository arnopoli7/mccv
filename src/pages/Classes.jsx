import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Tag } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import ColorPicker from '../components/ui/ColorPicker'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { genId } from '../utils/id'

export default function Classes() {
  const navigate = useNavigate()
  const { classes, add, update, remove, seancesCalendrier, getAnneeActive } = useData()
  const toast = useToast()

  const classList = classes()
  const anneeActive = getAnneeActive()

  const [showModal, setShowModal] = useState(false)
  const [editClasse, setEditClasse] = useState(null)
  const [form, setForm] = useState({ nom: '', couleur: '#93c5fd' })
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Matières dans la fiche classe, pas ici. Ici juste nom + couleur.

  function openCreate() {
    setEditClasse(null)
    setForm({ nom: '', couleur: '#93c5fd' })
    setShowModal(true)
  }

  function openEdit(cl, e) {
    e.stopPropagation()
    setEditClasse(cl)
    setForm({ nom: cl.nom, couleur: cl.couleur })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.nom.trim()) { toast.error('Le nom est requis.'); return }
    if (editClasse) {
      update('classes', editClasse.id, { nom: form.nom.trim(), couleur: form.couleur })
      toast.success('Classe mise à jour.')
    } else {
      add('classes', { id: genId('c'), nom: form.nom.trim(), couleur: form.couleur, matieres: [] })
      toast.success(`Classe "${form.nom}" créée.`)
    }
    setShowModal(false)
  }

  function handleDelete(cl) {
    remove('classes', cl.id)
    toast.info(`Classe "${cl.nom}" supprimée.`)
    setDeleteTarget(null)
  }

  function getProgression(classeId) {
    if (!anneeActive) return { done: 0, total: 0, pct: 0 }
    const seances = seancesCalendrier({ classeId, anneeScolaireId: anneeActive.id })
    const total = seances.length
    const done = seances.filter(s => s.statut === 'faite').length
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Classes</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{classList.length} classe(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle classe
        </button>
      </div>

      {classList.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Aucune classe créée pour l'instant.</p>
          <button onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Créer ma première classe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classList.map(cl => {
            const { done, total, pct } = getProgression(cl.id)
            return (
              <div
                key={cl.id}
                onClick={() => navigate(`/classes/${cl.id}`)}
                className="card p-5 cursor-pointer hover:shadow-md transition-shadow group"
              >
                {/* En-tête colorée */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                      style={{ backgroundColor: cl.couleur }}
                    >
                      {cl.nom[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{cl.nom}</h3>
                      <p className="text-xs text-gray-400">
                        {cl.matieres?.length > 0
                          ? cl.matieres.map(m => m.nom).join(', ')
                          : 'Aucune matière'}
                      </p>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => openEdit(cl, e)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(cl) }}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Progression */}
                {total > 0 ? (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>{done}/{total} séances</span>
                      <span className="font-medium" style={{ color: pct > 50 ? '#22c55e' : '#f97316' }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct >= 80 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444'
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Pas encore de séances déployées</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal créer/éditer */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editClasse ? 'Modifier la classe' : 'Nouvelle classe'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Nom de la classe</label>
            <input
              className="input"
              placeholder="ex: CAPA 1, BTS SN 2..."
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Couleur</label>
            <ColorPicker value={form.couleur} onChange={c => setForm(f => ({ ...f, couleur: c }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
            <button className="btn-primary" onClick={handleSave}>
              {editClasse ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm suppression */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Supprimer la classe"
        message={`Supprimer "${deleteTarget?.nom}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  )
}
