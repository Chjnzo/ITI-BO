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
