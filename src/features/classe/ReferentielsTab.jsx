import { useState, useRef, useEffect } from 'react'
import { Upload, Download, Trash2, Edit2, Check, X, FileText, Lock } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import { formatFileSize } from '../../components/ui/FileUpload'
import { genId } from '../../utils/id'

const MAX_SIZE = 5 * 1024 * 1024        // 5 Mo
const ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
const ACCEPT_RE = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|jpg|jpeg|png)$/i

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve({ name: file.name, size: file.size, type: file.type, data: e.target.result })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function useDebounce(fn, delay) {
  const t = useRef(null)
  return (...args) => {
    clearTimeout(t.current)
    t.current = setTimeout(() => fn(...args), delay)
  }
}

export default function ReferentielsTab({ classe, anneeId, readOnly = false }) {
  const { update } = useData()
  const toast = useToast()
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editNom, setEditNom] = useState('')
  const [notes, setNotes] = useState(classe.notesReferentiel || '')

  // Sync notes si classe change (ex: rechargement)
  useEffect(() => {
    setNotes(classe.notesReferentiel || '')
  }, [classe.id]) // eslint-disable-line

  const referentiels = classe.referentiels || []

  const saveNotes = useDebounce((val) => {
    update('classes', classe.id, { notesReferentiel: val })
  }, 1000)

  function handleNotesChange(e) {
    setNotes(e.target.value)
    if (!readOnly) saveNotes(e.target.value)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > MAX_SIZE) { toast.error('Fichier trop volumineux (max 5 Mo)'); return }
    if (!ACCEPT_RE.test(file.name)) { toast.error('Format non supporté'); return }

    setUploading(true)
    try {
      const fileData = await fileToBase64(file)
      const nomCustom = file.name.replace(/\.[^.]+$/, '')
      const newDoc = { id: genId('ref'), nomCustom, ...fileData }
      const updated = [...referentiels, newDoc]
      update('classes', classe.id, { referentiels: updated })
      toast.success('Document ajouté.')
    } catch {
      toast.error('Erreur lors de la lecture du fichier.')
    } finally {
      setUploading(false)
    }
  }

  function startRename(doc) {
    setEditingId(doc.id)
    setEditNom(doc.nomCustom || doc.name)
  }

  function saveRename(docId) {
    if (!editNom.trim()) { cancelRename(); return }
    const updated = referentiels.map(d => d.id === docId ? { ...d, nomCustom: editNom.trim() } : d)
    update('classes', classe.id, { referentiels: updated })
    setEditingId(null)
    toast.success('Nom mis à jour.')
  }

  function cancelRename() {
    setEditingId(null)
    setEditNom('')
  }

  function removeDoc(docId) {
    const updated = referentiels.filter(d => d.id !== docId)
    update('classes', classe.id, { referentiels: updated })
    toast.info('Document supprimé.')
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {referentiels.length} document{referentiels.length !== 1 ? 's' : ''}
          {readOnly && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Lock size={12} /> Lecture seule (année archivée)
            </span>
          )}
        </p>
        {!readOnly && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-primary flex items-center gap-2 text-sm py-2"
          >
            <Upload size={14} />
            {uploading ? 'Lecture…' : 'Ajouter un référentiel'}
          </button>
        )}
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
      </div>

      {/* Liste des documents */}
      {referentiels.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 font-medium mb-1">Aucun référentiel</p>
          <p className="text-sm text-gray-400 mb-4">
            Uploadez vos référentiels officiels, programmes et grilles de compétences.
          </p>
          {!readOnly && (
            <button
              onClick={() => inputRef.current?.click()}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Upload size={14} /> Ajouter un document
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {referentiels.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <span className="text-2xl shrink-0">📄</span>

                {/* Nom (éditable) */}
                <div className="flex-1 min-w-0">
                  {editingId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="input text-sm py-1 flex-1"
                        value={editNom}
                        onChange={e => setEditNom(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(doc.id)
                          if (e.key === 'Escape') cancelRename()
                        }}
                        autoFocus
                      />
                      <button onClick={() => saveRename(doc.id)} className="p-1 text-green-500 hover:text-green-700">
                        <Check size={16} />
                      </button>
                      <button onClick={cancelRename} className="p-1 text-gray-400 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
                        {doc.nomCustom || doc.name}
                      </p>
                      <p className="text-xs text-gray-400">{doc.name} · {formatFileSize(doc.size)}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {doc.data && (
                    <a
                      href={doc.data}
                      download={doc.name}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Télécharger"
                    >
                      <Download size={15} />
                    </a>
                  )}
                  {!readOnly && editingId !== doc.id && (
                    <button
                      onClick={() => startRename(doc)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Renommer"
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => removeDoc(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes sur le référentiel */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notes sur le référentiel</h3>
          {!readOnly && (
            <span className="text-xs text-gray-400">Sauvegarde automatique</span>
          )}
        </div>
        <textarea
          className="input resize-none text-sm"
          rows={6}
          placeholder={readOnly ? '' : "Notez ici les compétences clés, points du programme à couvrir, remarques sur le référentiel…"}
          value={notes}
          onChange={handleNotesChange}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
