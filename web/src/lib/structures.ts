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
  { key: 'village', label: 'Village', short: 'V', color: '#e0a040', minZoom: -5, defaultOn: true },
  { key: 'swamp_hut', label: 'Witch Hut', short: 'H', color: '#9b6bd6', minZoom: -5, defaultOn: true },
  { key: 'monument', label: 'Ocean Monument', short: 'M', color: '#3fb3c9', minZoom: -5, defaultOn: true },
  { key: 'pillager_outpost', label: 'Pillager Outpost', short: 'P', color: '#8a8f99', minZoom: -5, defaultOn: true },
  { key: 'mansion', label: 'Woodland Mansion', short: 'W', color: '#7a4b2a', minZoom: -6, defaultOn: true },
  { key: 'desert_pyramid', label: 'Desert Temple', short: 'DT', color: '#e6cf7a', minZoom: -4, defaultOn: false },
  { key: 'jungle_pyramid', label: 'Jungle Temple', short: 'JT', color: '#4f9a3a', minZoom: -4, defaultOn: false },
  { key: 'igloo', label: 'Igloo', short: 'I', color: '#cfe8f5', minZoom: -4, defaultOn: false },
  { key: 'ancient_city', label: 'Ancient City', short: 'AC', color: '#2c5a6e', minZoom: -5, defaultOn: true },
  { key: 'trial_chambers', label: 'Trial Chambers', short: 'TC', color: '#c8743a', minZoom: -4, defaultOn: false },
  { key: 'trail_ruins', label: 'Trail Ruins', short: 'TR', color: '#a7896a', minZoom: -4, defaultOn: false },
  { key: 'shipwreck', label: 'Shipwreck', short: 'S', color: '#6b5135', minZoom: -2, defaultOn: false },
  { key: 'ocean_ruin', label: 'Ocean Ruin', short: 'O', color: '#5f8f86', minZoom: -2, defaultOn: false },
  { key: 'ruined_portal', label: 'Ruined Portal', short: 'RP', color: '#6c3fb4', minZoom: -2, defaultOn: false },
  { key: 'buried_treasure', label: 'Buried Treasure', short: 'BT', color: '#d9b43c', minZoom: 0, defaultOn: false },
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
