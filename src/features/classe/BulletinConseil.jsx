import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Loader, Printer, RefreshCw, Edit2, Check, Bot } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useData } from '../../contexts/DataContext'
import { useAuth } from '../../contexts/AuthContext'
import { parseISO, isBefore, isSameDay } from '../../utils/dateUtils'

async function callClaude(prompt) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Clé API Anthropic manquante (VITE_ANTHROPIC_API_KEY)')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erreur API (${response.status})`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export default function BulletinConseil({ classe, anneeId, isOpen, onClose }) {
  const { seancesCalendrier, rubanPedagogique, ccf, anneesScolaires, getParams } = useData()
  const { getCurrentUser } = useAuth()
  const user = getCurrentUser()
  const params = getParams()

  const [bulletin, setBulletin] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')

  const annees = anneesScolaires()
  const anneeActive = annees.find(a => a.id === anneeId)
  const enseignantLabel = params?.enseignant || user?.nom || ''
  const etablissementLabel = params?.etablissement || ''

  // Calcul des stats
  const allSeances = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = rubanList.flatMap(rb => rb.sequences || [])
  const total = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const done = allSeances.filter(s => s.statut === 'faite').length
  const retard = allSeances.filter(s => {
    if (s.statut === 'faite') return false
    try { return isBefore(parseISO(s.date), new Date()) && !isSameDay(parseISO(s.date), new Date()) }
    catch { return false }
  }).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const ccfList = ccf({ classeId: classe.id, anneeScolaireId: anneeId })
  const ccfFaits = ccfList.filter(c => c.ordrePassage?.some(e => e.statut === 'passé')).length
  const allNotes = ccfList.flatMap(c =>
    (c.ordrePassage || []).filter(e => e.note !== null && e.note !== undefined && e.note !== '').map(e => parseFloat(e.note))
  )
  const moyenneCCF = allNotes.length > 0
    ? (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2)
    : null

  const seqTerminees = sequences.filter((seq) => {
    const ids = (seq.seances || []).map(s => s.id)
    const seancesFaites = allSeances.filter(sc => ids.includes(sc.seanceRubanId) && sc.statut === 'faite').length
    return seancesFaites === ids.length && ids.length > 0
  }).length
  const seqEnCours = sequences.filter((seq) => {
    const ids = (seq.seances || []).map(s => s.id)
    const seancesFaites = allSeances.filter(sc => ids.includes(sc.seanceRubanId) && sc.statut === 'faite').length
    return seancesFaites > 0 && seancesFaites < ids.length
  }).length

  const notesRecentes = allSeances
    .filter(s => s.noteCours)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(s => `"${s.noteCours}"`)
    .join('; ') || 'Aucune note'

  function buildPrompt() {
    return `Tu es un professeur de commerce. Génère une appréciation générale pour le conseil de classe de la classe ${classe.nom}.

Contexte pédagogique :
- Séances réalisées : ${done}/${total} (${pct}%)
- Séquences terminées : ${seqTerminees}
- Séquences en cours : ${seqEnCours}
- CCF réalisés : ${ccfFaits}${moyenneCCF ? `, moyenne : ${moyenneCCF}/20` : ''}
- Notes rapides sur les séances : ${notesRecentes}

Génère :
1. Une appréciation générale positive et constructive (3-4 phrases)
2. Les points forts observés (2-3 points)
3. Les axes de progression (2-3 points)
4. Un encouragement final

Ton : professionnel, bienveillant, précis.
Format : texte structuré avec des titres clairs, pas de JSON.`
  }

  async function generate() {
    setIsGenerating(true)
    setError('')
    setBulletin('')
    setIsEditing(false)
    try {
      const text = await callClaude(buildPrompt())
      setBulletin(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  function startEdit() {
    setEditText(bulletin)
    setIsEditing(true)
  }

  function saveEdit() {
    setBulletin(editText)
    setIsEditing(false)
  }

  function handlePrint() {
    const dateStr = format(new Date(), 'd MMMM yyyy', { locale: fr })
    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bulletin conseil de classe — ${classe.nom}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2cm; color: #222; font-size: 12px; line-height: 1.6; }
    header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #555; margin: 0; font-size: 11px; }
    .bulletin { white-space: pre-wrap; background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .stats { display: flex; gap: 24px; margin-top: 16px; padding: 12px; background: #f0f4ff; border-radius: 6px; }
    .stat { text-align: center; }
    .stat-val { font-size: 20px; font-weight: bold; color: #1d4ed8; }
    .stat-lbl { font-size: 10px; color: #666; }
    footer { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
    @media print { body { margin: 1.5cm; } }
  </style>
</head>
<body>
  <header>
    <h1>${etablissementLabel || 'Établissement'} — ${enseignantLabel || 'Enseignant'}</h1>
    <p class="sub">Classe : <strong>${classe.nom}</strong> · Année : ${anneeActive?.label || ''} · Date : ${dateStr}</p>
  </header>

  <h2 style="font-size:14px">Appréciation — Conseil de classe</h2>
  <div class="bulletin">${bulletin.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

  <div class="stats">
    <div class="stat"><div class="stat-val">${done}/${total}</div><div class="stat-lbl">Séances faites</div></div>
    <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Taux d'avancement</div></div>
    <div class="stat"><div class="stat-val">${ccfFaits}</div><div class="stat-lbl">CCF réalisés</div></div>
    ${moyenneCCF ? `<div class="stat"><div class="stat-val">${moyenneCCF}/20</div><div class="stat-lbl">Moyenne CCF</div></div>` : ''}
  </div>

  <footer>
    <span>Document généré via MCCV — Mon Cahier de Cours Virtuel</span>
    <span>Imprimé le ${dateStr}</span>
  </footer>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`)
    win.document.close()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📋 Bulletin conseil de classe" size="xl">
      <div className="space-y-4">
        {/* Stats rapides */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Séances faites', value: `${done}/${total}` },
            { label: 'Avancement', value: `${pct}%` },
            { label: 'CCF réalisés', value: ccfFaits },
            { label: 'Moy. CCF', value: moyenneCCF ? `${moyenneCCF}/20` : '—' },
          ].map(s => (
            <div key={s.label} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Zone bulletin */}
        {!bulletin && !isGenerating && !error && (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p className="mb-4">Cliquez sur "Générer" pour créer l'appréciation du conseil de classe.</p>
            <button onClick={generate} className="btn-primary flex items-center gap-2 mx-auto">
              <Bot className="w-4 h-4" /> Générer le bulletin
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
            <Loader size={28} className="animate-spin text-blue-500" />
            <span className="text-sm">Génération en cours…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-sm text-red-700 dark:text-red-300">
            ❌ {error}
            <button onClick={generate} className="ml-3 underline">Réessayer</button>
          </div>
        )}

        {bulletin && !isGenerating && (
          <>
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="input w-full text-sm leading-relaxed"
                  rows={14}
                />
                <button onClick={saveEdit} className="btn-primary flex items-center gap-2 text-sm">
                  <Check size={14} /> Valider
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                {bulletin}
              </div>
            )}

            {!isEditing && (
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={startEdit}
                  className="btn-secondary flex items-center gap-2 text-sm py-1.5"
                >
                  <Edit2 size={13} /> Modifier
                </button>
                <button
                  onClick={generate}
                  className="btn-secondary flex items-center gap-2 text-sm py-1.5"
                >
                  <RefreshCw size={13} /> Régénérer
                </button>
                <button
                  onClick={handlePrint}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Printer size={14} /> Imprimer
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

