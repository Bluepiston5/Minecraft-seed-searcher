/// <reference lib="webworker" />
import init, { type CubiomesModule } from '../wasm/cubiomes.mjs';
import type { Job, Request, Response, WorldParams, Cluster } from './protocol';

const ready = init();
let M: CubiomesModule;
let current = '';
const mcCache = new Map<string, number>();
const structCache = new Map<string, number>();

function cstr(s: string): number {
  const bytes = new TextEncoder().encode(s);
  const p = M._malloc(bytes.length + 1);
  M.HEAPU8.set(bytes, p);
  M.HEAPU8[p + bytes.length] = 0;
  return p;
}

function mcId(version: string): number {
  let mc = mcCache.get(version);
  if (mc === undefined) {
    const p = cstr(version);
    mc = M._api_str2mc(p);
    M._free(p);
    if (!mc) throw new Error(`Unbekannte Version ${version}`);
    mcCache.set(version, mc);
  }
  return mc;
}

function structId(key: string): number {
  if (!structCache.size) {
    for (let i = 0; i < M._api_feature_num(); i++) structCache.set(M.UTF8ToString(M._api_struct_name(i)), i);
  }
  const id = structCache.get(key);
  if (id === undefined) throw new Error(`Unbekannte Struktur ${key}`);
  return id;
}

const u64 = (s: string) => BigInt.asUintN(64, BigInt(s));
const i64str = (v: bigint) => BigInt.asIntN(64, v).toString();

function useWorld(w: WorldParams) {
  const key = `${w.version}|${w.seed}|${w.large}`;
  if (key !== current) {
    M._api_init(mcId(w.version), u64(w.seed), w.large ? 1 : 0);
    current = key;
  }
}

// Ensures the generator matches a version without caring about the seed.
function useVersion(version: string) {
  if (!current.startsWith(version + '|')) useWorld({ version, seed: '0', large: false });
}

function withBuf<T>(bytes: number, fn: (p: number) => T): T {
  const p = M._malloc(bytes);
  try {
    return fn(p);
  } finally {
    M._free(p);
  }
}

function readU64(p: number, n: number): bigint[] {
  return Array.from(new BigUint64Array(M.HEAPU8.buffer, p, n));
}

