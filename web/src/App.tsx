import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type ClusterOverlay, type FocusRequest, type Highlight } from './map/MapView';
import QuadHutFinder from './panels/QuadHutFinder';
import SeedSearch, { CLUSTER_TYPES } from './panels/SeedSearch';
import ClusterFinder from './panels/ClusterFinder';
import SlimeFinder from './panels/SlimeFinder';
import { DIMENSIONS, STRUCTURES, STRUCTURE_BY_KEY, VERSIONS } from './lib/structures';
import { parseSeed, randomSeed } from './lib/seed';
import type { Cluster, Dimension, WorldParams } from './worker/protocol';
import { drawStructureIcon } from './map/layers';

type Mode = 'map' | 'clusters' | 'quad' | 'seeds' | 'slime';

const MODES: [Mode, string][] = [
  ['map', 'Map'],
  ['clusters', 'Structure Clusters'],
  ['quad', 'Quad Witch Huts'],
  ['seeds', 'Seed Finder'],
  ['slime', 'Slime Chunks'],
];

const OVERWORLD_HEIGHTS: [number, string][] = [
  [320, '320 (build limit)'],
  [64, '64 (surface)'],
  [0, '0 (caves)'],
  [-52, '−52 (deep dark)'],
];

const NETHER_HEIGHTS: [number, string][] = [
  [100, '100 (upper nether)'],
  [64, '64 (middle)'],
  [32, '32 (lava sea)'],
];

const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const mode = p.get('mode') as Mode | null;
  const dim = p.get('dim') as Dimension | null;
  return {
    seed: p.get('seed'),
    version: p.get('v'),
    mode: MODES.some(([m]) => m === mode) ? mode! : 'map',
    dim: DIMENSIONS.some(([d]) => d === dim) ? dim! : 'overworld',
  };
}

function StructIcon({ k }: { k: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = 22 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawStructureIcon(ctx, k, 11, 11, 18);
  }, [k]);
  return <canvas ref={ref} className="sicon" aria-hidden />;
}

