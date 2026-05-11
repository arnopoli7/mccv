import { useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'

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

function getFileIcon(file) {
  const name = (file.name || '').toLowerCase()
  const type = (file.type || '').toLowerCase()
  if (name.endsWith('.pdf') || type === 'application/pdf') return '📄'
  if (name.match(/\.pptx?$/) || type.includes('powerpoint') || type.includes('presentation')) return '📊'
  if (name.match(/\.docx?$/) || type.includes('msword') || type.includes('wordprocessingml')) return '📝'
  if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return '🖼️'
  if (type.startsWith('video/') || name.match(/\.(mp4|avi|mov|mkv|webm)$/)) return '🎬'
  if (name.match(/\.xlsx?$/) || type.includes('excel') || type.includes('spreadsheetml')) return '📈'
  return '📎'
}

const ACCEPT_ALL = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.avi,.mov,.mkv'

async function uploadToStorage(file, userId) {
  const filename = `${Date.now()}_${file.name}`
  const storageRef = ref(storage, `users/${userId}/files/${filename}`)
  await uploadBytes(storageRef, file)
  const url = await getDownloadURL(storageRef)
  return { name: file.name, size: file.size, type: file.type, url }
}

export default function FileUpload({ value, onChange, label = 'Déposer un fichier' }) {
  const { session } = useAuth()
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (session?.userId) {
        const data = await uploadToStorage(file, session.userId)
        onChange(data)
      } else {
        const data = await fileToBase64(file)
        onChange(data)
      }
    } catch (err) {
      console.error('Erreur upload fichier:', err)
    }
    e.target.value = ''
  }

  // Rétrocompatibilité : value.url (Firebase Storage) ou value.data (base64 ancienne version)
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

export function MultiFileUpload({ files = [], onAdd, onRemove }) {
  const { session } = useAuth()
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (session?.userId) {
        const data = await uploadToStorage(file, session.userId)
        onAdd(data)
      } else {
        const data = await fileToBase64(file)
        onAdd(data)
      }
    } catch (err) {
      console.error('Erreur upload fichier:', err)
    }
    e.target.value = ''
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
              <a href={href} download={f.name} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline shrink-0">↓</a>
            )}
            <button type="button" onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600 shrink-0">
              <X size={14} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600
          rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors w-full justify-center"
      >
        <Upload size={14} /> Ajouter un fichier
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT_ALL} className="hidden" onChange={handleFile} />
    </div>
  )
}
