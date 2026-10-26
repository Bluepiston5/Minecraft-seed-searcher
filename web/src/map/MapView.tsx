import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BiomeLayer, GridLines, SlimeLayer, StructureLayer, fromLatLng, toLatLng } from './layers';
import { getPool } from '../worker/pool';
import type { Cluster, WorldParams } from '../worker/protocol';
import { STRUCTURE_BY_KEY } from '../lib/structures';
import { biomeLabel } from '../lib/biomes';

export interface ClusterOverlay {
  key: string;
  minCount: number;
  radius: number;
}

export interface FocusRequest {
  x: number;
  z: number;
  zoom?: number;
  /** changes on every request so the same spot can be focused twice */
  token: number;
}

interface Props {
  world: WorldParams;
  structures: string[];
  slime: boolean;
  grid: boolean;
  biomeY: number;
  clusters: ClusterOverlay | null;
  focus: FocusRequest | null;
  onCursor: (pos: { x: number; z: number } | null) => void;
  onClusters: (c: Cluster[], truncated: boolean) => void;
  onCopy: (text: string) => void;
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const RING_COLORS = { quad: '#f2c94c', triple: '#6fcf7f', double: '#6ab0f3' };

function pinIcon(cls: string, label: string) {
  return L.divIcon({ className: '', html: `<div class="pin ${cls}">${label}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layers = useRef<{ biome: BiomeLayer; structs: StructureLayer; slime: SlimeLayer; grid: GridLines; marks: L.LayerGroup; clusters: L.LayerGroup }>();
  const latest = useRef(props);
  latest.current = props;

  // create the map once
  useEffect(() => {
    const m = L.map(el.current!, {
      crs: L.CRS.Simple,
      minZoom: -8,
      maxZoom: 4,
      zoomSnap: 1,
      attributionControl: false,
      zoomControl: false,
      preferCanvas: true,
    }).setView(toLatLng(0, 0), -2);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const world = latest.current.world;
    const biome = new BiomeLayer(world).addTo(m);
    const structs = new StructureLayer(world, { pane: 'overlayPane' });
    structs.setZIndex(5);
    const slime = new SlimeLayer(world);
    slime.setZIndex(3);
    const grid = new GridLines();
    grid.setZIndex(4);
    const marks = L.layerGroup().addTo(m);
    const clusters = L.layerGroup().addTo(m);
    structs.addTo(m);
    layers.current = { biome, structs, slime, grid, marks, clusters };
    map.current = m;

    let moveTimer = 0;
    m.on('mousemove', (e: L.LeafletMouseEvent) => {
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => latest.current.onCursor(fromLatLng(e.latlng)), 16);
    });
    m.on('mouseout', () => latest.current.onCursor(null));
    m.on('click', (e: L.LeafletMouseEvent) => showPopup(m, fromLatLng(e.latlng), e.latlng));

    return () => {
      m.remove();
      map.current = undefined;
    };
  }, []);

  function showPopup(m: L.Map, pos: { x: number; z: number }, at: L.LatLng) {
    const l = layers.current!;
    const hit = l.structs.hitTest(pos.x, pos.z, m.getZoom());
    const x = hit ? hit.x + 8 : pos.x, z = hit ? hit.z + 8 : pos.z;
    const title = hit ? escape(STRUCTURE_BY_KEY[hit.key]?.label ?? hit.key) : 'Position';
    const tp = `/tp @s ${x} ~ ${z}`;
    const popup = L.popup({ className: 'map-popup', maxWidth: 260 })
      .setLatLng(hit ? toLatLng(x, z) : at)
      .setContent(
        `<div class="pp"><div class="pp-title">${title}</div>` +
          `<div class="pp-row"><span>X / Z</span><b>${x} / ${z}</b></div>` +
          `<div class="pp-row"><span>Chunk</span><b>${x >> 4}, ${z >> 4}</b></div>` +
          `<div class="pp-row"><span>Biom</span><b class="pp-biome">…</b></div>` +
          `<button class="pp-copy" data-copy="${escape(tp)}">${escape(tp)} kopieren</button></div>`,
      )
      .openOn(m);
    const node = popup.getElement();
    node?.querySelector('.pp-copy')?.addEventListener('click', (ev) => {
      latest.current.onCopy((ev.currentTarget as HTMLElement).dataset.copy!);
    });
    getPool()
      .run({ kind: 'biomeAt', world: latest.current.world, x, z, y: latest.current.biomeY }, { priority: 5 })
      .then((r) => {
        const b = node?.querySelector('.pp-biome');
        if (b) b.textContent = biomeLabel(r.name);
      })
      .catch(() => {});
  }

  // world change: redraw tiles, recompute spawn and strongholds
  useEffect(() => {
    const l = layers.current!;
    l.biome.setWorld(props.world);
    l.structs.setWorld(props.world);
    l.slime.setWorld(props.world);
    map.current?.closePopup();
    l.marks.clearLayers();
    const world = props.world;
    let alive = true;
    getPool()
      .run({ kind: 'spawn', world }, { priority: 4 })
      .then((s) => {
        if (!alive) return;
        L.marker(toLatLng(s.x, s.z), { icon: pinIcon('pin-spawn', '★'), title: `Spawn ${s.x} / ${s.z}` }).addTo(l.marks);
      })
      .catch(() => {});
    getPool()
      .run({ kind: 'strongholds', world, count: 128 }, { priority: 0 })
      .then((r) => {
        if (!alive) return;
        for (let i = 0; i < r.pos.length; i += 2) {
          const x = r.pos[i], z = r.pos[i + 1];
          L.marker(toLatLng(x, z), { icon: pinIcon('pin-stronghold', 'E'), title: `Festung ${x} / ${z}` }).addTo(l.marks);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.world.seed, props.world.version, props.world.large]);

  useEffect(() => {
    layers.current!.structs.setKeys(props.structures);
  }, [props.structures.join(',')]);

  useEffect(() => {
    const m = map.current!, l = layers.current!;
    if (props.slime) l.slime.addTo(m);
    else l.slime.remove();
  }, [props.slime]);

  useEffect(() => {
    const m = map.current!, l = layers.current!;
    if (props.grid) l.grid.addTo(m);
    else l.grid.remove();
  }, [props.grid]);

  useEffect(() => {
    layers.current!.biome.setY(props.biomeY);
  }, [props.biomeY]);

  // cluster overlay follows the viewport
  useEffect(() => {
    const m = map.current!, l = layers.current!;
    l.clusters.clearLayers();
    const ov = props.clusters;
    if (!ov) {
      latest.current.onClusters([], false);
      return;
    }
    let ctrl: AbortController | null = null;
    const update = () => {
      ctrl?.abort();
      ctrl = new AbortController();
      const b = m.getBounds();
      const nw = fromLatLng(b.getNorthWest()), se = fromLatLng(b.getSouthEast());
      getPool()
        .run(
          { kind: 'clusters', world: latest.current.world, key: ov.key, minCount: ov.minCount, radius: ov.radius, x0: nw.x, z0: nw.z, x1: se.x, z1: se.z },
          { signal: ctrl.signal, priority: 3 },
        )
        .then((r) => {
          l.clusters.clearLayers();
          for (const c of r.clusters) {
            const cls = c.count >= 4 ? 'quad' : c.count === 3 ? 'triple' : 'double';
            // the map renders vectors on canvas, so colours can't come from CSS
            const color = RING_COLORS[cls];
            L.circle(toLatLng(c.afkX, c.afkZ), { radius: 128, color, weight: 2, dashArray: '6 4', fillColor: color, fillOpacity: 0.1, interactive: false }).addTo(l.clusters);
            L.marker(toLatLng(c.afkX, c.afkZ), {
              icon: L.divIcon({ className: '', html: `<div class="afk-pin afk-${cls}">${c.count}×</div>`, iconSize: [30, 20], iconAnchor: [15, 10] }),
              title: `AFK ${c.afkX} / ${c.afkZ} · Radius ${c.radius.toFixed(1)}`,
            })
              .on('click', () => latest.current.onCopy(`/tp @s ${c.afkX} ~ ${c.afkZ}`))
              .addTo(l.clusters);
          }
          latest.current.onClusters(r.clusters, r.truncated);
        })
        .catch(() => {});
    };
    update();
    m.on('moveend', update);
    return () => {
      ctrl?.abort();
      m.off('moveend', update);
    };
  }, [props.clusters?.key, props.clusters?.minCount, props.clusters?.radius, props.world.seed, props.world.version, props.world.large]);

  useEffect(() => {
    const f = props.focus;
    if (f && map.current) map.current.setView(toLatLng(f.x, f.z), f.zoom ?? Math.max(map.current.getZoom(), -1));
  }, [props.focus?.token]);

  return <div ref={el} className="map" />;
}
