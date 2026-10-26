// Geometry for multi-structure farms: which structures fit together into one
// despawn sphere (the area around an AFK spot where mobs keep spawning).

export interface Placed {
  key: string;
  x: number;
  z: number;
}

export interface MultiCluster {
  members: Placed[];
  /** AFK spot (centre of the smallest enclosing sphere) */
  x: number;
  z: number;
  /** sphere radius needed to contain all members, in blocks */
  radius: number;
  /** distance of the AFK spot from 0,0 */
  dist: number;
}

/** Bounding box relative to the structure's generation chunk origin, plus the
 * height of its mob spawning volume. Matches structBox() in wasm/api.c. */
export function structBox(key: string): { x0: number; z0: number; x1: number; z1: number; ay: number } {
  switch (key) {
    case 'swamp_hut':
      return { x0: 0, z0: 0, x1: 8, z1: 10, ay: 7 };
    case 'monument':
      return { x0: -29, z0: -29, x1: 30, z1: 30, ay: 23 };
    case 'pillager_outpost':
      return { x0: 0, z0: 0, x1: 16, z1: 16, ay: 20 };
    default:
      return { x0: 0, z0: 0, x1: 16, z1: 16, ay: 0 };
  }
}

interface Circle {
  x: number;
  z: number;
  r: number;
}

const inside = (c: Circle, x: number, z: number) => (x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r + 1e-6;

function circle2(ax: number, az: number, bx: number, bz: number): Circle {
  const x = (ax + bx) / 2, z = (az + bz) / 2;
  return { x, z, r: Math.hypot(ax - x, az - z) };
}

function circle3(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): Circle | null {
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + az * az, b2 = bx * bx + bz * bz, c2 = cx * cx + cz * cz;
  const x = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d;
  const z = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x, z, r: Math.hypot(ax - x, az - z) };
}

/** Smallest circle containing all points (Welzl, iterative form). */
export function minCircle(px: number[], pz: number[]): Circle {
  const n = px.length;
  let c: Circle = { x: px[0], z: pz[0], r: 0 };
  for (let i = 1; i < n; i++) {
    if (inside(c, px[i], pz[i])) continue;
    c = { x: px[i], z: pz[i], r: 0 };
    for (let j = 0; j < i; j++) {
      if (inside(c, px[j], pz[j])) continue;
      c = circle2(px[i], pz[i], px[j], pz[j]);
      for (let k = 0; k < j; k++) {
        if (inside(c, px[k], pz[k])) continue;
        c = circle3(px[i], pz[i], px[j], pz[j], px[k], pz[k]) ?? c;
      }
    }
  }
  return c;
}

/** Sphere around the structures' bounding boxes, with the vertical size of the
 * tallest spawning volume taken into account. */
export function enclose(members: Placed[]): Circle {
  const px: number[] = [], pz: number[] = [];
  let ay = 0;
  for (const m of members) {
    const b = structBox(m.key);
    ay = Math.max(ay, b.ay);
    px.push(m.x + b.x0, m.x + b.x1, m.x + b.x0, m.x + b.x1);
    pz.push(m.z + b.z0, m.z + b.z0, m.z + b.z1, m.z + b.z1);
  }
  const c = minCircle(px, pz);
  return { x: c.x, z: c.z, r: Math.sqrt(c.r * c.r + (ay * ay) / 4) };
}

function center(p: Placed) {
  const b = structBox(p.key);
  return { x: p.x + (b.x0 + b.x1) / 2, z: p.z + (b.z0 + b.z1) / 2 };
}

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

export interface ClusterQuery {
  minCount: number;
  radius: number;
  /** every listed type must appear at least once in a cluster */
  requireKeys?: string[];
  maxCount?: number;
}

/** Finds the largest groups that fit into a sphere of 'radius'. A group that is
 * contained in a larger one is dropped. */
export function findClusters(items: Placed[], q: ClusterQuery): MultiCluster[] {
  const maxCount = q.maxCount ?? 6;
  const centers = items.map(center);
  const order = items.map((_, i) => i).sort((a, b) => centers[a].x - centers[b].x);
  const reach = 2 * q.radius + 64;
  const found: MultiCluster[] = [];

  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    // neighbours that come later in x order, so each group is built from its
    // westernmost member only
    const nb: number[] = [];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      if (centers[j].x - centers[i].x > reach) break;
      if (Math.abs(centers[j].z - centers[i].z) <= reach) nb.push(j);
    }
    if (nb.length + 1 < q.minCount) continue;

    let best: MultiCluster | null = null;
    for (let k = Math.min(maxCount, nb.length + 1); k >= q.minCount && !best; k--) {
      for (const rest of combinations(nb, k - 1)) {
        const members = [items[i], ...rest.map((j) => items[j])];
        if (q.requireKeys?.length && !q.requireKeys.every((key) => members.some((m) => m.key === key))) continue;
        const c = enclose(members);
        if (c.r > q.radius) continue;
        if (!best || c.r < best.radius) {
          best = { members, x: Math.floor(c.x), z: Math.floor(c.z), radius: c.r, dist: Math.hypot(c.x, c.z) };
        }
      }
    }
    if (best) found.push(best);
  }

  const id = (p: Placed) => `${p.key}:${p.x}:${p.z}`;
  const sets = found.map((c) => new Set(c.members.map(id)));
  return found.filter((c, a) =>
    !found.some((o, b) => b !== a && o.members.length > c.members.length && c.members.every((m) => sets[b].has(id(m)))),
  );
}
