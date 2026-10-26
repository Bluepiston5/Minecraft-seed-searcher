import { useEffect, useMemo, useRef, useState } from 'react';
import { getPool, getSearchPool } from '../worker/pool';
import type { WorldParams } from '../worker/protocol';
import type { Highlight } from '../map/MapView';
import { parseSeed, randomSeed } from '../lib/seed';
import { Field, ResultList, Seg, StartStop, Stats, SuggestionCard } from './common';

interface Props {
  world: WorldParams;
  onHighlight: (h: Highlight | null) => void;
  onFocus: (x: number, z: number, zoom?: number) => void;
  onCopy: (t: string) => void;
  onOpenSeed: (seed: string, x: number, z: number) => void;
}

const GRID = 7;

type Cells = boolean[]; // GRID*GRID, row-major

function preset(rows: string[]): Cells {
  const cells: Cells = Array(GRID * GRID).fill(false);
  rows.forEach((row, j) => [...row].forEach((ch, i) => (cells[j * GRID + i] = ch === '#')));
  return cells;
}

const PRESETS: [string, Cells][] = [
  ['2×2', preset(['##', '##'])],
  ['3×3', preset(['###', '###', '###'])],
  ['4×4', preset(['####', '####', '####', '####'])],
  ['Line 4', preset(['####'])],
  ['2×3', preset(['###', '###'])],
  ['Plus', preset(['.#.', '###', '.#.'])],
  ['L', preset(['#..', '#..', '###'])],
  ['Ring', preset(['###', '#.#', '###'])],
];

/** Crops the drawn cells to their bounding box. */
function toPattern(cells: Cells) {
  let x0 = GRID, z0 = GRID, x1 = -1, z1 = -1;
  cells.forEach((on, i) => {
    if (!on) return;
    const x = i % GRID, z = Math.floor(i / GRID);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  });
  if (x1 < 0) return null;
  const pw = x1 - x0 + 1, ph = z1 - z0 + 1;
  const pattern: number[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) pattern.push(cells[z * GRID + x] ? 1 : 0);
  return { pattern, pw, ph, count: pattern.reduce((a, b) => a + b, 0) };
}

// one chunk in ten is a slime chunk, independently of its neighbours
function rarity(count: number) {
  const n = Math.pow(10, count);
  return n >= 1e6 ? `10^${count}` : n.toLocaleString('en-US');
}

const START_CHUNKS = 64;
const MAX_CHUNKS = 2048;
const SEED_BATCH = 500;

export default function SlimeFinder({ world, onHighlight, onFocus, onCopy, onOpenSeed }: Props) {
  const [cells, setCells] = useState<Cells>(PRESETS[0][1]);
  const [scope, setScope] = useState<'seed' | 'seeds'>('seed');
  const pat = useMemo(() => toPattern(cells), [cells]);
  const patKey = pat ? `${pat.pw}x${pat.ph}:${pat.pattern.join('')}` : '';

  const paint = useRef<boolean | null>(null);
  const setCell = (i: number, on: boolean) => setCells((c) => c.map((v, j) => (j === i ? on : v)));

  return (
    <div className="panel-body">
      <p className="lead">Draw the slime chunk constellation you need, or pick a preset. Every marked chunk has to be a slime chunk.</p>
      <div className="presets">
        {PRESETS.map(([name, p]) => (
          <button key={name} className={patKey && toPattern(p) && patKeyOf(p) === patKey ? 'chip on' : 'chip'} onClick={() => setCells(p)}>
            {name}
          </button>
        ))}
      </div>
      <div
        className="pattern"
        style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
        onPointerUp={() => (paint.current = null)}
        onPointerLeave={() => (paint.current = null)}
      >
        {cells.map((on, i) => (
          <button
            key={i}
            className={on ? 'cell on' : 'cell'}
            aria-label={`Chunk ${i % GRID + 1}, ${Math.floor(i / GRID) + 1}`}
            aria-pressed={on}
            onPointerDown={(e) => {
              e.preventDefault();
              paint.current = !on;
              setCell(i, !on);
            }}
            onPointerEnter={() => paint.current !== null && setCell(i, paint.current)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setCell(i, !on))}
          />
        ))}
      </div>
      <div className="row tight">
        <span className="hint">
          {pat ? `${pat.count} chunks · ${pat.pw}×${pat.ph} · chance 1 in ${rarity(pat.count)} per spot` : 'Mark at least one chunk'}
        </span>
        <button className="btn ghost" onClick={() => setCells(Array(GRID * GRID).fill(false))}>
          Clear
        </button>
      </div>

      <Seg
        label="Search scope"
        value={scope}
        onChange={setScope}
        options={[
          ['seed', 'This seed'],
          ['seeds', 'Find seeds'],
        ]}
      />
      {pat &&
        (scope === 'seed' ? (
          <ThisSeed key={patKey + world.seed} world={world} pat={pat} onHighlight={onHighlight} onFocus={onFocus} onCopy={onCopy} />
        ) : (
          <FindSeeds pat={pat} onCopy={onCopy} onOpenSeed={onOpenSeed} onHighlight={onHighlight} />
        ))}
    </div>
  );
}

