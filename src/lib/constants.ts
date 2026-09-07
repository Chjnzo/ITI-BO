// Fonte di verità unica per la tipologia immobile/proprietario/ricerca acquirenti.
// Era la lista usata da PropertyWizard.LOCALI_STANZE (la più completa: include
// commerciale/box/terreno oltre alle metrature residenziali).
export const TIPOLOGIE_IMMOBILE = [
  'Monolocale', 'Bilocale', 'Trilocale', 'Quadrilocale', 'Pentalocale+',
  'Nuova costruzione', 'Villa', 'Villetta a schiera', 'Attico', 'Loft',
  'Box', 'Posto auto', 'Locale commerciale', 'Capannone', 'Terreno',
] as const;

export type TipologiaImmobile = typeof TIPOLOGIE_IMMOBILE[number];

export const PREDEFINED_FEATURES = [
  "Aria Condizionata", "Ascensore", "Balcone", "Terrazzo",
  "Box Auto", "Posto Auto", "Cantina", "Giardino Privato",
  "Domotica", "Allarme", "Piscina", "Pannelli Solari"
];

const VALUATION_FORM_FEATURE_NAMES = [
  "Box Auto", "Posto Auto", "Cantina", "Giardino Privato",
  "Ascensore", "Balcone", "Terrazzo", "Domotica"
];

export const VALUATION_FORM_FEATURES = VALUATION_FORM_FEATURE_NAMES.filter((f) =>
  PREDEFINED_FEATURES.includes(f)
);
