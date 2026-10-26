import L from 'leaflet';
import { getPool, AbortError } from '../worker/pool';
import type { WorldParams } from '../worker/protocol';
import { STRUCTURE_BY_KEY } from '../lib/structures';

// Map coordinates: one Leaflet unit is one block; lat = -z, lng = x, so that
// north (negative z) is up like in the game's F3 screen and on chunkbase.
export const toLatLng = (x: number, z: number) => L.latLng(-z, x);
export const fromLatLng = (ll: L.LatLng) => ({ x: Math.floor(ll.lng), z: Math.floor(-ll.lat) });

export const TILE = 256;

/** Blocks per screen pixel at a zoom level. */
export const blocksPerPixel = (zoom: number) => Math.pow(2, -zoom);

interface TileEl extends HTMLCanvasElement {
  _abort?: AbortController;
}

function tileArea(coords: L.Coords) {
  const size = TILE * blocksPerPixel(coords.z);
  return { x0: coords.x * size, z0: coords.y * size, size };
}

const tileKey = (c: L.Coords) => `${c.x}:${c.y}:${c.z}`;

const isAbort = (e: unknown) => e instanceof AbortError;

/** Base class for canvas tile layers whose content is computed asynchronously. */
abstract class AsyncCanvasLayer extends L.GridLayer {
  world: WorldParams;

  constructor(world: WorldParams, options?: L.GridLayerOptions) {
    super({ tileSize: TILE, keepBuffer: 2, updateWhenZooming: false, minZoom: -8, maxZoom: 4, ...options });
    this.world = world;
  }

  onAdd(map: L.Map) {
    super.onAdd(map);
    this.on('tileunload', this.onTileUnload);
    return this;
  }

  onRemove(map: L.Map) {
    this.off('tileunload', this.onTileUnload);
    return super.onRemove(map);
  }

  private onTileUnload = (e: L.TileEvent) => {
    (e.tile as unknown as TileEl)._abort?.abort();
    this.tileUnloaded(e.coords);
  };

  protected tileUnloaded(_coords: L.Coords) {}

  setWorld(world: WorldParams) {
    this.world = world;
    this.redraw();
  }

  protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('canvas') as TileEl;
    tile.width = tile.height = TILE;
    const ctrl = new AbortController();
    tile._abort = ctrl;
    this.drawTile(tile, coords, ctrl.signal)
      .then(() => done(undefined, tile))
      .catch((e) => {
        if (!isAbort(e)) console.error(e);
        done(undefined, tile);
      });
    return tile;
  }

  protected abstract drawTile(tile: HTMLCanvasElement, coords: L.Coords, signal: AbortSignal): Promise<void>;
}

const SCALES = [4, 16, 64, 256];

export class BiomeLayer extends AsyncCanvasLayer {
  y = 64;

  setY(y: number) {
    this.y = y;
    this.redraw();
  }

  protected async drawTile(tile: HTMLCanvasElement, coords: L.Coords, signal: AbortSignal) {
    const { x0, z0, size } = tileArea(coords);
    const bpp = blocksPerPixel(coords.z);
    const scale = SCALES.find((s) => s >= bpp) ?? 256;
    const cells = Math.max(1, Math.round(size / scale));
    // tiles nearer to the view centre are generated first
    const res = await getPool().run(
      {
        kind: 'biomes',
        world: this.world,
        scale,
        x: Math.floor(x0 / scale),
        z: Math.floor(z0 / scale),
        w: cells,
        h: cells,
        y: this.y,
      },
      { signal, priority: 2 },
    );
    const src = document.createElement('canvas');
    src.width = src.height = cells;
    src.getContext('2d')!.putImageData(new ImageData(res.rgba, cells, cells), 0, 0);
    const ctx = tile.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, TILE, TILE);
  }
}

export interface PlacedStructure {
  key: string;
  x: number;
  z: number;
}

const ICON = 20;

