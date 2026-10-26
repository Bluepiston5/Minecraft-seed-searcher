#!/usr/bin/env bash
# Builds the cubiomes WebAssembly module into web/src/wasm/.
# Requires an activated Emscripten SDK (source emsdk_env.sh).
set -euo pipefail
cd "$(dirname "$0")"
OUT=../web/src/wasm
mkdir -p "$OUT"
emcc -O3 -fwrapv -flto \
  api.c cubiomes/noise.c cubiomes/biomes.c cubiomes/layers.c \
  cubiomes/biomenoise.c cubiomes/generator.c cubiomes/finders.c \
  cubiomes/util.c cubiomes/quadbase.c \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=worker,web,node \
  -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0 \
  -s EXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,UTF8ToString \
  -s EXPORTED_FUNCTIONS=_malloc,_free \
  -o "$OUT/cubiomes.mjs"
echo "built $OUT/cubiomes.mjs"
