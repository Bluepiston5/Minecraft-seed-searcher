// German names of the 1.21 overworld biomes, keyed by cubiomes' biome2str().
const DE: Record<string, string> = {
  ocean: 'Ozean', deep_ocean: 'Tiefsee', warm_ocean: 'Warmer Ozean', lukewarm_ocean: 'Lauwarmer Ozean',
  deep_lukewarm_ocean: 'Lauwarme Tiefsee', cold_ocean: 'Kalter Ozean', deep_cold_ocean: 'Kalte Tiefsee',
  frozen_ocean: 'Vereister Ozean', deep_frozen_ocean: 'Vereiste Tiefsee', mushroom_fields: 'Pilzland',
  plains: 'Ebene', sunflower_plains: 'Sonnenblumenebene', snowy_plains: 'Verschneite Ebene', ice_spikes: 'Eiszapfentundra',
  desert: 'Wüste', swamp: 'Sumpf', mangrove_swamp: 'Mangrovensumpf', forest: 'Wald', flower_forest: 'Blumenwald',
  birch_forest: 'Birkenwald', old_growth_birch_forest: 'Birkenurwald', dark_forest: 'Dunkler Wald',
  pale_garden: 'Bleicher Garten', taiga: 'Taiga', old_growth_pine_taiga: 'Kiefernurtaiga',
  old_growth_spruce_taiga: 'Fichtenurtaiga', snowy_taiga: 'Verschneite Taiga', savanna: 'Savanne',
  savanna_plateau: 'Savannenhochebene', windswept_savanna: 'Zerklüftete Savanne', windswept_hills: 'Windgepeitschte Hügel',
  windswept_gravelly_hills: 'Windgepeitschte Kieshügel', windswept_forest: 'Windgepeitschter Wald', jungle: 'Dschungel',
  sparse_jungle: 'Lichter Dschungel', bamboo_jungle: 'Bambusdschungel', badlands: 'Tafelberge',
  eroded_badlands: 'Abgetragene Tafelberge', wooded_badlands: 'Tafelbergwald', meadow: 'Wiese', cherry_grove: 'Kirschhain',
  grove: 'Hain', snowy_slopes: 'Verschneite Hänge', frozen_peaks: 'Vereiste Spitzen', jagged_peaks: 'Zerklüftete Spitzen',
  stony_peaks: 'Steinige Spitzen', river: 'Fluss', frozen_river: 'Vereister Fluss', beach: 'Strand', snowy_beach: 'Verschneiter Strand',
  stony_shore: 'Steinküste', dripstone_caves: 'Tropfsteinhöhlen', lush_caves: 'Üppige Höhlen', deep_dark: 'Tiefes Dunkel',
};

export function biomeLabel(name: string): string {
  return DE[name] ?? name.replace(/_/g, ' ');
}
