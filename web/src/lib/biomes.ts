// Display names for cubiomes' biome2str() ids, e.g. "old_growth_pine_taiga".
export function biomeLabel(name: string): string {
  return name
    .split('_')
    .map((w) => (w === 'of' || w === 'the' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
