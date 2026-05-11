const VARIANTS = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

export default function Badge({ children, variant = 'gray', className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
      ${VARIANTS[variant] || VARIANTS.gray} ${className}`}>
      {children}
    </span>
  )
}

export function statutBadge(statut) {
  if (statut === 'faite') return <Badge variant="green">Faite</Badge>
  if (statut === 'en retard') return <Badge variant="red">En retard</Badge>
  return <Badge variant="orange">À faire</Badge>
}
