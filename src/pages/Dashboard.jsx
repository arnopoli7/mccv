import { useState, useEffect } from 'react'
import guyRoux from '../assets/guyroux.png'
import yannPhoto from '../assets/yann.png'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Printer,
  AlertCircle, AlertTriangle, CheckCircle, CalendarDays,
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import {
  getWeekStart, getWeekDays, nextWeek, prevWeek,
  formatDate, isInVacances,
  parseISO, isBefore, isSameDay, toISODate, getDaysUntilJune30, fr,
} from '../utils/dateUtils'
import { format } from 'date-fns'

export default function Dashboard() {
  const navigate = useNavigate()
  const { getCurrentUser } = useAuth()
  const { classes, seancesCalendrier, rubanPedagogique, vacances, stages, getAnneeActive, cleanOrphanCalendarEvents } = useData()
  const user = getCurrentUser()

  const anneeActive = getAnneeActive()
  const anneeId = anneeActive?.id
  const today = new Date()
  const todayStr = toISODate(today)

  const [weekStart, setWeekStart] = useState(() => getWeekStart(today))

  useEffect(() => { cleanOrphanCalendarEvents(anneeId) }, [anneeId]) // eslint-disable-line

  const classList = classes()
  const vacancesList = vacances(anneeId)
  const stagesList = stages(anneeId)
  const allSeances = seancesCalendrier({ anneeScolaireId: anneeId })
  const allRuban = rubanPedagogique({ anneeScolaireId: anneeId })

  // ── PROGRESSION PAR CLASSE
  function getClasseProgression(classeId) {
    const seances = allSeances.filter(s => s.classeId === classeId)
    const rubanList = allRuban.filter(rb => rb.classeId === classeId)
    const total = rubanList.flatMap(rb => rb.sequences || []).reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
    const done = seances.filter(s => s.statut === 'faite').length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { done, total, pct }
  }

  // ── PROCHAINE SÉANCE PAR CLASSE
  function getNextSeance(classeId) {
    return allSeances
      .filter(s => s.classeId === classeId && s.date >= todayStr && s.statut !== 'faite')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.heureDebut || '').localeCompare(b.heureDebut || ''))[0] || null
  }

  // ── ALERTES
  const seancesEnRetard = allSeances.filter(s => {
    if (s.statut === 'faite') return false
    return isBefore(parseISO(s.date), today) && !isSameDay(parseISO(s.date), today)
  })

  const retardByClasse = classList
    .map(cl => ({ cl, count: seancesEnRetard.filter(s => s.classeId === cl.id).length }))
    .filter(x => x.count > 0)

  const classesSansSeances = classList.filter(cl =>
    allSeances.filter(s => s.classeId === cl.id).length === 0
  )

  // ── CALENDRIER SEMAINE
  const weekDays = getWeekDays(weekStart)

  function getSeancesForDay(day) {
    const dayStr = toISODate(day)
    return allSeances
      .filter(s => s.date === dayStr)
      .sort((a, b) => (a.heureDebut || '').localeCompare(b.heureDebut || ''))
  }

  const HOUR_START = 7
  const HOUR_END = 20
  const SLOT_H = 52
  const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

  const TYPE_BORDER_COLORS = {
    'Cours': '#3b82f6',
    'TD / Exercices': '#f97316',
    'Évaluation': '#ef4444',
  }

  function getEventPos(heureDebut, heureFin) {
    const parse = t => {
      const [h, m] = (t || '08:00').split(':').map(Number)
      return h * 60 + (m || 0)
    }
    const startMin = Math.max(parse(heureDebut), HOUR_START * 60)
    const endMin = Math.min(parse(heureFin), HOUR_END * 60)
    const top = ((startMin - HOUR_START * 60) / 60) * SLOT_H
    const height = Math.max(((endMin - startMin) / 60) * SLOT_H, 22)
    return { top, height }
  }

  const daysLeft = anneeActive
    ? getDaysUntilJune30(parseInt(anneeActive.label?.split('-')?.[1] || '2026'))
    : null

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Bienvenue */}
      {(() => {
        const login = user?.login
        const photoSrc = login === 'Arnaud7' ? guyRoux : login === 'YannW' ? yannPhoto : null
        const slogan = login === 'Arnaud7'
          ? 'Éleveur de Champions ! 🏆'
          : login === 'YannW'
          ? 'Un traiteur intraitable ! 👨‍🍳'
          : (user?.slogan || '')
        return (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Bonjour, {user?.nom || user?.login} 👋
              </h2>
              {slogan && (
                <p className="text-2xl font-bold mt-0.5" style={{ color: '#003F8A' }}>
                  {slogan}
                </p>
              )}
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
                {anneeActive ? `Année ${anneeActive.label}` : 'Aucune année configurée'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt={login}
                  style={{ height: 150, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                />
              ) : (
                <div
                  className="flex items-center justify-center font-bold text-white text-3xl shrink-0"
                  style={{ width: 100, height: 100, borderRadius: 12, backgroundColor: '#6366f1', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                >
                  {(user?.nom || user?.login || '?')[0].toUpperCase()}
                </div>
              )}
              <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 no-print">
                <Printer size={15} /> Imprimer la semaine
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── VIGNETTES CLASSES ── */}
      {classList.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Mes classes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {classList.map(cl => {
              const { done, total, pct } = getClasseProgression(cl.id)
              const nextSeance = getNextSeance(cl.id)
              return (
                <div
                  key={cl.id}
                  onClick={() => navigate(`/classes/${cl.id}`)}
                  className="card cursor-pointer hover:shadow-lg transition-all group overflow-hidden flex flex-col"
                  style={{ minHeight: 180 }}
                >
                  <div className="h-2 w-full shrink-0" style={{ backgroundColor: cl.couleur }} />
                  <div className="p-6 flex flex-col gap-3 flex-1">
                    {/* Identité */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-2xl text-gray-700 shrink-0"
                        style={{ backgroundColor: cl.couleur }}
                      >
                        {cl.nom[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-xl text-gray-900 dark:text-gray-100 leading-tight">{cl.nom}</h4>
                        {cl.matieres?.length > 0 && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {cl.matieres.map(m => m.nom).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Progression */}
                    {total > 0 ? (
                      <div>
                        <div className="flex justify-between items-baseline mb-2">
                          <span className="text-base font-semibold text-gray-700 dark:text-gray-200">
                            {done}
                            <span className="text-sm font-normal text-gray-400">/{total} séances</span>
                          </span>
                          <span
                            className="text-lg font-bold"
                            style={{ color: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444' }}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f97316' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Aucune séance déployée</p>
                    )}

                    {/* Prochaine séance */}
                    {nextSeance && (
                      <div className="flex items-start gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
                        <CalendarDays size={13} className="text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">Prochaine :</span>{' '}
                          {nextSeance.titre || 'Séance'}{' '}
                          <span className="text-blue-500">— {formatDate(nextSeance.date)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ALERTES ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Alertes
        </h3>
        {retardByClasse.length === 0 && classesSansSeances.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <CheckCircle size={20} className="text-green-500 shrink-0" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Tout est à jour !</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 🔴 Séances en retard */}
            {retardByClasse.length > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-900/20">
                  <AlertCircle size={15} className="text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Séances en retard — {seancesEnRetard.length} au total
                  </span>
                </div>
                <div className="divide-y divide-red-100 dark:divide-red-900/30">
                  {retardByClasse.map(({ cl, count }) => (
                    <button
                      key={cl.id}
                      onClick={() => navigate(`/classes/${cl.id}?tab=seances`)}
                      className="w-full flex items-center justify-between px-4 py-2.5
                        bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/10
                        transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cl.couleur }} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{cl.nom}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                          {count} en retard
                        </span>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-red-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 🟡 Classes sans séances */}
            {classesSansSeances.length > 0 && (
              <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-yellow-50 dark:bg-yellow-900/20">
                  <AlertTriangle size={15} className="text-yellow-500 shrink-0" />
                  <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
                    Classes sans séances déployées
                  </span>
                </div>
                <div className="divide-y divide-yellow-100 dark:divide-yellow-900/30">
                  {classesSansSeances.map(cl => (
                    <button
                      key={cl.id}
                      onClick={() => navigate(`/classes/${cl.id}?tab=ruban`)}
                      className="w-full flex items-center justify-between px-4 py-2.5
                        bg-white dark:bg-gray-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/10
                        transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cl.couleur }} />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{cl.nom}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">Aucune séance</span>
                        <ChevronRight size={14} className="text-gray-300 group-hover:text-yellow-400 transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CALENDRIER SEMAINE ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Semaine du {formatDate(weekStart)}
          </h3>
          <div className="flex items-center gap-3">
            {daysLeft !== null && (
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                {daysLeft} jour{daysLeft > 1 ? 's' : ''} avant le 30 juin
              </span>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setWeekStart(w => prevWeek(w))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekStart(getWeekStart(today))}
                className="px-3 py-1 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 font-medium"
              >
                Auj.
              </button>
              <button
                onClick={() => setWeekStart(w => nextWeek(w))}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          {/* Header jours */}
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            <div className="w-12 shrink-0 border-r border-gray-100 dark:border-gray-700" />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, today)
              return (
                <div key={i}
                  className={`flex-1 py-2 text-center border-r border-gray-100 dark:border-gray-700 last:border-r-0
                    ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    {format(day, 'EEE', { locale: fr })}
                  </p>
                  <p className={`text-base font-bold mt-0.5 ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
                    {format(day, 'd')}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Corps */}
          <div className="flex overflow-y-auto" style={{ maxHeight: '480px' }}>
            <div className="w-12 shrink-0 border-r border-gray-100 dark:border-gray-700 relative select-none"
              style={{ height: `${(HOUR_END - HOUR_START) * SLOT_H}px` }}>
              {HOURS.map((h, i) => (
                <div key={h} className="absolute right-1.5 text-[10px] font-medium text-gray-400"
                  style={{ top: `${i * SLOT_H - 7}px` }}>
                  {h}h
                </div>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-5 min-w-0">
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, today)
                const isVac = isInVacances(day, vacancesList)
                const isStage = isInVacances(day, stagesList)
                const daySeances = getSeancesForDay(day)
                return (
                  <div key={i}
                    className={`relative border-r border-gray-100 dark:border-gray-700 last:border-r-0
                      ${isToday ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
                    style={{ height: `${(HOUR_END - HOUR_START) * SLOT_H}px` }}>

                    {HOURS.map((_, hi) => (
                      <div key={hi}
                        className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800 pointer-events-none"
                        style={{ top: `${hi * SLOT_H}px` }} />
                    ))}

                    {isVac && (
                      <div className="absolute inset-0 bg-gray-50/90 dark:bg-gray-800/80 flex items-center justify-center z-10 pointer-events-none">
                        <span className="text-[10px] text-gray-400 -rotate-12 select-none">Vacances</span>
                      </div>
                    )}

                    {!isVac && isStage && (
                      <div className="absolute inset-0 bg-orange-50/70 dark:bg-orange-900/20 pointer-events-none z-5" />
                    )}

                    {!isVac && daySeances.map(s => {
                      const cl = classList.find(c => c.id === s.classeId)
                      const { top, height } = getEventPos(s.heureDebut, s.heureFin)
                      const borderColor = TYPE_BORDER_COLORS[s.type] || '#94a3b8'
                      const bgColor = cl?.couleur ? (cl.couleur + 'bb') : '#e2e8f0'
                      return (
                        <div
                          key={s.id}
                          onClick={() => navigate(`/classes/${s.classeId}?tab=seances`)}
                          style={{
                            position: 'absolute',
                            top: `${top}px`, height: `${height}px`,
                            left: '3px', right: '3px',
                            backgroundColor: bgColor,
                            borderLeft: `3px solid ${borderColor}`,
                            borderRadius: '7px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            zIndex: 10,
                          }}
                          className="hover:opacity-75 transition-opacity shadow-sm"
                        >
                          <div style={{ padding: '3px 5px', height: '100%', overflow: 'hidden' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.titre || cl?.nom || '?'}
                            </p>
                            {height > 34 && (
                              <p style={{ fontSize: 10, color: '#374151', opacity: 0.75, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[
                                  cl?.matieres?.find(m => m.id === s.matiereId)?.nom || (s.matiereId ? 'Non définie' : null),
                                  cl?.nom || '?',
                                ].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400 no-print">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#3b82f6' }} />Cours</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#f97316' }} />TD / Exercices</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#ef4444' }} />Évaluation</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-200 dark:bg-gray-600 inline-block" />Vacances</span>
        </div>
      </div>
    </div>
  )
}
