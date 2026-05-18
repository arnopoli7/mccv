import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  Sparkles, BookOpen, Loader2, RefreshCw, Check, X,
  ChevronDown, ChevronRight, AlertTriangle, Download, FileSpreadsheet, FileText,
} from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import { genId } from '../utils/id'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const API_URL = import.meta.env.DEV
  ? '/api/anthropic/v1/messages'
  : 'https://api.anthropic.com/v1/messages'

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

export default function Generateur() {
  const { get, add, update, getAnneeActive } = useData()
  const toast = useToast()
  const navigate = useNavigate()

  const [selected, setSelected] = useState(null) // null | 'ruban'
  const [form, setForm] = useState({
    classeId: '',
    matiereId: '',
    niveau: '',
    specialite: '',
    theme: '',
    volume: '',
    nbSequences: '',
    nbEvals: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [expandedSeqs, setExpandedSeqs] = useState({})

  // Conflict dialog state
  const [conflictMode, setConflictMode] = useState(null) // null | 'ask'
  const [pendingSequences, setPendingSequences] = useState(null)

  // Post-import deploy prompt
  const [showDeployPrompt, setShowDeployPrompt] = useState(false)

  const classes = get('classes')
  const anneeActive = getAnneeActive()
  const selectedClasse = classes.find(c => c.id === form.classeId)
  const selectedMatieres = selectedClasse?.matieres || []
  const selectedMatiere = selectedMatieres.find(m => m.id === form.matiereId) || null

  // Auto-select matière when classe changes
  useEffect(() => {
    if (!form.classeId) { setForm(f => ({ ...f, matiereId: '' })); return }
    const cl = classes.find(c => c.id === form.classeId)
    const mats = cl?.matieres || []
    setForm(f => ({ ...f, matiereId: mats.length === 1 ? mats[0].id : '' }))
  }, [form.classeId]) // eslint-disable-line

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleSeq(idx) {
    setExpandedSeqs(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  function getTotalHeures(data) {
    if (!data) return 0
    return data.sequences.reduce((total, seq) => {
      return total + (seq.seances || []).reduce((st, s) => st + (Number(s.duree) || 0), 0)
    }, 0)
  }

  async function handleGenerate() {
    if (!form.classeId) { toast.error('Sélectionnez une classe.'); return }
    if (selectedMatieres.length > 0 && !form.matiereId) {
      toast.error('Sélectionnez une matière.'); return
    }
    if (!form.niveau.trim()) { toast.error('Renseignez le niveau.'); return }
    if (!form.theme.trim()) { toast.error('Renseignez le thème du module.'); return }
    if (!form.volume || isNaN(Number(form.volume)) || Number(form.volume) <= 0) {
      toast.error('Volume horaire invalide.'); return
    }
    if (!form.nbSequences || isNaN(Number(form.nbSequences)) || Number(form.nbSequences) <= 0) {
      toast.error('Nombre de séquences invalide.'); return
    }
    if (form.nbEvals === '' || isNaN(Number(form.nbEvals)) || Number(form.nbEvals) < 0) {
      toast.error("Nombre d'évaluations invalide."); return
    }
    if (!API_KEY) { toast.error('Clé API Anthropic non configurée (variable VITE_ANTHROPIC_API_KEY manquante).'); return }

    setLoading(true)
    setError(null)
    setResult(null)
    setExpandedSeqs({})

    const matiereLabel = selectedMatiere ? `\n- Matière : ${selectedMatiere.nom}` : ''
    const prompt = `Crée-moi un ruban pédagogique structuré en JSON avec exactement ce format :
{
  "sequences": [
    {
      "numero": 1,
      "titre": "Titre de la séquence",
      "seances": [
        {
          "titre": "Titre de la séance",
          "type": "Cours",
          "duree": 1,
          "objectif": "Objectif pédagogique"
        }
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
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error?.message || `Erreur ${response.status}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Aucun JSON trouvé dans la réponse.')

      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.sequences || !Array.isArray(parsed.sequences)) {
        throw new Error('Structure JSON invalide : "sequences" manquant.')
      }

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

  // ── Import ────────────────────────────────────────────────────────────────

  function handleImport() {
    if (!selectedClasse || !anneeActive || !result) return

    const newSequences = buildSequences(result.sequences)
    const matiereId = form.matiereId || null

    const existingRuban = get('rubanPedagogique').find(
      r => r.classeId === form.classeId &&
           r.anneeScolaireId === anneeActive.id &&
           (r.matiereId === matiereId)
    )

    if (existingRuban && (existingRuban.sequences || []).length > 0) {
      setPendingSequences(newSequences)
      setConflictMode('ask')
    } else {
      doImport(newSequences, existingRuban, 'add')
    }
  }

  function doImport(sequences, existingRuban, mode) {
    const matiereId = form.matiereId || null
    const ruban = existingRuban ?? get('rubanPedagogique').find(
      r => r.classeId === form.classeId &&
           r.anneeScolaireId === anneeActive?.id &&
           (r.matiereId === matiereId)
    )

    const finalSequences = mode === 'replace'
      ? sequences
      : [...((ruban?.sequences) || []), ...sequences]

    if (ruban) {
      update('rubanPedagogique', ruban.id, { sequences: finalSequences })
    } else {
      add('rubanPedagogique', {
        id: genId('rb'),
        anneeScolaireId: anneeActive.id,
        classeId: form.classeId,
        matiereId: matiereId,
        sequences: finalSequences,
      })
    }

    setConflictMode(null)
    setPendingSequences(null)
    setShowDeployPrompt(true)
  }

  function handleConflictReplace() { doImport(pendingSequences, null, 'replace') }
  function handleConflictAdd() { doImport(pendingSequences, null, 'add') }
  function handleConflictCancel() { setConflictMode(null); setPendingSequences(null) }

  function handleDeployNow() {
    sessionStorage.setItem('mccv_autodeploy', JSON.stringify({
      classeId: form.classeId,
      matiereId: form.matiereId || null,
    }))
    setShowDeployPrompt(false)
    navigate(`/classes/${form.classeId}?tab=ruban`)
  }

  function handleDeployLater() {
    setShowDeployPrompt(false)
    navigate(`/classes/${form.classeId}?tab=ruban`)
  }

  function handleReset() {
    setResult(null)
    setError(null)
  }

  // ── Téléchargements ───────────────────────────────────────────────────────

  function handleDownloadExcel() {
    if (!result) return
    const rows = [[
      'N° Séquence', 'Titre séquence', 'Objectifs', 'Compétences',
      'Titre séance', 'Type', 'Durée (h)', 'Objectif séance',
    ]]
    result.sequences.forEach((seq, si) => {
      const seqNo = seq.numero ?? si + 1
      ;(seq.seances || []).forEach((s, i) => {
        rows.push([
          i === 0 ? seqNo : '',
          i === 0 ? seq.titre : '',
          i === 0 ? (seq.objectifs || '') : '',
          i === 0 ? (seq.competences || '') : '',
          s.titre,
          normalizeType(s.type),
          Math.max(1, Math.round(Number(s.duree) || 1)),
          s.objectif || '',
        ])
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 28 }, { wch: 24 },
      { wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 36 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ruban pédagogique')

    const cn = (selectedClasse?.nom || 'Classe').replace(/[^a-zA-Z0-9]/g, '_')
    const mn = (selectedMatiere?.nom || 'Matiere').replace(/[^a-zA-Z0-9]/g, '_')
    const dt = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Ruban_${cn}_${mn}_${dt}.xlsx`)
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
        return `<tr style="background:${bg}">
          <td style="border:1px solid #e5e7eb;padding:6px 8px">${s.titre}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center">${normalizeType(s.type)}</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px;text-align:center">${s.duree}h</td>
          <td style="border:1px solid #e5e7eb;padding:6px 8px">${s.objectif || ''}</td>
        </tr>`
      }).join('')
      return `
        <h3 style="margin:20px 0 6px;color:#1e40af;font-size:14px;border-bottom:1px solid #bfdbfe;padding-bottom:4px">
          Séquence ${seq.numero ?? si + 1} — ${seq.titre}
          <span style="font-weight:normal;font-size:12px;color:#6b7280;margin-left:8px">
            (${(seq.seances || []).length} séances · ${(seq.seances || []).reduce((a, s) => a + (Number(s.duree) || 0), 0)}h)
          </span>
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px">
          <thead>
            <tr style="background:#1e3a5f;color:white">
              <th style="padding:6px 8px;text-align:left;border:1px solid #1e3a5f">Titre de la séance</th>
              <th style="padding:6px 8px;text-align:center;border:1px solid #1e3a5f;white-space:nowrap">Type</th>
              <th style="padding:6px 8px;text-align:center;border:1px solid #1e3a5f;white-space:nowrap">Durée</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid #1e3a5f">Objectif</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) { toast.error('Fenêtre bloquée. Autorisez les popups pour télécharger le PDF.'); return }
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Ruban_${cn.replace(/\s/g,'_')}_${mn.replace(/\s/g,'_')}_${dt.replace(/\//g,'-')}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; font-size: 13px; }
    h1 { font-size: 20px; color: #1e3a5f; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
    @media print {
      button { display: none !important; }
      body { padding: 12px; }
    }
  </style>
</head>
<body>
  <h1>Ruban pédagogique</h1>
  <div class="meta">
    <strong>Classe :</strong> ${cn}
    ${mn ? `&nbsp;·&nbsp;<strong>Matière :</strong> ${mn}` : ''}
    &nbsp;·&nbsp;<strong>Thème :</strong> ${form.theme}
    &nbsp;·&nbsp;<strong>Niveau :</strong> ${form.niveau}
    &nbsp;·&nbsp;<strong>Volume :</strong> ${form.volume}h
    &nbsp;·&nbsp;Généré le ${dt}
    &nbsp;·&nbsp;${result.sequences.length} séquences · ${getTotalHeures(result)}h
  </div>
  ${seqHTML}
  <p style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">
      Imprimer / Enregistrer en PDF
    </button>
  </p>
</body>
</html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // ── Vue : liste des générateurs ───────────────────────────────────────────
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
        </div>
      </div>
    )
  }

  // ── Vue : formulaire + aperçu ─────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl">

      {/* Dialog de conflit */}
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
                  {selectedMatiere && (
                    <> — <span className="font-medium text-gray-900 dark:text-white">{selectedMatiere.nom}</span></>
                  )}.
                  Voulez-vous le remplacer ou ajouter ces séquences ?
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button onClick={handleConflictReplace}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                Remplacer
              </button>
              <button onClick={handleConflictAdd}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                Ajouter
              </button>
              <button onClick={handleConflictCancel}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog post-import : déployer ? */}
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
              <button onClick={handleDeployNow}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                Déployer maintenant
              </button>
              <button onClick={handleDeployLater}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors">
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => { setSelected(null); setResult(null); setError(null) }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Classe concernée <span className="text-red-500">*</span>
            </label>
            <select
              value={form.classeId}
              onChange={e => setField('classeId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">-- Sélectionner une classe --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>

          {/* Matière */}
          {form.classeId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Matière concernée <span className="text-red-500">*</span>
              </label>
              {selectedMatieres.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20
                  border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Ajoutez d'abord des matières à cette classe dans la fiche classe.
                </p>
              ) : (
                <select
                  value={form.matiereId}
                  onChange={e => setField('matiereId', e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                    text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Sélectionner une matière --</option>
                  {selectedMatieres.map(m => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Niveau <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.niveau}
                onChange={e => setField('niveau', e.target.value)}
                placeholder="ex: Seconde Bac Pro, Terminale, CAP..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Spécialité / filière
              </label>
              <input
                type="text"
                value={form.specialite}
                onChange={e => setField('specialite', e.target.value)}
                placeholder="ex: TCVA, Commerce, Vente..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Thème du module <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.theme}
              onChange={e => setField('theme', e.target.value)}
              placeholder="ex: La négociation commerciale, La relation client..."
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Volume horaire (h) <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min="1"
                value={form.volume}
                onChange={e => setField('volume', e.target.value)}
                placeholder="ex: 20"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre de séquences <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min="1"
                value={form.nbSequences}
                onChange={e => setField('nbSequences', e.target.value)}
                placeholder="ex: 4"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre d'évaluations <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min="0"
                value={form.nbEvals}
                onChange={e => setField('nbEvals', e.target.value)}
                placeholder="ex: 2"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {!API_KEY && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
              text-amber-700 dark:text-amber-400 text-sm px-4 py-3">
              ⚠️ Variable <code className="font-mono">VITE_ANTHROPIC_API_KEY</code> non définie dans le fichier <code className="font-mono">.env</code>.
              La génération ne fonctionnera pas.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800
              text-red-700 dark:text-red-400 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700
              text-white font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            <Sparkles size={16} />
            Générer le ruban
          </button>
        </div>
      )}

      {/* Chargement */}
      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12
          flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <Loader2 size={28} className="text-purple-600 dark:text-purple-400 animate-spin" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 dark:text-white">
              Claude génère votre ruban...
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Cela peut prendre quelques secondes.
            </div>
          </div>
        </div>
      )}

      {/* Aperçu du résultat */}
      {result && !loading && (
        <div className="space-y-4">
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800
            rounded-xl px-5 py-4">
            <div className="font-semibold text-purple-800 dark:text-purple-300">
              Ruban généré — {result.sequences.length} séquence{result.sequences.length > 1 ? 's' : ''}
              {selectedMatiere && (
                <span className="ml-2 font-normal text-purple-600 dark:text-purple-400">· {selectedMatiere.nom}</span>
              )}
            </div>
            <div className="text-sm text-purple-600 dark:text-purple-400 mt-0.5">
              Total : {getTotalHeures(result)}h
              {form.volume && getTotalHeures(result) !== Number(form.volume) && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  (objectif : {form.volume}h)
                </span>
              )}
            </div>
          </div>

          {/* Liste des séquences */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {result.sequences.map((seq, idx) => {
              const seqHeures = (seq.seances || []).reduce((s, c) => s + (Number(c.duree) || 0), 0)
              const isOpen = !!expandedSeqs[idx]
              return (
                <div key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <button
                    onClick={() => toggleSeq(idx)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50
                      dark:hover:bg-gray-700/50 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown size={16} className="shrink-0 text-gray-400" />
                      : <ChevronRight size={16} className="shrink-0 text-gray-400" />
                    }
                    <span className="flex-1 font-medium text-gray-900 dark:text-white text-sm">
                      Séq. {seq.numero ?? idx + 1} — {seq.titre}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {(seq.seances || []).length} séance{(seq.seances || []).length > 1 ? 's' : ''} · {seqHeures}h
                    </span>
                  </button>

                  {isOpen && (seq.seances || []).length > 0 && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {seq.seances.map((s, si) => (
                        <div
                          key={si}
                          className="flex items-start gap-3 pl-5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                        >
                          <span className={`shrink-0 mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded
                            ${normalizeType(s.type) === 'Évaluation'
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                              : normalizeType(s.type) === 'TD / Exercices'
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                            }`}
                          >
                            {normalizeType(s.type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {s.titre}
                            </div>
                            {s.objectif && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {s.objectif}
                              </div>
                            )}
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

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {/* Excel */}
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white
                font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <FileSpreadsheet size={16} />
              Excel
            </button>

            {/* PDF */}
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white
                font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <FileText size={16} />
              PDF
            </button>

            {/* Importer */}
            <button
              onClick={handleImport}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white
                font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <Download size={16} />
              Importer dans {selectedClasse ? `"${selectedClasse.nom}"` : 'la classe'}
              {selectedMatiere ? ` — ${selectedMatiere.nom}` : ''}
            </button>

            {/* Régénérer */}
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200
                dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300
                font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <RefreshCw size={16} />
              Régénérer
            </button>

            {/* Annuler */}
            <button
              onClick={handleReset}
              className="flex items-center gap-2 border border-gray-200 dark:border-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400
                hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              <X size={16} />
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
