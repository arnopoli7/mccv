import {
  format,
  parseISO,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isBefore,
  isAfter,
  addDays,
  isSameDay,
  differenceInDays,
} from 'date-fns'
import { fr } from 'date-fns/locale'

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
export const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']

export function formatDate(dateStr, fmt = 'dd/MM/yyyy') {
  if (!dateStr) return ''
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return format(d, fmt, { locale: fr })
  } catch {
    return ''
  }
}

export function formatDateLong(dateStr) {
  return formatDate(dateStr, 'EEEE d MMMM yyyy')
}

export function toISODate(date) {
  return format(date, 'yyyy-MM-dd')
}

export function getWeekStart(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function getWeekEnd(date = new Date()) {
  return endOfWeek(date, { weekStartsOn: 1 })
}

export function nextWeek(date) {
  return addWeeks(date, 1)
}

export function prevWeek(date) {
  return subWeeks(date, 1)
}

export function isInVacances(date, vacances) {
  if (!vacances || vacances.length === 0) return false
  const d = typeof date === 'string' ? parseISO(date) : date
  return vacances.some(v => {
    try {
      return isWithinInterval(d, {
        start: parseISO(v.dateDebut),
        end: parseISO(v.dateFin),
      })
    } catch {
      return false
    }
  })
}

export function getJoursOuvrables(dateDebut, dateFin, vacances = []) {
  const start = typeof dateDebut === 'string' ? parseISO(dateDebut) : dateDebut
  const end = typeof dateFin === 'string' ? parseISO(dateFin) : dateFin
  const days = eachDayOfInterval({ start, end })
  return days.filter(d => {
    const dayOfWeek = d.getDay() // 0=dim, 1=lun, ..., 5=ven, 6=sam
    if (dayOfWeek === 0 || dayOfWeek === 6) return false
    if (isInVacances(d, vacances)) return false
    return true
  })
}

export function getDaysUntilJune30(year) {
  const today = new Date()
  const june30 = new Date(year, 5, 30) // juin = mois 5
  if (isAfter(today, june30)) return 0
  return differenceInDays(june30, today)
}

export function getJourIndex(jourNom) {
  // lundi=1, mardi=2, etc. (pour correspondre à date.getDay() où 1=lundi)
  const map = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 }
  return map[jourNom.toLowerCase()] ?? -1
}

export function getNextOccurrence(jourNom, fromDate = new Date()) {
  const targetDay = getJourIndex(jourNom)
  let d = new Date(fromDate)
  for (let i = 0; i < 8; i++) {
    if (d.getDay() === targetDay) return d
    d = addDays(d, 1)
  }
  return null
}

export function parseTime(timeStr) {
  // "08:30" -> { hours: 8, minutes: 30 }
  const [h, m] = (timeStr || '00:00').split(':').map(Number)
  return { hours: h, minutes: m }
}

export function combineDateAndTime(dateStr, timeStr) {
  const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr)
  const { hours, minutes } = parseTime(timeStr)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function getWeekDays(weekStart) {
  return eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 4), // lun → ven
  })
}

export { isBefore, isAfter, isSameDay, parseISO, addDays, format, fr }