function run(job: Job): { result: unknown; transfer: Transferable[] } {
  switch (job.kind) {
    case 'biomes': {
      useWorld(job.world);
      const n = job.w * job.h;
      return withBuf(n * 5, (p) => {
        if (!M._api_biomes(job.scale, job.x, job.z, job.w, job.h, job.y, p, p + n * 4)) throw new Error('Biomgenerierung fehlgeschlagen');
        const rgba = new Uint8ClampedArray(M.HEAPU8.slice(p, p + n * 4).buffer);
        const ids = M.HEAPU8.slice(p + n * 4, p + n * 5);
        return { result: { rgba, ids }, transfer: [rgba.buffer, ids.buffer] };
      });
    }
    case 'structures': {
      useWorld(job.world);
      const stype = structId(job.key);
      if (!M._api_struct_supported(stype)) return { result: { pos: new Int32Array(0) }, transfer: [] };
      const max = 8192;
      return withBuf(max * 8, (p) => {
        const c = M._api_structures(stype, job.x0, job.z0, job.x1, job.z1, p, max);
        const pos = M.HEAP32.slice(p >> 2, (p >> 2) + 2 * c);
        return { result: { pos }, transfer: [pos.buffer] };
      });
    }
    case 'slime': {
      useWorld(job.world);
      const n = job.w * job.h;
      return withBuf(n, (p) => {
        M._api_slime(job.cx, job.cz, job.w, job.h, p);
        const mask = M.HEAPU8.slice(p, p + n);
        return { result: { mask }, transfer: [mask.buffer] };
      });
    }
    case 'spawn': {
      useWorld(job.world);
      return withBuf(8, (p) => {
        M._api_spawn(p);
        return { result: { x: M.HEAP32[p >> 2], z: M.HEAP32[(p >> 2) + 1] }, transfer: [] };
      });
    }
    case 'strongholds': {
      useWorld(job.world);
      return withBuf(job.count * 8, (p) => {
        const c = M._api_strongholds(p, job.count);
        const pos = M.HEAP32.slice(p >> 2, (p >> 2) + 2 * c);
        return { result: { pos }, transfer: [pos.buffer] };
      });
    }
    case 'biomeAt': {
      useWorld(job.world);
      const id = M._api_biome_at(job.x, job.y, job.z);
      return { result: { id, name: M.UTF8ToString(M._api_biome_name(id)) }, transfer: [] };
    }
    case 'clusters': {
      useWorld(job.world);
      const stype = structId(job.key);
      const max = 512;
      if (!M._api_struct_supported(stype)) return { result: { clusters: [], truncated: false }, transfer: [] };
      // block area -> region windows, capped so a zoomed-out view stays fast
      const rb = M._api_struct_region_size(stype) * 16;
      const cap = 40;
      const cxr = Math.floor((job.x0 + job.x1) / 2 / rb), czr = Math.floor((job.z0 + job.z1) / 2 / rb);
      let rx0 = Math.floor(job.x0 / rb) - 1, rx1 = Math.floor(job.x1 / rb);
      let rz0 = Math.floor(job.z0 / rb) - 1, rz1 = Math.floor(job.z1 / rb);
      const truncated = rx1 - rx0 > cap || rz1 - rz0 > cap;
      if (rx1 - rx0 > cap) [rx0, rx1] = [cxr - cap / 2, cxr + cap / 2];
      if (rz1 - rz0 > cap) [rz0, rz1] = [czr - cap / 2, czr + cap / 2];
      return withBuf(max * 16 + max * 32, (p) => {
        const mem = p + max * 16;
        const c = M._api_clusters(stype, job.minCount, job.radius, rx0, rz0, rx1, rz1, p, mem, max);
        const clusters: Cluster[] = [];
        for (let i = 0; i < c; i++) {
          const o = (p >> 2) + 4 * i, m = (mem >> 2) + 8 * i;
          const count = M.HEAP32[o];
          const members: [number, number][] = [];
          for (let q = 0; q < count; q++) members.push([M.HEAP32[m + 2 * q], M.HEAP32[m + 2 * q + 1]]);
          clusters.push({ count, afkX: M.HEAP32[o + 1], afkZ: M.HEAP32[o + 2], radius: M.HEAP32[o + 3] / 10, members });
        }
        return { result: { clusters, truncated }, transfer: [] };
      });
    }
    case 'quadBases': {
      useVersion(job.version);
      const max = 4096;
      return withBuf(max * 8, (p) => {
        const c = M._api_quad_hut_bases(job.quality, job.hiStart, job.hiCount, p, max);
        return { result: { bases: readU64(p, c).map((b) => b.toString()) }, transfer: [] };
      });
    }
    case 'quadComplete': {
      const max = 4096;
      return withBuf(max * 8, (p) => {
        const c = M._api_quad_hut_complete(BigInt(job.base), mcId(job.version), job.upStart, job.upCount, p, max);
        return { result: { seeds: readU64(p, c).map(i64str) }, transfer: [] };
      });
    }
    case 'seedScan': {
      useVersion(job.version);
      const stype = structId(job.key);
      const hits: { seed: string; x: number; z: number }[] = [];
      if (!M._api_struct_supported(stype)) return { result: { hits }, transfer: [] };
      const regRadius = Math.max(1, Math.ceil(job.areaRadius / (M._api_struct_region_size(stype) * 16)));
      withBuf(8, (p) => {
        for (const s of job.seeds) {
          if (M._api_seed_has_cluster(u64(s), stype, job.minCount, job.radius, regRadius, p))
            hits.push({ seed: s, x: M.HEAP32[p >> 2], z: M.HEAP32[(p >> 2) + 1] });
        }
      });
      // api_seed_has_cluster leaves the generator on an arbitrary seed
      current = '';
      return { result: { hits }, transfer: [] };
    }
  }
}

self.onmessage = async (e: MessageEvent<Request>) => {
  M = await ready;
  const { id, job } = e.data;
  let msg: Response;
  let transfer: Transferable[] = [];
  try {
    const r = run(job);
    msg = { id, ok: true, result: r.result };
    transfer = r.transfer;
  } catch (err) {
    msg = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
};
