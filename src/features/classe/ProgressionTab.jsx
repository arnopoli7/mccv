import { useMemo, useState } from 'react'
import { Printer, Star, ClipboardList, AlertTriangle } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, parseISO, isInVacances, toISODate } from '../../utils/dateUtils'
import { eachWeekOfInterval, startOfWeek, endOfWeek, isBefore, isAfter, isSameDay, addDays, differenceInWeeks } from 'date-fns'
import BulletinConseil from './BulletinConseil'

// ── Donut SVG ─────────────────────────────────────────────────────────────────
function DonutChart({ faites, retard, aFaire, total }) {
  if (total === 0) return (
    <div className="w-28 h-28 flex items-center justify-center rounded-full border-8 border-gray-100 dark:border-gray-700">
      <span className="text-xs text-gray-400">—</span>
    </div>
  )

  const cx = 56, cy = 56, r = 40, strokeW = 14

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg - 90) * Math.PI / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  function arcPath(startDeg, endDeg) {
    if (Math.abs(endDeg - startDeg) < 0.5) return ''
    const p1 = polarToXY(startDeg, r)
    const p2 = polarToXY(endDeg, r)
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }

  const segments = [
    { value: faites, color: '#22c55e' },
    { value: retard, color: '#ef4444' },
    { value: aFaire, color: '#f97316' },
  ]

  let angle = 0
  const GAP = 2
  const paths = segments.map((seg, i) => {
    if (seg.value === 0) return null
    const span = (seg.value / total) * 360
    const start = angle
    const end = angle + span - (segments.filter(s => s.value > 0).length > 1 ? GAP : 0)
    angle += span
    return (
      <path
        key={i}
        d={arcPath(start, end)}
        fill="none"
        stroke={seg.color}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
    )
  })

  const pct = Math.round((faites / total) * 100)

  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={strokeW}
        className="text-gray-100 dark:text-gray-700" />
      {paths}
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="17" fontWeight="800"
        style={{ fill: 'currentColor' }} className="text-gray-800 dark:text-gray-100">
        {pct}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9"
        style={{ fill: '#6b7280' }}>
        faites
      </text>
    </svg>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  const colors = {
    green: 'text-green-600 dark:text-green-400',
    orange: 'text-orange-600 dark:text-orange-400',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
    gray: 'text-gray-600 dark:text-gray-300',
  }
  return (
    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] || colors.gray}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Gantt Tooltip ─────────────────────────────────────────────────────────────
