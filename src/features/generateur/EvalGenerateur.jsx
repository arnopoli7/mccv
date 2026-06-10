import { useState, useEffect, useMemo } from 'react'
import { FileText, Loader2, RefreshCw, Printer, Download, BookMarked, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { useData } from '../../contexts/DataContext'
import { useToast } from '../../contexts/ToastContext'
import { genId } from '../../utils/id'
import { useNavigate } from 'react-router-dom'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
const API_URL = import.meta.env.DEV
  ? '/api/anthropic/v1/messages'
  : 'https://api.anthropic.com/v1/messages'

const DIPLOMES = [
  { value: 'CAP_SAPVER', label: 'CAP SAPVER' },
  { value: 'SECONDE_TCVA', label: 'Seconde Pro TCVA' },
  { value: 'BAC_PRO_TCVA', label: 'Bac Pro TCVA (1re / Tle)' },
  { value: 'BTS_MCO', label: 'BTS MCO' },
  { value: 'BTS_NDRC', label: 'BTS NDRC' },
  { value: 'Autre', label: 'Autre (saisie libre)' },
]

const MODULES_PAR_DIPLOME = {
  CAP_SAPVER: [
    'MP1 : Relation aux personnes et communication professionnelle',
    'MP2 : Vente et relation commerciale',
    'MP3 : Produits, services et espaces de vente',
    'MP4 : Techniques de vente en commerce alimentaire et de proximite',
    'MP5 : Services aux personnes en espace rural',
    'MIP : Module d\'Initiative Professionnelle',
  ],
  SECONDE_TCVA: [
    'Decouverte des filieres et des acteurs du secteur TCVA',
    'L\'environnement commercial et les types de commerce',
    'Les produits alimentaires et boissons : caracteristiques et reglementation',
    'La relation client et les techniques de vente',
    'La communication commerciale en point de vente',
    'Les operations commerciales et promotionnelles',
    'Hygiene, securite et qualite alimentaire',
    'L\'entreprise et son environnement economique et juridique',
  ],
  BAC_PRO_TCVA: [
    'Module 1 : L\'environnement commercial et economique de la filiere',
    'Module 2 : Les produits alimentaires et les boissons',
    'Module 3 : La relation client et la vente conseil',
    'Module 4 : L\'animation et la dynamisation de l\'offre',
    'Module 5 : La communication commerciale',
    'Module 6 : La gestion de l\'unite commerciale',
    'Module 7 : Le droit et la reglementation professionnelle',
    'Module 8 : Le management et l\'organisation du travail',
    'Module 9 : Les techniques de negociation et d\'argumentation',
    'Module 10 : Le merchandising et l\'implantation des produits',
    'Module 11 : La logistique et la gestion des stocks',
    'Module 12 : Le numerique au service de la vente',
  ],
  BTS_MCO: [
    'E41 - Cibler et prospecter la clientele',
    'E41 - Analyser les besoins du client',
    'E41 - Argumenter et conclure la vente',
    'E41 - Fideliser la clientele',
    'E42 - Elaborer et adapter en continu l\'offre de produits et services',
    'E42 - Agencer l\'espace commercial',
    'E42 - Organiser les promotions et animations commerciales',
    'E42 - Concevoir et mettre en place la communication',
    'E42 - Analyser et suivre l\'action commerciale',
    'E43 - Gerer les approvisionnements et les stocks',
    'E43 - Gerer les flux financiers',
    'E43 - Analyser les performances commerciales',
    'E43 - Elaborer des budgets previsionnels',
    'E44 - Organiser le travail de l\'equipe',
    'E44 - Recruter et integrer les collaborateurs',
    'E44 - Animer et motiver l\'equipe',
    'E44 - Evaluer les performances individuelles et collectives',
    'CEJM - L\'integration de l\'entreprise dans son environnement',
    'CEJM - La regulation de l\'activite economique',
    'CEJM - L\'organisation de l\'activite de l\'entreprise',
    'CEJM - Le financement de l\'activite de l\'entreprise',
    'CEJM - Les relations sociales dans l\'entreprise',
    'CEJM - La creation de valeur dans l\'entreprise',
  ],
  BTS_NDRC: [
    'E41 - Developpement de clientele et prospection',
    'E41 - Negociation et techniques de vente',
    'E41 - Valorisation et animation de la relation client',
    'E41 - Veille et expertise commerciales',
    'E42 - Management de la relation client omnicanal',
    'E42 - Animation de la relation client digital',
    'E42 - Developpement de la relation client e-commerce',
    'E42 - Outils numeriques et CRM',
    'E43 - Implantation et promotion d\'une offre chez des distributeurs',
    'E43 - Developpement d\'un reseau de partenaires',
    'E43 - Animation d\'un reseau de vente directe',
    'E43 - Merchandising et animation reseau',
  ],
}

const TYPES_EVAL = [
  { value: 'QCM', label: 'QCM' },
  { value: 'Questions ouvertes', label: 'Questions ouvertes' },
  { value: 'Etude de cas', label: 'Etude de cas' },
  { value: 'Exercices pratiques', label: 'Exercices pratiques' },
  { value: 'Mixte', label: 'Mixte (QCM + questions ouvertes)' },
]
const DUREES = ['30min', '45min', '1h', '2h']
const NIVEAUX_DIFF = ['Facile', 'Moyen', 'Difficile']

export default function EvalGenerateur({ onBack }) {
  const { get, add, getAnneeActive, seancesCalendrier: getSeancesCalendrier } = useData()
  const toast = useToast()
  const navigate = useNavigate()

  const classes = get('classes')
  const anneeActive = getAnneeActive()

  const [form, setForm] = useState({
    classeId: '',
    matiereId: '',
    sequenceId: '',
    seanceId: '',
    diplome: '',
    theme: '',
    typeEval: 'QCM',
    duree: '1h',
    difficulte: 'Moyen',
    nbQuestions: 10,
    bareme: 20,
    includeCorrige: true,
  })

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('sujet')

  const selectedClasse = classes.find(c => c.id === form.classeId)
  const matieres = selectedClasse?.matieres || []
  const selectedMatiere = matieres.find(m => m.id === form.matiereId)

  const ruban = get('rubanPedagogique').find(
    r => r.classeId === form.classeId &&
         r.anneeScolaireId === anneeActive?.id &&
         (!form.matiereId || r.matiereId === form.matiereId)
  )
  const sequences = ruban?.sequences || []
  const selectedSeq = sequences.find(s => s.id === form.sequenceId)

  // ── Progression & séances calendrier ──────────────────────────────────────
  const anneeId = anneeActive?.id
  const calSeances = (form.classeId && anneeId)
    ? getSeancesCalendrier({ classeId: form.classeId, anneeScolaireId: anneeId })
    : []

  // IDs valides du ruban entier
  const rubanTotalIds = useMemo(
    () => new Set(sequences.flatMap(seq => (seq.seances || []).map(s => s.id))),
    [sequences.length] // eslint-disable-line
  )
  // IDs de la séquence sélectionnée (ou tout le ruban si aucune)
  const scopeIds = useMemo(() => {
    if (form.sequenceId && selectedSeq) {
      return new Set((selectedSeq.seances || []).map(s => s.id))
    }
    return rubanTotalIds
  }, [form.sequenceId, selectedSeq, rubanTotalIds]) // eslint-disable-line

  // Séances faites dans la portée (séq ou ruban entier)
  const seancesFaites = calSeances.filter(s => s.statut === 'faite' && scopeIds.has(s.seanceRubanId))
  // Total faites sur tout le ruban (pour le résumé)
  const totalFaitesRuban = calSeances.filter(s => s.statut === 'faite' && rubanTotalIds.has(s.seanceRubanId)).length
  const totalSeancesRuban = sequences.reduce((acc, seq) => acc + (seq.seances?.length || 0), 0)
  const derniereSeanceFaite = [...calSeances]
    .filter(s => s.statut === 'faite' && rubanTotalIds.has(s.seanceRubanId))
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null

  // Blocage génération
  const hasRuban = sequences.length > 0
  const canGenerate = !hasRuban || seancesFaites.length > 0

  // Auto-sélect matière quand classe change
  useEffect(() => {
    if (!form.classeId) return
    const cl = classes.find(c => c.id === form.classeId)
    const mats = cl?.matieres || []
    setForm(f => ({ ...f, matiereId: mats.length === 1 ? mats[0].id : '', sequenceId: '' }))
  }, [form.classeId]) // eslint-disable-line

  useEffect(() => {
    setForm(f => ({ ...f, sequenceId: '', seanceId: '' }))
  }, [form.matiereId])

  useEffect(() => {
    setForm(f => ({ ...f, seanceId: '' }))
  }, [form.sequenceId])

  useEffect(() => {
    setForm(f => ({ ...f, theme: '' }))
  }, [form.diplome])

  function setField(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleGenerate() {
    if (!form.classeId) { toast.error('Selectionnez une classe.'); return }
    if (!canGenerate) {
      toast.error('Aucune seance realisee dans cette classe. Marquez vos seances comme faites avant de generer une evaluation.')
      return
    }
    if (!API_KEY) { toast.error('Cle API Anthropic non configuree.'); return }

    const classeNom = selectedClasse?.nom || ''
    const matiereNom = selectedMatiere?.nom || 'Non precisee'
    const seqTitre = selectedSeq?.titre || 'Non precisee'
    const objectifs = selectedSeq?.objectifs || ''
    const competences = selectedSeq?.competences || ''
    const diplomeLabel = DIPLOMES.find(d => d.value === form.diplome)?.label || ''

    // Séance spécifique sélectionnée
    const seanceSelectionnee = calSeances.find(s => s.id === form.seanceId) || null

    // Résumé des séances faites pour Claude
    const seancesFaitesContext = seancesFaites.length > 0
      ? seancesFaites.map((s, i) => {
          let line = `  - Seance ${i + 1} : ${s.titre || 'Sans titre'} (${s.type || 'Cours'}, le ${s.date})`
          if (s.noteCours) line += `\n    Note du prof : ${s.noteCours}`
          if (s.etoiles > 0) line += ` [Niveau engagement : ${s.etoiles}/3]`
          return line
        }).join('\n')
      : '  Aucune seance realisee dans la portee selectionnee'

    const prompt = `Tu es un professeur de commerce expert en evaluation pedagogique.
Genere une evaluation complete et professionnelle.

CONTEXTE :
- Classe : ${classeNom}
- Diplome : ${diplomeLabel || 'Non precise'}
- Theme / Module : ${form.theme || 'Non precise'}
- Matiere : ${matiereNom}
- Sequence : ${seqTitre}
- Objectifs : ${objectifs || 'Non precises'}
- Competences visees : ${competences || 'Non precisees'}
${seanceSelectionnee ? `- Seance ciblee : ${seanceSelectionnee.titre} (${seanceSelectionnee.date})` : ''}

CONTENU DEJA VU EN CLASSE (base l'evaluation UNIQUEMENT sur ces seances) :
${seancesFaitesContext}
- Total seances realisees : ${seancesFaites.length} / ${totalSeancesRuban || seancesFaites.length}

INSTRUCTION : Genere l'evaluation en coherence stricte avec le contenu des seances realisees ci-dessus.
Si des notes du professeur mentionnent des difficultes, adapte le niveau en consequence.
Ne pas evaluer du contenu qui n'a pas encore ete enseigne.

PARAMETRES :
- Type : ${form.typeEval}
- Duree : ${form.duree}
- Difficulte : ${form.difficulte}
- Nombre de questions : ${form.nbQuestions}
- Bareme total : ${form.bareme} points
- Inclure le corrige : ${form.includeCorrige ? 'Oui' : 'Non'}

GENERE :
1. Un en-tete professionnel (etablissement, classe, date, duree, bareme)
2. Les consignes generales
3. Toutes les questions/exercices avec leur bareme individuel
4. Si QCM : 4 propositions par question dont une seule correcte
5. Si etude de cas : document support + questions progressives
6. Le corrige detaille avec bareme si demande

REGLES :
- Vocabulaire adapte au niveau
- Exemples et contenus specifiquement adaptes au module : ${form.theme || matiereNom || 'commerce, vente, distribution'}
- Questions progressives (du plus simple au plus complexe)
- Bareme coherent et detaille
- Format propre et directement utilisable en classe

Reponds UNIQUEMENT en JSON avec ce format exact (sans texte avant ou apres) :
{
  "sujet": {
    "entete": "En-tete formate avec toutes les informations",
    "consignes": "Consignes generales pour les eleves",
    "questions": [
      {
        "numero": 1,
        "enonce": "Enonce de la question",
        "bareme": 2,
        "type": "qcm",
        "propositions": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "document_support": ""
      }
    ]
  },
  "corrige": {
    "questions": [
      {
        "numero": 1,
        "reponse": "Reponse correcte",
        "explication": "Explication detaillee"
      }
    ],
    "bareme_detail": "Detail du bareme global"
  },
  "duree_estimee": "${form.duree}",
  "conseils_prof": "Conseils pour le professeur"
}`

    setLoading(true)
    setError(null)
    setResult(null)

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
        const e = await response.json().catch(() => ({}))
        throw new Error(e?.error?.message || `Erreur ${response.status}`)
      }
      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Aucun JSON trouve dans la reponse.')
      const parsed = JSON.parse(jsonMatch[0])
      if (!parsed.sujet || !parsed.corrige) throw new Error('Structure JSON invalide.')
      setResult(parsed)
      setActiveTab('sujet')
    } catch (err) {
      setError('La generation a echoue. Verifiez votre connexion et reessayez.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handlePrintSujet() {
    if (!result) return
    const classeNom = selectedClasse?.nom || ''
    const matiereNom = selectedMatiere?.nom || ''

    const questionsHTML = (result.sujet.questions || []).map(q => {
      const props = (q.propositions || []).map((p, pi) =>
        `<li style="margin:3px 0"><strong>${String.fromCharCode(65+pi)}.</strong> ${p.replace(/^[A-D]\.\s*/i, '')}</li>`
      ).join('')
      const doc = q.document_support
        ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:8px 0;font-size:12px;font-style:italic">${q.document_support}</div>`
        : ''
      return `
        <div style="margin-bottom:20px;padding:14px;border:1px solid #e5e7eb;border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <strong>Question ${q.numero}</strong>
            <span style="font-size:12px;background:#fff7ed;color:#c2410c;padding:2px 8px;border-radius:9999px;border:1px solid #fed7aa">${q.bareme} pt${q.bareme > 1 ? 's' : ''}</span>
          </div>
          ${doc}
          <p style="margin:0 0 8px">${q.enonce}</p>
          ${props ? `<ol style="list-style:none;margin:0;padding:0">${props}</ol>` : ''}
        </div>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) { toast.error('Fenetre bloquee. Autorisez les popups.'); return }
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Evaluation - ${classeNom}</title>
<style>
  body{font-family:Arial,sans-serif;padding:30px;max-width:800px;margin:0 auto;color:#111}
  h1{font-size:18px;color:#1e3a5f;margin-bottom:4px}
  .entete{white-space:pre-wrap;font-size:12px;border-bottom:2px solid #1e3a5f;padding-bottom:14px;margin-bottom:20px;color:#374151}
  .consignes{background:#eff6ff;border-left:4px solid #3b82f6;padding:10px 14px;margin-bottom:24px;font-size:13px;border-radius:0 6px 6px 0}
  @media print{button{display:none!important}}
</style></head><body>
<h1>Evaluation - ${classeNom}${matiereNom ? ' · ' + matiereNom : ''}</h1>
<div class="entete">${result.sujet.entete}</div>
<div class="consignes"><strong>Consignes :</strong><br>${result.sujet.consignes}</div>
${questionsHTML}
<p style="text-align:center;margin-top:24px">
  <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">Imprimer / Enregistrer en PDF</button>
</p>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  function handlePrintCorrige() {
    if (!result) return
    const classeNom = selectedClasse?.nom || ''

    const corrigeHTML = (result.corrige.questions || []).map(q => `
      <div style="margin-bottom:16px;padding:12px;border-left:4px solid #10b981;background:#f0fdf4;border-radius:0 6px 6px 0">
        <strong style="color:#065f46">Question ${q.numero}</strong>
        <p style="margin:6px 0 4px"><strong>Reponse :</strong> ${q.reponse}</p>
        ${q.explication ? `<p style="margin:0;color:#374151;font-size:12px;font-style:italic">${q.explication}</p>` : ''}
      </div>`).join('')

    const win = window.open('', '_blank')
    if (!win) { toast.error('Fenetre bloquee. Autorisez les popups.'); return }
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Corrige - ${classeNom}</title>
<style>
  body{font-family:Arial,sans-serif;padding:30px;max-width:800px;margin:0 auto;color:#111}
  h1{color:#065f46;font-size:18px}
  .bareme{background:#f0fdf4;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px}
  .conseils{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:20px;font-size:13px}
  @media print{button{display:none!important}}
</style></head><body>
<h1>Corrige - ${classeNom}</h1>
${result.corrige.bareme_detail ? `<div class="bareme"><strong>Bareme :</strong> ${result.corrige.bareme_detail}</div>` : ''}
${corrigeHTML}
${result.conseils_prof ? `<div class="conseils"><strong>Conseils professeur :</strong><br>${result.conseils_prof}</div>` : ''}
<p style="text-align:center;margin-top:24px">
  <button onclick="window.print()" style="background:#065f46;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px">Imprimer / Enregistrer en PDF</button>
</p>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  function handleDownloadWord() {
    if (!result) return
    const classeNom = selectedClasse?.nom || ''
    const matiereNom = selectedMatiere?.nom || ''

    const questionsHtml = (result.sujet.questions || []).map(q => {
      const props = (q.propositions || []).map((p, pi) =>
        `<p style="margin:2px 0 2px 20px">${String.fromCharCode(65+pi)}. ${p.replace(/^[A-D]\.\s*/i, '')}</p>`
      ).join('')
      return `<p><b>Question ${q.numero}</b> (${q.bareme} pt${q.bareme > 1 ? 's' : ''})</p>
${q.document_support ? `<p style="font-style:italic;color:#4b5563">${q.document_support}</p>` : ''}
<p>${q.enonce}</p>${props}`
    }).join('<hr/>')

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="UTF-8">
<style>body{font-family:Calibri,Arial;font-size:11pt;margin:2cm}h1{color:#1e3a5f;font-size:16pt}
h2{color:#065f46;font-size:14pt}hr{border-color:#e5e7eb}</style></head>
<body>
<h1>Evaluation - ${classeNom}${matiereNom ? ' - ' + matiereNom : ''}</h1>
<pre style="font-family:Calibri;font-size:10pt;color:#374151">${result.sujet.entete}</pre>
<p><b>Consignes :</b> ${result.sujet.consignes}</p>
<br/>
${questionsHtml}
${form.includeCorrige && result.corrige ? `
<br/><br/>
<h2>Corrige</h2>
${result.corrige.bareme_detail ? `<p><b>Bareme :</b> ${result.corrige.bareme_detail}</p>` : ''}
${(result.corrige.questions || []).map(q =>
  `<p><b>Q${q.numero} :</b> ${q.reponse}${q.explication ? ` — <i>${q.explication}</i>` : ''}</p>`
).join('')}
` : ''}
</body></html>`

    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Evaluation_${classeNom.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().slice(0,10)}.doc`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Fichier Word telecharge.')
  }

  function handleSaveToCCF() {
    if (!result || !form.classeId || !anneeActive) {
      toast.error('Impossible de sauvegarder : selectionnez une classe et une annee active.')
      return
    }
    const classeNom = selectedClasse?.nom || ''
    const seqTitre = selectedSeq?.titre || ''
    add('ccf', {
      id: genId('ccf'),
      classeId: form.classeId,
      anneeScolaireId: anneeActive.id,
      titre: `Evaluation ${form.typeEval}${seqTitre ? ' - ' + seqTitre : ''}`,
      type: 'Evaluation',
      date: new Date().toISOString().split('T')[0],
      bareme: form.bareme,
      statut: 'planifiee',
      matiereId: form.matiereId || null,
      sujet: result.sujet,
      corrige: result.corrige,
      conseilsProf: result.conseils_prof || '',
      source: 'generateur-ia',
    })
    toast.success(`Evaluation sauvegardee dans le CCF de ${classeNom}.`)
  }

  // ── Render : formulaire ──────────────────────────────────────────────────

  if (!result && !loading) return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <X size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Generateur - Evaluation
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        {/* Classe */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Classe concernee <span className="text-red-500">*</span>
          </label>
          <select value={form.classeId} onChange={e => setField('classeId', e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="">-- Selectionner une classe --</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        {/* Warning : pas de ruban */}
        {form.classeId && !hasRuban && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Aucun ruban pedagogique trouve pour cette classe.
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                  Creez d'abord votre ruban pedagogique avant de generer une evaluation.
                </p>
                <button
                  onClick={() => navigate(`/classes/${form.classeId}?tab=ruban`)}
                  className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 underline hover:no-underline"
                >
                  Creer le ruban
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Résumé progression */}
        {form.classeId && hasRuban && (
          <div className={`rounded-lg border px-4 py-3 ${seancesFaites.length > 0 ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
            <div className="flex items-center gap-2 mb-1">
              {seancesFaites.length > 0
                ? <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                : <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              }
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Progression de la classe
              </span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
              <p>Seances realisees (ruban) : <strong>{totalFaitesRuban} / {totalSeancesRuban}</strong></p>
              {form.sequenceId && selectedSeq && (
                <p>Dans cette sequence : <strong>{seancesFaites.length} seance{seancesFaites.length !== 1 ? 's' : ''} realisee{seancesFaites.length !== 1 ? 's' : ''}</strong></p>
              )}
              {seancesFaites.length > 0
                ? <p className="text-green-700 dark:text-green-400 font-medium">Evaluation possible sur {seancesFaites.length} seance{seancesFaites.length !== 1 ? 's' : ''} realisee{seancesFaites.length !== 1 ? 's' : ''}</p>
                : <p className="text-amber-700 dark:text-amber-400 font-medium">Aucune seance realisee dans la portee selectionnee — marquez des seances comme "faites" pour debloquer.</p>
              }
              {derniereSeanceFaite && (
                <p className="text-gray-500 dark:text-gray-400">Derniere seance : {derniereSeanceFaite.titre || 'Sans titre'} ({derniereSeanceFaite.date})</p>
              )}
            </div>
          </div>
        )}

        {/* Diplome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diplome</label>
          <select value={form.diplome} onChange={e => setField('diplome', e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
            <option value="">-- Selectionner un diplome --</option>
            {DIPLOMES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        {/* Theme / Module */}
        {form.diplome && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Theme / Module
            </label>
            {form.diplome === 'Autre' ? (
              <input
                type="text"
                value={form.theme}
                onChange={e => setField('theme', e.target.value)}
                placeholder="Ex : La relation client, La gestion des stocks…"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            ) : (
              <select value={form.theme} onChange={e => setField('theme', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">-- Selectionner un module --</option>
                {(MODULES_PAR_DIPLOME[form.diplome] || []).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Matiere */}
        {form.classeId && matieres.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Matiere</label>
            <select value={form.matiereId} onChange={e => setField('matiereId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">-- Toutes matieres --</option>
              {matieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
        )}

        {/* Sequence */}
        {sequences.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sequence concernee
              <span className="ml-1 text-xs text-gray-400">(pre-remplit les objectifs)</span>
            </label>
            <select value={form.sequenceId} onChange={e => setField('sequenceId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">-- Selectionner une sequence --</option>
              {sequences.map(s => <option key={s.id} value={s.id}>{s.titre}</option>)}
            </select>
            {selectedSeq?.objectifs && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                Objectifs : {selectedSeq.objectifs}
              </p>
            )}
          </div>
        )}

        {/* Séance concernée — uniquement les séances FAITES */}
        {form.sequenceId && selectedSeq && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Seance concernee
              <span className="ml-1 text-xs text-gray-400">(optionnel — uniquement les seances realisees)</span>
            </label>
            {seancesFaites.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                Aucune seance realisee dans cette sequence.
              </p>
            ) : (
              <select value={form.seanceId} onChange={e => setField('seanceId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                <option value="">-- Toutes les seances realisees --</option>
                {seancesFaites.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.titre || 'Seance'} — {s.date}{s.noteCours ? ' *' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Type + Duree */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type d'evaluation</label>
            <select value={form.typeEval} onChange={e => setField('typeEval', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {TYPES_EVAL.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duree</label>
            <select value={form.duree} onChange={e => setField('duree', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {DUREES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Difficulte + Questions + Bareme */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulte</label>
            <select value={form.difficulte} onChange={e => setField('difficulte', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {NIVEAUX_DIFF.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Questions : <strong>{form.nbQuestions}</strong>
            </label>
            <input type="range" min={5} max={20} value={form.nbQuestions}
              onChange={e => setField('nbQuestions', Number(e.target.value))}
              className="w-full accent-orange-500 mt-2" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>5</span><span>20</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bareme (pts)</label>
            <input type="number" min={5} max={100} value={form.bareme}
              onChange={e => setField('bareme', Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>

        {/* Corrige */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.includeCorrige}
              onChange={e => setField('includeCorrige', e.target.checked)}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Inclure le corrige detaille
            </span>
          </label>
        </div>

        {!API_KEY && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm px-4 py-3">
            Variable <code className="font-mono">VITE_ANTHROPIC_API_KEY</code> non definie. La generation ne fonctionnera pas.
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={form.classeId && hasRuban && !canGenerate}
          className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 transition-colors"
        >
          <FileText size={16} /> Generer l'evaluation
          {form.classeId && hasRuban && !canGenerate && (
            <span className="text-xs font-normal">(aucune seance realisee)</span>
          )}
        </button>
      </div>
    </div>
  )

  // ── Render : chargement ──────────────────────────────────────────────────

  if (loading) return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Generation en cours…
        </h1>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
          <Loader2 size={28} className="text-orange-500 animate-spin" />
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">Claude genere votre evaluation…</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cela peut prendre 15 a 30 secondes.</div>
        </div>
      </div>
    </div>
  )

  // ── Render : resultat ────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText size={20} className="text-orange-500" />
          Evaluation generee
        </h1>
        {result && (
          <span className="text-sm text-gray-400">
            {result.duree_estimee} · {form.nbQuestions} questions · {form.bareme} pts
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setResult(null); setError(null) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={14} /> Regenerer
        </button>
        <button
          onClick={handlePrintSujet}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        >
          <Printer size={14} /> Imprimer le sujet
        </button>
        <button
          onClick={handlePrintCorrige}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
        >
          <Printer size={14} /> Imprimer le corrige
        </button>
        <button
          onClick={handleDownloadWord}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
        >
          <Download size={14} /> Telecharger en Word
        </button>
        <button
          onClick={handleSaveToCCF}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors"
        >
          <BookMarked size={14} /> Sauvegarder dans CCF
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
        {['sujet', 'corrige'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {tab === 'sujet' ? 'Sujet eleve' : 'Corrige professeur'}
          </button>
        ))}
      </div>

      {/* Onglet Sujet */}
      {activeTab === 'sujet' && result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 px-5 py-4">
            <pre className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
              {result.sujet.entete}
            </pre>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30 px-5 py-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong className="text-amber-700 dark:text-amber-400">Consignes : </strong>
              {result.sujet.consignes}
            </p>
          </div>
          <div className="p-5 space-y-4">
            {(result.sujet.questions || []).map(q => (
              <div key={q.numero} className="border border-gray-100 dark:border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm">
                    Question {q.numero}
                  </span>
                  <span className="text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full">
                    {q.bareme} pt{q.bareme > 1 ? 's' : ''}
                  </span>
                </div>
                {q.document_support && (
                  <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 italic">
                    {q.document_support}
                  </div>
                )}
                <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">{q.enonce}</p>
                {q.propositions && q.propositions.length > 0 && (
                  <ul className="space-y-1.5 mt-2">
                    {q.propositions.map((p, pi) => (
                      <li key={pi} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                        <span className="shrink-0 w-5 h-5 rounded border border-gray-300 dark:border-gray-600 text-center text-xs leading-5 font-medium bg-gray-50 dark:bg-gray-700">
                          {String.fromCharCode(65 + pi)}
                        </span>
                        {p.replace(/^[A-D]\.\s*/i, '')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Onglet Corrige */}
      {activeTab === 'corrige' && result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {result.corrige.bareme_detail && (
            <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-800 px-5 py-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong className="text-green-700 dark:text-green-400">Bareme : </strong>
                {result.corrige.bareme_detail}
              </p>
            </div>
          )}
          <div className="p-5 space-y-3">
            {(result.corrige.questions || []).map(q => (
              <div key={q.numero} className="border-l-4 border-green-400 dark:border-green-600 pl-4 py-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  Question {q.numero}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <strong>Reponse : </strong>{q.reponse}
                </p>
                {q.explication && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">{q.explication}</p>
                )}
              </div>
            ))}
          </div>
          {result.conseils_prof && (
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border-t border-yellow-100 dark:border-yellow-900/30 px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                <strong className="text-yellow-700 dark:text-yellow-500">Conseils professeur : </strong>
                {result.conseils_prof}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
