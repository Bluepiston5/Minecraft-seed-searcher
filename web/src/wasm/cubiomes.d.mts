// Emscripten module built from wasm/api.c (see wasm/build.sh).
export interface CubiomesModule {
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  UTF8ToString(ptr: number): string;
  _malloc(n: number): number;
  _free(p: number): void;
  _api_init(mc: number, seed: bigint, large: number): number;
  _api_str2mc(s: number): number;
  _api_feature_num(): number;
  _api_struct_name(stype: number): number;
  _api_biomes(scale: number, x: number, z: number, w: number, h: number, y: number, out: number, ids: number): number;
  _api_biome_at(x: number, y: number, z: number): number;
  _api_biome_name(id: number): number;
  _api_struct_supported(stype: number): number;
  _api_struct_region_size(stype: number): number;
  _api_structures(stype: number, x0: number, z0: number, x1: number, z1: number, out: number, max: number): number;
  _api_spawn(out: number): number;
  _api_strongholds(out: number, max: number): number;
  _api_slime(cx: number, cz: number, w: number, h: number, out: number): number;
  _api_clusters(stype: number, minCount: number, radius: number, rx0: number, rz0: number, rx1: number, rz1: number, out: number, members: number, max: number): number;
  _api_quad_hut_bases(quality: number, hiStart: number, hiCount: number, out: number, max: number): number;
  _api_quad_hut_complete(base: bigint, mc: number, upStart: number, upCount: number, out: number, max: number): number;
  _api_seed_has_cluster(seed: bigint, stype: number, minCount: number, radius: number, regRadius: number, out: number): number;
}
declare const init: () => Promise<CubiomesModule>;
export default init;
