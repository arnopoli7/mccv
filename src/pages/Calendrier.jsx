import { useState, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CheckCircle, Clock } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/ui/Modal'
import { MultiFileUpload } from '../components/ui/FileUpload'
import { formatDateLong, parseISO, isBefore, isSameDay, combineDateAndTime } from '../utils/dateUtils'
import '../styles/calendar.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
})

const MESSAGES = {
  today: "Aujourd'hui",
  previous: '‹',
  next: '›',
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  agenda: 'Agenda',
  noEventsInRange: 'Aucune séance sur cette période.',
  showMore: n => `+ ${n} de plus`,
}

const TYPE_COLORS = {
  'Cours':          { border: '#3b82f6', badge: '#dbeafe', badgeText: '#1d4ed8' },
  'TD / Exercices': { border: '#f97316', badge: '#ffedd5', badgeText: '#c2410c' },
  'Évaluation':     { border: '#ef4444', badge: '#fee2e2', badgeText: '#b91c1c' },
}

function SeanceEvent({ event, calView }) {
  if (event.isVacances || event.isStage) {
    return <span style={{ fontSize: 11 }}>{event.title}</span>
  }
  const tc = TYPE_COLORS[event.type] || { border: '#94a3b8', badge: '#f1f5f9', badgeText: '#64748b' }

  if (calView === Views.MONTH) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', padding: '1px 4px' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: tc.border, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </span>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.title}
      </p>
      {event.matiereNom && (
        <p style={{ fontSize: 10, opacity: 0.8, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.matiereNom}
        </p>
      )}
      {event.classeNom && (
        <p style={{ fontSize: 10, opacity: 0.7, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.classeNom}
        </p>
      )}
      {event.type && (
        <span style={{
          display: 'inline-block',
          fontSize: 9,
          padding: '1px 5px',
          borderRadius: 4,
          backgroundColor: tc.badge,
          color: tc.badgeText,
          fontWeight: 700,
          alignSelf: 'flex-start',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          maxWidth: '100%',
          textOverflow: 'ellipsis',
        }}>
          {event.type}
        </span>
      )}
    </div>
  )
}

function CalToolbar({ onNavigate, label, view, onView }) {
  return (
    <div className="flex items-center justify-between mb-4 px-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onNavigate('PREV')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => onNavigate('TODAY')}
          className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Aujourd'hui
        </button>
        <button
          onClick={() => onNavigate('NEXT')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 ml-2 capitalize">
          {label}
        </span>
      </div>
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => onView(Views.WEEK)}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
            view === Views.WEEK
              ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Semaine
        </button>
        <button
          onClick={() => onView(Views.MONTH)}
          className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
            view === Views.MONTH
              ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Mois
        </button>
      </div>
    </div>
  )
}

export default function Calendrier() {
  const { classes, seancesCalendrier, rubanPedagogique, vacances, stages, getAnneeActive, update, cleanOrphanCalendarEvents } = useData()
  const toast = useToast()

  const [calView, setCalView] = useState(Views.WEEK)
  const [calDate, setCalDate] = useState(new Date())
  const [filterClasseId, setFilterClasseId] = useState('all')
  const [selectedEvent, setSelectedEvent] = useState(null)

  const anneeActive = getAnneeActive()

  useEffect(() => { cleanOrphanCalendarEvents(anneeActive?.id) }, [anneeActive?.id]) // eslint-disable-line
  const anneeId = anneeActive?.id

  const allClasses = classes()
  const allRubans = rubanPedagogique()
  const vacancesList = vacances(anneeId)
  const stagesList = stages(anneeId)

  // Resolve title/type from ruban
  function getSeanceInfo(s) {
    if (s.titre) return { titre: s.titre, type: s.type }
    for (const rb of allRubans) {
      for (const seq of (rb.sequences || [])) {
        const found = (seq.seances || []).find(rs => rs.id === s.seanceRubanId)
        if (found) return { titre: found.titre, type: found.type }
      }
    }
    return { titre: 'Séance', type: null }
  }

  function getStatut(s) {
    if (s.statut === 'faite') return 'faite'
    try {
      const d = parseISO(s.date)
      if (isBefore(d, new Date()) && !isSameDay(d, new Date())) return 'en retard'
    } catch {}
    return 'à faire'
  }

  // Build events from seancesCalendrier
  let allSeances = seancesCalendrier(anneeId ? { anneeScolaireId: anneeId } : {})
  if (filterClasseId !== 'all') {
    allSeances = allSeances.filter(s => s.classeId === filterClasseId)
  }

  const seanceEvents = allSeances.map(s => {
    const info = getSeanceInfo(s)
    const classe = allClasses.find(c => c.id === s.classeId)
    const matiereNom = s.matiereId
      ? (classe?.matieres?.find(m => m.id === s.matiereId)?.nom || 'Non définie')
      : null
    const start = combineDateAndTime(s.date, s.heureDebut || '08:00')
    const end = combineDateAndTime(s.date, s.heureFin || '09:00')
    return {
      id: s.id,
      title: info.titre,
      start,
      end,
      resource: s,
      type: info.type,
      classeNom: classe?.nom || '',
      classeCouleur: classe?.couleur || '#94a3b8',
      matiereNom,
      statut: getStatut(s),
      isVacances: false,
    }
  })

  const vacanceEvents = vacancesList.map(v => ({
    id: v.id,
    title: `🏖 ${v.nom}`,
    start: parseISO(v.dateDebut),
    end: parseISO(v.dateFin),
    resource: v,
    isVacances: true,
    allDay: true,
  }))

  const stageEvents = stagesList.map(s => ({
    id: s.id,
    title: `Stage : ${s.nom}`,
    start: parseISO(s.dateDebut),
    end: parseISO(s.dateFin),
    resource: s,
    isStage: true,
    allDay: true,
  }))

  const allEvents = [...seanceEvents, ...vacanceEvents, ...stageEvents]

  function eventStyleGetter(event) {
    if (event.isVacances) {
      return {
        style: {
          backgroundColor: '#f1f5f9',
          color: '#94a3b8',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.7rem',
        }
      }
    }
    if (event.isStage) {
      return {
        style: {
          backgroundColor: '#fed7aa',
          color: '#c2410c',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.7rem',
          fontWeight: 600,
        }
      }
    }
    const tc = TYPE_COLORS[event.type] || { border: '#94a3b8' }
    const bgColor = event.statut === 'en retard' ? '#fee2e2' : (event.classeCouleur + 'cc')
    const textColor = event.statut === 'en retard' ? '#991b1b' : '#1e293b'
    return {
      style: {
        backgroundColor: bgColor,
        borderLeft: `4px solid ${tc.border}`,
        borderTop: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderRadius: '10px',
        color: textColor,
        fontSize: '0.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }
    }
  }

  function handleSelectEvent(event) {
    if (event.isVacances || event.isStage) return
    setSelectedEvent({ seance: event.resource, info: getSeanceInfo(event.resource) })
  }

  function toggleStatut() {
    if (!selectedEvent) return
    const { seance } = selectedEvent
    const current = getStatut(seance)
    const newStatut = current === 'faite' ? 'à faire' : 'faite'
    update('seancesCalendrier', seance.id, { statut: newStatut })
    setSelectedEvent(prev => prev
      ? { ...prev, seance: { ...prev.seance, statut: newStatut } }
      : null
    )
    toast.success(newStatut === 'faite' ? 'Séance marquée faite ✓' : 'Séance remise à faire.')
  }

  function addDoc(doc) {
    if (!selectedEvent) return
    const { seance } = selectedEvent
    const docs = [...(seance.documents || []), doc]
    update('seancesCalendrier', seance.id, { documents: docs })
    setSelectedEvent(prev => prev ? { ...prev, seance: { ...prev.seance, documents: docs } } : null)
    toast.success('Document ajouté.')
  }

  function removeDoc(idx) {
    if (!selectedEvent) return
    const { seance } = selectedEvent
    const docs = (seance.documents || []).filter((_, i) => i !== idx)
    update('seancesCalendrier', seance.id, { documents: docs })
    setSelectedEvent(prev => prev ? { ...prev, seance: { ...prev.seance, documents: docs } } : null)
    toast.info('Document supprimé.')
  }

  const selSeance = selectedEvent?.seance || null
  const selInfo = selectedEvent?.info || null
  const selStatut = selSeance ? getStatut(selSeance) : null
  const selClasse = selSeance ? allClasses.find(c => c.id === selSeance.classeId) : null
  const selMatiereNom = selSeance?.matiereId
    ? (selClasse?.matieres?.find(m => m.id === selSeance.matiereId)?.nom || 'Non définie')
    : null

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Calendrier global</h1>

        {/* Filter by class */}
        <select
          value={filterClasseId}
          onChange={e => setFilterClasseId(e.target.value)}
          className="input max-w-xs"
        >
          <option value="all">Toutes les classes</option>
          {allClasses.map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
      </div>

      {/* Legend */}
      {allClasses.length > 0 && filterClasseId === 'all' && (
        <div className="flex flex-wrap gap-3">
          {allClasses.map(c => (
            <button
              key={c.id}
              onClick={() => setFilterClasseId(c.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: c.couleur, color: c.couleur, backgroundColor: c.couleur + '22' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.couleur, display: 'inline-block' }} />
              {c.nom}
            </button>
          ))}
        </div>
      )}

      <div className="card p-4">
        {allSeances.length === 0 && (
          <div className="text-center text-sm text-gray-400 mb-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            Aucune séance déployée sur le calendrier pour l'année en cours.
          </div>
        )}
        <Calendar
          localizer={localizer}
          events={allEvents}
          view={calView}
          onView={setCalView}
          date={calDate}
          onNavigate={setCalDate}
          views={[Views.WEEK, Views.MONTH]}
          culture="fr"
          messages={MESSAGES}
          style={{ height: 660 }}
          min={new Date(0, 0, 0, 8, 0, 0)}
          max={new Date(0, 0, 0, 18, 0, 0)}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleSelectEvent}
          components={{
            event: (props) => <SeanceEvent {...props} calView={calView} />,
            toolbar: CalToolbar,
          }}
          popup
          tooltipAccessor={event => event.isVacances ? event.title : `${event.title}${event.matiereNom ? ` — ${event.matiereNom}` : ''}${event.type ? ` — ${event.type}` : ''} (${event.classeNom})`}
        />
      </div>

      {/* Modal détail séance */}
      <Modal
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title={selInfo?.titre || 'Fiche séance'}
        size="md"
      >
        {selSeance && selInfo && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {selClasse && (
                <div>
                  <p className="text-gray-400 mb-0.5">Classe</p>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: selClasse.couleur }}
                    />
                    <p className="font-medium text-gray-800 dark:text-gray-100">{selClasse.nom}</p>
                  </div>
                </div>
              )}
              {selMatiereNom && (
                <div>
                  <p className="text-gray-400 mb-0.5">Matière</p>
                  <p className="font-medium text-gray-800 dark:text-gray-100">{selMatiereNom}</p>
                </div>
              )}
              {selInfo.type && (
                <div>
                  <p className="text-gray-400 mb-0.5">Type</p>
                  <p className="font-medium text-gray-800 dark:text-gray-100">{selInfo.type}</p>
                </div>
              )}
              <div>
                <p className="text-gray-400 mb-0.5">Date</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">{formatDateLong(selSeance.date)}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5">Horaire</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">
                  {selSeance.heureDebut} – {selSeance.heureFin}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-400 mb-2">Statut</p>
              <button
                onClick={toggleStatut}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm border-2 transition-all
                  ${selStatut === 'faite'
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                  }`}
              >
                {selStatut === 'faite'
                  ? <><CheckCircle size={16} /> Faite — cliquer pour remettre à faire</>
                  : <><Clock size={16} /> À faire — cliquer pour marquer faite</>
                }
              </button>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Documents ({(selSeance.documents || []).length})
              </p>
              <MultiFileUpload
                files={selSeance.documents || []}
                onAdd={addDoc}
                onRemove={removeDoc}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
