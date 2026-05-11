const COLORS = [
  '#fde68a', '#fca5a5', '#86efac', '#93c5fd', '#c4b5fd',
  '#fdba74', '#f9a8d4', '#6ee7b7', '#7dd3fc', '#a5b4fc',
  '#fef08a', '#fb7185', '#34d399', '#38bdf8', '#818cf8',
  '#e2e8f0', '#cbd5e1', '#94a3b8', '#475569', '#1e293b',
]

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
            value === color ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  )
}
