import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, BookOpen, Loader2, RefreshCw, Check, X, ChevronDown, ChevronRight, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { genId } from '../utils/id'

function apiKeyStorageKey(userId) {
  return `mccv_anthropic_api_key_${userId}`
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

export default function Generateur() {
  const { get, add, update, getAnneeActive } = useData()
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const userId = session?.userId

  const [selected, setSelected] = useState(null) // null | 'ruban'
  const [showApiKey, setShowApiKey] = useState(false)
  const [form, setForm] = useState({
    classeId: '',
    niveau: '',
    specialite: '',
    theme: '',
    volume: '',
    nbSequences: '',
    nbEvals: '',
    apiKey: userId ? (localStorage.getItem(apiKeyStorageKey(userId)) || '') : '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [expandedSeqs, setExpandedSeqs] = useState({})

  // Conflict dialog state
  const [conflictMode, setConflictMode] = useState(null) // null | 'ask'
  const [pendingSequences, setPendingSequences] = useState(null)

  const classes = get('classes')
  const anneeActive = getAnneeActive()
  const selectedClasse = classes.find(c => c.id === form.classeId)

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
    if (!form.apiKey.trim()) { toast.error('Renseignez votre clé API Anthropic.'); return }

    if (userId) localStorage.setItem(apiKeyStorageKey(userId), form.apiKey.trim())
    setLoading(true)
    setError(null)
    setResult(null)
    setExpandedSeqs({})

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
- Spécialité : ${form.specialite.trim() || 'Non précisée'}
- Thème : ${form.theme}
- Volume horaire total : ${form.volume}h
- Nombre de séquences : ${form.nbSequences}
- Nombre d'évaluations : ${form.nbEvals}, intégrées dans le volume horaire
- Toutes les durées sont des heures entières uniquement (1, 2, 3...)
- Types acceptés : Cours / TD / Exercices / Évaluation
Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': form.apiKey.trim(),
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

      // Expand all sequences by default in the preview
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

  // Called when user clicks the import button
  function handleImport() {
    if (!selectedClasse || !anneeActive || !result) return

    const newSequences = buildSequences(result.sequences)

    const existingRuban = get('rubanPedagogique').find(
      r => r.classeId === form.classeId &&
           r.anneeScolaireId === anneeActive.id &&
           !r.matiereId
    )

    if (existingRuban && (existingRuban.sequences || []).length > 0) {
      // Ruban already has sequences → ask user
      setPendingSequences(newSequences)
      setConflictMode('ask')
    } else {
      // No existing content → import directly
      doImport(newSequences, existingRuban, 'add')
    }
  }

  // mode: 'replace' | 'add'
  function doImport(sequences, existingRuban, mode) {
    // Allow calling from conflict dialog where we re-fetch existingRuban
    const ruban = existingRuban ?? get('rubanPedagogique').find(
      r => r.classeId === form.classeId &&
           r.anneeScolaireId === anneeActive?.id &&
           !r.matiereId
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
        matiereId: null,
        sequences: finalSequences,
      })
    }

    setConflictMode(null)
    setPendingSequences(null)

    toast.success(`Ruban importé avec succès dans ${selectedClasse.nom} !`)
    navigate(`/classes/${form.classeId}?tab=ruban`)
  }

  function handleConflictReplace() {
    doImport(pendingSequences, null, 'replace')
  }

  function handleConflictAdd() {
    doImport(pendingSequences, null, 'add')
  }

  function handleConflictCancel() {
    setConflictMode(null)
    setPendingSequences(null)
  }

  function handleReset() {
    setResult(null)
    setError(null)
  }

  // ── Vue : liste des générateurs ──────────────────────────────────────────
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
      {/* Dialog de conflit (modale inline) */}
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
                  <span className="font-medium text-gray-900 dark:text-white">{selectedClasse?.nom}</span>.
                  Voulez-vous le remplacer ou ajouter ces séquences ?
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <button
                onClick={handleConflictReplace}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                Remplacer
              </button>
              <button
                onClick={handleConflictAdd}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                Ajouter
              </button>
              <button
                onClick={handleConflictCancel}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300
                  hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                Annuler
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
                type="number"
                min="1"
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
                type="number"
                min="1"
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
                type="number"
                min="0"
                value={form.nbEvals}
                onChange={e => setField('nbEvals', e.target.value)}
                placeholder="ex: 2"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Clé API */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Clé API Anthropic <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={e => setField('apiKey', e.target.value)}
                placeholder="sk-ant-..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700
                  text-gray-900 dark:text-white px-3 py-2 pr-10 text-sm font-mono
                  focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Votre clé est sauvegardée localement dans ce navigateur.
            </p>
          </div>

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
            <button
              onClick={handleImport}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white
                font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <Check size={16} />
              Importer dans {selectedClasse ? `"${selectedClasse.nom}"` : 'la classe'}
            </button>
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200
                dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300
                font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              <RefreshCw size={16} />
              Régénérer
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 border border-gray-200 dark:border-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 text-gray-500 dark:text-gray-400
                hover:text-gray-700 dark:hover:text-gray-200 font-medium rounded-lg px-4 py-2.5 transition-colors"
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
