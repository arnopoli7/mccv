import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import ColorPicker from '../components/ui/ColorPicker'
import { genId } from '../utils/id'
import { getVacancesForZone } from '../utils/vacancesData'

const ZONES = ['A', 'B', 'C']

const STEPS = [
  { num: 1, label: 'Profil' },
  { num: 2, label: 'Année scolaire' },
  { num: 3, label: 'Vacances' },
  { num: 4, label: 'Classes' },
]

export default function Setup() {
  const navigate = useNavigate()
  const { getCurrentUser, updateCurrentUserProfile } = useAuth()
  const { add, setParams } = useData()
  const toast = useToast()
  const [step, setStep] = useState(1)

  const [profil, setProfil] = useState({ enseignant: '', etablissement: '' })
  const [annee, setAnnee] = useState({ label: '2025-2026', dateDebut: '2025-09-01', dateFin: '2026-06-30' })
  const [zone, setZone] = useState('B')
  const [classes, setClasses] = useState([])
  const [newClasse, setNewClasse] = useState({ nom: '', couleur: '#93c5fd' })

  function addClasse() {
    if (!newClasse.nom.trim()) return
    setClasses(prev => [...prev, { ...newClasse, id: genId('c') }])
    setNewClasse({ nom: '', couleur: '#93c5fd' })
  }

  function removeClasse(id) {
    setClasses(prev => prev.filter(c => c.id !== id))
  }

  async function finish() {
    const user = getCurrentUser()
    if (!user) return

    setParams({ enseignant: profil.enseignant, etablissement: profil.etablissement, zoneVacances: zone })

    const anneeId = genId('as')
    add('anneesScolaires', { id: anneeId, ...annee, active: true })

    getVacancesForZone(zone, anneeId).forEach(v => add('vacances', v))

    classes.forEach(cl => add('classes', { id: cl.id, nom: cl.nom, couleur: cl.couleur, matieres: [] }))

    await updateCurrentUserProfile({ setupDone: true, nom: profil.enseignant || user.nom })

    toast.success('Configuration terminée ! Bienvenue dans MCCV.')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800
      flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3">
            <BookOpen size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Configuration initiale</h1>
          <p className="text-sm text-gray-500 mt-1">Quelques informations pour démarrer</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-1">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-1">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors
                ${step > s.num ? 'bg-green-500 text-white' :
                  step === s.num ? 'bg-blue-600 text-white' :
                  'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                {step > s.num ? <Check size={14} /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:block mr-2
                ${step === s.num ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-6 ${step > s.num ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Votre profil</h2>
              <div>
                <label className="label">Nom de l'enseignant</label>
                <input className="input" placeholder="ex: Arnaud Dupont" value={profil.enseignant}
                  onChange={e => setProfil(p => ({ ...p, enseignant: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="label">Nom de l'établissement</label>
                <input className="input" placeholder="ex: Lycée Jean Moulin" value={profil.etablissement}
                  onChange={e => setProfil(p => ({ ...p, etablissement: e.target.value }))} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Première année scolaire</h2>
              <div>
                <label className="label">Libellé</label>
                <input className="input" placeholder="ex: 2025-2026" value={annee.label}
                  onChange={e => setAnnee(a => ({ ...a, label: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date de début</label>
                  <input type="date" className="input" value={annee.dateDebut}
                    onChange={e => setAnnee(a => ({ ...a, dateDebut: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Date de fin</label>
                  <input type="date" className="input" value={annee.dateFin}
                    onChange={e => setAnnee(a => ({ ...a, dateFin: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Zone de vacances</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choisissez votre zone académique pour pré-remplir les vacances scolaires.
              </p>
              <div className="flex gap-4 justify-center my-6">
                {ZONES.map(z => (
                  <button key={z} type="button" onClick={() => setZone(z)}
                    className={`w-24 h-20 rounded-xl border-2 text-xl font-bold transition-all
                      ${zone === z
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-600 text-gray-400 hover:border-gray-300'
                      }`}>
                    Zone {z}
                  </button>
                ))}
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Vacances pré-remplies (Zone {zone}) :
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  {getVacancesForZone(zone, 'preview').map(v => (
                    <li key={v.nom} className="flex gap-2">
                      <span className="font-medium w-24 shrink-0">{v.nom}</span>
                      <span className="text-gray-400 text-xs">{v.dateDebut} → {v.dateFin}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Vos classes</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ajoutez vos classes (vous pourrez en créer d'autres plus tard).
              </p>

              {classes.length > 0 && (
                <div className="space-y-2 mb-2">
                  {classes.map(cl => (
                    <div key={cl.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: cl.couleur }} />
                      <span className="flex-1 font-medium text-sm text-gray-800 dark:text-gray-100">{cl.nom}</span>
                      <button onClick={() => removeClasse(cl.id)} className="text-xs text-red-400 hover:text-red-600">
                        Supprimer
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <div>
                  <label className="label">Nom de la classe</label>
                  <input className="input" placeholder="ex: CAPA 1, BTS 2..." value={newClasse.nom}
                    onChange={e => setNewClasse(n => ({ ...n, nom: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addClasse() }} />
                </div>
                <div>
                  <label className="label">Couleur</label>
                  <ColorPicker value={newClasse.couleur} onChange={c => setNewClasse(n => ({ ...n, couleur: c }))} />
                </div>
                <button type="button" onClick={addClasse} disabled={!newClasse.nom.trim()}
                  className="btn-primary text-sm py-1.5 w-full">
                  + Ajouter cette classe
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button type="button" onClick={() => setStep(s => s - 1)} disabled={step === 1}
              className="flex items-center gap-1 btn-secondary py-2">
              <ChevronLeft size={16} /> Précédent
            </button>
            {step < 4 ? (
              <button type="button" onClick={() => setStep(s => s + 1)}
                className="flex items-center gap-1 btn-primary py-2">
                Suivant <ChevronRight size={16} />
              </button>
            ) : (
              <button type="button" onClick={finish}
                className="flex items-center gap-1 btn-primary py-2">
                <Check size={16} /> Terminer
              </button>
            )}
          </div>
        </div>

        {step === 4 && (
          <button type="button" onClick={finish}
            className="mt-3 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 w-full text-center">
            Passer — créer les classes plus tard
          </button>
        )}
      </div>
    </div>
  )
}
