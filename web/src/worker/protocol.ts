// Messages between the UI thread and the cubiomes workers. Seeds travel as
// decimal strings of the signed 64-bit value.

import type { MultiCluster } from '../lib/cluster';

export interface WorldParams {
  version: string;
  seed: string;
  large: boolean;
}

export type Job =
  | { kind: 'biomes'; world: WorldParams; scale: number; x: number; z: number; w: number; h: number; y: number }
  | { kind: 'structures'; world: WorldParams; key: string; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'slime'; world: WorldParams; cx: number; cz: number; w: number; h: number }
  | { kind: 'spawn'; world: WorldParams }
  | { kind: 'strongholds'; world: WorldParams; count: number }
  | { kind: 'biomeAt'; world: WorldParams; x: number; z: number; y: number }
  | { kind: 'clusters'; world: WorldParams; key: string; minCount: number; radius: number; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'quadBases'; version: string; quality: number; hiStart: number; hiCount: number }
  | { kind: 'quadComplete'; version: string; base: string; upStart: number; upCount: number }
  | { kind: 'multiClusters'; world: WorldParams; keys: string[]; minCount: number; radius: number; requireAll: boolean; area: number }
  | { kind: 'slimePattern'; seed: string; pattern: number[]; pw: number; ph: number; cx: number; cz: number; w: number; h: number; max: number }
  | { kind: 'slimeSeedScan'; seeds: string[]; pattern: number[]; pw: number; ph: number; area: number }
  | { kind: 'seedScan'; version: string; key: string; minCount: number; radius: number; areaRadius: number; seeds: string[] };

export interface Cluster {
  count: number;
  afkX: number;
  afkZ: number;
  radius: number;
  members: [number, number][];
}

export interface JobResults {
  biomes: { rgba: Uint8ClampedArray; ids: Uint8Array };
  structures: { pos: Int32Array };
  slime: { mask: Uint8Array };
  spawn: { x: number; z: number };
  strongholds: { pos: Int32Array };
  biomeAt: { id: number; name: string };
  clusters: { clusters: Cluster[]; truncated: boolean };
  quadBases: { bases: string[] };
  quadComplete: { seeds: string[] };
  multiClusters: { clusters: MultiCluster[] };
  slimePattern: { matches: Int32Array };
  slimeSeedScan: { hits: { seed: string; cx: number; cz: number }[] };
  seedScan: { hits: { seed: string; x: number; z: number }[] };
}

export type Result<J extends Job = Job> = JobResults[J['kind']];

export interface Request {
  id: number;
  job: Job;
}

export type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
