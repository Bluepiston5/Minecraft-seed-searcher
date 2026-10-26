import { useEffect, useRef, useState } from 'react';
import { getSearchPool } from '../worker/pool';
import { VERSIONS } from '../lib/structures';

interface Props {
  version: string;
  onOpen: (seed: string) => void;
  onCopy: (text: string) => void;
}

const QUALITIES = [
  { id: 0, label: 'Ideal', hint: 'Only the very best constellations, very rare' },
  { id: 1, label: 'Classic', hint: 'The well-known quad constellations' },
  { id: 2, label: 'Normal', hint: 'All quads that work with a drop-chute farm (radius 128)' },
  { id: 3, label: 'Barely', hint: 'Also quads that only fit without a drop chute' },
];

// The 48-bit search space is split into 2^28 "high" values per low20 pattern.
const HI_TOTAL = 1 << 28;
const HI_CHUNK = 1 << 16;
const UP_CHUNK = 8192;

/** Exhaustive quad witch hut search: first enumerate 48-bit quad bases (pure
 * structure geometry), then try the 65536 upper bits of each base for four
 * swamp biomes. All four huts lie in regions (0,0)–(1,1), near spawn. */
export default function QuadHutFinder({ version, onOpen, onCopy }: Props) {
  const [quality, setQuality] = useState(1);
  const [ver, setVer] = useState(version);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bases, setBases] = useState(0);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [limit, setLimit] = useState(200);
  const stopRef = useRef<() => void>();

  useEffect(() => () => stopRef.current?.(), []);

  function start() {
    const pool = getSearchPool();
    let stopped = false;
    // random starting point, so repeated searches show different seeds first
    let hiNext = Math.floor(Math.random() * (HI_TOTAL / HI_CHUNK)) * HI_CHUNK;
    let hiIssued = 0;
    let hiDone = 0;
    let found = 0;
    const baseQueue: { base: string; up: number }[] = [];
    let inflight = 0;
    const out: string[] = [];
    setSeeds([]);
    setBases(0);
    setProgress(0);
    setRunning(true);

    const finish = () => {
      stopped = true;
      setRunning(false);
    };
    stopRef.current = finish;

    const schedule = () => {
      while (!stopped && inflight < pool.size * 2) {
        const b = baseQueue[0];
        if (b) {
          // complete known bases first so results show up early
          const up = b.up;
          b.up += UP_CHUNK;
          if (b.up >= 0x10000) baseQueue.shift();
          inflight++;
          pool
            .run({ kind: 'quadComplete', version: ver, base: b.base, upStart: up, upCount: UP_CHUNK }, { priority: 2 })
            .then((r) => {
              if (stopped) return;
              out.push(...r.seeds);
              if (out.length >= limit) {
                out.length = limit;
                finish();
              }
              setSeeds([...out]);
            })
            .finally(() => {
              inflight--;
              schedule();
            });
        } else if (hiIssued < HI_TOTAL) {
          const hi = hiNext;
          hiNext = (hiNext + HI_CHUNK) % HI_TOTAL;
          hiIssued += HI_CHUNK;
          inflight++;
          pool
            .run({ kind: 'quadBases', version: ver, quality, hiStart: hi, hiCount: HI_CHUNK }, { priority: 1 })
            .then((r) => {
              if (stopped) return;
              hiDone += HI_CHUNK;
              found += r.bases.length;
              for (const base of r.bases) baseQueue.push({ base, up: 0 });
              setBases(found);
              setProgress(hiDone / HI_TOTAL);
            })
            .finally(() => {
              inflight--;
              schedule();
            });
        } else {
          break;
        }
      }
      if (!stopped && inflight === 0 && !baseQueue.length) finish();
    };
    schedule();
  }

  const q = QUALITIES.find((x) => x.id === quality)!;

  return (
    <div className="panel-body">
      <p className="lead">
        Finds seeds with four witch huts that all fit into one AFK sphere with a 128 block radius. The huts are close to the world origin
        (roughly X/Z 0–1000).
      </p>
      <label className="field">
        <span>Version</span>
        <select value={ver} onChange={(e) => setVer(e.target.value)} disabled={running}>
          {VERSIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quality</span>
        <select value={quality} onChange={(e) => setQuality(+e.target.value)} disabled={running}>
          {QUALITIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{q.hint}</p>
      <label className="field">
        <span>Max results</span>
        <input type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(Math.max(1, +e.target.value || 1))} disabled={running} />
      </label>
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={() => stopRef.current?.()}>
            Stop
          </button>
        ) : (
          <button className="btn primary" onClick={start}>
            Start search
          </button>
        )}
      </div>
      <div className="stats">
        <div>
          <span>Progress</span>
          <b>{(progress * 100).toFixed(2)} %</b>
        </div>
        <div>
          <span>Quad bases</span>
          <b>{bases}</b>
        </div>
        <div>
          <span>Seeds</span>
          <b>{seeds.length}</b>
        </div>
      </div>
      {running && <div className="bar"><i style={{ width: `${Math.max(1, progress * 100)}%` }} /></div>}
      <ResultList seeds={seeds} onOpen={onOpen} onCopy={onCopy} />
    </div>
  );
}

export function ResultList({
  seeds,
  onOpen,
  onCopy,
  detail,
}: {
  seeds: string[];
  onOpen: (seed: string) => void;
  onCopy: (t: string) => void;
  detail?: (seed: string) => string | undefined;
}) {
  if (!seeds.length) return null;
  return (
    <ul className="results">
      {seeds.map((s) => (
        <li key={s}>
          <button className="seed" onClick={() => onOpen(s)} title="Show on map">
            <code>{s}</code>
            {detail?.(s) && <small>{detail(s)}</small>}
          </button>
          <button className="icon-btn" onClick={() => onCopy(s)} title="Copy seed" aria-label="Copy seed">
            ⧉
          </button>
        </li>
      ))}
    </ul>
  );
}
