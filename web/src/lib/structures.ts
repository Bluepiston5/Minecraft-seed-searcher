// Structure layers shown on the map. 'key' is cubiomes' struct2str() name,
// which the worker resolves to the numeric StructureType.

export interface StructureDef {
  key: string;
  label: string;
  short: string;
  color: string;
  /** minimum zoom level at which the layer is drawn (dense structures) */
  minZoom: number;
  /** enabled when the app first loads */
  defaultOn: boolean;
}

export const STRUCTURES: StructureDef[] = [
  { key: 'village', label: 'Dorf', short: 'D', color: '#e0a040', minZoom: -5, defaultOn: true },
  { key: 'swamp_hut', label: 'Hexenhütte', short: 'H', color: '#9b6bd6', minZoom: -5, defaultOn: true },
  { key: 'monument', label: 'Ozeanmonument', short: 'M', color: '#3fb3c9', minZoom: -5, defaultOn: true },
  { key: 'pillager_outpost', label: 'Außenposten', short: 'A', color: '#8a8f99', minZoom: -5, defaultOn: true },
  { key: 'mansion', label: 'Waldanwesen', short: 'W', color: '#7a4b2a', minZoom: -6, defaultOn: true },
  { key: 'desert_pyramid', label: 'Wüstentempel', short: 'Wt', color: '#e6cf7a', minZoom: -4, defaultOn: false },
  { key: 'jungle_pyramid', label: 'Dschungeltempel', short: 'Dt', color: '#4f9a3a', minZoom: -4, defaultOn: false },
  { key: 'igloo', label: 'Iglu', short: 'I', color: '#cfe8f5', minZoom: -4, defaultOn: false },
  { key: 'ancient_city', label: 'Antike Stadt', short: 'AS', color: '#2c5a6e', minZoom: -5, defaultOn: true },
  { key: 'trial_chambers', label: 'Prüfungskammer', short: 'P', color: '#c8743a', minZoom: -4, defaultOn: false },
  { key: 'trail_ruins', label: 'Pfadruine', short: 'R', color: '#a7896a', minZoom: -4, defaultOn: false },
  { key: 'shipwreck', label: 'Schiffswrack', short: 'S', color: '#6b5135', minZoom: -2, defaultOn: false },
  { key: 'ocean_ruin', label: 'Ozeanruine', short: 'O', color: '#5f8f86', minZoom: -2, defaultOn: false },
  { key: 'ruined_portal', label: 'Portalruine', short: 'Pr', color: '#6c3fb4', minZoom: -2, defaultOn: false },
  { key: 'buried_treasure', label: 'Vergrabener Schatz', short: 'T', color: '#d9b43c', minZoom: 0, defaultOn: false },
];

export const STRUCTURE_BY_KEY = Object.fromEntries(STRUCTURES.map((s) => [s.key, s]));

export interface VersionDef {
  id: string; // cubiomes mc2str() name
  label: string;
}

export const VERSIONS: VersionDef[] = [
  { id: '1.21 WD', label: '1.21.4 (Winter Drop)' },
  { id: '1.21.3', label: '1.21.2 – 1.21.3' },
  { id: '1.21.1', label: '1.21 – 1.21.1' },
];
