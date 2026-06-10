import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import PptxGenJS from 'pptxgenjs'
import {
  Sparkles, BookOpen, Loader2, RefreshCw, Check, X,
  ChevronDown, ChevronRight, AlertTriangle, Download,
  FileSpreadsheet, FileText, Presentation, Copy, ClipboardCheck,
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { genId } from '../utils/id'
import AssistantIA from '../features/classe/AssistantIA'
import EvalGenerateur from '../features/generateur/EvalGenerateur'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const API_URL = import.meta.env.DEV
  ? '/api/anthropic/v1/messages'
  : 'https://api.anthropic.com/v1/messages'

const PALETTES = [
  { id: 'vert',    label: 'Vert Épicerie', primary: '#2D6A4F', accent: '#F4A261', light: '#74C69D', pale: '#D8F3DC' },
  { id: 'bleu',    label: 'Bleu Marine',   primary: '#1E2761', accent: '#F4A261', light: '#7B8CDE', pale: '#D9DCEF' },
  { id: 'terra',   label: 'Terracotta',    primary: '#B85042', accent: '#A7BEAE', light: '#E07A5F', pale: '#FAEBD7' },
  { id: 'charbon', label: 'Charbon',       primary: '#36454F', accent: '#E63946', light: '#6B7F87', pale: '#D4DDE0' },
  { id: 'teal',    label: 'Teal Ocean',    primary: '#028090', accent: '#F4A261', light: '#05C8E0', pale: '#C4EDF2' },
  { id: 'berry',   label: 'Berry',         primary: '#6D2E46', accent: '#F4A261', light: '#B5547A', pale: '#EDD4DF' },
]

const SLIDE_TYPE_LABEL = {
  titre: 'Titre',
  plan: 'Plan du cours',
  contenu: 'Contenu',
  synthese: 'Synthèse',
  vocabulaire: 'Vocabulaire clé',
  remediation: 'Activité de remédiation',
}

function normalizeType(type) {
  if (!type) return 'Cours'
  const t = type.trim()
  if (t === 'TD' || t === 'Exercices' || t === 'TD / Exercices' || t === 'TD/Exercices') return 'TD / Exercices'
  if (t === 'Évaluation' || t === 'Evaluation' || t === 'évaluation') return 'Évaluation'
  return 'Cours'
}

function buildSequences(rawSequences) {
  return rawSequences.map(seq => ({
    id: genId('seq'),
    titre: seq.titre || `Séquence ${seq.numero}`,
    objectifs: '',
    competences: '',
    documentSupport: null,
    seances: (seq.seances || []).map(s => ({
      id: genId('s'),
      titre: s.titre || 'Séance sans titre',
      type: normalizeType(s.type),
      objectif: s.objectif || '',
      duree: Math.max(1, Math.round(Number(s.duree) || 1)),
    })),
  }))
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Generateur() {
  const { get, add, update, getAnneeActive } = useData()
  const { isAdmin, getCurrentUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const user = getCurrentUser()
  const isArnaud7 = user?.login === 'Arnaud7'

  const [selected, setSelected] = useState(null) // null | 'ruban' | 'ppt' | 'ia'
  const [iaClasseId, setIaClasseId] = useState('')

  // ── Ruban states ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    classeId: '', matiereId: '', niveau: '', specialite: '',
    theme: '', volume: '', nbSequences: '', nbEvals: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [expandedSeqs, setExpandedSeqs] = useState({})
  const [conflictMode, setConflictMode] = useState(null)
  const [pendingSequences, setPendingSequences] = useState(null)
  const [showDeployPrompt, setShowDeployPrompt] = useState(false)

  // ── PPT states ────────────────────────────────────────────────────────────
  const [pptForm, setPptForm] = useState({
    classeId: '', matiereId: '', sequenceId: '',
    niveau: '', option: '', chapitre: '', titre: '',
    contenu: '', objectifs: '', competences: '',
    difficulte: 'Intermédiaire', typeSeance: 'Cours magistral',
    duree: '1h', remediation: false, difficulteEleves: false,
    nbSlides: 10, palette: 'vert',
  })
  const [pptLoading, setPptLoading] = useState(false)
  const [pptResult, setPptResult] = useState(null)
  const [pptError, setPptError] = useState(null)
  const [expandedSlides, setExpandedSlides] = useState({})
  const [copied, setCopied] = useState(false)
  const [pptGenerating, setPptGenerating] = useState(false)

  // ── Données communes ──────────────────────────────────────────────────────
  const classes = get('classes')
  const anneeActive = getAnneeActive()

  // Ruban helpers
  const selectedClasse = classes.find(c => c.id === form.classeId)
  const selectedMatieres = selectedClasse?.matieres || []
  const selectedMatiere = selectedMatieres.find(m => m.id === form.matiereId) || null

  // PPT helpers
  const pptClasse = classes.find(c => c.id === pptForm.classeId)
  const pptMatieres = pptClasse?.matieres || []
  const pptMatiere = pptMatieres.find(m => m.id === pptForm.matiereId) || null
  const pptRuban = get('rubanPedagogique').find(
    r => r.classeId === pptForm.classeId &&
         r.anneeScolaireId === anneeActive?.id &&
         (!pptForm.matiereId || r.matiereId === pptForm.matiereId)
  )
  const pptSequences = pptRuban?.sequences || []
  const pptSelectedPalette = PALETTES.find(p => p.id === pptForm.palette) || PALETTES[0]

  // Auto-sélect matière ruban quand classe change
  useEffect(() => {
    if (!form.classeId) { setForm(f => ({ ...f, matiereId: '' })); return }
    const cl = classes.find(c => c.id === form.classeId)
    const mats = cl?.matieres || []
    setForm(f => ({ ...f, matiereId: mats.length === 1 ? mats[0].id : '' }))
  }, [form.classeId]) // eslint-disable-line

  // Auto-sélect matière PPT quand classe change
  useEffect(() => {
    if (!pptForm.classeId) { setPptForm(f => ({ ...f, matiereId: '', sequenceId: '' })); return }
    const cl = classes.find(c => c.id === pptForm.classeId)
    const mats = cl?.matieres || []
    setPptForm(f => ({ ...f, matiereId: mats.length === 1 ? mats[0].id : '', sequenceId: '' }))
  }, [pptForm.classeId]) // eslint-disable-line

  // Auto-fill objectifs/compétences depuis la séquence sélectionnée
  useEffect(() => {
    if (!pptForm.sequenceId) return
    const seq = pptSequences.find(s => s.id === pptForm.sequenceId)
    if (seq) {
      setPptForm(f => ({
        ...f,
        objectifs: seq.objectifs || f.objectifs,
        competences: seq.competences || f.competences,
      }))
    }
  }, [pptForm.sequenceId]) // eslint-disable-line

  // ═══════════════════════════════════════════════════════════════════════════
  // RUBAN — handlers
  // ═══════════════════════════════════════════════════════════════════════════

  function setField(field, value) { setForm(f => ({ ...f, [field]: value })) }
  function toggleSeq(idx) { setExpandedSeqs(prev => ({ ...prev, [idx]: !prev[idx] })) }

  function getTotalHeures(data) {
    if (!data) return 0
    return data.sequences.reduce((total, seq) =>
      total + (seq.seances || []).reduce((st, s) => st + (Number(s.duree) || 0), 0), 0)
  }

  async function handleGenerate() {
    if (!form.classeId) { toast.error('Sélectionnez une classe.'); return }
    if (selectedMatieres.length > 0 && !form.matiereId) { toast.error('Sélectionnez une matière.'); return }
    if (!form.niveau.trim()) { toast.error('Renseignez le niveau.'); return }
    if (!form.theme.trim()) { toast.error('Renseignez le thème du module.'); return }
    if (!form.volume || isNaN(Number(form.volume)) || Number(form.volume) <= 0) { toast.error('Volume horaire invalide.'); return }
    if (!form.nbSequences || isNaN(Number(form.nbSequences)) || Number(form.nbSequences) <= 0) { toast.error('Nombre de séquences invalide.'); return }
    if (form.nbEvals === '' || isNaN(Number(form.nbEvals)) || Number(form.nbEvals) < 0) { toast.error("Nombre d'évaluations invalide."); return }
    if (!API_KEY) { toast.error('Clé API Anthropic non configurée.'); return }

    setLoading(true); setError(null); setResult(null); setExpandedSeqs({})

    const matiereLabel = selectedMatiere ? `\n- Matière : ${selectedMatiere.nom}` : ''
    const prompt = `Crée-moi un ruban pédagogique structuré en JSON avec exactement ce format :
{
  "sequences": [
    {
      "numero": 1,
      "titre": "Titre de la séquence",
      "seances": [
        { "titre": "Titre de la séance", "type": "Cours", "duree": 1, "objectif": "Objectif pédagogique" }
      ]
    }
  ]
}
Contraintes :
- Niveau : ${form.niveau}
- Spécialité : ${form.specialite.trim() || 'Non précisée'}${matiereLabel}
- Thème : ${form.theme}
- Volume horaire total : ${form.volume}h
- Nombre de séquences : ${form.nbSequences}
- Nombre d'évaluations : ${form.nbEvals}, intégrées dans le volume horaire
- Toutes les durées sont des heures entières uniquement (1, 2, 3...)
- Types acceptés : Cours / TD / Exercices / Évaluation
Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e?.error?.message || `Erreur ${response.status}`) }
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse.')
      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.sequences || !Array.isArray(parsed.sequences)) throw new Error('Structure JSON invalide.')
      const expanded = {}
      parsed.sequences.forEach((_, i) => { expanded[i] = true })
      setExpandedSeqs(expanded)
      setResult(parsed)
    } catch (err) {
      setError('La génération a échoué, vérifiez votre connexion et réessayez')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleImport() {
    if (!selectedClasse || !anneeActive || !result) return
    const newSequences = buildSequences(result.sequences)
    const matiereId = form.matiereId || null
    const existingRuban = get('rubanPedagogique').find(
      r => r.classeId === form.classeId && r.anneeScolaireId === anneeActive.id && r.matiereId === matiereId
    )
    if (existingRuban && (existingRuban.sequences || []).length > 0) {
      setPendingSequences(newSequences); setConflictMode('ask')
    } else {
      doImport(newSequences, existingRuban, 'add')
    }
  }

  function doImport(sequences, existingRuban, mode) {
    const matiereId = form.matiereId || null
    const ruban = existingRuban ?? get('rubanPedagogique').find(
      r => r.classeId === form.classeId && r.anneeScolaireId === anneeActive?.id && r.matiereId === matiereId
    )
    const finalSequences = mode === 'replace' ? sequences : [...((ruban?.sequences) || []), ...sequences]
    if (ruban) { update('rubanPedagogique', ruban.id, { sequences: finalSequences }) }
    else { add('rubanPedagogique', { id: genId('rb'), anneeScolaireId: anneeActive.id, classeId: form.classeId, matiereId, sequences: finalSequences }) }
    setConflictMode(null); setPendingSequences(null); setShowDeployPrompt(true)
  }

  function handleConflictReplace() { doImport(pendingSequences, null, 'replace') }
  function handleConflictAdd() { doImport(pendingSequences, null, 'add') }
  function handleConflictCancel() { setConflictMode(null); setPendingSequences(null) }

  function handleDeployNow() {
    sessionStorage.setItem('mccv_autodeploy', JSON.stringify({ classeId: form.classeId, matiereId: form.matiereId || null }))
    setShowDeployPrompt(false)
    navigate(`/classes/${form.classeId}?tab=ruban`)
  }
  function handleDeployLater() { setShowDeployPrompt(false); navigate(`/classes/${form.classeId}?tab=ruban`) }
  function handleReset() { setResult(null); setError(null) }

  function handleDownloadExcel() {
    if (!result) return
    const rows = [['N° Séquence', 'Titre séquence', 'Objectifs', 'Compétences', 'Titre séance', 'Type', 'Durée (h)', 'Objectif séance']]
    result.sequences.forEach((seq, si) => {
      const seqNo = seq.numero ?? si + 1
      ;(seq.seances || []).forEach((s, i) => {
        rows.push([
          i === 0 ? seqNo : '', i === 0 ? seq.titre : '',
          i === 0 ? (seq.objectifs || '') : '', i === 0 ? (seq.competences || '') : '',
          s.titre, normalizeType(s.type), Math.max(1, Math.round(Number(s.duree) || 1)), s.objectif || '',
        ])
      })
    })
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 36 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ruban pédagogique')
    const cn = (selectedClasse?.nom || 'Classe').replace(/[^a-zA-Z0-9]/g, '_')
    const mn = (selectedMatiere?.nom || 'Matiere').replace(/[^a-zA-Z0-9]/g, '_')
    XLSX.writeFile(wb, `Ruban_${cn}_${mn}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadPDF() {
    if (!result) return
    const cn = selectedClasse?.nom || 'Classe'
    const mn = selectedMatiere?.nom || ''
    const dt = new Date().toLocaleDateString('fr-FR')
    const seqHTML = result.sequences.map((seq, si) => {
      const rows = (seq.seances || []).map(s => {
        const isEval = normalizeType(s.type) === 'Évaluation'
        const isTD = normalizeType(s.type) === 'TD / Exercices'
        const bg = isEval ? '#fce7f3' : isTD ? '#eff6ff' : '#f0fdf4'
        return `<tr style="background:${bg}"><td style="border:1px solid #e5e7eb;padding:6px 8px">${s.titre}</td><td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center">${normalizeType(s.type)}</td><td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center">${s.duree}h</td><td style="border:1px solid #e5e7eb;padding:6px 8px">${s.objectif || ''}</td></tr>`
      }).join('')
      return `<h3 style="margin:20px 0 6px;color:#1e40af;font-size:14px;border-bottom:1px solid #bfdbfe;padding-bottom:4px">Séquence ${seq.numero ?? si + 1} — ${seq.titre}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px"><thead><tr style="background:#1e3a5f;color:white"><th style="padding:6px 8px;text-align:left;border:1px solid #1e3a5f">Titre</th><th style="padding:6px 8px;text-align:center">Type</th><th style="padding:6px 8px;text-align:center">Durée</th><th style="padding:6px 8px;text-align:left">Objectif</th></tr></thead><tbody>${rows}</tbody></table>`
    }).join('')
    const win = window.open('', '_blank')
    if (!win) { toast.error('Fenêtre bloquée. Autorisez les popups.'); return }
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Ruban_${cn.replace(/\s/g,'_')}_${mn.replace(/\s/g,'_')}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:13px}h1{font-size:20px;color:#1e3a5f;margin-bottom:4px}.meta{color:#6b7280;font-size:12px;margin-bottom:20px;border-bottom:2px solid #1e3a5f;padding-bottom:12px}@media print{button{display:none!important}}</style></head><body><h1>Ruban pédagogique</h1><div class="meta"><strong>Classe :</strong> ${cn}${mn ? ` &nbsp;·&nbsp; <strong>Matière :</strong> ${mn}` : ''} &nbsp;·&nbsp; <strong>Thème :</strong> ${form.theme} &nbsp;·&nbsp; Généré le ${dt} &nbsp;·&nbsp; ${result.sequences.length} séquences · ${getTotalHeures(result)}h</div>${seqHTML}<p style="text-align:center;margin-top:20px"><button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer">Imprimer / Enregistrer en PDF</button></p></body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PPT — handlers
  // ═══════════════════════════════════════════════════════════════════════════

  function setPptField(field, value) { setPptForm(f => ({ ...f, [field]: value })) }
  function toggleSlide(idx) { setExpandedSlides(prev => ({ ...prev, [idx]: !prev[idx] })) }

  async function handleGeneratePPT() {
    if (!pptForm.titre.trim()) { toast.error('Renseignez le titre du cours.'); return }
    if (!API_KEY) { toast.error('Clé API Anthropic non configurée.'); return }

    setPptLoading(true); setPptError(null); setPptResult(null); setExpandedSlides({})

    const pal = pptSelectedPalette
    const prompt = `Tu es un expert en création de présentations pédagogiques PowerPoint.
Génère un plan de présentation détaillé en JSON pour une présentation de cours.

INFORMATIONS :
- Matière : ${pptMatiere?.nom || 'Non précisée'}
- Niveau : ${pptForm.niveau || 'Non précisé'}
- Option : ${pptForm.option || 'Non précisée'}
- Chapitre : ${pptForm.chapitre || 'Non précisé'}
- Titre : ${pptForm.titre}
- Contenu voulu : ${pptForm.contenu || 'Non précisé'}
- Objectifs pédagogiques : ${pptForm.objectifs || 'Non précisés'}
- Compétences visées : ${pptForm.competences || 'Non précisées'}
- Niveau de difficulté : ${pptForm.difficulte}
- Type de séance : ${pptForm.typeSeance}
- Durée : ${pptForm.duree}
- Nombre de slides : ${pptForm.nbSlides}
- Inclure remédiation : ${pptForm.remediation ? 'Oui' : 'Non'}
- Adapter pour difficultés : ${pptForm.difficulteEleves ? 'Oui' : 'Non'}
- Palette principale : ${pal.primary}
- Palette accent : ${pal.accent}

STRUCTURE OBLIGATOIRE DES SLIDES :
- Slide 1 : Titre (fond couleur principale, numéro chapitre, titre blanc)
- Slide 2 : Plan du cours (bandeau coloré, liste des parties)
- Slides intermédiaires : Contenu (définitions, tableaux, fiches, exemples)
- Avant-dernière slide : Synthèse (tableau comparatif + encart À retenir)
- Dernière slide : Vocabulaire clé (6 termes max, terme + définition)
- Si remédiation demandée : ajouter une slide activité de remédiation
- Si adaptation difficultés : simplifier le vocabulaire et ajouter des exemples concrets

RÈGLES :
- Titres : Georgia 24-28pt, gras, blanc sur fond coloré
- Corps : Calibri 11pt
- Emojis autorisés : 🛒 🏪 💡 📐 ✅ ❌
- Chaque slide a maximum 6 points ou 1 tableau
- Exemples concrets tirés du secteur ${pptForm.option || 'professionnel'}

Réponds UNIQUEMENT en JSON avec cette structure :
{
  "slides": [
    {
      "numero": 1,
      "type": "titre|plan|contenu|synthese|vocabulaire|remediation",
      "titre": "Titre de la slide",
      "contenu": [
        { "type": "titre|texte|liste|tableau|encart|terme", "valeur": "..." }
      ],
      "notes_professeur": "Notes pour le professeur sur cette slide"
    }
  ],
  "resume_pedagogique": "Résumé pédagogique de la présentation",
  "duree_estimee": "45 min"
}`

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e?.error?.message || `Erreur ${response.status}`) }
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse.')
      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.slides || !Array.isArray(parsed.slides)) throw new Error('Structure JSON invalide.')
      setPptResult(parsed)
    } catch (err) {
      setPptError('La génération a échoué. Vérifiez votre connexion et réessayez.')
      console.error(err)
    } finally {
      setPptLoading(false)
    }
  }

  function handleDownloadPPTPDF() {
    if (!pptResult) return
    const pal = pptSelectedPalette
    const dt = new Date().toLocaleDateString('fr-FR')
    const slidesHTML = pptResult.slides.map((slide, i) => {
      const typeLabel = SLIDE_TYPE_LABEL[slide.type] || slide.type
      const contenuHTML = (slide.contenu || []).map(c => {
        if (c.type === 'liste') return `<ul style="margin:4px 0 4px 18px;padding:0">${String(c.valeur).split('\n').map(l => `<li style="margin-bottom:2px">${l}</li>`).join('')}</ul>`
        if (c.type === 'encart') return `<div style="background:${pal.pale};border-left:4px solid ${pal.primary};padding:8px 12px;margin:6px 0;border-radius:4px;font-size:11px">${c.valeur}</div>`
        return `<p style="margin:4px 0;font-size:12px">${c.valeur}</p>`
      }).join('')
      return `
        <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;overflow:hidden">
          <div style="background:${pal.primary};color:white;padding:8px 14px;display:flex;align-items:center;gap:10px">
            <span style="background:${pal.accent};color:#1a1a1a;font-weight:700;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">${i + 1}</span>
            <span style="font-weight:600;font-size:13px">${slide.titre}</span>
            <span style="margin-left:auto;font-size:11px;opacity:0.8">${typeLabel}</span>
          </div>
          <div style="padding:10px 14px">${contenuHTML}</div>
          ${slide.notes_professeur ? `<div style="background:#fafafa;border-top:1px solid #e5e7eb;padding:6px 14px;font-size:11px;color:#6b7280;font-style:italic">📝 ${slide.notes_professeur}</div>` : ''}
        </div>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) { toast.error('Fenêtre bloquée. Autorisez les popups.'); return }
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>PPT_${(pptForm.titre || 'Présentation').replace(/\s/g,'_')}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto}h1{font-size:20px;color:${pal.primary};margin-bottom:4px}.meta{color:#6b7280;font-size:12px;margin-bottom:20px;border-bottom:3px solid ${pal.primary};padding-bottom:12px}.resume{background:${pal.pale};border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px}@media print{button{display:none!important}}</style></head><body>
<h1>📊 ${pptForm.titre}</h1>
<div class="meta">
  ${pptMatiere ? `<strong>Matière :</strong> ${pptMatiere.nom} &nbsp;·&nbsp;` : ''}
  ${pptForm.niveau ? `<strong>Niveau :</strong> ${pptForm.niveau} &nbsp;·&nbsp;` : ''}
  ${pptForm.chapitre ? `<strong>Chapitre :</strong> ${pptForm.chapitre} &nbsp;·&nbsp;` : ''}
  <strong>Durée estimée :</strong> ${pptResult.duree_estimee || '—'} &nbsp;·&nbsp;
  ${pptResult.slides.length} slides &nbsp;·&nbsp; Généré le ${dt}
  &nbsp;·&nbsp; Palette : ${pal.label}
</div>
${pptResult.resume_pedagogique ? `<div class="resume"><strong>📋 Résumé pédagogique :</strong> ${pptResult.resume_pedagogique}</div>` : ''}
${slidesHTML}
<p style="text-align:center;margin-top:20px"><button onclick="window.print()" style="background:${pal.primary};color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">Imprimer / Enregistrer en PDF</button></p>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  function buildPPTXPrompt() {
    if (!pptResult) return ''
    const pal = pptSelectedPalette
    const slidesPlan = pptResult.slides.map((slide, i) => {
      const contenuText = (slide.contenu || []).map(c => `    - [${c.type}] ${c.valeur}`).join('\n')
      return `  SLIDE ${i + 1} (${SLIDE_TYPE_LABEL[slide.type] || slide.type}) : ${slide.titre}\n${contenuText}`
    }).join('\n')

    return `Tu es un expert en création de présentations pédagogiques PowerPoint avec pptxgenjs.
Génère le code pptxgenjs complet pour cette présentation.

MATIÈRE        : ${pptMatiere?.nom || 'Non précisée'}
NIVEAU         : ${pptForm.niveau || 'Non précisé'}
OPTION         : ${pptForm.option || 'Non précisée'}
CHAPITRE       : ${pptForm.chapitre || 'Non précisé'}
TITRE DU COURS : ${pptForm.titre}
CONTENU VOULU  : ${pptForm.contenu || 'Non précisé'}
NOMBRE SLIDES  : ${pptResult.slides.length}
PALETTE        : ${pal.label} (principale ${pal.primary}, accent ${pal.accent})

PLAN GÉNÉRÉ :
${slidesPlan}

INSTRUCTIONS TECHNIQUES :
const C = {
  primary:  '${pal.primary}',
  light:    '${pal.light}',
  pale:     '${pal.pale}',
  accent:   '${pal.accent}',
};

STRUCTURE DES SLIDES :
  SLIDE 1  → Titre    : fond primary, numéro chapitre amber, titre blanc Georgia
  SLIDE 2  → Plan     : bandeau vert, cartes 2 colonnes, bordure gauche colorée
  SLIDES N → Contenu  : selon type — définition/points, tableau, fiches, flux
  SLIDE -2 → Synthèse : grand tableau comparatif + encart À retenir
  SLIDE -1 → Vocab    : fond dark, 6 cartes 2×3, terme amber + définition pâle

RÈGLES TYPOGRAPHIQUES :
  Titres de slides  : Georgia 24-28pt, gras, blanc sur fond coloré
  Corps de texte    : Calibri 11pt, couleur dark
  Définitions       : Calibri 12.5-13.5pt
  Notes / légendes  : Calibri 9-10pt, italique, grey
  Emojis autorisés  : 🛒 🏪 💡 📐 ✅

QUALITÉ OBLIGATOIRE :
  1. Générer le code pptxgenjs complet et fonctionnel
  2. Copier le .pptx dans /mnt/user-data/outputs/
  3. Appeler present_files pour le rendre téléchargeable

NOM DU FICHIER : ${pptForm.chapitre ? pptForm.chapitre + '_' : ''}${pptForm.titre.replace(/\s+/g,'_').slice(0,30)}${pptForm.niveau ? '_' + pptForm.niveau.replace(/\s+/g,'_') : ''}.pptx

Génère maintenant le fichier complet. Commence directement par le code, sans commentaire préalable.`
  }

  async function handleCopyPrompt() {
    const prompt = buildPPTXPrompt()
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Impossible de copier. Vérifiez les permissions du navigateur.')
    }
  }

  // ── Génération du fichier PPTX ────────────────────────────────────────────
  async function handleDownloadPPT() {
    if (!pptResult || pptGenerating) return
    setPptGenerating(true)
    try {
      const prs = new PptxGenJS()
      prs.layout = 'LAYOUT_16x9' // 10" × 5.625" = 25.4cm × 14.29cm

      const pal = pptSelectedPalette
      // pptxgenjs attend des hex SANS #
      const hx = c => String(c || '').replace(/^#/, '').toUpperCase().padEnd(6, '0')
      const C = {
        primary:  hx(pal.primary),
        accent:   hx(pal.accent),
        light:    hx(pal.light),
        pale:     hx(pal.pale),
        white:    'FFFFFF',
        dark:     '1E1E2E',
        darkCard: '2D2D3F',
        amber:    'F59E0B',
        text:     '2C2C2C',
        gray:     'BBBBBB',
        fafafa:   'FAFAFA',
      }
      console.log('[PPT] Palette:', pal.label, '| Couleurs hex →', C)

      // ── Dimensions (pouces, LAYOUT_16x9 = 10" × 5.625") ──────────────────
      const W = 10, H = 5.625
      const cm = v => v / 2.54           // cm → pouces
      const BAND_H = cm(1.8)             // bandeau titre : 1.8cm
      const BODY_Y = cm(2.1)             // début corps   : 2.1cm du haut (bande + 0.3cm)
      const FOOT_H = cm(0.55)            // hauteur pied de page
      const FOOT_Y = H - FOOT_H          // début pied de page
      const BODY_H = FOOT_Y - BODY_Y     // hauteur utile du corps
      const MAR    = cm(0.5)             // marge gauche/droite
      const GAP    = cm(0.25)            // espacement entre éléments

      // ── Strip emojis (mojibake dans certains lecteurs PPT) ──────────────────
      const clean = s => String(s || '')
        .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|\u{200D}/gu, '')
        .replace(/\s{2,}/g, ' ').trim()

      // ── Helpers partagés ────────────────────────────────────────────────────
      const addBand = (sl, title, slideIdx) => {
        sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: W, h: BAND_H, fill: { color: C.primary }, line: { color: C.primary } })
        sl.addText(clean(title), {
          x: cm(0.6), y: 0, w: W - cm(2.8), h: BAND_H,
          fontSize: 20, color: C.white, bold: true, fontFace: 'Georgia', valign: 'middle',
        })
        // Badge numéro de slide en haut à droite dans le bandeau
        if (slideIdx !== undefined) {
          const badgeW = cm(1.1), badgeH = cm(0.7)
          const badgeX = W - badgeW - cm(0.35)
          const badgeY = (BAND_H - badgeH) / 2
          sl.addShape(prs.ShapeType.rect, {
            x: badgeX, y: badgeY, w: badgeW, h: badgeH,
            fill: { color: C.accent }, line: { color: C.accent },
          })
          sl.addText(String(slideIdx + 1), {
            x: badgeX, y: badgeY, w: badgeW, h: badgeH,
            fontSize: 11, color: C.white, bold: true, fontFace: 'Calibri', align: 'center', valign: 'middle',
          })
        }
      }

      const addFooter = (sl, idx) => {
        // Ligne fine pleine largeur
        sl.addShape(prs.ShapeType.rect, {
          x: 0, y: FOOT_Y, w: W, h: cm(0.035),
          fill: { color: C.gray }, line: { color: C.gray },
        })
        // Titre cours à gauche — 7pt gris
        sl.addText(clean(pptForm.titre), {
          x: cm(0.4), y: FOOT_Y + cm(0.05), w: W - cm(2), h: FOOT_H - cm(0.05),
          fontSize: 7, color: C.gray, fontFace: 'Calibri', valign: 'middle',
        })
        // Numéro slide à droite — 7pt gris
        sl.addText(String(idx + 1), {
          x: W - cm(1.4), y: FOOT_Y + cm(0.05), w: cm(1.1), h: FOOT_H - cm(0.05),
          fontSize: 7, color: C.gray, fontFace: 'Calibri', bold: true, align: 'right', valign: 'middle',
        })
      }

      // ── Estimation hauteur d'un item (pour centrage vertical) ──────────────
      const estimH = (item) => {
        const val = String(item.valeur || '')
        switch (item.type) {
          case 'liste': {
            const n = val.split('\n').filter(l => l.trim()).length
            const lineH = n <= 3 ? cm(1.05) : n <= 5 ? cm(0.85) : cm(0.68)
            return n * lineH + GAP
          }
          case 'sous_titre': return cm(0.75) + GAP * 0.5
          case 'encart':  return cm(0.72) + cm(2.0) + GAP
          case 'tableau': return Math.min(val.split('\n').filter(r => r.trim()).length * cm(1.05), BODY_H * 0.65) + GAP
          default:        return cm(0.9) + GAP
        }
      }

      // ── Rendu d'un item de contenu (avec positionnement y courant) ──────────
      const renderItem = (sl, item, cy, maxY) => {
        const val = clean(item.valeur || '')
        if (!val && item.type !== 'liste') return cy

        // ── Sous-titre de section ──
        if (item.type === 'sous_titre') {
          const subH = cm(0.44)
          const lineH = cm(0.04)
          const totalH = subH + lineH + GAP * 0.5
          if (cy + totalH > maxY) return cy
          sl.addText(val, {
            x: MAR, y: cy, w: W - 2 * MAR, h: subH,
            fontSize: 14, color: C.primary, bold: true, fontFace: 'Calibri',
          })
          sl.addShape(prs.ShapeType.rect, {
            x: MAR, y: cy + subH, w: W - 2 * MAR, h: lineH,
            fill: { color: C.accent }, line: { color: C.accent },
          })
          return cy + subH + lineH + GAP * 0.5

        // ── Liste à puces ──
        } else if (item.type === 'liste') {
          const lines = val.split('\n').filter(l => l.trim())
          if (!lines.length) return cy
          const n = lines.length

          // Taille de police adaptative
          const fs = n <= 3 ? 18 : n <= 5 ? 15 : 13

          // Espacement inter-paragraphe adaptatif (en points)
          const paraSpaceAfter = n <= 3 ? 17 : n <= 5 ? 11 : 7

          // Hauteur estimée par ligne
          const lineH = n <= 3 ? cm(1.05) : n <= 5 ? cm(0.85) : cm(0.68)
          const bh = Math.min(n * lineH, maxY - cy - GAP)

          const runs = []
          lines.forEach((l, li) => {
            const text = l.replace(/^[-•*\u25A0\u25CF\s]+/, '')
            // Puce carrée ■ 8pt ACCENT
            runs.push({ text: '\u25A0  ', options: { color: C.accent, fontSize: 8, fontFace: 'Calibri' } })
            // Texte indenté
            runs.push({ text, options: { color: C.text, fontSize: fs, fontFace: 'Calibri', breakLine: li < lines.length - 1 } })
          })
          sl.addText(runs, {
            x: MAR + cm(0.5), y: cy, w: W - 2 * MAR - cm(0.5), h: bh,
            fontFace: 'Calibri', paraSpaceAfter,
          })
          return cy + bh + GAP

        // ── Tableau ──
        } else if (item.type === 'tableau') {
          const tRows = buildTableRows(val, C)
          if (!tRows.length) return cy
          const th = Math.min(tRows.length * cm(1.1), maxY - cy - GAP)
          sl.addTable(tRows, { x: MAR, y: cy, w: W - 2 * MAR, h: th, border: { color: 'E5E7EB', type: 'solid', pt: 1 } })
          return cy + th + GAP

        // ── Encart exemple ──
        } else if (item.type === 'encart') {
          // Label "Exemple :" en ACCENT bold
          const labelH = cm(0.5)
          sl.addText('Exemple :', {
            x: MAR, y: cy, w: cm(5), h: labelH,
            fontSize: 12, color: C.accent, bold: true, fontFace: 'Calibri',
          })
          const ey = cy + labelH + cm(0.08)
          const eh = Math.min(cm(2.0), maxY - ey - GAP)
          // Fond PALE pleine largeur
          sl.addShape(prs.ShapeType.rect, { x: MAR, y: ey, w: W - 2 * MAR, h: eh, fill: { color: C.pale }, line: { color: C.pale } })
          // Bordure gauche 4pt (~cm(0.14))
          sl.addShape(prs.ShapeType.rect, { x: MAR, y: ey, w: cm(0.14), h: eh, fill: { color: C.accent }, line: { color: C.accent } })
          sl.addText(val, {
            x: MAR + cm(0.28), y: ey + cm(0.14), w: W - 2 * MAR - cm(0.42), h: eh - cm(0.28),
            fontSize: 11, color: C.dark, fontFace: 'Calibri', italic: true, valign: 'middle', wrap: true,
          })
          return ey + eh + GAP

        // ── Texte libre ──
        } else {
          const th = Math.min(cm(1.1), maxY - cy - GAP)
          sl.addText(val, {
            x: MAR, y: cy, w: W - 2 * MAR, h: th,
            fontSize: 14, color: C.text, fontFace: 'Calibri', wrap: true,
          })
          return cy + th + GAP
        }
      }

      // ── Boucle principale ───────────────────────────────────────────────────
      for (let si = 0; si < pptResult.slides.length; si++) {
        const slide = pptResult.slides[si]
        const sl = prs.addSlide()

        // ── TITRE ─────────────────────────────────────────────────────────────
        if (slide.type === 'titre') {
          // Fond pleine page couleur primary
          sl.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: C.primary }, line: { color: C.primary } })

          // Badge chapitre amber haut-gauche
          if (pptForm.chapitre) {
            sl.addShape(prs.ShapeType.rect, { x: cm(0.7), y: cm(0.55), w: cm(4.5), h: cm(0.95), fill: { color: C.amber }, line: { color: C.amber } })
            sl.addText(`Chapitre ${pptForm.chapitre}`, {
              x: cm(0.7), y: cm(0.55), w: cm(4.5), h: cm(0.95),
              fontSize: 13, color: C.white, bold: true, fontFace: 'Calibri', align: 'center', valign: 'middle',
            })
          }

          // Titre centré verticalement ET horizontalement — 38pt
          sl.addText(clean(slide.titre || pptForm.titre), {
            x: cm(1.5), y: 0, w: W - cm(3), h: H,
            fontSize: 38, color: C.white, bold: true, align: 'center',
            fontFace: 'Georgia', valign: 'middle', wrap: true,
          })

          // Sous-titre niveau · matière centré en bas
          const subtitle = [pptForm.niveau, pptMatiere?.nom].filter(Boolean).join('  ·  ')
          if (subtitle) {
            sl.addText(subtitle, {
              x: cm(1.5), y: H - cm(1.7), w: W - cm(3), h: cm(1.4),
              fontSize: 15, color: C.white, align: 'center', fontFace: 'Calibri', valign: 'middle',
            })
          }
          if (pptForm.option) {
            sl.addText(clean(pptForm.option), {
              x: cm(1.5), y: H - cm(3.2), w: W - cm(3), h: cm(0.9),
              fontSize: 12, color: C.white, align: 'center', fontFace: 'Calibri', italic: true,
            })
          }
          // MCCV bas-droite discret
          sl.addText('MCCV', {
            x: W - cm(2.2), y: H - cm(0.55), w: cm(2), h: cm(0.45),
            fontSize: 9, color: C.white, align: 'right', fontFace: 'Calibri', italic: true,
          })

        // ── VOCABULAIRE ────────────────────────────────────────────────────────
        } else if (slide.type === 'vocabulaire') {
          sl.background = { fill: C.dark }

          // Collecte paires terme / définition
          const pairs = []
          for (const item of (slide.contenu || [])) {
            const v = clean(item.valeur || '')
            const parsePair = line => {
              const s = line.replace(/^[-•*■\s]+/, '').trim()
              const colon = s.indexOf(':')
              if (colon > 0 && colon < 50) return { terme: s.slice(0, colon).trim(), def: s.slice(colon + 1).trim() }
              return { terme: s, def: '' }
            }
            if (item.type === 'liste') v.split('\n').filter(l => l.trim()).forEach(l => pairs.push(parsePair(l)))
            else pairs.push(parsePair(v))
            if (pairs.length >= 6) break
          }

          // Grille 2 colonnes × 3 lignes — remplit toute la slide
          const GCOLS = 2, GROWS = 3
          const gapX = cm(0.25), gapY = cm(0.2)
          const gridX = cm(0.3), gridY = cm(0.3)
          const gridW = W - cm(0.6)
          const gridH = H - cm(0.6)
          const cW = (gridW - (GCOLS - 1) * gapX) / GCOLS
          const cH = (gridH - (GROWS - 1) * gapY) / GROWS

          for (let i = 0; i < Math.min(pairs.length, 6); i++) {
            const col = i % GCOLS, row = Math.floor(i / GCOLS)
            const cx = gridX + col * (cW + gapX)
            const cy = gridY + row * (cH + gapY)
            const { terme, def } = pairs[i]

            // Fond carte
            sl.addShape(prs.ShapeType.rect, { x: cx, y: cy, w: cW, h: cH, fill: { color: C.darkCard }, line: { color: C.darkCard } })
            // Bordure top accent 3pt (~cm(0.11))
            sl.addShape(prs.ShapeType.rect, { x: cx, y: cy, w: cW, h: cm(0.11), fill: { color: C.accent }, line: { color: C.accent } })
            // Terme
            sl.addText(terme, {
              x: cx + cm(0.35), y: cy + cm(0.22), w: cW - cm(0.7), h: cm(1.05),
              fontSize: 15, color: C.amber, bold: true, fontFace: 'Calibri', wrap: true,
            })
            // Définition
            if (def) {
              sl.addText(def, {
                x: cx + cm(0.35), y: cy + cm(1.35), w: cW - cm(0.7), h: cH - cm(1.55),
                fontSize: 10, color: C.white, fontFace: 'Calibri', wrap: true,
              })
            }
          }

        // ── PLAN ──────────────────────────────────────────────────────────────
        } else if (slide.type === 'plan') {
          sl.background = { fill: C.fafafa }
          addBand(sl, 'Plan du cours', si)

          const items = (slide.contenu || [])
            .map(item => clean(item.valeur || '').replace(/^[-•*■\d.)\s]+/, '').trim())
            .filter(Boolean)

          const n = items.length
          // 1 col si ≤3 ; 2 cols sinon (4→2×2, 6→2×3)
          const GCOLS = n <= 3 ? 1 : 2
          const GROWS = Math.ceil(n / GCOLS)

          const gapX  = cm(0.2), gapY = cm(0.2)
          const gridX = cm(0.3)
          const gridY = BODY_Y
          const gridW = W - cm(0.6)
          const gridH = FOOT_Y - gridY - cm(0.1)
          const colW  = (gridW - (GCOLS - 1) * gapX) / GCOLS
          const rowH  = (gridH - (GROWS - 1) * gapY) / GROWS

          // Cercle interne : cm(0.85) max, 30% de rowH
          const CIRC  = Math.min(cm(0.85), rowH * 0.3)
          const FONT  = Math.min(18, Math.max(16, Math.round(rowH * 6.5)))

          for (let i = 0; i < items.length; i++) {
            const col = i % GCOLS, row = Math.floor(i / GCOLS)
            const cx  = gridX + col * (colW + gapX)
            const cy  = gridY + row * (rowH + gapY)

            // Carte pleine largeur fond PALE + ombre légère
            sl.addShape(prs.ShapeType.rect, {
              x: cx, y: cy, w: colW, h: rowH,
              fill: { color: C.pale }, line: { color: C.pale },
              shadow: { type: 'outer', color: '888888', blur: 5, offset: 2, angle: 45, opacity: 0.15 },
            })

            // Cercle numéroté en haut à gauche DANS la carte
            const circX = cx + cm(0.25), circY = cy + cm(0.22)
            sl.addShape(prs.ShapeType.ellipse, {
              x: circX, y: circY, w: CIRC, h: CIRC,
              fill: { color: C.primary }, line: { color: C.primary },
            })
            sl.addText(String(i + 1), {
              x: circX, y: circY, w: CIRC, h: CIRC,
              fontSize: Math.round(FONT * 0.65), color: C.white, bold: true,
              fontFace: 'Calibri', align: 'center', valign: 'middle',
            })

            // Texte centré verticalement ET horizontalement dans la zone sous le cercle
            sl.addText(items[i], {
              x: cx + cm(0.2), y: cy + CIRC + cm(0.35),
              w: colW - cm(0.4), h: rowH - CIRC - cm(0.48),
              fontSize: FONT, color: C.text, fontFace: 'Calibri',
              align: 'center', valign: 'middle', wrap: true,
            })
          }
          addFooter(sl, si)

        // ── SYNTHESE ──────────────────────────────────────────────────────────
        } else if (slide.type === 'synthese') {
          sl.background = { fill: 'FFFFFF' }
          addBand(sl, 'Synthese', si)

          const items = slide.contenu || []
          // Séparer encart "À retenir" du reste
          const retenirItem = items.find(it => it.type === 'encart' || /retenir/i.test(String(it.valeur || '')))
          const tableItems  = items.filter(it => it !== retenirItem)

          const RETENIR_H = retenirItem ? cm(2.2) : 0
          const tableMaxY = retenirItem ? FOOT_Y - RETENIR_H - GAP : FOOT_Y

          // Tableau plein : occupe tout l'espace corps disponible
          let cy = BODY_Y
          for (const item of tableItems) {
            if (cy >= tableMaxY - cm(0.4)) break
            if (item.type === 'tableau') {
              const tRows = buildTableRows(clean(item.valeur || ''), C)
              if (tRows.length) {
                const th = tableMaxY - cy - GAP
                sl.addTable(tRows, {
                  x: MAR, y: cy, w: W - 2 * MAR, h: th,
                  border: { color: 'E5E7EB', type: 'solid', pt: 1 },
                })
                cy += th + GAP
              }
            } else {
              cy = renderItem(sl, item, cy, tableMaxY)
            }
          }

          // Encart À retenir pleine largeur en bas
          if (retenirItem) {
            const val = clean(retenirItem.valeur || '').replace(/^a\s*retenir\s*:?\s*/i, '')
            sl.addShape(prs.ShapeType.rect, {
              x: MAR, y: FOOT_Y - RETENIR_H, w: W - 2 * MAR, h: RETENIR_H,
              fill: { color: C.accent }, line: { color: C.accent },
            })
            sl.addText('A retenir : ' + val, {
              x: MAR + cm(0.4), y: FOOT_Y - RETENIR_H + cm(0.18), w: W - 2 * MAR - cm(0.8), h: RETENIR_H - cm(0.36),
              fontSize: 13, color: C.white, bold: true, fontFace: 'Calibri', valign: 'middle', wrap: true,
            })
          }
          addFooter(sl, si)

        // ── CONTENU / REMEDIATION ─────────────────────────────────────────────
        } else {
          sl.background = { fill: 'FFFFFF' }
          addBand(sl, clean(slide.titre || ''), si)

          const items = slide.contenu || []

          // Compter les points totaux pour adapter le rendu
          let totalPoints = 0
          for (const item of items) {
            if (item.type === 'liste') {
              totalPoints += clean(item.valeur || '').split('\n').filter(l => l.trim()).length
            } else if (item.type !== 'sous_titre') {
              totalPoints += 1
            }
          }
          const fewContent = totalPoints > 0 && totalPoints < 4

          // Réserver zone "À retenir" en bas si peu de contenu
          const RETENIR_H = fewContent ? cm(1.6) : 0
          const bodyMaxY = FOOT_Y - RETENIR_H - (fewContent ? GAP : 0)

          // Centrage vertical si peu de contenu
          let cy = BODY_Y
          if (fewContent) {
            let totalEstH = 0
            for (const item of items) totalEstH += estimH(item)
            const available = bodyMaxY - BODY_Y
            if (totalEstH < available * 0.75) {
              cy = BODY_Y + Math.max(0, (available - totalEstH) / 2)
            }
          }

          for (const item of items) {
            if (cy >= bodyMaxY - cm(0.3)) break
            cy = renderItem(sl, item, cy, bodyMaxY)
          }

          // Zone "À retenir" en bas pour les slides peu chargées
          if (fewContent) {
            const firstList = items.find(it => it.type === 'liste' || it.type === 'texte')
            const keyText = firstList
              ? clean(firstList.valeur || '').split('\n')[0].replace(/^[-•*\u25A0\u25CF\s]+/, '').trim()
              : ''
            const retY = FOOT_Y - RETENIR_H
            sl.addShape(prs.ShapeType.rect, {
              x: MAR, y: retY, w: W - 2 * MAR, h: RETENIR_H,
              fill: { color: C.pale }, line: { color: C.pale },
            })
            sl.addShape(prs.ShapeType.rect, {
              x: MAR, y: retY, w: cm(0.14), h: RETENIR_H,
              fill: { color: C.accent }, line: { color: C.accent },
            })
            sl.addText('A retenir : ' + keyText, {
              x: MAR + cm(0.28), y: retY + cm(0.14), w: W - 2 * MAR - cm(0.42), h: RETENIR_H - cm(0.28),
              fontSize: 12, color: C.text, bold: true, fontFace: 'Calibri', valign: 'middle', wrap: true,
            })
          }

          addFooter(sl, si)
        }
      }

      // ── Écriture du fichier ─────────────────────────────────────────────────
      const fileParts = [
        pptForm.chapitre?.replace(/[^a-zA-Z0-9]/g, '_'),
        (pptForm.titre || 'Presentation').replace(/\s+/g, '_').slice(0, 25),
        pptForm.niveau?.replace(/\s+/g, '_').slice(0, 15),
      ].filter(Boolean)
      await prs.writeFile({ fileName: fileParts.join('_') + '.pptx' })
      toast.success('Fichier PowerPoint telecharge !')
    } catch (err) {
      console.error('[PPT] Erreur generation:', err)
      toast.error('Erreur lors de la creation du fichier PowerPoint.')
    } finally {
      setPptGenerating(false)
    }
  }

  // Helper : parse "Col1|Col2\nVal1|Val2" → tableau pptxgenjs
  function buildTableRows(val, C) {
    return String(val).split('\n').filter(r => r.trim())
      .map((r, ri) => r.split('|').filter(c => c.trim()).map(cell => ({
        text: cell.trim(),
        options: ri === 0
          ? { fill: { color: C.primary }, color: C.white, bold: true, fontSize: 12, fontFace: 'Calibri', align: 'center', valign: 'middle' }
          : { fill: { color: ri % 2 === 0 ? C.pale : 'FFFFFF' }, color: C.text, fontSize: 11, fontFace: 'Calibri', valign: 'middle' },
      })))
      .filter(r => r.length > 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Vue sélection
  // ═══════════════════════════════════════════════════════════════════════════

  if (!selected) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={24} className="text-purple-500" />
            Générateur IA
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Générez du contenu pédagogique avec l'aide de Claude.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Ruban pédagogique */}
          <button
            onClick={() => setSelected('ruban')}
            className="group flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200
              dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400
              dark:hover:border-purple-500 hover:shadow-md transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <BookOpen size={24} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-purple-600
                dark:group-hover:text-purple-400 transition-colors">
                Ruban pédagogique
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Génère un ruban structuré en séquences et séances
              </div>
            </div>
          </button>

          {/* Présentation PPT — admin uniquement */}
          {isAdmin() && (
            <button
              onClick={() => setSelected('ppt')}
              className="group flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200
                dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400
                dark:hover:border-blue-500 hover:shadow-md transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600
                  dark:group-hover:text-blue-400 transition-colors">
                  Présentation PPT
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Générez des présentations PowerPoint professionnelles pour vos cours en quelques secondes
                </div>
              </div>
            </button>
          )}

          {/* Generateur d'evaluation — tous utilisateurs */}
          <button
            onClick={() => setSelected('eval')}
            className="group flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200
              dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-400
              dark:hover:border-orange-500 hover:shadow-md transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <span className="text-2xl">📝</span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white group-hover:text-orange-600
                dark:group-hover:text-orange-400 transition-colors">
                Evaluation
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Generez une evaluation complete avec corrige et bareme
              </div>
            </div>
          </button>

          {/* Assistant IA — Arnaud7 uniquement */}
          {isArnaud7 && (
            <button
              onClick={() => { setIaClasseId(''); setSelected('ia') }}
              className="group flex flex-col items-start gap-3 p-5 rounded-xl border-2 border-gray-200
                dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-green-400
                dark:hover:border-green-500 hover:shadow-md transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white group-hover:text-green-600
                  dark:group-hover:text-green-400 transition-colors">
                  Assistant IA
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Chat pédagogique contextualisé par classe — évaluations, TD, objectifs, progression
                </div>
              </div>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Assistant IA
  // ═══════════════════════════════════════════════════════════════════════════

  if (selected === 'eval') {
    return <EvalGenerateur onBack={() => setSelected(null)} />
  }

  if (selected === 'ia') {
    const iaClasse = classes.find(c => c.id === iaClasseId) || null
    const anneeActive = getAnneeActive()

    return (
      <div className="p-6 max-w-4xl">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelected(null)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            ← Retour
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            🤖 Assistant IA
          </h2>
        </div>

        {/* Sélecteur de classe */}
        <div className="card p-4 mb-4">
          <label className="label mb-1">Classe (contexte de la conversation)</label>
          <select
            className="input"
            value={iaClasseId}
            onChange={e => setIaClasseId(e.target.value)}
          >
            <option value="">— Choisir une classe —</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
          {iaClasse && (
            <p className="text-xs text-gray-400 mt-1.5">
              Contexte chargé : <strong className="text-gray-600 dark:text-gray-300">{iaClasse.nom}</strong>
              {iaClasse.matieres?.length > 0 && ` · ${iaClasse.matieres.map(m => m.nom).join(', ')}`}
            </p>
          )}
        </div>

        {/* Chat — monté uniquement quand une classe est sélectionnée */}
        {iaClasse && anneeActive ? (
          <AssistantIA
            key={iaClasse.id}
            classe={iaClasse}
            anneeId={anneeActive.id}
          />
        ) : (
          <div className="card p-10 flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
            <span className="text-4xl">🤖</span>
            <p>Sélectionnez une classe pour démarrer la conversation.</p>
            <p className="text-xs text-gray-300 dark:text-gray-600">
              L'assistant chargera automatiquement les séquences, la progression et les notes de la classe choisie.
            </p>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Générateur Ruban
  // ═══════════════════════════════════════════════════════════════════════════

  if (selected === 'ruban') {
    return (
      <div className="p-6 max-w-3xl">
        {/* Dialog conflit */}
        {conflictMode === 'ask' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">Ruban existant</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Un ruban existe déjà pour{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{selectedClasse?.nom}</span>
                    {selectedMatiere && <> — <span className="font-medium text-gray-900 dark:text-white">{selectedMatiere.nom}</span></>}.
                    Voulez-vous le remplacer ou ajouter ces séquences ?
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-5">
                <button onClick={handleConflictReplace} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">Remplacer</button>
                <button onClick={handleConflictAdd} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">Ajouter</button>
                <button onClick={handleConflictCancel} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">Annuler</button>
              </div>
            </div>
          </div>
        )}

        {/* Dialog post-import */}
        {showDeployPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                  <Check size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">Ruban importé avec succès !</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Voulez-vous déployer maintenant les séances sur le calendrier ?
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 mt-5">
                <button onClick={handleDeployNow} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">Déployer maintenant</button>
                <button onClick={handleDeployLater} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">Plus tard</button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-5 flex items-center gap-3">
          <button onClick={() => { setSelected(null); setResult(null); setError(null) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={20} className="text-purple-500" />
            Générateur — Ruban pédagogique
          </h1>
        </div>

        {/* Formulaire */}
        {!result && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            {/* Classe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Classe concernée <span className="text-red-500">*</span></label>
              <select value={form.classeId} onChange={e => setField('classeId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="">-- Sélectionner une classe --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>

            {/* Matière */}
            {form.classeId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Matière concernée <span className="text-red-500">*</span></label>
                {selectedMatieres.length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Ajoutez d'abord des matières à cette classe dans la fiche classe.
                  </p>
                ) : (
                  <select value={form.matiereId} onChange={e => setField('matiereId', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">-- Sélectionner une matière --</option>
                    {selectedMatieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Niveau <span className="text-red-500">*</span></label>
                <input type="text" value={form.niveau} onChange={e => setField('niveau', e.target.value)} placeholder="ex: Seconde Bac Pro, Terminale, CAP..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Spécialité / filière</label>
                <input type="text" value={form.specialite} onChange={e => setField('specialite', e.target.value)} placeholder="ex: TCVA, Commerce, Vente..."
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Thème du module <span className="text-red-500">*</span></label>
              <input type="text" value={form.theme} onChange={e => setField('theme', e.target.value)} placeholder="ex: La négociation commerciale, La relation client..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Volume horaire (h) <span className="text-red-500">*</span></label>
                <input type="number" min="1" value={form.volume} onChange={e => setField('volume', e.target.value)} placeholder="ex: 20"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de séquences <span className="text-red-500">*</span></label>
                <input type="number" min="1" value={form.nbSequences} onChange={e => setField('nbSequences', e.target.value)} placeholder="ex: 4"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre d'évaluations <span className="text-red-500">*</span></label>
                <input type="number" min="0" value={form.nbEvals} onChange={e => setField('nbEvals', e.target.value)} placeholder="ex: 2"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>

            {!API_KEY && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm px-4 py-3">
                ⚠️ Variable <code className="font-mono">VITE_ANTHROPIC_API_KEY</code> non définie. La génération ne fonctionnera pas.
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">{error}</div>}

            <button onClick={handleGenerate}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg px-4 py-2.5 transition-colors">
              <Sparkles size={16} /> Générer le ruban
            </button>
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <Loader2 size={28} className="text-purple-600 dark:text-purple-400 animate-spin" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">Claude génère votre ruban...</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cela peut prendre quelques secondes.</div>
            </div>
          </div>
        )}

        {/* Résultat ruban */}
        {result && !loading && (
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-5 py-4">
              <div className="font-semibold text-purple-800 dark:text-purple-300">
                Ruban généré — {result.sequences.length} séquence{result.sequences.length > 1 ? 's' : ''}
                {selectedMatiere && <span className="ml-2 font-normal text-purple-600 dark:text-purple-400">· {selectedMatiere.nom}</span>}
              </div>
              <div className="text-sm text-purple-600 dark:text-purple-400 mt-0.5">
                Total : {getTotalHeures(result)}h
                {form.volume && getTotalHeures(result) !== Number(form.volume) && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">(objectif : {form.volume}h)</span>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {result.sequences.map((seq, idx) => {
                const seqHeures = (seq.seances || []).reduce((s, c) => s + (Number(c.duree) || 0), 0)
                const isOpen = !!expandedSeqs[idx]
                return (
                  <div key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <button onClick={() => toggleSeq(idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
                      {isOpen ? <ChevronDown size={16} className="shrink-0 text-gray-400" /> : <ChevronRight size={16} className="shrink-0 text-gray-400" />}
                      <span className="flex-1 font-medium text-gray-900 dark:text-white text-sm">Séq. {seq.numero ?? idx + 1} — {seq.titre}</span>
                      <span className="text-xs text-gray-400 shrink-0">{(seq.seances || []).length} séance{(seq.seances || []).length > 1 ? 's' : ''} · {seqHeures}h</span>
                    </button>
                    {isOpen && (seq.seances || []).length > 0 && (
                      <div className="px-4 pb-3 space-y-1.5">
                        {seq.seances.map((s, si) => (
                          <div key={si} className="flex items-start gap-3 pl-5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                            <span className={`shrink-0 mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${normalizeType(s.type) === 'Évaluation' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : normalizeType(s.type) === 'TD / Exercices' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
                              {normalizeType(s.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.titre}</div>
                              {s.objectif && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{s.objectif}</div>}
                            </div>
                            <span className="shrink-0 text-xs text-gray-400">{s.duree}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={handleDownloadExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                <FileSpreadsheet size={16} /> Excel
              </button>
              <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                <FileText size={16} /> PDF
              </button>
              <button onClick={handleImport} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                <Download size={16} />
                Importer dans {selectedClasse ? `"${selectedClasse.nom}"` : 'la classe'}
                {selectedMatiere ? ` — ${selectedMatiere.nom}` : ''}
              </button>
              <button onClick={handleGenerate} className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                <RefreshCw size={16} /> Régénérer
              </button>
              <button onClick={handleReset} className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                <X size={16} /> Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — Générateur PPT
  // ═══════════════════════════════════════════════════════════════════════════

  // Garde admin
  if (!isAdmin()) {
    navigate('/')
    return null
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
  const sectionCls = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4'

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => { setSelected(null); setPptResult(null); setPptError(null) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <X size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-xl">📊</span>
          Générateur — Présentation PPT
        </h1>
      </div>

      {/* Formulaire PPT */}
      {!pptResult && !pptLoading && (
        <div className="space-y-5">

          {/* Section Informations pédagogiques */}
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Informations pédagogiques
            </h2>

            {/* Classe */}
            <div>
              <label className={labelCls}>Classe concernée</label>
              <select value={pptForm.classeId} onChange={e => setPptField('classeId', e.target.value)} className={inputCls}>
                <option value="">-- Sélectionner une classe --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>

            {/* Matière */}
            {pptForm.classeId && (
              <div>
                <label className={labelCls}>Matière</label>
                {pptMatieres.length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Aucune matière dans cette classe.
                  </p>
                ) : (
                  <select value={pptForm.matiereId} onChange={e => setPptField('matiereId', e.target.value)} className={inputCls}>
                    <option value="">-- Sélectionner une matière --</option>
                    {pptMatieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Séquence */}
            {pptSequences.length > 0 && (
              <div>
                <label className={labelCls}>Séquence du ruban <span className="text-gray-400 font-normal">(pré-remplit objectifs & compétences)</span></label>
                <select value={pptForm.sequenceId} onChange={e => setPptField('sequenceId', e.target.value)} className={inputCls}>
                  <option value="">-- Sélectionner une séquence --</option>
                  {pptSequences.map((s, i) => <option key={s.id} value={s.id}>Séq. {i + 1} — {s.titre}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Niveau scolaire</label>
                <input type="text" value={pptForm.niveau} onChange={e => setPptField('niveau', e.target.value)} placeholder="ex: Seconde Bac Pro" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Option / Filière</label>
                <input type="text" value={pptForm.option} onChange={e => setPptField('option', e.target.value)} placeholder="ex: TCVA Alimentation & Boissons" className={inputCls} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Numéro de chapitre</label>
                <input type="text" value={pptForm.chapitre} onChange={e => setPptField('chapitre', e.target.value)} placeholder="ex: 1.6" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Titre du cours <span className="text-red-500">*</span></label>
                <input type="text" value={pptForm.titre} onChange={e => setPptField('titre', e.target.value)} placeholder="ex: Le contrat de travail" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Section Contenu */}
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Contenu</h2>

            <div>
              <label className={labelCls}>Contenu voulu</label>
              <textarea value={pptForm.contenu} onChange={e => setPptField('contenu', e.target.value)}
                placeholder="ex: Définitions, formats, exemples, tableau comparatif, cas pratiques..."
                rows={3} className={`${inputCls} resize-none`} />
            </div>

            <div>
              <label className={labelCls}>Objectifs pédagogiques</label>
              <textarea value={pptForm.objectifs} onChange={e => setPptField('objectifs', e.target.value)}
                placeholder="ex: Identifier les types de contrats, Comprendre les droits et obligations..."
                rows={2} className={`${inputCls} resize-none`} />
            </div>

            <div>
              <label className={labelCls}>Compétences visées</label>
              <textarea value={pptForm.competences} onChange={e => setPptField('competences', e.target.value)}
                placeholder="ex: C1 - Communication, C3 - Gestion..."
                rows={2} className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Niveau de difficulté</label>
                <select value={pptForm.difficulte} onChange={e => setPptField('difficulte', e.target.value)} className={inputCls}>
                  <option>Débutant</option>
                  <option>Intermédiaire</option>
                  <option>Avancé</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Type de séance</label>
                <select value={pptForm.typeSeance} onChange={e => setPptField('typeSeance', e.target.value)} className={inputCls}>
                  <option>Cours magistral</option>
                  <option>TD</option>
                  <option>Évaluation</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Durée de la séance</label>
                <select value={pptForm.duree} onChange={e => setPptField('duree', e.target.value)} className={inputCls}>
                  <option>1h</option>
                  <option>1h30</option>
                  <option>2h</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setPptField('remediation', !pptForm.remediation)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${pptForm.remediation ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pptForm.remediation ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">Inclure activité de remédiation</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => setPptField('difficulteEleves', !pptForm.difficulteEleves)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${pptForm.difficulteEleves ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pptForm.difficulteEleves ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-gray-700 dark:text-gray-300">Adapter pour élèves en difficulté</span>
              </label>
            </div>
          </div>

          {/* Section Mise en forme */}
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Mise en forme</h2>

            <div>
              <label className={labelCls}>Nombre de slides : <span className="font-semibold text-blue-600 dark:text-blue-400">{pptForm.nbSlides}</span></label>
              <input type="range" min="6" max="15" value={pptForm.nbSlides}
                onChange={e => setPptField('nbSlides', Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1"><span>6</span><span>15</span></div>
            </div>

            <div>
              <label className={labelCls}>Palette de couleurs</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PALETTES.map(pal => (
                  <button
                    key={pal.id}
                    type="button"
                    onClick={() => setPptField('palette', pal.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border-2 text-left transition-all ${pptForm.palette === pal.id ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}
                  >
                    <div className="flex gap-1 shrink-0">
                      <div className="w-5 h-5 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: pal.primary }} />
                      <div className="w-5 h-5 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: pal.accent }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{pal.label}</span>
                  </button>
                ))}
              </div>
              {/* Aperçu couleurs sélectionnées */}
              <div className="mt-3 flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                <div className="w-8 h-8 rounded-lg shadow" style={{ backgroundColor: pptSelectedPalette.primary }} />
                <div className="w-8 h-8 rounded-lg shadow" style={{ backgroundColor: pptSelectedPalette.accent }} />
                <div className="w-8 h-8 rounded-lg shadow" style={{ backgroundColor: pptSelectedPalette.light }} />
                <div className="w-8 h-8 rounded-lg shadow border border-gray-200 dark:border-gray-600" style={{ backgroundColor: pptSelectedPalette.pale }} />
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <div className="font-medium text-gray-700 dark:text-gray-300">{pptSelectedPalette.label}</div>
                  <div className="font-mono">{pptSelectedPalette.primary} · {pptSelectedPalette.accent}</div>
                </div>
              </div>
            </div>
          </div>

          {!API_KEY && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm px-4 py-3">
              ⚠️ Variable <code className="font-mono">VITE_ANTHROPIC_API_KEY</code> non définie. La génération ne fonctionnera pas.
            </div>
          )}
          {pptError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">
              {pptError}
            </div>
          )}

          <button onClick={handleGeneratePPT}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-3 transition-colors text-base">
            <Sparkles size={18} />
            Générer la présentation
          </button>
        </div>
      )}

      {/* Chargement PPT */}
      {pptLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-16 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Loader2 size={32} className="text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-lg">🤖 Claude prépare votre présentation...</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Génération du plan de {pptForm.nbSlides} slides en cours.</div>
          </div>
        </div>
      )}

      {/* Résultat PPT */}
      {pptResult && !pptLoading && (
        <div className="space-y-5">
          {/* En-tête résultat */}
          <div className="rounded-xl border-2 p-5" style={{ borderColor: pptSelectedPalette.primary, backgroundColor: pptSelectedPalette.pale + '33' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: pptSelectedPalette.primary }}>
                <span className="text-white text-lg">📊</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 dark:text-white text-lg truncate">{pptForm.titre}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {pptResult.slides.length} slides · {pptResult.duree_estimee || '—'}
                  {pptMatiere && <> · <span className="font-medium">{pptMatiere.nom}</span></>}
                  {pptForm.niveau && <> · {pptForm.niveau}</>}
                  {pptForm.chapitre && <> · Ch. {pptForm.chapitre}</>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: pptSelectedPalette.primary }} />
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: pptSelectedPalette.accent }} />
              </div>
            </div>
            {pptResult.resume_pedagogique && (
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-gray-800/60 rounded-lg p-3">
                <span className="font-medium">📋 Résumé : </span>{pptResult.resume_pedagogique}
              </div>
            )}
          </div>

          {/* Liste des slides */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {pptResult.slides.map((slide, idx) => {
              const isOpen = !!expandedSlides[idx]
              const typeLabel = SLIDE_TYPE_LABEL[slide.type] || slide.type
              const typeBg = {
                titre: 'bg-gray-700 text-white',
                plan: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
                contenu: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
                synthese: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
                vocabulaire: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
                remediation: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
              }[slide.type] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'

              return (
                <div key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <button onClick={() => toggleSlide(idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white" style={{ backgroundColor: pptSelectedPalette.primary }}>
                      {slide.numero ?? idx + 1}
                    </div>
                    {isOpen ? <ChevronDown size={15} className="shrink-0 text-gray-400" /> : <ChevronRight size={15} className="shrink-0 text-gray-400" />}
                    <span className="flex-1 font-medium text-gray-900 dark:text-white text-sm truncate">{slide.titre}</span>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${typeBg}`}>{typeLabel}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 pl-14">
                      {(slide.contenu || []).length > 0 && (
                        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3 space-y-1.5">
                          {slide.contenu.map((c, ci) => (
                            <div key={ci} className="text-sm text-gray-700 dark:text-gray-300">
                              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono mr-2">[{c.type}]</span>
                              {c.valeur}
                            </div>
                          ))}
                        </div>
                      )}
                      {slide.notes_professeur && (
                        <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
                          <span className="shrink-0">📝</span>
                          <span><strong>Note prof :</strong> {slide.notes_professeur}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Overlay génération PPTX */}
          {pptGenerating && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: pptSelectedPalette.pale }}>
                  <Loader2 size={32} className="animate-spin" style={{ color: pptSelectedPalette.primary }} />
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-base">📊 Création du fichier PowerPoint...</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Génération de {pptResult?.slides?.length} slides en cours.</div>
                </div>
              </div>
            </div>
          )}

          {/* Boutons actions */}
          <div className="flex flex-wrap gap-3">
            {/* Télécharger le PPTX */}
            <button
              onClick={handleDownloadPPT}
              disabled={pptGenerating}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <Presentation size={16} />
              {pptGenerating ? 'Création...' : 'Télécharger le PPT'}
            </button>
            <button onClick={handleDownloadPPTPDF}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
              <FileText size={16} /> Télécharger en PDF
            </button>
            <button onClick={handleCopyPrompt}
              className={`flex items-center gap-2 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white'}`}>
              {copied ? <><ClipboardCheck size={16} /> Copié !</> : <><Copy size={16} /> Copier le prompt PowerPoint</>}
            </button>
            <button onClick={() => { setPptResult(null); setPptError(null) }}
              className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
              <RefreshCw size={16} /> Régénérer
            </button>
            <button onClick={() => { setPptResult(null); setPptError(null); setSelected(null) }}
              className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
              <X size={16} /> Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
