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

// Reconstitue le data URL depuis un fichier (format normal ou chunked)
export function getFileData(file) {
  if (!file) return null
  if (file.data) return file.data
  if (file.chunks && Array.isArray(file.chunks) && file.chunks.length > 0) return file.chunks.join('')
  return null
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

const MAX_SIZE_BYTES = 10 * 1024 * 1024          // 10 Mo
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024    // 5 Mo : découpage en chunks
const CHUNK_SIZE_CHARS = 900 * 1024              // ~900 Ko par chunk base64
const COMPRESS_THRESHOLD = 500 * 1024            // compresser les images > 500 Ko
const ACCEPT_ALL = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'
const ACCEPTED_EXTS = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|jpg|jpeg|png)$/i

function validateFile(file) {
  if (file.size > MAX_SIZE_BYTES)
    return "Fichier trop volumineux (max 10 Mo). Compressez votre PDF avant de l'uploader."
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

async function readFile(file, onProgress) {
  if (IMAGE_EXTS.test(file.name) && file.size > COMPRESS_THRESHOLD) {
    onProgress?.(30)
    const compressed = await compressImage(file)
    onProgress?.(100)
    if (compressed) return compressed
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 85))
      }
    }
    reader.onload = (e) => {
      onProgress?.(95)
      const dataUrl = e.target.result
      if (file.size > LARGE_FILE_THRESHOLD) {
        // Découper en chunks de ~900 Ko
        const chunks = []
        for (let i = 0; i < dataUrl.length; i += CHUNK_SIZE_CHARS) {
          chunks.push(dataUrl.slice(i, i + CHUNK_SIZE_CHARS))
        }
        onProgress?.(100)
        resolve({ name: file.name, size: file.size, type: file.type, chunks })
      } else {
        onProgress?.(100)
        resolve({ name: file.name, size: file.size, type: file.type, data: dataUrl })
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Confirmation inline ──────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }) {
  return (
    <div className="flex flex-col gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <p className="text-xs text-red-700 dark:text-red-300 font-medium">
        Supprimer ce document ? Cette action est irréversible.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 text-xs py-1 px-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
        >
          Oui, supprimer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs py-1 px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-medium transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Barre de progression ────────────────────────────────────────────────────

function ProgressBar({ progress }) {
  return (
    <div className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">Chargement en cours…</span>
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// ─── FileUpload (fichier unique) ─────────────────────────────────────────────

// storagePath ignoré (conservé pour compatibilité des appelants)
export default function FileUpload({ value, onChange, label = 'Déposer un fichier', storagePath: _sp }) {
  const toast = useToast()
  const inputRef = useRef()
  const [progress, setProgress] = useState(null) // null = inactif, 0-100 = en cours
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const err = validateFile(file)
    if (err) {
      toast.error(err)
      e.target.value = ''
      return
    }

    setProgress(0)
    try {
      const data = await readFile(file, setProgress)
      onChange(data)
    } catch {
      toast.error('Erreur lors de la lecture du fichier.')
    } finally {
      setProgress(null)
      e.target.value = ''
    }
  }

  const fileData = getFileData(value)

  return (
    <div>
      {confirmDelete ? (
        <DeleteConfirm
          onConfirm={() => { onChange(null); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : value ? (
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <span className="text-xl shrink-0">{getFileIcon(value)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{value.name}</p>
            <p className="text-xs text-gray-500">
              {formatFileSize(value.size)}
              {value.chunks && (
                <span className="ml-1 text-blue-500">· {value.chunks.length} blocs</span>
              )}
            </p>
          </div>
          <div className="flex gap-1">
            {fileData && (
              <a
                href={fileData}
                download={value.name}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                title="Télécharger"
              >
                <Download size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
              title="Supprimer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : progress !== null ? (
        <ProgressBar progress={progress} />
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
  const [progress, setProgress] = useState(null)
  const [confirmIdx, setConfirmIdx] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const err = validateFile(file)
    if (err) {
      toast.error(err)
      e.target.value = ''
      return
    }

    setProgress(0)
    try {
      const data = await readFile(file, setProgress)
      onAdd(data)
    } catch {
      toast.error('Erreur lors de la lecture du fichier.')
    } finally {
      setProgress(null)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={i}>
          {confirmIdx === i ? (
            <DeleteConfirm
              onConfirm={() => { onRemove(i); setConfirmIdx(null) }}
              onCancel={() => setConfirmIdx(null)}
            />
          ) : (
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-100 dark:border-gray-700">
              <span className="text-lg shrink-0">{getFileIcon(f)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 dark:text-gray-200 truncate font-medium">{f.name}</p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(f.size)}
                  {f.chunks && <span className="ml-1 text-blue-500">· {f.chunks.length} blocs</span>}
                </p>
              </div>
              {getFileData(f) && (
                <a href={getFileData(f)} download={f.name}
                  className="text-gray-400 hover:text-blue-500 shrink-0" title="Télécharger">
                  <Download size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={() => setConfirmIdx(i)}
                className="text-red-400 hover:text-red-600 shrink-0"
                title="Supprimer"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
      {progress !== null ? (
        <ProgressBar progress={progress} />
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
