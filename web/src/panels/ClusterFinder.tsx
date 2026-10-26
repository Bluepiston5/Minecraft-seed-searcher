import { useEffect, useMemo, useRef, useState } from 'react';
import { getPool } from '../worker/pool';
import type { WorldParams } from '../worker/protocol';
import type { MultiCluster } from '../lib/cluster';
import { STRUCTURES, STRUCTURE_BY_KEY } from '../lib/structures';
import type { Highlight } from '../map/MapView';
import { Field, Seg, SuggestionCard, ResultList } from './common';

interface Props {
  world: WorldParams;
  onHighlight: (h: Highlight | null) => void;
  onFocus: (x: number, z: number, zoom?: number) => void;
  onCopy: (t: string) => void;
  onStructures: (keys: string[]) => void;
}

const FARM_TYPES = ['swamp_hut', 'monument', 'pillager_outpost', 'village', 'desert_pyramid', 'jungle_pyramid', 'igloo', 'trial_chambers', 'ancient_city', 'shipwreck', 'ocean_ruin'];
const START_AREA = 2048;
const MAX_AREA = 32768;
const DESPAWN = 128;

const clusterId = (c: MultiCluster) => c.members.map((m) => `${m.key}:${m.x}:${m.z}`).join('|');

function describe(c: MultiCluster) {
  const counts = new Map<string, number>();
  for (const m of c.members) counts.set(m.key, (counts.get(m.key) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n}× ${STRUCTURE_BY_KEY[k]?.label ?? k}`).join(' + ');
}

/** Suggests groups of structures in the current seed that share one despawn
 * sphere, nearest to 0,0 first. Rejecting a suggestion moves on to the next
 * one; the search area grows when nothing is left. */
export default function ClusterFinder({ world, onHighlight, onFocus, onCopy, onStructures }: Props) {
  const [keys, setKeys] = useState<string[]>(['swamp_hut']);
  const [minCount, setMinCount] = useState(2);
  const [radius, setRadius] = useState(DESPAWN);
  const [requireAll, setRequireAll] = useState(false);
  const [sort, setSort] = useState<'origin' | 'compact'>('origin');
  const [area, setArea] = useState(START_AREA);
  const [found, setFound] = useState<MultiCluster[] | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  // any change of the query starts over near the origin
  const query = `${world.seed}|${world.version}|${world.large}|${keys.join(',')}|${minCount}|${radius}|${requireAll}`;
  useEffect(() => {
    setArea(START_AREA);
    setFound(null);
    setRejected(new Set());
  }, [query]);

  useEffect(() => {
    if (!keys.length) {
      setFound([]);
      return;
    }
    const id = ++run.current;
    setBusy(true);
    setError(null);
    getPool()
      .run({ kind: 'multiClusters', world, keys, minCount, radius, requireAll, area }, { priority: 4 })
      .then((r) => {
        if (id === run.current) setFound(r.clusters);
      })
      .catch((e) => id === run.current && setError(String(e.message ?? e)))
      .finally(() => id === run.current && setBusy(false));
  }, [query, area]);

  const open = useMemo(() => {
    if (!found) return [];
    const list = found.filter((c) => !rejected.has(clusterId(c)));
    return list.sort((a, b) =>
      sort === 'origin' ? a.dist - b.dist || a.radius - b.radius : b.members.length - a.members.length || a.radius - b.radius || a.dist - b.dist,
    );
  }, [found, rejected, sort]);

  // grow the area once every suggestion inside it has been rejected
  useEffect(() => {
    if (found && !busy && !open.length && area < MAX_AREA && keys.length) setArea((a) => Math.min(MAX_AREA, a * 2));
  }, [found, busy, open.length]);

  const current = open[0];

  useEffect(() => {
    if (!current) {
      onHighlight(null);
      return;
    }
    onHighlight({
      color: '#f2c94c',
      rings: [{ x: current.x, z: current.z, r: DESPAWN, label: `${current.members.length}×` }],
      boxes: current.members.map((m) => ({ x: m.x, z: m.z, size: 16 })),
    });
    onFocus(current.x, current.z, 0);
  }, [current && clusterId(current)]);

  useEffect(() => () => onHighlight(null), []);

  const toggle = (k: string) => setKeys((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  useEffect(() => onStructures(keys), [keys.join(',')]);

  const tp = current && `/tp @s ${current.x} ~ ${current.z}`;

  return (
    <div className="panel-body">
      <p className="lead">
        Finds structures in this seed that share one despawn sphere ({DESPAWN} blocks), nearest to 0, 0 first. Reject a suggestion to get the
        next one.
      </p>

      <h3>Structures</h3>
      <ul className="chips">
        {FARM_TYPES.map((k) => (
          <li key={k}>
            <button className={keys.includes(k) ? 'chip on' : 'chip'} onClick={() => toggle(k)} aria-pressed={keys.includes(k)}>
              {STRUCTURES.find((s) => s.key === k)?.label}
            </button>
          </li>
        ))}
      </ul>
      {keys.length > 1 && (
        <label className="check">
          <input type="checkbox" checked={requireAll} onChange={(e) => setRequireAll(e.target.checked)} />
          <span>Every selected type must be part of the group</span>
        </label>
      )}

      <Seg
        label="Minimum structures"
        value={minCount}
        onChange={setMinCount}
        options={[
          [2, 'Double'],
          [3, 'Triple'],
          [4, 'Quad'],
        ]}
      />
      <Field label="Sphere radius">
        <input type="number" min={24} max={256} value={radius} onChange={(e) => setRadius(Math.max(24, +e.target.value || DESPAWN))} />
      </Field>
      <Seg
        label="Order"
        value={sort}
        onChange={setSort}
        options={[
          ['origin', 'Nearest to 0, 0'],
          ['compact', 'Most structures'],
        ]}
      />

      {current ? (
        <SuggestionCard
          index={rejected.size + 1}
          total={open.length - 1}
          busy={busy}
          title={describe(current)}
          rows={[
            ['AFK spot', `${current.x} / ${current.z}`],
            ['Distance from 0, 0', `${Math.round(current.dist)} blocks`],
            ['Sphere needed', `${current.radius.toFixed(1)} blocks`],
          ]}
          onShow={() => onFocus(current.x, current.z, 0)}
          onCopy={() => onCopy(tp!)}
          onReject={() => setRejected((r) => new Set(r).add(clusterId(current)))}
        />
      ) : (
        <p className="hint">
          {busy
            ? `Searching within ±${area} blocks…`
            : !keys.length
              ? 'Select at least one structure type.'
              : area >= MAX_AREA
                ? `Nothing (else) found within ±${MAX_AREA} blocks.`
                : 'Searching…'}
        </p>
      )}
      {error && <p className="hint warn">{error}</p>}
      {busy && current && <p className="hint">Searching further out (±{area} blocks)…</p>}

      {open.length > 1 && (
        <>
          <h3>Other candidates</h3>
          <ResultList
            items={open.slice(1, 11).map((c) => ({
              id: clusterId(c),
              title: `${c.members.length}× · ${c.x} / ${c.z}`,
              detail: `${describe(c)} · ${Math.round(c.dist)} from 0, 0`,
            }))}
            onOpen={(id) => {
              // move the chosen candidate to the front by rejecting the ones before it
              const idx = open.findIndex((c) => clusterId(c) === id);
              setRejected((r) => {
                const n = new Set(r);
                open.slice(0, idx).forEach((c) => n.add(clusterId(c)));
                return n;
              });
            }}
            onCopy={(id) => {
              const c = open.find((x) => clusterId(x) === id)!;
              onCopy(`/tp @s ${c.x} ~ ${c.z}`);
            }}
            copyLabel="Copy /tp command"
          />
        </>
      )}
      {rejected.size > 0 && (
        <button className="btn ghost wide" onClick={() => setRejected(new Set())}>
          Restore {rejected.size} rejected
        </button>
      )}
    </div>
  );
}
