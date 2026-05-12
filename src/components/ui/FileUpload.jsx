import { useRef, useState } from 'react'
import { Upload, X, Download } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

// ─── Utilitaires exportés ────────────────────────────────────────────────────

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve({ name: file.name, size: file.size, type: file.type, data: e.target.result })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

// ─── Helpers internes ────────────────────────────────────────────────────────

function getFileIcon(file) {
  const name = (file.name || '').toLowerCase()
  const type = (file.type || '').toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') return '📄'
  if (name.match(/\.pptx?$/) || type.includes('powerpoint') || type.includes('presentation')) return '📊'
  if (name.match(/\.docx?$/) || type.includes('msword') || type.includes('wordprocessingml')) return '📝'
  if (name.match(/\.xlsx?$/) || type.includes('excel') || type.includes('spreadsheetml')) return '📈'
  if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return '🖼️'
  return '📎'
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024  // 5 Mo
const COMPRESS_THRESHOLD = 500 * 1024   // compresser les images > 500 Ko
const ACCEPT_ALL = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
const ACCEPTED_EXTS = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|jpg|jpeg|png)$/i

function validateFile(file) {
  if (file.size > MAX_SIZE_BYTES) return 'Fichier trop volumineux (max 5 Mo)'
  if (!ACCEPTED_EXTS.test(file.name)) return 'Format non supporté'
  return null
}

// Compression image via Canvas (images > COMPRESS_THRESHOLD uniquement)
function compressImage(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const MAX_DIM = 1400
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      const data = canvas.toDataURL('image/jpeg', 0.78)
      const size = Math.round((data.length * 3) / 4)
      const name = file.name.replace(/\.[^.]+$/, '.jpg')
      resolve({ name, size, type: 'image/jpeg', data })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp)$/i

async function readFile(file) {
  if (IMAGE_EXTS.test(file.name) && file.size > COMPRESS_THRESHOLD) {
    const compressed = await compressImage(file)
    if (compressed) return compressed
  }
  return fileToBase64(file)
}

// ─── FileUpload (fichier unique) ─────────────────────────────────────────────

// storagePath ignoré (conservé pour compatibilité des appelants)
export default function FileUpload({ value, onChange, label = 'Déposer un fichier', storagePath: _sp }) {
  const toast = useToast()
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const err = validateFile(file)
    if (err) {
      toast.error(err)
      e.target.value = ''
      return
    }

    setUploading(true)
    try {
      const data = await readFile(file)
      onChange(data)
    } catch {
      toast.error('Erreur lors de la lecture du fichier.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <span className="text-xl shrink-0">{getFileIcon(value)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{value.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(value.size)}</p>
          </div>
          <div className="flex gap-1">
            {value.data && (
              <a
                href={value.data}
                download={value.name}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                title="Télécharger"
              >
                <Download size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
              title="Supprimer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : uploading ? (
        <div className="p-3 text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
          Lecture en cours…
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600
            rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500
            transition-colors w-full justify-center"
        >
          <Upload size={16} />
          {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ALL}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ─── MultiFileUpload (liste de fichiers) ─────────────────────────────────────

// storagePath ignoré (conservé pour compatibilité des appelants)
export function MultiFileUpload({ files = [], onAdd, onRemove, storagePath: _sp }) {
  const toast = useToast()
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const err = validateFile(file)
    if (err) {
      toast.error(err)
      e.target.value = ''
      return
    }

    setUploading(true)
    try {
      const data = await readFile(file)
      onAdd(data)
    } catch {
      toast.error('Erreur lors de la lecture du fichier.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-100 dark:border-gray-700">
          <span className="text-lg shrink-0">{getFileIcon(f)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 dark:text-gray-200 truncate font-medium">{f.name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(f.size)}</p>
          </div>
          {f.data && (
            <a href={f.data} download={f.name}
              className="text-gray-400 hover:text-blue-500 shrink-0" title="Télécharger">
              <Download size={14} />
            </a>
          )}
          <button type="button" onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 shrink-0" title="Supprimer">
            <X size={14} />
          </button>
        </div>
      ))}
      {uploading ? (
        <div className="p-3 text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center">
          Lecture en cours…
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600
            rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500
            transition-colors w-full justify-center"
        >
          <Upload size={14} /> Ajouter un fichier
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />
    </div>
  )
}