export default function App() {
  const initial = useMemo(readHash, []);
  const [mode, setMode] = useState<Mode>(initial.mode);
  // the finders work on overworld structures and slime chunks only
  const [dim, setDim] = useState<Dimension>(initial.mode === 'map' ? initial.dim : 'overworld');
  const [seedText, setSeedText] = useState(initial.seed ?? randomSeed().toString());
  const [version, setVersion] = useState(VERSIONS.some((v) => v.id === initial.version) ? initial.version! : VERSIONS[0].id);
  const [large, setLarge] = useState(false);
  const [biomeY, setBiomeY] = useState(64);
  const [structures, setStructures] = useState(() => STRUCTURES.filter((s) => s.defaultOn).map((s) => s.key));
  const [slime, setSlime] = useState(false);
  const [grid, setGrid] = useState(false);
  const [overlay, setOverlay] = useState<ClusterOverlay | null>(null);
  const [clusters, setClusters] = useState<{ list: Cluster[]; truncated: boolean }>({ list: [], truncated: false });
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => !isPhone());
  const [toast, setToast] = useState<string | null>(null);
  const [goto, setGoto] = useState('');

  const seed = useMemo(() => (parseSeed(seedText) ?? 0n).toString(), [seedText]);
  const world: WorldParams = useMemo(() => ({ version, seed, large, dim }), [version, seed, large, dim]);
  const dimStructures = useMemo(() => STRUCTURES.filter((s) => s.dim === dim), [dim]);
  const shownStructures = useMemo(() => structures.filter((k) => STRUCTURE_BY_KEY[k]?.dim === dim), [structures, dim]);

  useEffect(() => {
    history.replaceState(
      null,
      '',
      `#seed=${encodeURIComponent(seedText)}&v=${encodeURIComponent(version)}&mode=${mode}${dim === 'overworld' ? '' : `&dim=${dim}`}`,
    );
  }, [seedText, version, mode, dim]);

  // finder modes bring their own markings
  useEffect(() => {
    setHighlight(null);
    if (mode === 'slime') setSlime(true);
  }, [mode]);

  const toastTimer = useRef(0);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setToast(`Copied: ${text}`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const focusAt = useCallback((x: number, z: number, zoom?: number) => setFocus({ x, z, zoom, token: Date.now() + Math.random() }), []);

  const openSeed = (s: string, kind: string, minCount: number, at?: { x: number; z: number }) => {
    setSeedText(s);
    setOverlay({ key: kind, minCount, radius: 128 });
    setStructures((cur) => (cur.includes(kind) ? cur : [...cur, kind]));
    const p = at ?? { x: 512, z: 512 };
    focusAt(p.x, p.z, 0);
    if (isPhone()) setPanelOpen(false);
  };

  const showStructures = useCallback(
    (keys: string[]) => setStructures((cur) => [...new Set([...cur, ...keys])]),
    [],
  );

  const toggleStruct = (k: string) => setStructures((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const submitGoto = (e: React.FormEvent) => {
    e.preventDefault();
    // accepts "x z" and "x y z"
    const nums = (goto.match(/-?\d+/g) ?? []).map(Number);
    if (nums.length >= 2) {
      const [x, z] = nums.length >= 3 ? [nums[0], nums[2]] : [nums[0], nums[1]];
      focusAt(x, z);
    }
  };

  const onClusters = useCallback((list: Cluster[], truncated: boolean) => setClusters({ list, truncated }), []);

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <select
            className="mode"
            aria-label="What to search for"
            value={mode}
            onChange={(e) => {
              const m = e.target.value as Mode;
              setMode(m);
              if (m !== 'map') setDim('overworld');
              setPanelOpen(true);
            }}
          >
            {MODES.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="dim"
            aria-label="Dimension"
            value={dim}
            onChange={(e) => {
              const d = e.target.value as Dimension;
              setDim(d);
              setBiomeY(64);
              if (d !== 'overworld') setMode('map');
            }}
          >
            {DIMENSIONS.map(([d, label]) => (
              <option key={d} value={d}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="seedbox">
          <input aria-label="Seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="Seed or text" spellCheck={false} />
          <button className="icon-btn" title="Random seed" aria-label="Random seed" onClick={() => setSeedText(randomSeed().toString())}>
            ⚄
          </button>
          <button className="icon-btn" title="Copy seed" aria-label="Copy seed" onClick={() => copy(seed)}>
            ⧉
          </button>
        </div>
        <select className="version" aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value)}>
          {VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              Java {v.label}
            </option>
          ))}
        </select>
        <button className="btn ghost panel-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          {panelOpen ? 'Map' : 'Menu'}
        </button>
      </header>

      <aside className="panel">
        <div className="panel-head">{MODES.find(([m]) => m === mode)![1]}</div>
        <div className={mode === 'map' ? '' : 'hidden'}>
          <div className="panel-body">
            {seed !== seedText.trim() && seedText.trim() && <p className="hint">Text seed equals {seed}</p>}
            <form className="goto" onSubmit={submitGoto}>
              <input value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to X Z" aria-label="Coordinates" />
              <button className="btn">Go</button>
            </form>

            <h3>Structures</h3>
            <ul className="toggles">
              {dimStructures.map((s) => (
                <li key={s.key}>
                  <label>
                    <input type="checkbox" checked={structures.includes(s.key)} onChange={() => toggleStruct(s.key)} />
                    <StructIcon k={s.key} />
                    <span>{s.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="hint">Common structures only show up once you zoom in further.</p>

            {dim === 'overworld' && (
            <>
            <h3>Layers</h3>
            <ul className="toggles">
              <li>
                <label>
                  <input type="checkbox" checked={slime} onChange={(e) => setSlime(e.target.checked)} />
                  <span className="swatch slime" />
                  <span>Slime chunks</span>
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
                  <span className="swatch grid" />
                  <span>Chunk and region grid</span>
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} />
                  <span className="swatch large" />
                  <span>Large biomes</span>
                </label>
              </li>
            </ul>
            </>
            )}
            {dim !== 'end' && (
            <label className="field">
              <span>Biome height Y</span>
              <select value={biomeY} onChange={(e) => setBiomeY(+e.target.value)}>
                {(dim === 'nether' ? NETHER_HEIGHTS : OVERWORLD_HEIGHTS).map(([y, label]) => (
                  <option key={y} value={y}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            )}
            {dim === 'nether' && <p className="hint">Click the map to see the matching overworld coordinates for portals.</p>}

            {dim === 'overworld' && (
            <>
            <h3>Farm overlay</h3>
            <label className="field">
              <span>Structure</span>
              <select
                value={overlay?.key ?? ''}
                onChange={(e) => setOverlay(e.target.value ? { key: e.target.value, minCount: overlay?.minCount ?? 2, radius: overlay?.radius ?? 128 } : null)}
              >
                <option value="">Off</option>
                {CLUSTER_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {STRUCTURE_BY_KEY[k].label}
                  </option>
                ))}
              </select>
            </label>
            {overlay && (
              <>
                <div className="seg">
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={overlay.minCount === n ? 'on' : ''} onClick={() => setOverlay({ ...overlay, minCount: n })}>
                      {n}× or more
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Rings mark AFK spots with at least {overlay.minCount} structures within a {overlay.radius} block radius.
                  {clusters.truncated && ' Only the area around the map centre is searched.'}
                </p>
                {clusters.list.length > 0 ? (
                  <ul className="results">
                    {clusters.list
                      .slice()
                      .sort((a, b) => b.count - a.count || a.radius - b.radius)
                      .slice(0, 50)
                      .map((c) => (
                        <li key={`${c.afkX},${c.afkZ}`}>
                          <button className="seed" onClick={() => focusAt(c.afkX, c.afkZ, 0)}>
                            <code>
                              {c.count}× · {c.afkX} / {c.afkZ}
                            </code>
                            <small>radius {c.radius.toFixed(1)}</small>
                          </button>
                          <button
                            className="icon-btn"
                            title="Copy /tp command"
                            aria-label="Copy /tp command"
                            onClick={() => copy(`/tp @s ${c.afkX} ~ ${c.afkZ}`)}
                          >
                            ⧉
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="hint">Nothing found in the visible area.</p>
                )}
              </>
            )}
            </>
            )}
          </div>
        </div>
        {mode === 'clusters' && <ClusterFinder world={world} onHighlight={setHighlight} onFocus={focusAt} onCopy={copy} onStructures={showStructures} />}
        <div className={mode === 'quad' ? '' : 'hidden'}>
          <QuadHutFinder version={version} onCopy={copy} onOpen={(s) => openSeed(s, 'swamp_hut', 4)} />
        </div>
        <div className={mode === 'seeds' ? '' : 'hidden'}>
          <SeedSearch version={version} onCopy={copy} onOpen={openSeed} />
        </div>
        {mode === 'slime' && (
          <SlimeFinder
            world={world}
            onHighlight={setHighlight}
            onFocus={focusAt}
            onCopy={copy}
            onOpenSeed={(s, x, z) => {
              setSeedText(s);
              focusAt(x, z, 1);
              if (isPhone()) setPanelOpen(false);
            }}
          />
        )}
      </aside>

      <main className="stage">
        <MapView
          world={world}
          structures={shownStructures}
          slime={slime}
          grid={grid}
          biomeY={biomeY}
          clusters={overlay}
          focus={focus}
          highlight={highlight}
          onCursor={setCursor}
          onClusters={onClusters}
          onCopy={copy}
        />
        <div className="coords" aria-live="off">
          {cursor ? (
            <>
              <span>X</span> {cursor.x} <span>Z</span> {cursor.z} <span>Chunk</span> {cursor.x >> 4}, {cursor.z >> 4}
            </>
          ) : (
            'Click the map for details'
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
