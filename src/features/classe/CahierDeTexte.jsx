import { useState } from 'react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useData } from '../../contexts/DataContext'
import { useAuth } from '../../contexts/AuthContext'
import { parseISO } from '../../utils/dateUtils'

const TYPE_COLOR = {
  'Cours': '#3b82f6',
  'TD / Exercices': '#f97316',
  'Évaluation': '#ef4444',
}

export default function CahierDeTexte({ classe, anneeId, isOpen, onClose }) {
  const { seancesCalendrier, getParams } = useData()
  const { getCurrentUser } = useAuth()
  const user = getCurrentUser()
  const params = getParams()

  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const semainelabel = `Semaine du ${format(weekStart, 'd MMMM', { locale: fr })} au ${format(weekEnd, 'd MMMM yyyy', { locale: fr })}`
  const enseignantLabel = params?.enseignant || user?.nom || ''
  const etablissementLabel = params?.etablissement || ''

  const allSeances = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })

  const seancesSemaine = allSeances
    .filter(s => {
      try {
        return isWithinInterval(parseISO(s.date), { start: weekStart, end: weekEnd })
      } catch { return false }
    })
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date)
      return d !== 0 ? d : (a.heureDebut || '').localeCompare(b.heureDebut || '')
    })

  function handlePrint() {
    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Cahier de texte — ${classe.nom}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2cm; color: #222; font-size: 12px; }
    h1 { font-size: 16px; margin: 0 0 2px; }
    .sub { color: #555; margin: 0 0 4px; }
    .semaine { font-weight: bold; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; border-bottom: 2px solid #333; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #555; }
    td { border-bottom: 1px solid #ddd; padding: 7px 8px; vertical-align: top; }
    .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .badge-cours { background:#dbeafe; color:#1d4ed8; }
    .badge-td { background:#ffedd5; color:#c2410c; }
    .badge-eval { background:#fee2e2; color:#b91c1c; }
    .badge-faite { background:#dcfce7; color:#15803d; }
    .badge-todo { background:#fff7ed; color:#c2410c; }
    .note { color: #666; font-style: italic; }
    footer { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
    @media print { body { margin: 1.5cm; } }
  </style>
</head>
<body>
  <h1>${enseignantLabel}${etablissementLabel ? ` — ${etablissementLabel}` : ''}</h1>
  <p class="sub">${classe.nom}</p>
  <p class="semaine">${semainelabel}</p>
  ${seancesSemaine.length === 0
    ? '<p style="color:#888;font-style:italic">Aucune séance cette semaine.</p>'
    : `<table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Heure</th>
        <th>Titre de la séance</th>
        <th>Type</th>
        <th>Statut</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${seancesSemaine.map(s => {
        const typeClass = s.type === 'TD / Exercices' ? 'badge-td' : s.type === 'Évaluation' ? 'badge-eval' : 'badge-cours'
        return `<tr>
          <td>${format(parseISO(s.date), 'EEE d MMM', { locale: fr })}</td>
          <td style="white-space:nowrap">${s.heureDebut || ''}–${s.heureFin || ''}</td>
          <td><strong>${s.titre || ''}</strong></td>
          <td><span class="badge ${typeClass}">${s.type || 'Cours'}</span></td>
          <td><span class="badge ${s.statut === 'faite' ? 'badge-faite' : 'badge-todo'}">${s.statut === 'faite' ? '✓ Faite' : 'À faire'}</span></td>
          <td class="note">${s.noteCours ? `"${s.noteCours}"` : '—'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>`}
  <footer>
    <span>MCCV — Mon Cahier de Cours Virtuel</span>
    <span>Imprimé le ${format(new Date(), 'd MMMM yyyy', { locale: fr })}</span>
  </footer>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`)
    win.document.close()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📓 Cahier de texte" size="xl">
      <div className="space-y-4">
        {/* Navigation semaine */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="btn-secondary flex items-center gap-1 text-sm py-1.5"
          >
            <ChevronLeft size={15} /> Précédente
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 text-center">
            {semainelabel}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="btn-secondary flex items-center gap-1 text-sm py-1.5"
          >
            Suivante <ChevronRight size={15} />
          </button>
        </div>

        {/* Contenu */}
        {seancesSemaine.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Aucune séance cette semaine.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Heure</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Titre</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody>
                {seancesSemaine.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-100 dark:border-gray-700/50 ${i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-700 dark:text-gray-300 font-medium">
                      {format(parseISO(s.date), 'EEE d MMM', { locale: fr })}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-500 dark:text-gray-400 text-xs">
                      {s.heureDebut}–{s.heureFin}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">
                      {s.titre}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.type === 'Évaluation'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          : s.type === 'TD / Exercices'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      }`}>
                        {s.type || 'Cours'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.statut === 'faite'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                      }`}>
                        {s.statut === 'faite' ? '✓ Faite' : 'À faire'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 italic max-w-xs truncate">
                      {s.noteCours || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <span className="text-xs text-gray-400">
            {seancesSemaine.length} séance(s) · {seancesSemaine.filter(s => s.statut === 'faite').length} faite(s)
          </span>
          <button
            onClick={handlePrint}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Printer size={15} /> Imprimer le cahier de texte
          </button>
        </div>
      </div>
    </Modal>
  )
}
