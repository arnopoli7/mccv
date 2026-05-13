// Vacances scolaires pré-remplies par zone et année

export const VACANCES_2026_2027 = {
  A: [
    { nom: 'Toussaint', dateDebut: '2026-10-17', dateFin: '2026-11-03' },
    { nom: 'Noël', dateDebut: '2026-12-19', dateFin: '2027-01-04' },
    { nom: 'Hiver', dateDebut: '2027-02-06', dateFin: '2027-02-22' },
    { nom: 'Printemps', dateDebut: '2027-04-10', dateFin: '2027-04-26' },
    { nom: 'Été', dateDebut: '2027-06-30', dateFin: '2027-08-31' },
  ],
  B: [
    { nom: 'Toussaint', dateDebut: '2026-10-17', dateFin: '2026-11-03' },
    { nom: 'Noël', dateDebut: '2026-12-19', dateFin: '2027-01-04' },
    { nom: 'Hiver', dateDebut: '2027-02-13', dateFin: '2027-03-01' },
    { nom: 'Printemps', dateDebut: '2027-04-17', dateFin: '2027-05-03' },
    { nom: 'Été', dateDebut: '2027-06-30', dateFin: '2027-08-31' },
  ],
  C: [
    { nom: 'Toussaint', dateDebut: '2026-10-17', dateFin: '2026-11-03' },
    { nom: 'Noël', dateDebut: '2026-12-19', dateFin: '2027-01-04' },
    { nom: 'Hiver', dateDebut: '2027-02-20', dateFin: '2027-03-08' },
    { nom: 'Printemps', dateDebut: '2027-04-24', dateFin: '2027-05-10' },
    { nom: 'Été', dateDebut: '2027-06-30', dateFin: '2027-08-31' },
  ],
}

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

export function getVacancesForZone(zone, anneeScolaireId, anneeLabel = '2025-2026') {
  const dataset = anneeLabel.startsWith('2026') ? VACANCES_2026_2027 : VACANCES_2025_2026
  const data = dataset[zone] || dataset['B']
  return data.map((v, i) => ({
    id: `v_${anneeScolaireId}_${i}`,
    anneeScolaireId,
    ...v,
  }))
}

export function getVacancesForAnnee(anneeLabel, zone = 'B') {
  const dataset = anneeLabel.startsWith('2026') ? VACANCES_2026_2027 : VACANCES_2025_2026
  return dataset[zone] || dataset['B']
}
