import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'

// ─── Utilitaires exportés (rétrocompatibilité) ──────────────────────────────

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
  if (type.startsWith('video/') || name.match(/\.(mp4|avi|mov|mkv|webm)$/)) return '🎬'
  return '📎'
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 Mo
const ACCEPT_ALL = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.mp4'
const ACCEPTED_EXTS = /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|jpg|jpeg|png|mp4)$/i

function validateFile(file) {
  if (file.size > MAX_SIZE_BYTES) return 'Fichier trop volumineux (max 10 Mo)'
  if (!ACCEPTED_EXTS.test(file.name)) return 'Format non supporté'
  return null
}

// Upload avec progression — chemin : users/{userId}/{storagePath}/{timestamp}_{filename}
// storagePath optionnel (ex : "classeId/seances/seanceId")
function uploadFileToStorage(file, userId, storagePath, onProgress) {
  return new Promise((resolve, reject) => {
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const fullPath = storagePath
      ? `users/${userId}/${storagePath}/${filename}`
      : `users/${userId}/files/${filename}`
    const storageRef = ref(storage, fullPath)
    const task = uploadBytesResumable(storageRef, file)
    task.on(
      'state_changed',
      (snap) => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ name: file.name, size: file.size, type: file.type, url })
        } catch (e) {
          reject(e)
        }
      }
    )
  })
}

function frenchStorageError(err) {
  if (!err) return 'Erreur de connexion, réessayez.'
  if (err.code === 'storage/unauthorized') return 'Accès refusé au stockage.'
  if (err.code === 'storage/quota-exceeded') return 'Quota de stockage dépassé.'
  if (err.code === 'storage/canceled') return 'Upload annulé.'
  return 'Erreur de connexion, réessayez.'
}

// ─── Barre de progression ────────────────────────────────────────────────────

function ProgressBar({ progress }) {
  return (
    <div className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
        <span>Upload en cours…</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// ─── FileUpload (fichier unique) ─────────────────────────────────────────────

export default function FileUpload({ value, onChange, label = 'Déposer un fichier', storagePath }) {
  const { session } = useAuth()
  const toast = useToast()
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }

    setUploading(true)
    setProgress(0)
    try {
      let data
      if (session?.userId) {
        data = await uploadFileToStorage(file, session.userId, storagePath, setProgress)
      } else {
        data = await fileToBase64(file)
      }
      onChange(data)
    } catch (err) {
      console.error('Erreur upload fichier:', err)
      toast.error(frenchStorageError(err))
    } finally {
      setUploading(false)
      setProgress(0)
      e.target.value = ''
    }
  }

  const href = value?.url || value?.data

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
            {href && (
              <a
                href={href}
                download={value.name}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                title="Télécharger"
              >
                ↓
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

export function MultiFileUpload({ files = [], onAdd, onRemove, storagePath }) {
  const { session } = useAuth()
  const toast = useToast()
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      toast.error(validationError)
      e.target.value = ''
      return
    }

    setUploading(true)
    setProgress(0)
    try {
      let data
      if (session?.userId) {
        data = await uploadFileToStorage(file, session.userId, storagePath, setProgress)
      } else {
        data = await fileToBase64(file)
      }
      onAdd(data)
    } catch (err) {
      console.error('Erreur upload fichier:', err)
      toast.error(frenchStorageError(err))
    } finally {
      setUploading(false)
      setProgress(0)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {files.map((f, i) => {
        const href = f.url || f.data
        return (
          <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-100 dark:border-gray-700">
            <span className="text-lg shrink-0">{getFileIcon(f)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-200 truncate font-medium">{f.name}</p>
              <p className="text-xs text-gray-400">{formatFileSize(f.size)}</p>
            </div>
            {href && (
              <a href={href} download={f.name} target="_blank" rel="noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0">↓</a>
            )}
            <button type="button" onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 shrink-0">
              <X size={14} />
            </button>
          </div>
        )
      })}
      {uploading ? (
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