function patKeyOf(c: Cells) {
  const p = toPattern(c)!;
  return `${p.pw}x${p.ph}:${p.pattern.join('')}`;
}

type Pattern = NonNullable<ReturnType<typeof toPattern>>;

function patternCenter(cx: number, cz: number, p: Pattern) {
  return { x: cx * 16 + (p.pw * 16) / 2, z: cz * 16 + (p.ph * 16) / 2 };
}

function patternBoxes(cx: number, cz: number, p: Pattern) {
  const boxes: { x: number; z: number; size: number }[] = [];
  for (let j = 0; j < p.ph; j++) for (let i = 0; i < p.pw; i++) if (p.pattern[j * p.pw + i]) boxes.push({ x: (cx + i) * 16, z: (cz + j) * 16, size: 16 });
  return boxes;
}

function ThisSeed({ world, pat, onHighlight, onFocus, onCopy }: { world: WorldParams; pat: Pattern; onHighlight: Props['onHighlight']; onFocus: Props['onFocus']; onCopy: Props['onCopy'] }) {
  const [area, setArea] = useState(START_CHUNKS);
  const [matches, setMatches] = useState<{ cx: number; cz: number; d: number }[] | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    getPool()
      .run(
        { kind: 'slimePattern', seed: world.seed, pattern: pat.pattern, pw: pat.pw, ph: pat.ph, cx: -area, cz: -area, w: 2 * area, h: 2 * area, max: 20000 },
        { priority: 4 },
      )
      .then((r) => {
        if (!alive) return;
        const list: { cx: number; cz: number; d: number }[] = [];
        for (let i = 0; i < r.matches.length; i += 2) {
          const c = patternCenter(r.matches[i], r.matches[i + 1], pat);
          list.push({ cx: r.matches[i], cz: r.matches[i + 1], d: Math.hypot(c.x, c.z) });
        }
        list.sort((a, b) => a.d - b.d);
        setMatches(list);
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [area]);

  const open = useMemo(() => (matches ?? []).filter((m) => !rejected.has(`${m.cx},${m.cz}`)), [matches, rejected]);
  useEffect(() => {
    if (matches && !busy && !open.length && area < MAX_CHUNKS) setArea((a) => a * 2);
  }, [matches, busy, open.length]);

  const cur = open[0];
  useEffect(() => {
    if (!cur) {
      onHighlight(null);
      return;
    }
    const c = patternCenter(cur.cx, cur.cz, pat);
    onHighlight({ color: '#6ee65a', boxes: patternBoxes(cur.cx, cur.cz, pat) });
    onFocus(c.x, c.z, 1);
  }, [cur?.cx, cur?.cz]);
  useEffect(() => () => onHighlight(null), []);

  if (!cur)
    return <p className="hint">{busy ? `Searching within ±${area * 16} blocks…` : area >= MAX_CHUNKS ? 'No (more) matches nearby.' : 'Searching…'}</p>;
  const c = patternCenter(cur.cx, cur.cz, pat);
  return (
    <SuggestionCard
      index={rejected.size + 1}
      total={open.length - 1}
      busy={busy}
      title={`Chunks ${cur.cx}, ${cur.cz} → ${cur.cx + pat.pw - 1}, ${cur.cz + pat.ph - 1}`}
      rows={[
        ['Centre', `${Math.round(c.x)} / ${Math.round(c.z)}`],
        ['Distance from 0, 0', `${Math.round(cur.d)} blocks`],
      ]}
      onShow={() => onFocus(c.x, c.z, 1)}
      onCopy={() => onCopy(`/tp @s ${Math.round(c.x)} ~ ${Math.round(c.z)}`)}
      onReject={() => setRejected((r) => new Set(r).add(`${cur.cx},${cur.cz}`))}
    />
  );
}

function FindSeeds({ pat, onCopy, onOpenSeed, onHighlight }: { pat: Pattern; onCopy: Props['onCopy']; onOpenSeed: Props['onOpenSeed']; onHighlight: Props['onHighlight'] }) {
  const [area, setArea] = useState(16);
  const [mode, setMode] = useState<'random' | 'sequential'>('random');
  const [startSeed, setStartSeed] = useState('0');
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState(0);
  const [hits, setHits] = useState<{ seed: string; cx: number; cz: number }[]>([]);
  const stop = useRef<() => void>();
  useEffect(() => () => stop.current?.(), []);

  function start() {
    const pool = getSearchPool();
    let stopped = false;
    let next = parseSeed(startSeed) ?? 0n;
    let total = 0;
    const out: typeof hits = [];
    setHits([]);
    setChecked(0);
    setRunning(true);
    const finish = () => {
      stopped = true;
      setRunning(false);
    };
    stop.current = finish;
    const launch = () => {
      if (stopped) return;
      const seeds: string[] = [];
      for (let i = 0; i < SEED_BATCH; i++) seeds.push(mode === 'random' ? randomSeed().toString() : BigInt.asIntN(64, next++).toString());
      pool
        .run({ kind: 'slimeSeedScan', seeds, pattern: pat.pattern, pw: pat.pw, ph: pat.ph, area })
        .then((r) => {
          if (stopped) return;
          total += SEED_BATCH;
          out.push(...r.hits);
          if (out.length >= limit) {
            out.length = limit;
            finish();
          }
          setHits([...out]);
          setChecked(total);
        })
        .catch(finish)
        .finally(launch);
    };
    for (let i = 0; i < pool.size; i++) launch();
  }

  return (
    <>
      <Field label="Within ± chunks">
        <input type="number" min={2} max={256} value={area} onChange={(e) => setArea(Math.max(2, Math.min(256, +e.target.value || 16)))} disabled={running} />
      </Field>
      <p className="hint">±{area} chunks = ±{area * 16} blocks around 0, 0.</p>
      <Seg
        label="Seed order"
        value={mode}
        onChange={setMode}
        disabled={running}
        options={[
          ['random', 'Random'],
          ['sequential', 'From seed'],
        ]}
      />
      {mode === 'sequential' && (
        <Field label="Start seed">
          <input value={startSeed} onChange={(e) => setStartSeed(e.target.value)} disabled={running} />
        </Field>
      )}
      <Field label="Max results">
        <input type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(Math.max(1, +e.target.value || 1))} disabled={running} />
      </Field>
      <StartStop running={running} onStart={start} onStop={() => stop.current?.()} />
      <Stats
        items={[
          ['Checked', checked.toLocaleString('en-US')],
          ['Results', hits.length],
        ]}
      />
      <ResultList
        items={hits.map((h) => ({ id: h.seed, title: h.seed, detail: `Chunk ${h.cx}, ${h.cz}` }))}
        onOpen={(id) => {
          const h = hits.find((x) => x.seed === id)!;
          const c = patternCenter(h.cx, h.cz, pat);
          onOpenSeed(id, c.x, c.z);
          onHighlight({ color: '#6ee65a', boxes: patternBoxes(h.cx, h.cz, pat) });
        }}
        onCopy={onCopy}
      />
    </>
  );
}
