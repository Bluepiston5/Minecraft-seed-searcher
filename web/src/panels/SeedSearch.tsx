import { useEffect, useRef, useState } from 'react';
import { getSearchPool } from '../worker/pool';
import { STRUCTURE_BY_KEY, VERSIONS } from '../lib/structures';
import { parseSeed, randomSeed } from '../lib/seed';
import { ResultList } from './QuadHutFinder';

interface Props {
  version: string;
  onOpen: (seed: string, key: string, minCount: number, focus?: { x: number; z: number }) => void;
  onCopy: (text: string) => void;
}

export const CLUSTER_TYPES = ['swamp_hut', 'monument', 'pillager_outpost', 'village', 'desert_pyramid', 'igloo', 'shipwreck', 'ocean_ruin'];

const BATCH = 2000;

/** Brute-force search over many seeds for double/triple/quad structures near
 * the origin. Structure geometry is checked first, biomes only for candidates. */
export default function SeedSearch({ version, onOpen, onCopy }: Props) {
  const [ver, setVer] = useState(version);
  const [key, setKey] = useState('monument');
  const [minCount, setMinCount] = useState(2);
  const [radius, setRadius] = useState(128);
  const [area, setArea] = useState(2000);
  const [mode, setMode] = useState<'random' | 'sequential'>('random');
  const [startSeed, setStartSeed] = useState('0');
  const [limit, setLimit] = useState(100);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState(0);
  const [rate, setRate] = useState(0);
  const [hits, setHits] = useState<{ seed: string; x: number; z: number }[]>([]);
  const stopRef = useRef<() => void>();

  useEffect(() => () => stopRef.current?.(), []);

  function start() {
    const pool = getSearchPool();
    let stopped = false;
    let next = parseSeed(startSeed) ?? 0n;
    let total = 0;
    const t0 = performance.now();
    const out: { seed: string; x: number; z: number }[] = [];
    setHits([]);
    setChecked(0);
    setRunning(true);
    const finish = () => {
      stopped = true;
      setRunning(false);
    };
    stopRef.current = finish;

    const batch = () => {
      const seeds: string[] = [];
      for (let i = 0; i < BATCH; i++) {
        if (mode === 'random') seeds.push(randomSeed().toString());
        else seeds.push(BigInt.asIntN(64, next++).toString());
      }
      return seeds;
    };

    const launch = () => {
      if (stopped) return;
      pool
        .run({ kind: 'seedScan', version: ver, key, minCount, radius, areaRadius: area, seeds: batch() })
        .then((r) => {
          if (stopped) return;
          total += BATCH;
          out.push(...r.hits);
          if (out.length >= limit) {
            out.length = limit;
            finish();
          }
          setHits([...out]);
          setChecked(total);
          setRate(total / ((performance.now() - t0) / 1000));
        })
        .catch((e) => {
          console.error(e);
          finish();
        })
        .finally(launch);
    };
    for (let i = 0; i < pool.size; i++) launch();
  }

  const lock = running;

  return (
    <div className="panel-body">
      <p className="lead">
        Durchsucht viele Seeds nach mehreren Strukturen, die zusammen in eine AFK-Kugel passen, zum Beispiel Doppel- oder
        Dreifach-Monumente.
      </p>
      <label className="field">
        <span>Version</span>
        <select value={ver} onChange={(e) => setVer(e.target.value)} disabled={lock}>
          {VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Struktur</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} disabled={lock}>
          {CLUSTER_TYPES.map((k) => (
            <option key={k} value={k}>
              {STRUCTURE_BY_KEY[k].label}
            </option>
          ))}
        </select>
      </label>
      <div className="seg" role="radiogroup" aria-label="Anzahl">
        {[2, 3, 4].map((n) => (
          <button key={n} role="radio" aria-checked={minCount === n} className={minCount === n ? 'on' : ''} onClick={() => setMinCount(n)} disabled={lock}>
            {n === 2 ? 'Doppelt' : n === 3 ? 'Dreifach' : 'Quad'}
          </button>
        ))}
      </div>
      <label className="field">
        <span>AFK-Radius</span>
        <input type="number" min={16} max={256} value={radius} onChange={(e) => setRadius(+e.target.value || 128)} disabled={lock} />
      </label>
      <label className="field">
        <span>Suchgebiet ±</span>
        <input type="number" min={512} max={20000} step={512} value={area} onChange={(e) => setArea(+e.target.value || 2000)} disabled={lock} />
      </label>
      <div className="seg">
        <button className={mode === 'random' ? 'on' : ''} onClick={() => setMode('random')} disabled={lock}>
          Zufällig
        </button>
        <button className={mode === 'sequential' ? 'on' : ''} onClick={() => setMode('sequential')} disabled={lock}>
          Ab Seed
        </button>
      </div>
      {mode === 'sequential' && (
        <label className="field">
          <span>Start-Seed</span>
          <input value={startSeed} onChange={(e) => setStartSeed(e.target.value)} disabled={lock} />
        </label>
      )}
      <label className="field">
        <span>Max. Treffer</span>
        <input type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(Math.max(1, +e.target.value || 1))} disabled={lock} />
      </label>
      {key === 'monument' && minCount === 4 && (
        <p className="hint warn">Vier Monumente in einer AFK-Kugel kommen in 1.21 praktisch nicht vor. Doppelt oder dreifach ist realistisch.</p>
      )}
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={() => stopRef.current?.()}>
            Stopp
          </button>
        ) : (
          <button className="btn primary" onClick={start}>
            Suche starten
          </button>
        )}
      </div>
      <div className="stats">
        <div>
          <span>Geprüft</span>
          <b>{checked.toLocaleString('de-DE')}</b>
        </div>
        <div>
          <span>Seeds/s</span>
          <b>{Math.round(rate).toLocaleString('de-DE')}</b>
        </div>
        <div>
          <span>Treffer</span>
          <b>{hits.length}</b>
        </div>
      </div>
      <ResultList
        seeds={hits.map((h) => h.seed)}
        detail={(s) => {
          const h = hits.find((x) => x.seed === s);
          return h && `AFK ${h.x} / ${h.z}`;
        }}
        onOpen={(s) => {
          const h = hits.find((x) => x.seed === s);
          onOpen(s, key, minCount, h && { x: h.x, z: h.z });
        }}
        onCopy={onCopy}
      />
    </div>
  );
}