function GanttTooltip({ seances, seqTitre }) {
  if (!seances || seances.length === 0) return null
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none"
      style={{ minWidth: 180 }}>
      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 space-y-1.5">
        {seances.map(sc => (
          <div key={sc.id}>
            <p className="font-semibold">{sc.titre || seqTitre}</p>
            <p className="text-gray-400">{formatDate(sc.date)} · {sc.heureDebut}–{sc.heureFin}</p>
            {sc.etoiles > 0 && (
              <div className="flex gap-0.5 mt-0.5">
                {[1, 2, 3].map(n => (
                  <Star key={n} size={10} className={n <= sc.etoiles ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'} />
                ))}
              </div>
            )}
            {sc.noteCours && (
              <p className="text-gray-300 italic mt-0.5 line-clamp-2">"{sc.noteCours}"</p>
            )}
          </div>
        ))}
      </div>
      <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProgressionTab({ classe, anneeId, onGoToRuban }) {
  const { seancesCalendrier, rubanPedagogique, vacances, ccf, anneesScolaires, emploiDuTemps, getParams } = useData()
  const { getCurrentUser } = useAuth()
  const [tooltipInfo, setTooltipInfo] = useState(null) // { seances, seqTitre, key }
  const [showBulletin, setShowBulletin] = useState(false)

  const user = getCurrentUser()
  const isArnaud7 = user?.login === 'Arnaud7'
  const params = getParams()
  const annees = anneesScolaires()
  const anneeActive = annees.find(a => a.id === anneeId)

  const allSeances = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const vacancesList = vacances(anneeId)
  const ccfList = ccf({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = rubanList.flatMap(rb => rb.sequences || [])

  // ── Bilan actuel
  const total = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const done = allSeances.filter(s => s.statut === 'faite').length
  const retard = allSeances.filter(s => {
    if (s.statut === 'faite') return false
    try {
      const d = parseISO(s.date)
      return isBefore(d, new Date()) && !isSameDay(d, new Date())
    } catch { return false }
  }).length
  const aFaire = total - done - retard
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const ccfFaits = ccfList.filter(c => c.ordrePassage?.some(e => e.statut === 'passé')).length
  const allNotes = ccfList.flatMap(c =>
    (c.ordrePassage || [])
      .filter(e => e.note !== null && e.note !== undefined && e.note !== '')
      .map(e => parseFloat(e.note))
  )
  const moyenneCCF = allNotes.length > 0
    ? (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2)
    : null

  // ── Comparaison année précédente
  const anneePrev = annees
    .filter(a => anneeActive && a.dateDebut < anneeActive.dateDebut)
    .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))[0] || null

  const prevSeances = anneePrev
    ? seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneePrev.id })
    : []
  const prevDone = prevSeances.filter(s => s.statut === 'faite').length
  const prevTotal = prevSeances.length
  const prevPct = prevTotal > 0 ? Math.round((prevDone / prevTotal) * 100) : null

  // ── Gantt
  const totalRubanSeances = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const ganttData = useMemo(() => {
    if (!anneeActive) return { weeks: [], seqRows: [], todayWeekIdx: -1 }

    const start = parseISO(anneeActive.dateDebut)
    const end = parseISO(anneeActive.dateFin)
    const today = new Date()

    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(weekStart => ({
      start: weekStart,
      end: endOfWeek(weekStart, { weekStartsOn: 1 }),
    }))

    const todayWeekIdx = weeks.findIndex(w =>
      !isBefore(today, startOfWeek(w.start, { weekStartsOn: 1 })) &&
      !isAfter(today, endOfWeek(w.end, { weekStartsOn: 1 }))
    )

    const seqRows = sequences.map(seq => {
      const seanceIds = (seq.seances || []).map(s => s.id)
      const deployedSeances = allSeances
        .filter(sc => seanceIds.includes(sc.seanceRubanId))
        .sort((a, b) => a.date.localeCompare(b.date))

      const weekSeances = weeks.map(week =>
        deployedSeances.filter(sc => {
          const d = parseISO(sc.date)
          return !isBefore(d, week.start) && !isAfter(d, week.end)
        })
      )

      return { seq, weekSeances, hasDeployed: deployedSeances.length > 0 }
    })

    return { weeks, seqRows, todayWeekIdx }
  }, [anneeActive?.id, allSeances.length, totalRubanSeances]) // eslint-disable-line

  const { weeks, seqRows, todayWeekIdx } = ganttData
  const BLOCK_W = 28
  const ROW_H = 22

  function getSeanceStatut(sc) {
    if (sc.statut === 'faite') return 'faite'
    try {
      const d = parseISO(sc.date)
      if (isBefore(d, new Date()) && !isSameDay(d, new Date())) return 'retard'
    } catch {}
    return 'todo'
  }

  function blockColor(statut) {
    if (statut === 'faite') return '#22c55e'
    if (statut === 'retard') return '#ef4444'
    if (statut === 'todo') return '#f97316'
    return 'transparent'
  }

  function isVacWeek(week) {
    return isInVacances(week.start, vacancesList) || isInVacances(week.end, vacancesList)
  }

  const todayLineX = todayWeekIdx >= 0 ? todayWeekIdx * BLOCK_W + BLOCK_W / 2 : null
  const LABEL_W = 200

  const enseignantLabel = params?.enseignant || user?.nom || ''
  const etablissementLabel = params?.etablissement || ''

  // ── Planning prévisionnel (Part 7) ───────────────────────────────────────
  const planningData = useMemo(() => {
    if (!anneeActive || sequences.length === 0) return null

    const today = new Date()
    const juin30 = new Date(parseInt(anneeActive.label?.split('-')?.[1] || '2026'), 5, 30)
    const fin = isBefore(parseISO(anneeActive.dateFin), juin30) ? parseISO(anneeActive.dateFin) : juin30

    // Compter les créneaux disponibles pour cette classe jusqu'au 30 juin
    const periodes = emploiDuTemps(anneeId)
    const JOUR_MAP = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 }

    let creneauxRestants = 0
    for (const periode of periodes) {
      const creneaux = (periode.creneaux || []).filter(c => c.classeId === classe.id)
      if (creneaux.length === 0) continue
      let current = parseISO(periode.dateDebut)
      const periodeFin = parseISO(periode.dateFin)
      while (current.getTime() <= Math.min(periodeFin.getTime(), fin.getTime())) {
        if (!isBefore(current, today) && !isInVacances(current, vacancesList)) {
          const dayOfWeek = current.getDay()
          if (creneaux.some(cr => JOUR_MAP[cr.jour] === dayOfWeek)) {
            creneauxRestants++
          }
        }
        current = addDays(current, 1)
      }
    }

    // Séances restantes à faire
    const seancesNonFaites = total - done
    const deficit = seancesNonFaites - creneauxRestants

    // Semaines restantes jusqu'au 30 juin
    const semainesRestantes = Math.max(0, differenceInWeeks(fin, today))

    // Prochaines vacances
    const prochainesVacances = vacancesList
      .filter(v => isBefore(today, parseISO(v.dateDebut)))
      .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))[0] || null

    let creneauxAvantVac = 0
    if (prochainesVacances) {
      const finVac = parseISO(prochainesVacances.dateDebut)
      for (const periode of periodes) {
        const creneaux = (periode.creneaux || []).filter(c => c.classeId === classe.id)
        if (creneaux.length === 0) continue
        let current = parseISO(periode.dateDebut)
        const periodeFin = parseISO(periode.dateFin)
        while (current.getTime() <= Math.min(periodeFin.getTime(), finVac.getTime())) {
          if (!isBefore(current, today) && !isInVacances(current, vacancesList)) {
            const dayOfWeek = current.getDay()
            if (creneaux.some(cr => JOUR_MAP[cr.jour] === dayOfWeek)) {
              creneauxAvantVac++
            }
          }
          current = addDays(current, 1)
        }
      }
    }

    // Tableau par séquence
    const seqDetails = sequences.map(seq => {
      const seanceIds = (seq.seances || []).map(s => s.id)
      const seancesDeployees = allSeances
        .filter(sc => seanceIds.includes(sc.seanceRubanId))
        .sort((a, b) => a.date.localeCompare(b.date))
      const seqDone = seancesDeployees.filter(s => s.statut === 'faite').length
      const seqTotal = seq.seances?.length || 0
      const premiere = seancesDeployees[0] || null
      const derniere = seancesDeployees[seancesDeployees.length - 1] || null

      let statut = '⏳ À venir'
      if (seqDone === seqTotal && seqTotal > 0) statut = '✅ Terminée'
      else if (seqDone > 0 || seancesDeployees.length > 0) statut = '🔄 En cours'

      return {
        titre: seq.titre,
        fait: seqDone,
        total: seqTotal,
        dateDebut: premiere?.date || null,
        dateFin: derniere?.date || null,
        statut,
      }
    })

    return {
      seancesNonFaites,
      creneauxRestants,
      deficit,
      semainesRestantes,
      prochainesVacances,
      creneauxAvantVac,
      seqDetails,
    }
  }, [anneeActive?.id, allSeances.length, totalRubanSeances, vacancesList.length]) // eslint-disable-line

  // ── Garde : pas de ruban ni de séances
  if (rubanList.length === 0 && allSeances.length === 0) {
    return (
      <div className="card p-12 text-center space-y-3">
        <AlertTriangle size={32} className="mx-auto text-orange-400" />
        <p className="font-medium text-gray-700 dark:text-gray-200">Aucune séance déployée pour le moment.</p>
        <p className="text-sm text-gray-400">
          Créez votre ruban pédagogique et déployez-le sur le calendrier<br />
          pour voir votre progression ici.
        </p>
        {onGoToRuban && (
          <button
            onClick={onGoToRuban}
            className="mt-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            Aller au Ruban pédagogique
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Bilan ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Bilan de l'année</h3>
          <div className="flex items-center gap-2 no-print">
            {isArnaud7 && (
              <button
                onClick={() => setShowBulletin(true)}
                className="flex items-center gap-1.5 btn-secondary text-sm py-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-700"
              >
                <ClipboardList size={14} /> Bulletin conseil de classe
              </button>
            )}
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
              <Printer size={14} /> Imprimer
            </button>
          </div>
        </div>

        {/* Print header */}
        <div className="print-only mb-6 border-b pb-4">
          <h1 className="text-xl font-bold">{enseignantLabel}{etablissementLabel ? ` — ${etablissementLabel}` : ''}</h1>
          <p className="text-sm text-gray-500">{anneeActive?.label} · {classe.nom}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Donut */}
          {total > 0 && (
            <div className="flex flex-col items-center gap-2 shrink-0">
              <DonutChart faites={done} retard={retard} aFaire={aFaire} total={total} />
              <div className="flex flex-col gap-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block bg-green-400" />
                  Faites : {done}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block bg-orange-400" />
                  À faire : {aFaire}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block bg-red-400" />
                  En retard : {retard}
                </span>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="flex-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Séances faites" value={`${done}/${total}`} sub={`${pct}%`} color={pct >= 70 ? 'green' : 'orange'} />
              <StatCard label="CCF réalisés" value={ccfFaits} sub={`sur ${ccfList.length}`} color="blue" />
              <StatCard label="Moyenne CCF" value={moyenneCCF ? `${moyenneCCF}/20` : '—'} color="purple" />
              <StatCard label="Séances restantes" value={total - done} color="gray" />
            </div>

            {/* Comparaison année précédente */}
            {anneePrev && prevTotal > 0 && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-sm flex items-center gap-3">
                <span className="text-gray-400 text-xs">Année précédente ({anneePrev.label})</span>
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  {prevDone}/{prevTotal} séances
                </span>
                <span
                  className="font-bold"
                  style={{ color: (prevPct || 0) >= 70 ? '#22c55e' : (prevPct || 0) >= 40 ? '#f97316' : '#ef4444' }}
                >
                  {prevPct}%
                </span>
                {prevPct !== null && (
                  <span className={`text-xs font-semibold ${pct > prevPct ? 'text-green-500' : pct < prevPct ? 'text-red-500' : 'text-gray-400'}`}>
                    {pct > prevPct ? `▲ +${pct - prevPct}pt` : pct < prevPct ? `▼ ${pct - prevPct}pt` : '='}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Gantt ── */}
      {sequences.length > 0 && weeks.length > 0 ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Frise de progression (Gantt)</h3>
            <div className="flex gap-3 text-xs no-print">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-green-400" /> Faite</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-orange-400" /> À faire</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block bg-red-400" /> En retard</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: 'rgba(148,163,184,0.25)', border: '1px solid #cbd5e1' }} />
                Vacances
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div style={{ minWidth: weeks.length * BLOCK_W + LABEL_W + 16 }}>

              {/* En-tête mois */}
              <div className="flex mb-1" style={{ marginLeft: LABEL_W }}>
                {weeks.map((week, i) => {
                  const showMonth = i === 0 || week.start.getMonth() !== weeks[i - 1]?.start.getMonth()
                  const isTodayWeek = i === todayWeekIdx
                  return (
                    <div key={i} style={{ width: BLOCK_W }} className="shrink-0 relative overflow-visible">
                      {showMonth && (
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(week.start, 'MMM')}
                        </span>
                      )}
                      {isTodayWeek && (
                        <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 whitespace-nowrap">
                          Auj.
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Body avec vacances + today ligne */}
              <div className="relative">
                {/* Fond vacances */}
                {weeks.map((week, i) => isVacWeek(week) && (
                  <div key={`vac-${i}`} style={{
                    position: 'absolute',
                    left: LABEL_W + i * BLOCK_W,
                    top: 0, bottom: 0, width: BLOCK_W,
                    backgroundColor: 'rgba(148,163,184,0.12)',
                    pointerEvents: 'none',
                  }} />
                ))}

                {/* Ligne verticale Aujourd'hui */}
                {todayLineX !== null && (
                  <div style={{
                    position: 'absolute',
                    left: LABEL_W + todayLineX,
                    top: 0, bottom: 0, width: 2,
                    backgroundColor: '#ef4444',
                    zIndex: 20, pointerEvents: 'none',
                    borderRadius: 1,
                  }} />
                )}

                {/* Lignes séquences */}
                {seqRows.map(({ seq, weekSeances }) => (
                  <div key={seq.id} className="flex items-center mb-1" style={{ height: ROW_H }}>
                    <div style={{ width: LABEL_W }} className="shrink-0 pr-3 text-xs text-gray-600 dark:text-gray-300 truncate font-medium">
                      {seq.titre}
                    </div>
                    <div className="flex relative" style={{ zIndex: 2 }}>
                      {weeks.map((week, i) => {
                        const seancesInWeek = weekSeances[i] || []
                        const hasNote = seancesInWeek.some(sc => sc.noteCours)
                        const hasEtoiles = seancesInWeek.some(sc => sc.etoiles > 0)
                        const tooltipKey = `${seq.id}-${i}`
                        return (
                          <div
                            key={i}
                            style={{ width: BLOCK_W, height: ROW_H, display: 'flex', alignItems: 'center', padding: '2px 1px', gap: 1, position: 'relative' }}
                            onMouseEnter={() => seancesInWeek.length > 0 && setTooltipInfo({ seances: seancesInWeek, seqTitre: seq.titre, key: tooltipKey })}
                            onMouseLeave={() => setTooltipInfo(null)}
                          >
                            {tooltipInfo?.key === tooltipKey && (
                              <GanttTooltip seances={tooltipInfo.seances} seqTitre={tooltipInfo.seqTitre} />
                            )}
                            {seancesInWeek.length > 0 && seancesInWeek.map(sc => {
                              const statut = getSeanceStatut(sc)
                              return (
                                <div
                                  key={sc.id}
                                  style={{
                                    flex: 1,
                                    height: 14,
                                    backgroundColor: blockColor(statut),
                                    borderRadius: 3,
                                    cursor: 'default',
                                    minWidth: 4,
                                    position: 'relative',
                                  }}
                                >
                                  {(hasNote || hasEtoiles) && (
                                    <div style={{
                                      position: 'absolute',
                                      top: -3,
                                      right: -2,
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      backgroundColor: '#fbbf24',
                                    }} />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 no-print">Survolez un bloc pour voir le détail de la séance</p>
        </div>
      ) : (
        <div className="card p-8 text-center text-gray-400">
          Déployez le ruban pédagogique pour voir la frise de progression.
        </div>
      )}

      {/* ── Planning prévisionnel ── */}
      {planningData && (
        <div className="card p-5 space-y-5 no-print">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">📅 Planning prévisionnel</h3>

          {/* Récap rapide */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Séances restantes</p>
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-200">{planningData.seancesNonFaites}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Créneaux dispo. avant le 30/06</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{planningData.creneauxRestants}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Semaines restantes</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{planningData.semainesRestantes}</p>
            </div>
          </div>

          {/* Prochaines vacances */}
          {planningData.prochainesVacances && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm flex items-center gap-3">
              <span className="text-blue-600 dark:text-blue-300 font-medium">
                Prochaines vacances : {planningData.prochainesVacances.nom}
              </span>
              <span className="text-gray-500">à partir du {formatDate(planningData.prochainesVacances.dateDebut)}</span>
              <span className="text-gray-500">·</span>
              <span className="text-gray-600 dark:text-gray-300">
                {planningData.creneauxAvantVac} créneaux disponibles d'ici là
              </span>
            </div>
          )}

          {/* Alerte déficit */}
          {planningData.deficit > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-300 font-semibold text-sm">
                ⚠️ Attention : {planningData.deficit} séance{planningData.deficit > 1 ? 's' : ''} ne pourront pas être placées avant le 30 juin avec l'emploi du temps actuel.
              </p>
              <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                Suggestion : réduisez de {planningData.deficit} séance{planningData.deficit > 1 ? 's' : ''} ou ajoutez {planningData.deficit} créneau{planningData.deficit > 1 ? 'x' : ''} à l'emploi du temps.
              </p>
            </div>
          )}
          {planningData.creneauxRestants > 0 && planningData.deficit <= 0 && planningData.seancesNonFaites > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
              ✅ Le programme peut être terminé avant le 30 juin ({planningData.creneauxRestants - planningData.seancesNonFaites} créneaux en réserve).
            </div>
          )}

          {/* Tableau récapitulatif par séquence */}
          {planningData.seqDetails.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Récapitulatif par séquence</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/40">
                      <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-l">Séquence</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-medium">Faites</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-medium hidden md:table-cell">Début</th>
                      <th className="text-center px-3 py-2 text-gray-500 font-medium hidden md:table-cell">Fin prév.</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium rounded-r">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {planningData.seqDetails.map((seq, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100 max-w-48 truncate">{seq.titre}</td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                          {seq.fait}/{seq.total}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500 hidden md:table-cell">
                          {seq.dateDebut ? formatDate(seq.dateDebut) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500 hidden md:table-cell">
                          {seq.dateFin ? formatDate(seq.dateFin) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{seq.statut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION IMPRESSION UNIQUEMENT ── */}
      <div className="print-only space-y-6 mt-8">
        <div className="border-t-2 pt-6">
          <h2 className="text-lg font-bold mb-3">Bilan chiffré</h2>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b">
                <td className="py-1 font-medium w-48">Séances faites</td>
                <td>{done} / {total} ({pct}%)</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 font-medium">Séances en retard</td>
                <td>{retard}</td>
              </tr>
              <tr className="border-b">
                <td className="py-1 font-medium">CCF réalisés</td>
                <td>{ccfFaits} / {ccfList.length}</td>
              </tr>
              <tr>
                <td className="py-1 font-medium">Moyenne CCF</td>
                <td>{moyenneCCF ? `${moyenneCCF}/20` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {sequences.length > 0 && (
          <div className="border-t-2 pt-6">
            <h2 className="text-lg font-bold mb-3">Progression par séquence</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left py-1 font-semibold">Séquence</th>
                  <th className="text-center py-1 font-semibold w-24">Faites</th>
                  <th className="text-center py-1 font-semibold w-24">Total</th>
                  <th className="text-center py-1 font-semibold w-24">%</th>
                </tr>
              </thead>
              <tbody>
                {sequences.map(seq => {
                  const seanceIds = (seq.seances || []).map(s => s.id)
                  const seancesSeq = allSeances.filter(sc => seanceIds.includes(sc.seanceRubanId))
                  const seqDone = seancesSeq.filter(s => s.statut === 'faite').length
                  const seqTotal = seancesSeq.length
                  const seqPct = seqTotal > 0 ? Math.round(seqDone / seqTotal * 100) : 0
                  return (
                    <tr key={seq.id} className="border-b">
                      <td className="py-1">{seq.titre}</td>
                      <td className="text-center">{seqDone}</td>
                      <td className="text-center">{seqTotal}</td>
                      <td className="text-center font-semibold">{seqTotal > 0 ? `${seqPct}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Bulletin conseil de classe — Arnaud7 uniquement */}
      {isArnaud7 && (
        <BulletinConseil
          classe={classe}
          anneeId={anneeId}
          isOpen={showBulletin}
          onClose={() => setShowBulletin(false)}
        />
      )}
    </div>
  )
}
