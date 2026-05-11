import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, ChevronDown, ChevronRight, Trash2, Edit2, Copy, Rocket, Printer, CalendarX, FileSpreadsheet, Download } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import FileUpload from '../../components/ui/FileUpload'
import { genId } from '../../utils/id'
import { isInVacances, parseISO, addDays, toISODate, formatDate } from '../../utils/dateUtils'

const TYPES_SEANCE = ['Cours', 'TD / Exercices', 'Évaluation']

export default function RubanPedagogique({ classe, anneeId, currentMatiere }) {
  const { get, set, add, update, remove, classes, anneesScolaires, getParams } = useData()
  const { getCurrentUser } = useAuth()
  const toast = useToast()
  const user = getCurrentUser()
  const params = getParams()

  const rubanList = get('rubanPedagogique').filter(
    r => r.classeId === classe.id && r.anneeScolaireId === anneeId &&
      (!currentMatiere || r.matiereId === currentMatiere?.id)
  )
  const ruban = rubanList[0] || null

  function getOrCreateRuban() {
    if (ruban) return ruban
    const newRuban = {
      id: genId('rb'),
      anneeScolaireId: anneeId,
      classeId: classe.id,
      matiereId: currentMatiere?.id || null,
      sequences: [],
    }
    add('rubanPedagogique', newRuban)
    return newRuban
  }

  // ── États modaux
  const [expandedSeq, setExpandedSeq] = useState({})
  const [showSeqModal, setShowSeqModal] = useState(false)
  const [editSeq, setEditSeq] = useState(null)
  const [seqForm, setSeqForm] = useState({ titre: '', objectifs: '', competences: '', documentSupport: null, seances: [] })

  // seanceEdit = null | { seqId, seanceId (null=new), titre, type, objectif, duree }
  const [seanceEdit, setSeanceEdit] = useState(null)
  // modalSeanceEdit = null | { idx: null|number, titre, type, objectif, duree }
  const [modalSeanceEdit, setModalSeanceEdit] = useState(null)

  // Deploy
  const [showDeployModal, setShowDeployModal] = useState(false)
  const [showDeployConfirm, setShowDeployConfirm] = useState(false)

  // Duplication
  const [showDupliquerModal, setShowDupliquerModal] = useState(false)
  const [dupTarget, setDupTarget] = useState({ classeId: '', anneeId: '' })

  // Deletes
  const [deleteSeqTarget, setDeleteSeqTarget] = useState(null)
  const [deleteSeanceTarget, setDeleteSeanceTarget] = useState(null)
  const [showClearCalConfirm, setShowClearCalConfirm] = useState(false)

  // Import Excel
  const importRef = useRef()
  const [importData, setImportData] = useState(null)   // séquences parsées
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [showImportConflict, setShowImportConflict] = useState(false)

  const sequences = ruban?.sequences || []

  // ── Séquences CRUD
  function openCreateSeq() {
    setEditSeq(null)
    setSeqForm({ titre: '', objectifs: '', competences: '', documentSupport: null, seances: [] })
    setModalSeanceEdit(null)
    setShowSeqModal(true)
  }
  function openEditSeq(seq) {
    setEditSeq(seq)
    setSeqForm({
      titre: seq.titre,
      objectifs: seq.objectifs || '',
      competences: seq.competences || '',
      documentSupport: seq.documentSupport || null,
      seances: (seq.seances || []).map(s => ({ ...s })),
    })
    setModalSeanceEdit(null)
    setShowSeqModal(true)
  }
  function saveSeq() {
    if (!seqForm.titre.trim()) return
    const rb = getOrCreateRuban()
    const seqs = [...(rb.sequences || [])]
    const seancesWithIds = seqForm.seances.map(s => s.id ? s : { id: genId('s'), ...s })
    if (editSeq) {
      const idx = seqs.findIndex(s => s.id === editSeq.id)
      if (idx >= 0) seqs[idx] = { ...seqs[idx], ...seqForm, seances: seancesWithIds }
    } else {
      seqs.push({ id: genId('seq'), ...seqForm, seances: seancesWithIds })
    }
    update('rubanPedagogique', rb.id, { sequences: seqs })
    setShowSeqModal(false)
    setModalSeanceEdit(null)
    toast.success(editSeq ? 'Séquence mise à jour.' : 'Séquence créée.')
  }

  // ── Séances dans la modal séquence
  function startModalAddSeance() {
    setModalSeanceEdit({ idx: null, titre: '', type: 'Cours', objectif: '', duree: 1 })
  }
  function startModalEditSeance(idx) {
    const s = seqForm.seances[idx]
    setModalSeanceEdit({ idx, titre: s.titre, type: s.type, objectif: s.objectif || '', duree: s.duree ?? 1 })
  }
  function saveModalSeance() {
    if (!modalSeanceEdit || !modalSeanceEdit.titre.trim()) return
    const duree = parseFloat(modalSeanceEdit.duree)
    if (!duree || duree <= 0) return
    const data = { titre: modalSeanceEdit.titre, type: modalSeanceEdit.type, objectif: modalSeanceEdit.objectif, duree }
    setSeqForm(f => {
      const seances = [...f.seances]
      if (modalSeanceEdit.idx === null) {
        seances.push(data)
      } else {
        seances[modalSeanceEdit.idx] = { ...seances[modalSeanceEdit.idx], ...data }
      }
      return { ...f, seances }
    })
    setModalSeanceEdit(null)
  }
  function deleteModalSeance(idx) {
    setSeqForm(f => ({ ...f, seances: f.seances.filter((_, i) => i !== idx) }))
  }
  function deleteSeq(seqId) {
    if (!ruban) return
    const seq = sequences.find(s => s.id === seqId)
    const seanceIds = (seq?.seances || []).map(s => s.id)
    // Cascade: supprimer tous les événements calendrier de cette séquence
    get('seancesCalendrier')
      .filter(sc => sc.classeId === classe.id && sc.anneeScolaireId === anneeId && seanceIds.includes(sc.seanceRubanId))
      .forEach(sc => remove('seancesCalendrier', sc.id))
    const seqs = sequences.filter(s => s.id !== seqId)
    update('rubanPedagogique', ruban.id, { sequences: seqs })
    toast.info('Séquence et ses événements calendrier supprimés.')
  }

  // ── Séances CRUD (inline)
  function startAddSeance(seqId) {
    setSeanceEdit({ seqId, seanceId: null, titre: '', type: 'Cours', objectif: '', duree: 1 })
  }
  function startEditSeance(seqId, seance) {
    setSeanceEdit({ seqId, seanceId: seance.id, titre: seance.titre, type: seance.type, objectif: seance.objectif || '', duree: seance.duree ?? 1 })
  }
  function cancelSeance() {
    setSeanceEdit(null)
  }
  function saveSeance() {
    if (!seanceEdit) return
    if (!seanceEdit.titre.trim()) return
    const dureeVal = parseFloat(seanceEdit.duree)
    if (!dureeVal || dureeVal <= 0) return
    const rb = ruban || getOrCreateRuban()
    const seqs = [...(rb.sequences || [])]
    const seqIdx = seqs.findIndex(s => s.id === seanceEdit.seqId)
    if (seqIdx < 0) return
    const seances = [...(seqs[seqIdx].seances || [])]
    const data = { titre: seanceEdit.titre, type: seanceEdit.type, objectif: seanceEdit.objectif, duree: dureeVal }
    if (seanceEdit.seanceId) {
      const idx = seances.findIndex(s => s.id === seanceEdit.seanceId)
      if (idx >= 0) seances[idx] = { ...seances[idx], ...data }
    } else {
      seances.push({ id: genId('s'), ...data })
    }
    seqs[seqIdx] = { ...seqs[seqIdx], seances }
    update('rubanPedagogique', rb.id, { sequences: seqs })
    setSeanceEdit(null)
    toast.success(seanceEdit.seanceId ? 'Séance mise à jour.' : 'Séance ajoutée.')
  }
  function deleteSeance(seqId, seanceId) {
    if (!ruban) return
    // Cascade: supprimer les événements calendrier de cette séance
    get('seancesCalendrier')
      .filter(sc => sc.classeId === classe.id && sc.anneeScolaireId === anneeId && sc.seanceRubanId === seanceId)
      .forEach(sc => remove('seancesCalendrier', sc.id))
    const seqs = (ruban.sequences || []).map(seq => {
      if (seq.id !== seqId) return seq
      return { ...seq, seances: (seq.seances || []).filter(s => s.id !== seanceId) }
    })
    update('rubanPedagogique', ruban.id, { sequences: seqs })
    toast.info('Séance et ses événements calendrier supprimés.')
  }

  // ── Effacer tout le calendrier de cette classe
  function clearCalendar() {
    const allCal = get('seancesCalendrier')
    const remaining = allCal.filter(sc => !(sc.classeId === classe.id && sc.anneeScolaireId === anneeId))
    set('seancesCalendrier', remaining)
    setShowClearCalConfirm(false)
    toast.success('Calendrier effacé pour cette classe.')
  }

  // ── Helpers temps
  function parseTimeToMinutes(timeStr) {
    const [h, m] = (timeStr || '00:00').split(':').map(Number)
    return h * 60 + m
  }
  function minutesToTimeStr(totalMinutes) {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // ── Déploiement sur calendrier
  function openDeployModal() {
    if (!ruban) return
    const seanceRubanIds = sequences.flatMap(seq => (seq.seances || []).map(s => s.id))
    const existing = get('seancesCalendrier').filter(
      sc => sc.classeId === classe.id &&
            sc.anneeScolaireId === anneeId &&
            seanceRubanIds.includes(sc.seanceRubanId)
    )
    if (existing.length > 0) {
      setShowDeployConfirm(true)
    } else {
      setShowDeployModal(true)
    }
  }

  function deployerSurCalendrier() {
    if (!ruban || !anneeId) return

    const periodes = get('emploiDuTemps').filter(p => p.anneeScolaireId === anneeId)
    const vacancesList = get('vacances').filter(v => v.anneeScolaireId === anneeId)

    if (periodes.length === 0) {
      toast.error("Aucune période configurée dans l'emploi du temps.")
      return
    }
    const hasCreneaux = periodes.some(p =>
      (p.creneaux || []).some(c => c.classeId === classe.id)
    )
    if (!hasCreneaux) {
      toast.error("Aucun créneau configuré pour cette classe dans l'emploi du temps.")
      return
    }

    const toutesSeances = sequences.flatMap(seq =>
      (seq.seances || []).map(s => ({ ...s, sequenceId: seq.id }))
    )
    if (toutesSeances.length === 0) {
      toast.warning('Aucune séance dans le ruban.')
      return
    }

    const missingDuree = toutesSeances.filter(s => !s.duree || parseFloat(s.duree) <= 0)
    if (missingDuree.length > 0) {
      toast.error(`${missingDuree.length} séance(s) sans durée. Veuillez renseigner la durée de chaque séance.`)
      setShowDeployModal(false)
      setShowDeployConfirm(false)
      return
    }

    // Construire la liste chronologique des créneaux avec leur durée en heures
    const JOUR_MAP = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 }
    const occurrences = []
    const periodesTriees = [...periodes].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))

    for (const periode of periodesTriees) {
      const creneaux = (periode.creneaux || []).filter(c => c.classeId === classe.id)
      if (creneaux.length === 0) continue

      let current = parseISO(periode.dateDebut)
      const fin = parseISO(periode.dateFin)

      while (current.getTime() <= fin.getTime()) {
        const dayOfWeek = current.getDay()
        const dayCreneaux = creneaux
          .filter(cr => JOUR_MAP[cr.jour] === dayOfWeek)
          .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut))

        for (const cr of dayCreneaux) {
          if (!isInVacances(current, vacancesList)) {
            const durationH = (parseTimeToMinutes(cr.heureFin) - parseTimeToMinutes(cr.heureDebut)) / 60
            if (durationH > 0) {
              occurrences.push({
                date: toISODate(current),
                heureDebut: cr.heureDebut,
                heureFin: cr.heureFin,
                durationH,
              })
            }
          }
        }
        current = addDays(current, 1)
      }
    }

    if (occurrences.length === 0) {
      toast.error("Aucun créneau disponible (vérifiez les périodes et les vacances).")
      return
    }

    // Supprimer les séances déjà déployées
    const seanceRubanIds = toutesSeances.map(s => s.id)
    const allExisting = get('seancesCalendrier').filter(
      sc => sc.classeId === classe.id && sc.anneeScolaireId === anneeId
    )
    allExisting
      .filter(sc => seanceRubanIds.includes(sc.seanceRubanId))
      .forEach(sc => remove('seancesCalendrier', sc.id))

    // Remplir les créneaux avec les séances en tenant compte des durées
    const newEvents = []
    let slotIdx = 0
    let slotRemaining = occurrences[0]?.durationH || 0

    for (const s of toutesSeances) {
      let seanceRemaining = parseFloat(s.duree) || 1

      while (seanceRemaining > 0.001 && slotIdx < occurrences.length) {
        const occ = occurrences[slotIdx]
        const slotUsedH = occ.durationH - slotRemaining
        const startMin = parseTimeToMinutes(occ.heureDebut) + Math.round(slotUsedH * 60)
        const allocated = Math.min(seanceRemaining, slotRemaining)
        const endMin = startMin + Math.round(allocated * 60)

        newEvents.push({
          id: genId('sc'),
          anneeScolaireId: anneeId,
          seanceRubanId: s.id,
          sequenceId: s.sequenceId,
          classeId: classe.id,
          titre: s.titre,
          type: s.type,
          date: occ.date,
          heureDebut: minutesToTimeStr(startMin),
          heureFin: minutesToTimeStr(endMin),
          statut: 'à faire',
          documents: [],
        })

        seanceRemaining -= allocated
        slotRemaining -= allocated

        if (slotRemaining < 0.001) {
          slotIdx++
          slotRemaining = slotIdx < occurrences.length ? occurrences[slotIdx].durationH : 0
        }
      }
    }

    newEvents.forEach(ev => add('seancesCalendrier', ev))

    setShowDeployModal(false)
    setShowDeployConfirm(false)

    const seancesDéployées = new Set(newEvents.map(e => e.seanceRubanId)).size
    if (newEvents.length > 0) {
      const dates = newEvents.map(e => e.date).sort()
      const debut = formatDate(dates[0])
      const fin = formatDate(dates[dates.length - 1])
      if (seancesDéployées < toutesSeances.length) {
        toast.warning(`${seancesDéployées}/${toutesSeances.length} séances déployées du ${debut} au ${fin} (créneaux insuffisants).`)
      } else {
        toast.success(`${seancesDéployées} séances déployées du ${debut} au ${fin} ✓`)
      }
    }
  }

  // ── Duplication du ruban
  function openDupliquerModal() {
    const classList = classes()
    const anneeList = anneesScolaires()
    setDupTarget({
      classeId: classList.find(c => c.id !== classe.id)?.id || classList[0]?.id || '',
      anneeId: anneeList[0]?.id || anneeId,
    })
    setShowDupliquerModal(true)
  }

  function dupliquerRuban() {
    if (!ruban || !dupTarget.classeId || !dupTarget.anneeId) {
      toast.error('Sélectionnez une classe et une année cible.')
      return
    }

    // Vérifier si un ruban existe déjà pour cette cible
    const existing = get('rubanPedagogique').find(
      r => r.classeId === dupTarget.classeId &&
           r.anneeScolaireId === dupTarget.anneeId &&
           r.matiereId === ruban.matiereId
    )

    // Copier les séquences avec de nouveaux IDs (sans documents PDF ni dates)
    const nouvellesSequences = sequences.map(seq => ({
      id: genId('seq'),
      titre: seq.titre,
      objectifs: seq.objectifs || '',
      competences: seq.competences || '',
      documentSupport: null, // Ne pas copier les PDFs
      seances: (seq.seances || []).map(s => ({
        id: genId('s'),
        titre: s.titre,
        type: s.type,
        objectif: s.objectif || '',
        duree: s.duree ?? 1,
      })),
    }))

    if (existing) {
      // Remplacer les séquences du ruban existant
      update('rubanPedagogique', existing.id, { sequences: nouvellesSequences })
    } else {
      add('rubanPedagogique', {
        id: genId('rb'),
        anneeScolaireId: dupTarget.anneeId,
        classeId: dupTarget.classeId,
        matiereId: ruban.matiereId,
        sequences: nouvellesSequences,
      })
    }

    const classeNom = classes().find(c => c.id === dupTarget.classeId)?.nom || '?'
    const anneeLabel = anneesScolaires().find(a => a.id === dupTarget.anneeId)?.label || '?'
    setShowDupliquerModal(false)
    toast.success(`Ruban dupliqué vers ${classeNom} — ${anneeLabel}.`)
  }

  // ── Télécharger le modèle Excel
  function downloadTemplate() {
    // ── Feuille 1 : Ruban pédagogique
    const headers = ['N° Séquence', 'Titre de la séquence', 'Titre de la séance', 'Type de séance (Cours / TD / Exercices / Évaluation)', 'Durée (heures)', 'Objectif de la séance']
    const examples = [
      [1, 'Les magasins', 'Introduction aux commerces', 'Cours', 1, 'Identifier les commerces'],
      [1, '', 'Étude de cas', 'TD / Exercices', 1.5, 'Analyser un cas réel'],
      [1, '', 'Évaluation séquence 1', 'Évaluation', 1, 'Contrôler les acquis'],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet([headers, ...examples])

    // Largeurs de colonnes
    ws1['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 32 }, { wch: 42 }, { wch: 16 }, { wch: 36 }]

    // ── Feuille 2 : Instructions
    const instructions = [
      ['INSTRUCTIONS DE REMPLISSAGE', ''],
      ['', ''],
      ['Colonne', 'Description'],
      ['A — N° Séquence', 'Numéro entier de la séquence (ex : 1, 2, 3…). Répéter le même numéro pour chaque séance de la séquence.'],
      ['B — Titre de la séquence', 'Renseigner uniquement sur la première ligne de la séquence. Laisser vide pour les lignes suivantes.'],
      ['C — Titre de la séance', 'Titre de chaque séance. Obligatoire.'],
      ['D — Type de séance', 'Valeur exacte parmi : Cours, TD / Exercices, Évaluation'],
      ['E — Durée (heures)', 'Durée en heures (ex : 1, 1.5, 2). Utiliser le point comme séparateur décimal.'],
      ['F — Objectif de la séance', 'Objectif pédagogique de la séance. Optionnel.'],
      ['', ''],
      ['RÈGLES IMPORTANTES', ''],
      ['', 'Ne pas modifier les en-têtes de la feuille "Ruban pédagogique".'],
      ['', 'Supprimer les lignes d\'exemple avant d\'importer.'],
      ['', 'Les lignes vides (sans titre de séance) sont automatiquement ignorées.'],
      ['', 'La ligne d\'en-tête est automatiquement détectée et ignorée à l\'import.'],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(instructions)
    ws2['!cols'] = [{ wch: 28 }, { wch: 72 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws1, 'Ruban pédagogique')
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions')
    XLSX.writeFile(wb, 'MCCV_Modele_Ruban.xlsx')
  }

  // ── Import Excel / CSV
  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Ignorer la ligne d'en-tête si la colonne A n'est pas un nombre
      const dataRows = rows.filter((row, idx) => {
        if (idx === 0 && isNaN(Number(row[0])) && String(row[0]).trim() !== '') return false
        const seanceTitre = String(row[2] || '').trim()
        return seanceTitre !== ''
      })

      if (dataRows.length === 0) {
        toast.error('Aucune séance trouvée dans le fichier. Vérifiez le format.')
        return
      }

      // Grouper par numéro de séquence (colonne A)
      const seqMap = new Map()
      for (const row of dataRows) {
        const seqNum = Number(row[0])
        if (!seqNum || isNaN(seqNum)) continue
        const seqTitre = String(row[1] || '').trim()
        const seanceTitre = String(row[2] || '').trim()
        const typeRaw = String(row[3] || '').trim()
        const duree = parseFloat(row[4]) || 1
        const objectif = String(row[5] || '').trim()

        // Normaliser le type
        const typeLow = typeRaw.toLowerCase()
        let type = 'Cours'
        if (typeLow.includes('td') || typeLow.includes('exercice')) type = 'TD / Exercices'
        else if (typeLow.includes('eval') || typeLow.includes('éval')) type = 'Évaluation'
        else if (TYPES_SEANCE.includes(typeRaw)) type = typeRaw

        if (!seqMap.has(seqNum)) {
          seqMap.set(seqNum, { titre: seqTitre || `Séquence ${seqNum}`, seances: [] })
        } else if (seqTitre && !seqMap.get(seqNum).titre) {
          seqMap.get(seqNum).titre = seqTitre
        }

        if (seanceTitre) {
          seqMap.get(seqNum).seances.push({ titre: seanceTitre, type, duree, objectif })
        }
      }

      const parsed = Array.from(seqMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, seq]) => seq)
        .filter(seq => seq.seances.length > 0)

      if (parsed.length === 0) {
        toast.error('Aucune séquence valide trouvée. Vérifiez le format du fichier.')
        return
      }

      setImportData(parsed)
      setShowImportPreview(true)
    } catch {
      toast.error('Impossible de lire le fichier. Vérifiez qu\'il s\'agit d\'un fichier Excel (.xlsx) ou CSV valide.')
    }
  }

  function handleConfirmImport() {
    if (!importData) return
    if (ruban && (ruban.sequences || []).length > 0) {
      setShowImportPreview(false)
      setShowImportConflict(true)
    } else {
      doImport('replace')
    }
  }

  function doImport(mode) {
    if (!importData) return
    const rb = getOrCreateRuban()
    const newSeqs = importData.map(seq => ({
      id: genId('seq'),
      titre: seq.titre,
      objectifs: '',
      competences: '',
      documentSupport: null,
      seances: seq.seances.map(s => ({ id: genId('s'), ...s })),
    }))
    const base = mode === 'add' ? (ruban?.sequences || []) : []
    update('rubanPedagogique', rb.id, { sequences: [...base, ...newSeqs] })
    setShowImportPreview(false)
    setShowImportConflict(false)
    setImportData(null)
    toast.success(`${newSeqs.length} séquence(s) importée(s) avec succès.`)
  }

  function toggleSeq(id) {
    setExpandedSeq(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const typeColor = (type) => {
    if (type === 'Cours') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    if (type === 'TD / Exercices') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  }

  const totalSeances = sequences.reduce((acc, s) => acc + (s.seances?.length || 0), 0)
  const totalHeures = sequences.reduce(
    (acc, seq) => acc + (seq.seances || []).reduce((a, s) => a + (parseFloat(s.duree) || 1), 0),
    0
  )

  const allClasses = classes()
  const allAnnees = anneesScolaires()
  const deployedCount = get('seancesCalendrier').filter(sc => sc.classeId === classe.id && sc.anneeScolaireId === anneeId).length

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sequences.length} séquence(s) · {totalSeances} séance(s) · {totalHeures}h
          {currentMatiere && (
            <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">— {currentMatiere.nom}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {ruban && sequences.length > 0 && (
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 btn-secondary text-sm py-2 no-print"
              >
                <Printer size={14} /> Imprimer le ruban
              </button>
              <button
                onClick={openDupliquerModal}
                className="flex items-center gap-2 btn-secondary text-sm py-2 no-print"
              >
                <Copy size={14} /> Dupliquer ce ruban
              </button>
            </>
          )}
          {deployedCount > 0 && (
            <button
              onClick={() => setShowClearCalConfirm(true)}
              className="flex items-center gap-2 btn-secondary text-sm py-2 no-print text-red-500 hover:text-red-600"
            >
              <CalendarX size={14} /> Effacer le calendrier ({deployedCount})
            </button>
          )}
          <button
            onClick={openDeployModal}
            className="flex items-center gap-2 btn-secondary text-sm py-2 no-print"
            disabled={totalSeances === 0}
          >
            <Rocket size={14} /> Déployer sur le calendrier
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 btn-secondary text-sm py-2 no-print"
          >
            <Download size={14} /> Modèle Excel
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-2 btn-secondary text-sm py-2 no-print"
          >
            <FileSpreadsheet size={14} /> Importer un ruban
          </button>
          <button onClick={openCreateSeq} className="btn-primary flex items-center gap-2 text-sm py-2 no-print">
            <Plus size={14} /> Nouvelle séquence
          </button>
        </div>
      </div>

      {sequences.length === 0 && (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-gray-400 mb-4">Aucune séquence. Commencez par créer votre première séquence.</p>
          <button onClick={openCreateSeq} className="btn-primary inline-flex items-center gap-2">
            <Plus size={14} /> Créer une séquence
          </button>
        </div>
      )}

      {/* Liste séquences */}
      <div className="space-y-4">
        {sequences.map((seq, seqIdx) => {
          const seqHeures = (seq.seances || []).reduce((a, s) => a + (parseFloat(s.duree) || 1), 0)
          const isEditingInThisSeq = seanceEdit?.seqId === seq.id
          return (
            <div key={seq.id} className="card overflow-hidden">

              {/* ── En-tête séquence ── */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center
                  text-blue-700 dark:text-blue-300 font-bold text-sm shrink-0">
                  {seqIdx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">{seq.titre}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{seq.seances?.length || 0} séance(s) · <span className="text-blue-500 font-medium">{seqHeures}h</span></p>
                </div>
                <button
                  onClick={() => toggleSeq(seq.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600"
                  title="Voir les détails de la séquence"
                >
                  {expandedSeq[seq.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button onClick={() => openEditSeq(seq)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => setDeleteSeqTarget(seq)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* ── Détails séquence (collapsible) ── */}
              {expandedSeq[seq.id] && (seq.objectifs || seq.competences || seq.documentSupport) && (
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-white dark:bg-gray-800">
                  {seq.objectifs && (
                    <div>
                      <p className="font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide mb-1">Objectifs</p>
                      <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{seq.objectifs}</p>
                    </div>
                  )}
                  {seq.competences && (
                    <div>
                      <p className="font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide mb-1">Compétences</p>
                      <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{seq.competences}</p>
                    </div>
                  )}
                  {seq.documentSupport && (
                    <div className="md:col-span-2">
                      <a href={seq.documentSupport.data} download={seq.documentSupport.name}
                        className="text-blue-500 hover:underline flex items-center gap-1 text-xs">
                        📎 {seq.documentSupport.name}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* ── Séances (toujours visibles) ── */}
              <div className="p-4 space-y-2">

                {/* Lignes séances existantes */}
                {(seq.seances || []).map((s, si) => {
                  const isEditingThis = isEditingInThisSeq && seanceEdit.seanceId === s.id
                  if (isEditingThis) {
                    return (
                      <SeanceForm
                        key={s.id}
                        value={seanceEdit}
                        onChange={patch => setSeanceEdit(prev => ({ ...prev, ...patch }))}
                        onSave={saveSeance}
                        onCancel={cancelSeance}
                      />
                    )
                  }
                  return (
                    <div key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 group">
                      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{si + 1}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${typeColor(s.type)}`}>
                        {s.type}
                      </span>
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{s.titre}</span>
                      {s.objectif && (
                        <span className="text-xs text-gray-400 truncate max-w-[140px] hidden lg:block">{s.objectif}</span>
                      )}
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        {parseFloat(s.duree) || 1}h
                      </span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => startEditSeance(seq.id, s)}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-blue-500">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => setDeleteSeanceTarget({ seqId: seq.id, seance: s })}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Formulaire inline d'ajout */}
                {isEditingInThisSeq && !seanceEdit.seanceId && (
                  <SeanceForm
                    value={seanceEdit}
                    onChange={patch => setSeanceEdit(prev => ({ ...prev, ...patch }))}
                    onSave={saveSeance}
                    onCancel={cancelSeance}
                  />
                )}

                {/* Bouton Ajouter une séance */}
                {!isEditingInThisSeq && (
                  <button
                    onClick={() => startAddSeance(seq.id)}
                    className="w-full mt-1 py-2 border-2 border-dashed border-gray-200 dark:border-gray-600
                      rounded-lg text-sm text-gray-400 hover:text-blue-500 hover:border-blue-300
                      dark:hover:border-blue-500 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> Ajouter une séance
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Total général */}
      {sequences.length > 0 && (
        <div className="flex justify-end no-print">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/40 px-4 py-2 rounded-lg">
            Total : {totalSeances} séance(s) — <span className="text-blue-600 dark:text-blue-400">{totalHeures}h</span>
          </p>
        </div>
      )}

      {/* ── IMPRESSION UNIQUEMENT ── */}
      <div className="print-only">
        {/* En-tête */}
        <div className="mb-6 pb-4 border-b-2">
          <h1 className="text-xl font-bold">
            {params?.enseignant || user?.nom || ''}
            {params?.etablissement ? ` — ${params.etablissement}` : ''}
          </h1>
          <p className="text-sm text-gray-500">
            {anneesScolaires().find(a => a.id === anneeId)?.label || ''} · {classe.nom}
            {currentMatiere ? ` · ${currentMatiere.nom}` : ''}
          </p>
          <h2 className="text-lg font-semibold mt-3">Ruban pédagogique</h2>
        </div>

        {/* Séquences */}
        {sequences.map((seq, seqIdx) => {
          const seqH = (seq.seances || []).reduce((a, s) => a + (parseFloat(s.duree) || 1), 0)
          return (
            <div key={seq.id} className="mb-6 break-inside-avoid">
              <div className="flex items-baseline gap-3 mb-2 pb-1 border-b">
                <span className="font-bold text-base">Séquence {seqIdx + 1} — {seq.titre}</span>
                <span className="text-sm text-gray-500">{seq.seances?.length || 0} séance(s) · {seqH}h</span>
              </div>
              {seq.objectifs && (
                <p className="text-sm text-gray-600 mb-2"><strong>Objectifs :</strong> {seq.objectifs}</p>
              )}
              {seq.competences && (
                <p className="text-sm text-gray-600 mb-2"><strong>Compétences :</strong> {seq.competences}</p>
              )}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 font-semibold w-6">#</th>
                    <th className="text-left py-1 font-semibold">Titre</th>
                    <th className="text-left py-1 font-semibold w-28">Type</th>
                    <th className="text-left py-1 font-semibold w-16">Durée</th>
                    <th className="text-left py-1 font-semibold">Objectif</th>
                  </tr>
                </thead>
                <tbody>
                  {(seq.seances || []).map((s, si) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className="py-1 text-gray-400">{si + 1}</td>
                      <td className="py-1 font-medium">{s.titre}</td>
                      <td className="py-1 text-gray-600">{s.type}</td>
                      <td className="py-1 text-gray-600">{parseFloat(s.duree) || 1}h</td>
                      <td className="py-1 text-gray-500">{s.objectif || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* Total */}
        <div className="pt-3 border-t-2 text-sm font-semibold">
          Total : {totalSeances} séance(s) — {totalHeures}h
        </div>
      </div>

      {/* ── Modal séquence ── */}
      <Modal isOpen={showSeqModal} onClose={() => { setShowSeqModal(false); setModalSeanceEdit(null) }}
        title={editSeq ? 'Modifier la séquence' : 'Nouvelle séquence'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="label">Titre</label>
            <input className="input" placeholder="ex: Les mécanismes du marché" value={seqForm.titre}
              onChange={e => setSeqForm(f => ({ ...f, titre: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">Objectifs pédagogiques</label>
            <textarea className="input min-h-[80px] resize-y" placeholder="Décrire les objectifs..."
              value={seqForm.objectifs} onChange={e => setSeqForm(f => ({ ...f, objectifs: e.target.value }))} />
          </div>
          <div>
            <label className="label">Compétences visées</label>
            <textarea className="input min-h-[60px] resize-y" placeholder="C1, C2..."
              value={seqForm.competences} onChange={e => setSeqForm(f => ({ ...f, competences: e.target.value }))} />
          </div>
          <div>
            <label className="label">Document support (PDF)</label>
            <FileUpload
              value={seqForm.documentSupport}
              onChange={f => setSeqForm(prev => ({ ...prev, documentSupport: f }))}
            />
          </div>

          {/* ── Séances de la séquence ── */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="label mb-0 flex items-center gap-2">
                Séances
                {seqForm.seances.length > 0 && (
                  <span className="text-xs font-normal text-gray-400">
                    {seqForm.seances.length} séance(s) ·{' '}
                    <span className="text-blue-500 font-semibold">
                      {seqForm.seances.reduce((a, s) => a + (parseFloat(s.duree) || 0), 0)}h
                    </span>
                  </span>
                )}
              </span>
              {!modalSeanceEdit && (
                <button type="button" onClick={startModalAddSeance}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                  <Plus size={12} /> Ajouter une séance
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {seqForm.seances.length === 0 && !modalSeanceEdit && (
                <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg">
                  Aucune séance — ajoutez-en maintenant ou après avoir enregistré la séquence.
                </p>
              )}

              {seqForm.seances.map((s, idx) => {
                if (modalSeanceEdit?.idx === idx) {
                  return (
                    <SeanceForm
                      key={idx}
                      value={modalSeanceEdit}
                      onChange={patch => setModalSeanceEdit(prev => ({ ...prev, ...patch }))}
                      onSave={saveModalSeance}
                      onCancel={() => setModalSeanceEdit(null)}
                    />
                  )
                }
                return (
                  <div key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 group text-sm">
                    <span className="text-xs text-gray-400 w-4 text-right shrink-0">{idx + 1}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${typeColor(s.type)}`}>
                      {s.type}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-100">{s.titre}</span>
                    {s.objectif && (
                      <span className="text-xs text-gray-400 truncate max-w-[120px] hidden sm:block">{s.objectif}</span>
                    )}
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                      {parseFloat(s.duree) || 1}h
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button type="button" onClick={() => startModalEditSeance(idx)}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-blue-500">
                        <Edit2 size={11} />
                      </button>
                      <button type="button" onClick={() => deleteModalSeance(idx)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {modalSeanceEdit?.idx === null && (
                <SeanceForm
                  value={modalSeanceEdit}
                  onChange={patch => setModalSeanceEdit(prev => ({ ...prev, ...patch }))}
                  onSave={saveModalSeance}
                  onCancel={() => setModalSeanceEdit(null)}
                />
              )}

              {!modalSeanceEdit && seqForm.seances.length > 0 && (
                <button type="button" onClick={startModalAddSeance}
                  className="w-full py-1.5 border-2 border-dashed border-gray-200 dark:border-gray-600
                    rounded-lg text-xs text-gray-400 hover:text-blue-500 hover:border-blue-300
                    dark:hover:border-blue-500 transition-colors flex items-center justify-center gap-1.5 mt-1">
                  <Plus size={13} /> Ajouter une séance
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1 border-t border-gray-100 dark:border-gray-700">
            <button className="btn-secondary" onClick={() => { setShowSeqModal(false); setModalSeanceEdit(null) }}>Annuler</button>
            <button className="btn-primary" onClick={saveSeq}>Enregistrer</button>
          </div>
        </div>
      </Modal>

      {/* ── Modal déploiement (premier déploiement) ── */}
      <Modal isOpen={showDeployModal} onClose={() => setShowDeployModal(false)}
        title="Déployer sur le calendrier" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Cette action va placer les <strong>{totalSeances}</strong> séance(s) ({totalHeures}h) du ruban sur les
            créneaux de l'emploi du temps, en sautant automatiquement les vacances scolaires.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              ℹ️ Si une séance dépasse la durée d'un créneau, elle sera répartie sur les créneaux suivants.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowDeployModal(false)}>Annuler</button>
            <button className="btn-primary flex items-center gap-2" onClick={deployerSurCalendrier}>
              <Rocket size={14} /> Déployer
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Confirmation remplacement déploiement ── */}
      <ConfirmDialog
        isOpen={showDeployConfirm}
        onClose={() => setShowDeployConfirm(false)}
        onConfirm={deployerSurCalendrier}
        title="Remplacer le déploiement"
        message="Un déploiement existe déjà. Voulez-vous le remplacer ?"
        confirmLabel="Oui, remplacer"
        danger
      />

      {/* ── Modal duplication ── */}
      <Modal isOpen={showDupliquerModal} onClose={() => setShowDupliquerModal(false)}
        title="Dupliquer ce ruban" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Copie les séquences et séances (sans les PDF ni les dates) vers une autre classe ou année.
          </p>
          <div>
            <label className="label">Classe cible</label>
            <select className="input" value={dupTarget.classeId}
              onChange={e => setDupTarget(t => ({ ...t, classeId: e.target.value }))}>
              {allClasses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nom}{c.id === classe.id ? ' (actuelle)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Année scolaire cible</label>
            <select className="input" value={dupTarget.anneeId}
              onChange={e => setDupTarget(t => ({ ...t, anneeId: e.target.value }))}>
              {allAnnees.map(a => (
                <option key={a.id} value={a.id}>
                  {a.label}{a.id === anneeId ? ' (actuelle)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Si un ruban existe déjà pour cette cible, ses séquences seront remplacées.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowDupliquerModal(false)}>Annuler</button>
            <button className="btn-primary flex items-center gap-2" onClick={dupliquerRuban}>
              <Copy size={14} /> Dupliquer
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Confirms ── */}
      {(() => {
        const seqSeanceIds = (deleteSeqTarget?.seances || []).map(s => s.id)
        const seqCalCount = seqSeanceIds.length > 0
          ? get('seancesCalendrier').filter(sc =>
              sc.classeId === classe.id && sc.anneeScolaireId === anneeId && seqSeanceIds.includes(sc.seanceRubanId)
            ).length
          : 0
        return (
          <ConfirmDialog isOpen={!!deleteSeqTarget} onClose={() => setDeleteSeqTarget(null)}
            onConfirm={() => deleteSeq(deleteSeqTarget.id)}
            title="Supprimer la séquence"
            message={
              seqCalCount > 0
                ? `Supprimer "${deleteSeqTarget?.titre}" supprimera également ses ${seqCalCount} événement(s) dans le calendrier. Confirmer ?`
                : `Supprimer "${deleteSeqTarget?.titre}" et toutes ses séances ?`
            }
            confirmLabel="Oui, supprimer" danger />
        )
      })()}

      {(() => {
        const seanceCalCount = deleteSeanceTarget
          ? get('seancesCalendrier').filter(sc =>
              sc.classeId === classe.id && sc.anneeScolaireId === anneeId && sc.seanceRubanId === deleteSeanceTarget.seance.id
            ).length
          : 0
        return (
          <ConfirmDialog isOpen={!!deleteSeanceTarget} onClose={() => setDeleteSeanceTarget(null)}
            onConfirm={() => deleteSeance(deleteSeanceTarget.seqId, deleteSeanceTarget.seance.id)}
            title="Supprimer la séance"
            message={
              seanceCalCount > 0
                ? `Supprimer "${deleteSeanceTarget?.seance?.titre}" supprimera également ses ${seanceCalCount} événement(s) dans le calendrier. Confirmer ?`
                : `Supprimer "${deleteSeanceTarget?.seance?.titre}" ?`
            }
            confirmLabel="Oui, supprimer" danger />
        )
      })()}

      <ConfirmDialog
        isOpen={showClearCalConfirm}
        onClose={() => setShowClearCalConfirm(false)}
        onConfirm={clearCalendar}
        title="Effacer le calendrier"
        message={`Supprimer les ${deployedCount} événement(s) du calendrier pour cette classe ? Le ruban pédagogique ne sera pas modifié.`}
        confirmLabel="Oui, effacer"
        danger
      />

      {/* ── Input fichier caché (import) ── */}
      <input
        ref={importRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* ── Modal aperçu import ── */}
      {importData && (
        <Modal isOpen={showImportPreview} onClose={() => { setShowImportPreview(false); setImportData(null) }}
          title="Aperçu de l'import" size="lg">
          {(() => {
            const totalS = importData.reduce((a, s) => a + s.seances.length, 0)
            const totalH = importData.reduce((a, s) => a + s.seances.reduce((b, sc) => b + (parseFloat(sc.duree) || 1), 0), 0)
            return (
              <div className="space-y-4">
                <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-4 py-2.5">
                  <span><strong className="text-gray-800 dark:text-gray-100">{importData.length}</strong> séquence(s)</span>
                  <span><strong className="text-gray-800 dark:text-gray-100">{totalS}</strong> séance(s)</span>
                  <span><strong className="text-blue-600 dark:text-blue-400">{totalH}h</strong> au total</span>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                  {importData.map((seq, si) => {
                    const seqH = seq.seances.reduce((a, s) => a + (parseFloat(s.duree) || 1), 0)
                    return (
                      <div key={si} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50">
                          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-xs shrink-0">
                            {si + 1}
                          </div>
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1">{seq.titre}</span>
                          <span className="text-xs text-gray-400">{seq.seances.length} séance(s) · <span className="text-blue-500 font-medium">{seqH}h</span></span>
                        </div>
                        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {seq.seances.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-3 px-4 py-2 text-sm">
                              <span className="text-xs text-gray-400 w-4 text-right shrink-0">{idx + 1}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${typeColor(s.type)}`}>{s.type}</span>
                              <span className="flex-1 text-gray-800 dark:text-gray-100 truncate">{s.titre}</span>
                              {s.objectif && <span className="text-xs text-gray-400 truncate max-w-[160px] hidden sm:block">{s.objectif}</span>}
                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">{parseFloat(s.duree) || 1}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                  <button className="btn-secondary" onClick={() => { setShowImportPreview(false); setImportData(null) }}>
                    Annuler
                  </button>
                  <button className="btn-primary flex items-center gap-2" onClick={handleConfirmImport}>
                    <FileSpreadsheet size={14} /> Confirmer l'import
                  </button>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}

      {/* ── Modal conflit import (ruban existant) ── */}
      <Modal isOpen={showImportConflict} onClose={() => setShowImportConflict(false)}
        title="Ruban existant" size="sm">
        <p className="text-gray-600 dark:text-gray-300 mb-2">
          Un ruban existe déjà pour cette classe avec <strong>{sequences.length}</strong> séquence(s).
        </p>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Voulez-vous <strong>remplacer</strong> le ruban existant ou <strong>ajouter</strong> les nouvelles séquences à la suite ?
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setShowImportConflict(false)}>Annuler</button>
          <button className="btn-secondary" onClick={() => doImport('add')}>
            Ajouter à la suite
          </button>
          <button className="btn-danger" onClick={() => doImport('replace')}>
            Remplacer
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ── Formulaire inline séance ──────────────────────────────────────────────────
function SeanceForm({ value, onChange, onSave, onCancel }) {
  return (
    <div className="rounded-xl border-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
      {/* Titre */}
      <input
        className="input text-sm"
        placeholder="Titre de la séance *"
        value={value.titre}
        onChange={e => onChange({ titre: e.target.value })}
        autoFocus
      />

      {/* Type */}
      <div className="flex gap-2">
        {TYPES_SEANCE.map(t => (
          <button key={t} type="button"
            onClick={() => onChange({ type: t })}
            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors
              ${value.type === t
                ? 'border-blue-500 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300 bg-white dark:bg-gray-800'
              }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Objectif */}
        <input
          className="input text-sm"
          placeholder="Objectif court"
          value={value.objectif}
          onChange={e => onChange({ objectif: e.target.value })}
        />

        {/* Durée */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 shrink-0">Durée :</span>
          <div className="flex gap-1 flex-1">
            {[1, 1.5, 2, 3].map(h => (
              <button key={h} type="button"
                onClick={() => onChange({ duree: h })}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors
                  ${value.duree === h
                    ? 'border-blue-500 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300 bg-white dark:bg-gray-800'
                  }`}>
                {h}h
              </button>
            ))}
            <input
              type="number" min="0.5" step="0.5"
              className="input w-16 text-center text-xs px-1"
              placeholder="…"
              value={[1, 1.5, 2, 3].includes(value.duree) ? '' : (value.duree || '')}
              onChange={e => onChange({ duree: parseFloat(e.target.value) || '' })}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-secondary text-xs py-1.5 px-3" onClick={onCancel}>Annuler</button>
        <button
          className="btn-primary text-xs py-1.5 px-3"
          onClick={onSave}
          disabled={!value.titre.trim() || !value.duree || parseFloat(value.duree) <= 0}
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}
