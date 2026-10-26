# Minecraft Seed Searcher

Web-App für Minecraft **Java Edition 1.21.1 – 1.21.4**: Seed-Karte im Stil von chunkbase
plus Finder für Multi-Struktur-Farmen (Quad-Hexenhütten, Doppel-/Dreifach-Monumente usw.).
Alles läuft lokal im Browser – die Weltgenerierung kommt aus [cubiomes](https://github.com/Cubitect/cubiomes)
(MIT), kompiliert nach WebAssembly und verteilt auf Web Worker.

## Funktionen

- **Karte**: Biome (wählbare Höhe), Dörfer, Hexenhütten, Monumente, Außenposten, Anwesen,
  Antike Städte, Prüfungskammern, Tempel, Ruinen, Schätze, Spawn, alle 128 Festungen,
  Schleimchunks, Chunk-/Regionsraster. Klick zeigt Koordinaten, Biom und `/tp`-Befehl.
- **Farm-Finder auf der Karte**: markiert AFK-Punkte, an denen 2, 3 oder 4 Strukturen
  komplett in eine Kugel mit 128 Blöcken Radius passen.
- **Quad-Hütten**: vollständige Suche über alle 48-Bit-Quad-Basen, danach werden die
  oberen 16 Bit auf vier Sumpf-Biome geprüft.
- **Seed-Suche**: Brute-Force über zufällige oder fortlaufende Seeds nach Doppel-/
  Dreifach-/Quad-Strukturen im Umkreis des Ursprungs.

## Entwicklung

```sh
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # statische Seite in web/dist
```

Das fertige WebAssembly-Modul liegt in `web/src/wasm/`. Nach Änderungen an
`wasm/api.c` neu bauen (benötigt ein aktiviertes [Emscripten SDK](https://emscripten.org)):

```sh
git submodule update --init
./wasm/build.sh
```
