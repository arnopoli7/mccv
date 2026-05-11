import { createContext, useContext, useState, useCallback } from 'react'
import { genId } from '../utils/id'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback(({ message, type = 'info', duration = 3500 }) => {
    const id = genId('toast')
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => removeToast(id), duration)
  }, [])

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const toast = {
    success: (msg) => addToast({ message: msg, type: 'success' }),
    error: (msg) => addToast({ message: msg, type: 'error' }),
    info: (msg) => addToast({ message: msg, type: 'info' }),
    warning: (msg) => addToast({ message: msg, type: 'warning' }),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
}

const COLORS = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 no-print">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onRemove(t.id)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg cursor-pointer
            transition-all animate-in slide-in-from-right-5 ${COLORS[t.type]}`}
        >
          <span className="font-bold">{ICONS[t.type]}</span>
          <span className="text-sm font-medium">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
