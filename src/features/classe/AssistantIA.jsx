import { useState, useEffect, useRef } from 'react'
import { Send, Trash2, Bot, User, Loader } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useData } from '../../contexts/DataContext'

const MAX_MESSAGES = 50

const QUICK_ACTIONS = [
  { label: '📝 Générer une évaluation', prompt: 'Génère une évaluation adaptée à la progression actuelle de la classe. Inclus les consignes, le barème et les compétences évaluées.' },
  { label: '✏️ Créer un TD', prompt: 'Propose un TD pratique en lien avec les séquences en cours. Inclus les objectifs, les exercices et les corrigés.' },
  { label: '🎯 Rédiger les objectifs', prompt: 'Rédige des objectifs pédagogiques précis et mesurables pour les prochaines séquences, en lien avec le référentiel commerce/vente.' },
  { label: '💡 Proposer des séances', prompt: 'Propose 3 séances originales et engageantes adaptées au niveau et aux séquences en cours. Décris les activités, supports et durées.' },
  { label: '📊 Analyser la progression', prompt: 'Analyse la progression pédagogique de la classe et donne des recommandations concrètes pour optimiser le reste de l\'année.' },
]

function buildSystemPrompt({ classe, sequences, allSeances, done, total, anneeLabel, ccfList }) {
  const matieres = (classe.matieres || []).map(m => m.nom).join(', ') || 'Non précisées'
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  // Séquences terminées / en cours
  const seqTerminees = sequences
    .filter(seq => {
      const ids = (seq.seances || []).map(s => s.id)
      if (ids.length === 0) return false
      return allSeances.filter(sc => ids.includes(sc.seanceRubanId) && sc.statut === 'faite').length === ids.length
    })
    .map(s => `"${s.titre}"`)
    .join(', ') || 'Aucune'

  const seqEnCours = sequences.find(seq => {
    const ids = (seq.seances || []).map(s => s.id)
    const faites = allSeances.filter(sc => ids.includes(sc.seanceRubanId) && sc.statut === 'faite').length
    return faites > 0 && faites < ids.length
  })
  const seqEnCoursLabel = seqEnCours
    ? `"${seqEnCours.titre}"${seqEnCours.objectifs ? ` — objectif : ${seqEnCours.objectifs}` : ''}`
    : 'Aucune en cours'

  // Prochaines séances (non faites, triées par date)
  const prochaines = allSeances
    .filter(s => s.statut !== 'faite')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map(s => `"${s.titre}" (${s.date})`)
    .join(', ') || 'Aucune planifiée'

  // Objectifs et compétences
  const objectifs = sequences
    .filter(s => s.objectifs)
    .map(s => s.objectifs)
    .slice(0, 6)
    .join(' | ') || 'Non renseignés'

  const competences = sequences
    .filter(s => s.competences)
    .map(s => s.competences)
    .slice(0, 4)
    .join(' | ') || 'Non renseignées'

  // Notes récentes sur séances
  const notesRecentes = allSeances
    .filter(s => s.noteCours)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(s => `"${s.noteCours}" (${s.titre}, ${s.date})`)
    .join(' | ') || 'Aucune note saisie'

  // CCF
  const ccfFaits = ccfList.filter(c => c.ordrePassage?.some(e => e.statut === 'passé')).length
  const allNotes = ccfList.flatMap(c =>
    (c.ordrePassage || []).filter(e => e.note !== null && e.note !== undefined && e.note !== '').map(e => parseFloat(e.note))
  )
  const moyenneCCF = allNotes.length > 0
    ? (allNotes.reduce((a, b) => a + b, 0) / allNotes.length).toFixed(2)
    : 'Non disponible'

  return `Tu es un assistant pédagogique expert spécialisé dans l'enseignement professionnel du commerce, de la vente et de la distribution en lycée professionnel.
Tu accompagnes un professeur dans la préparation et le suivi de ses cours.

CONTEXTE DE LA CLASSE :
- Classe : ${classe.nom}
- Niveau : ${classe.niveau || 'Non précisé'} (ex: Seconde Bac Pro, Terminale, CAP...)
- Matières enseignées : ${matieres}
- Année scolaire : ${anneeLabel || 'Non précisée'}

PROGRESSION PÉDAGOGIQUE :
- Séances réalisées : ${done} sur ${total} au total
- Pourcentage d'avancement : ${pct}%
- Séquences terminées : ${seqTerminees}
- Séquence en cours : ${seqEnCoursLabel}
- Prochaines séances : ${prochaines}

CONTENU DU PROGRAMME :
- Objectifs pédagogiques : ${objectifs}
- Compétences visées : ${competences}
- Référentiel : ${classe.referentiel || 'Non précisé'}

OBSERVATIONS RÉCENTES :
- Notes sur les dernières séances : ${notesRecentes}
- Évaluations réalisées : ${ccfFaits} CCF${ccfList.length > 0 ? ` sur ${ccfList.length} prévus` : ''}
- Moyenne générale CCF : ${moyenneCCF}${allNotes.length > 0 ? '/20' : ''}

RÈGLES DE RÉPONSE ABSOLUES :
1. Tes réponses sont TOUJOURS directement utilisables en classe, sans travail de reformatage nécessaire
2. Adapte SYSTÉMATIQUEMENT le vocabulaire, les exemples et la complexité au niveau ${classe.niveau || 'de la classe'}
3. Utilise des exemples concrets du secteur ${matieres} (commerce alimentaire, grande distribution, vente...)
4. Respecte le référentiel Bac Pro / CAP en vigueur
5. Quand tu génères un document (évaluation, TD, cours) :
   - Indique clairement la durée estimée
   - Précise le barème si c'est une évaluation
   - Structure le document avec des titres clairs
   - Adapte la difficulté au niveau de la classe
6. Si tu proposes des séances, respecte les durées en heures entières uniquement (1h, 2h, 3h...)
7. Tiens compte des séances déjà réalisées pour ne pas répéter du contenu déjà vu
8. En cas de demande d'évaluation, propose toujours :
   - Un sujet élève propre et prêt à distribuer
   - Un corrigé détaillé avec barème
   - La durée recommandée

FORMAT DE TES RÉPONSES :
- Utilise des titres clairs avec ## et ###
- Mets en gras les termes importants
- Utilise des listes à puces pour les énumérations
- Sépare clairement les différentes parties
- Termine toujours par une question ou suggestion pour aider le professeur à aller plus loin`
}

