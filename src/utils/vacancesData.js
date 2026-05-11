// Vacances scolaires pré-remplies par zone et année

export const VACANCES_2025_2026 = {
  A: [
    { nom: 'Toussaint', dateDebut: '2025-10-18', dateFin: '2025-11-03' },
    { nom: 'Noël', dateDebut: '2025-12-20', dateFin: '2026-01-05' },
    { nom: 'Hiver', dateDebut: '2026-02-07', dateFin: '2026-02-23' },
    { nom: 'Printemps', dateDebut: '2026-04-04', dateFin: '2026-04-20' },
    { nom: 'Été', dateDebut: '2026-07-04', dateFin: '2026-08-31' },
  ],
  B: [
    { nom: 'Toussaint', dateDebut: '2025-10-18', dateFin: '2025-11-03' },
    { nom: 'Noël', dateDebut: '2025-12-20', dateFin: '2026-01-05' },
    { nom: 'Hiver', dateDebut: '2026-02-14', dateFin: '2026-03-02' },
    { nom: 'Printemps', dateDebut: '2026-04-18', dateFin: '2026-05-04' },
    { nom: 'Été', dateDebut: '2026-07-04', dateFin: '2026-08-31' },
  ],
  C: [
    { nom: 'Toussaint', dateDebut: '2025-10-18', dateFin: '2025-11-03' },
    { nom: 'Noël', dateDebut: '2025-12-20', dateFin: '2026-01-05' },
    { nom: 'Hiver', dateDebut: '2026-02-21', dateFin: '2026-03-09' },
    { nom: 'Printemps', dateDebut: '2026-04-25', dateFin: '2026-05-11' },
    { nom: 'Été', dateDebut: '2026-07-04', dateFin: '2026-08-31' },
  ],
}

export function getVacancesForZone(zone, anneeScolaireId) {
  const data = VACANCES_2025_2026[zone] || VACANCES_2025_2026['B']
  return data.map((v, i) => ({
    id: `v_${anneeScolaireId}_${i}`,
    anneeScolaireId,
    ...v,
  }))
}
