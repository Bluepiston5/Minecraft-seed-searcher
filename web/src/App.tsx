import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type ClusterOverlay, type FocusRequest } from './map/MapView';
import QuadHutFinder from './panels/QuadHutFinder';
import SeedSearch, { CLUSTER_TYPES } from './panels/SeedSearch';
import { STRUCTURES, STRUCTURE_BY_KEY, VERSIONS } from './lib/structures';
import { parseSeed, randomSeed } from './lib/seed';
import type { Cluster, WorldParams } from './worker/protocol';
import { drawStructureIcon } from './map/layers';

type Tab = 'map' | 'quad' | 'search';

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { seed: p.get('seed'), version: p.get('v') };
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
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [toast, setToast] = useState<string | null>(null);
  const [goto, setGoto] = useState('');

  const seed = useMemo(() => (parseSeed(seedText) ?? 0n).toString(), [seedText]);
  const world: WorldParams = useMemo(() => ({ version, seed, large }), [version, seed, large]);

  useEffect(() => {
    history.replaceState(null, '', `#seed=${encodeURIComponent(seedText)}&v=${encodeURIComponent(version)}`);
  }, [seedText, version]);

  const toastTimer = useRef(0);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setToast(`Kopiert: ${text}`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const focusAt = (x: number, z: number, zoom?: number) => setFocus({ x, z, zoom, token: Date.now() });

  const openSeed = (s: string, kind: string, minCount: number, at?: { x: number; z: number }) => {
    setSeedText(s);
    setOverlay({ key: kind, minCount, radius: 128 });
    setStructures((cur) => (cur.includes(kind) ? cur : [...cur, kind]));
    const p = at ?? { x: 512, z: 512 };
    focusAt(p.x, p.z, 0);
    if (window.matchMedia('(max-width: 760px)').matches) setPanelOpen(false);
  };

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
          <span className="brand-name">Seed Searcher</span>
        </div>
        <div className="seedbox">
          <input
            aria-label="Seed"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="Seed oder Text"
            spellCheck={false}
          />
          <button className="icon-btn" title="Zufälliger Seed" aria-label="Zufälliger Seed" onClick={() => setSeedText(randomSeed().toString())}>
            ⚄
          </button>
          <button className="icon-btn" title="Seed kopieren" aria-label="Seed kopieren" onClick={() => copy(seed)}>
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
          {panelOpen ? 'Karte' : 'Menü'}
        </button>
      </header>

      <aside className="panel">
        <nav className="tabs" role="tablist">
          {(
            [
              ['map', 'Karte'],
              ['quad', 'Quad-Hütten'],
              ['search', 'Seed-Suche'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>

        <div className={tab === 'map' ? '' : 'hidden'}>
          <div className="panel-body">
            {seed !== seedText.trim() && seedText.trim() && <p className="hint">Text-Seed entspricht {seed}</p>}
            <form className="goto" onSubmit={submitGoto}>
              <input value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Gehe zu X Z" aria-label="Koordinaten" />
              <button className="btn">Los</button>
            </form>

            <h3>Strukturen</h3>
            <ul className="toggles">
              {STRUCTURES.map((s) => (
                <li key={s.key}>
                  <label>
                    <input type="checkbox" checked={structures.includes(s.key)} onChange={() => toggleStruct(s.key)} />
                    <StructIcon k={s.key} />
                    <span>{s.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="hint">Dichte Strukturen erscheinen erst, wenn du weiter hineinzoomst.</p>

            <h3>Ebenen</h3>
            <ul className="toggles">
              <li>
                <label>
                  <input type="checkbox" checked={slime} onChange={(e) => setSlime(e.target.checked)} />
                  <span className="swatch slime" />
                  <span>Schleimchunks</span>
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
                  <span className="swatch grid" />
                  <span>Chunk- und Regionsraster</span>
                </label>
              </li>
              <li>
                <label>
                  <input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} />
                  <span className="swatch large" />
                  <span>Große Biome</span>
                </label>
              </li>
            </ul>
            <label className="field">
              <span>Biom-Höhe Y</span>
              <select value={biomeY} onChange={(e) => setBiomeY(+e.target.value)}>
                <option value={320}>320 (Bauhöhe)</option>
                <option value={64}>64 (Oberfläche)</option>
                <option value={0}>0 (Höhlen)</option>
                <option value={-52}>−52 (Tiefes Dunkel)</option>
              </select>
            </label>

            <h3>Farm-Finder auf der Karte</h3>
            <label className="field">
              <span>Struktur</span>
              <select
                value={overlay?.key ?? ''}
                onChange={(e) => setOverlay(e.target.value ? { key: e.target.value, minCount: overlay?.minCount ?? 2, radius: overlay?.radius ?? 128 } : null)}
              >
                <option value="">Aus</option>
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
                      ab {n}×
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Ringe zeigen AFK-Punkte, bei denen mindestens {overlay.minCount} Strukturen in {overlay.radius} Blöcken Radius liegen.
                  {clusters.truncated && ' Nur der Bereich um die Kartenmitte wird durchsucht.'}
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
                            <small>Radius {c.radius.toFixed(1)}</small>
                          </button>
                          <button className="icon-btn" title="Teleport-Befehl kopieren" aria-label="Teleport-Befehl kopieren" onClick={() => copy(`/tp @s ${c.afkX} ~ ${c.afkZ}`)}>
                            ⧉
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="hint">Im sichtbaren Bereich nichts gefunden.</p>
                )}
              </>
            )}
          </div>
        </div>
        <div className={tab === 'quad' ? '' : 'hidden'}>
          <QuadHutFinder version={version} onCopy={copy} onOpen={(s) => openSeed(s, 'swamp_hut', 4)} />
        </div>
        <div className={tab === 'search' ? '' : 'hidden'}>
          <SeedSearch version={version} onCopy={copy} onOpen={openSeed} />
        </div>
      </aside>

      <main className="stage">
        <MapView
          world={world}
          structures={structures}
          slime={slime}
          grid={grid}
          biomeY={biomeY}
          clusters={overlay}
          focus={focus}
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
            'Klicke auf die Karte für Details'
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