export function drawStructureIcon(ctx: CanvasRenderingContext2D, key: string, px: number, py: number, size = ICON) {
  const def = STRUCTURE_BY_KEY[key];
  const r = size / 2;
  ctx.save();
  ctx.translate(px, py);
  ctx.beginPath();
  ctx.roundRect(-r, -r, size, size, 5);
  ctx.fillStyle = def?.color ?? '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(10,12,16,0.85)';
  ctx.stroke();
  ctx.fillStyle = isLight(def?.color ?? '#fff') ? '#14171c' : '#ffffff';
  ctx.font = `700 ${def && def.short.length > 1 ? 9 : 11}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def?.short ?? '?', 0, 0.5);
  ctx.restore();
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

/** Draws the enabled structure types, and remembers what it drew for clicks. */
export class StructureLayer extends AsyncCanvasLayer {
  keys: string[] = [];
  private placed = new Map<string, PlacedStructure[]>();

  setKeys(keys: string[]) {
    this.keys = keys;
    this.placed.clear();
    this.redraw();
  }

  setWorld(world: WorldParams) {
    this.placed.clear();
    super.setWorld(world);
  }

  /** Structures drawn near a block position at the current zoom. */
  hitTest(x: number, z: number, zoom: number): PlacedStructure | null {
    const tol = (ICON / 2 + 2) * blocksPerPixel(zoom);
    let best: PlacedStructure | null = null;
    let bestD = Infinity;
    for (const list of this.placed.values()) {
      for (const s of list) {
        const d = Math.max(Math.abs(s.x + 8 - x), Math.abs(s.z + 8 - z));
        if (d <= tol && d < bestD) {
          best = s;
          bestD = d;
        }
      }
    }
    return best;
  }

  protected async drawTile(tile: HTMLCanvasElement, coords: L.Coords, signal: AbortSignal) {
    const { x0, z0, size } = tileArea(coords);
    const bpp = blocksPerPixel(coords.z);
    const pad = Math.ceil((ICON / 2 + 2) * bpp) + 16;
    const keys = this.keys.filter((k) => coords.z >= (STRUCTURE_BY_KEY[k]?.minZoom ?? 0));
    const results = await Promise.all(
      keys.map((key) =>
        getPool()
          .run(
            { kind: 'structures', world: this.world, key, x0: x0 - pad, z0: z0 - pad, x1: x0 + size + pad, z1: z0 + size + pad },
            { signal, priority: 1 },
          )
          .then((r) => ({ key, pos: r.pos })),
      ),
    );
    const ctx = tile.getContext('2d')!;
    const list: PlacedStructure[] = [];
    for (const { key, pos } of results) {
      for (let i = 0; i < pos.length; i += 2) {
        const x = pos[i], z = pos[i + 1];
        // icon at the centre of the generation chunk
        const px = (x + 8 - x0) / bpp, py = (z + 8 - z0) / bpp;
        drawStructureIcon(ctx, key, px, py);
        if (x >= x0 && x < x0 + size && z >= z0 && z < z0 + size) list.push({ key, x, z });
      }
    }
    this.placed.set(tileKey(coords), list);
  }

  protected tileUnloaded(coords: L.Coords) {
    this.placed.delete(tileKey(coords));
  }
}

/** Slime chunks, only drawn when zoomed in far enough to see single chunks. */
export class SlimeLayer extends AsyncCanvasLayer {
  constructor(world: WorldParams) {
    super(world, { minZoom: -2 });
  }

  protected async drawTile(tile: HTMLCanvasElement, coords: L.Coords, signal: AbortSignal) {
    const { x0, z0, size } = tileArea(coords);
    const bpp = blocksPerPixel(coords.z);
    const n = Math.max(1, size / 16);
    const res = await getPool().run(
      { kind: 'slime', world: this.world, cx: Math.floor(x0 / 16), cz: Math.floor(z0 / 16), w: n, h: n },
      { signal, priority: 1 },
    );
    const ctx = tile.getContext('2d')!;
    const cs = 16 / bpp;
    ctx.fillStyle = 'rgba(110, 230, 90, 0.55)';
    ctx.strokeStyle = 'rgba(40, 120, 30, 0.9)';
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!res.mask[j * n + i]) continue;
        ctx.fillRect(i * cs, j * cs, cs, cs);
        if (cs >= 6) ctx.strokeRect(i * cs + 0.5, j * cs + 0.5, cs - 1, cs - 1);
      }
    }
  }
}

/** Chunk grid (zoomed in) and region-file grid lines, drawn synchronously. */
export class GridLines extends L.GridLayer {
  constructor() {
    super({ tileSize: TILE, minZoom: -3, maxZoom: 4 });
  }

  protected createTile(coords: L.Coords): HTMLElement {
    const tile = document.createElement('canvas');
    tile.width = tile.height = TILE;
    const ctx = tile.getContext('2d')!;
    const { x0, z0, size } = tileArea(coords);
    const bpp = blocksPerPixel(coords.z);
    const line = (step: number, style: string, width: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / step) * step; x < x0 + size; x += step) {
        const p = Math.round((x - x0) / bpp) + 0.5;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, TILE);
      }
      for (let z = Math.ceil(z0 / step) * step; z < z0 + size; z += step) {
        const p = Math.round((z - z0) / bpp) + 0.5;
        ctx.moveTo(0, p);
        ctx.lineTo(TILE, p);
      }
      ctx.stroke();
    };
    if (bpp <= 1) line(16, 'rgba(0,0,0,0.18)', 1);
    line(512, 'rgba(0,0,0,0.38)', 1);
    return tile;
  }
}