async function callClaude(messages, systemPrompt) {
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
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erreur API (${response.status})`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

export default function AssistantIA({ classe, anneeId }) {
  const { session } = useAuth()
  const { seancesCalendrier, rubanPedagogique, ccf, anneesScolaires } = useData()
  const userId = session?.userId

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Données contextuelles
  const rubanList = rubanPedagogique({ classeId: classe.id, anneeScolaireId: anneeId })
  const sequences = rubanList.flatMap(rb => rb.sequences || [])
  const allSeances = seancesCalendrier({ classeId: classe.id, anneeScolaireId: anneeId })
  const done = allSeances.filter(s => s.statut === 'faite').length
  const total = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const ccfList = ccf({ classeId: classe.id, anneeScolaireId: anneeId })
  const anneeLabel = anneesScolaires().find(a => a.id === anneeId)?.label || ''

  const systemPrompt = buildSystemPrompt({ classe, sequences, allSeances, done, total, anneeLabel, ccfList })

  // Clé Firestore pour l'historique
  const historyRef = userId
    ? doc(db, 'users', userId, 'chatHistory', classe.id)
    : null

  // Chargement historique
  useEffect(() => {
    if (!historyRef) { setLoadingHistory(false); return }
    setLoadingHistory(true)
    getDoc(historyRef)
      .then(snap => {
        if (snap.exists()) setMessages(snap.data().messages || [])
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [classe.id, userId]) // eslint-disable-line

  // Scroll automatique
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function saveHistory(msgs) {
    if (!historyRef) return
    const kept = msgs.slice(-MAX_MESSAGES)
    await setDoc(historyRef, { messages: kept }).catch(() => {})
    return kept
  }

  async function sendMessage(text) {
    const trimmed = (text || input).trim()
    if (!trimmed || isLoading) return
    setInput('')

    const userMsg = { role: 'user', content: trimmed, ts: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const reply = await callClaude(newMessages, systemPrompt)
      const assistantMsg = { role: 'assistant', content: reply, ts: Date.now() }
      const final = [...newMessages, assistantMsg]
      const kept = await saveHistory(final)
      setMessages(kept || final)
    } catch (err) {
      const errMsg = { role: 'assistant', content: `❌ Erreur : ${err.message}`, ts: Date.now(), isError: true }
      const final = [...newMessages, errMsg]
      setMessages(final)
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  async function clearHistory() {
    setMessages([])
    if (historyRef) await setDoc(historyRef, { messages: [] }).catch(() => {})
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (loadingHistory) {
    return (
      <div className="card p-8 flex items-center justify-center gap-3 text-gray-400">
        <Loader size={20} className="animate-spin" />
        <span className="text-sm">Chargement de l'historique…</span>
      </div>
    )
  }

  return (
    <div className="card flex flex-col" style={{ height: '70vh' }}>
      {/* En-tête */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-blue-500" />
          <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
            Assistant IA — {classe.nom}
          </span>
          <span className="text-xs text-gray-400">
            ({done}/{total} séances faites)
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} /> Effacer la conversation
          </button>
        )}
      </div>

      {/* Raccourcis rapides */}
      <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.prompt)}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Zone messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            <Bot size={40} className="text-blue-200 dark:text-blue-800" />
            <p className="text-sm text-center max-w-xs">
              Bonjour ! Je suis votre assistant pédagogique pour la classe <strong className="text-gray-600 dark:text-gray-300">{classe.nom}</strong>.
              Utilisez les raccourcis ci-dessus ou posez-moi directement une question.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
              msg.role === 'user'
                ? 'bg-blue-100 dark:bg-blue-900/40'
                : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              {msg.role === 'user'
                ? <User size={14} className="text-blue-600 dark:text-blue-400" />
                : <Bot size={14} className="text-gray-600 dark:text-gray-300" />
              }
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : msg.isError
                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 rounded-tl-sm'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-tl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <Bot size={14} className="text-gray-600 dark:text-gray-300" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Zone saisie */}
      <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question… (Entrée pour envoyer)"
            rows={2}
            className="flex-1 resize-none input text-sm py-2"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            className="btn-primary p-2.5 flex items-center justify-center disabled:opacity-50"
          >
            {isLoading
              ? <Loader size={17} className="animate-spin" />
              : <Send size={17} />
            }
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">Entrée pour envoyer · Maj+Entrée pour saut de ligne</p>
      </div>
    </div>
  )
}
