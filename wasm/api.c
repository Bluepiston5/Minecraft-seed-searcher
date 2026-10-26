// Thin WebAssembly API over cubiomes, used by the web app's workers.
// Each worker instance owns one generator that is (re)initialised per seed.

#include "cubiomes/generator.h"
#include "cubiomes/finders.h"
#include "cubiomes/quadbase.h"
#include "cubiomes/util.h"

#include <emscripten/emscripten.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define API EMSCRIPTEN_KEEPALIVE

static Generator g;
static int g_ready = 0;
static unsigned char g_colors[256][3];

API int api_init(int mc, uint64_t seed, int largeBiomes)
{
    if (!g_ready)
        initBiomeColors(g_colors);
    setupGenerator(&g, mc, largeBiomes ? LARGE_BIOMES : 0);
    applySeed(&g, DIM_OVERWORLD, seed);
    g_ready = 1;
    return 1;
}

// Enum lookups so the JS side does not hardcode cubiomes' numbering.
API int api_str2mc(const char *s) { return str2mc(s); }
API int api_feature_num(void) { return FEATURE_NUM; }
API const char *api_struct_name(int stype) { return struct2str(stype); }

API void *api_malloc(int n) { return malloc(n); }
API void api_free(void *p) { free(p); }

/* Fills 'out' with w*h RGBA pixels of biomes at the given scale (1,4,16,64,256).
 * x,z are in scaled coordinates; y is a block height. Biome ids go to 'ids'
 * (nullable) for hover lookups. */
API int api_biomes(int scale, int x, int z, int w, int h, int y,
        unsigned char *out, unsigned char *ids)
{
    Range r = { scale, x, z, w, h, scale == 1 ? y : y >> 2, 1 };
    int *cache = allocCache(&g, r);
    if (!cache)
        return 0;
    int err = genBiomes(&g, cache, r);
    if (!err)
    {
        for (int i = 0; i < w * h; i++)
        {
            int id = cache[i] & 0xff;
            out[4*i+0] = g_colors[id][0];
            out[4*i+1] = g_colors[id][1];
            out[4*i+2] = g_colors[id][2];
            out[4*i+3] = 255;
            if (ids)
                ids[i] = (unsigned char) id;
        }
    }
    free(cache);
    return !err;
}

API int api_biome_at(int x, int y, int z)
{
    return getBiomeAt(&g, 1, x, y, z);
}

API const char *api_biome_name(int id)
{
    return biome2str(g.mc, id);
}

API int api_biome_color(int id)
{
    id &= 0xff;
    return (g_colors[id][0] << 16) | (g_colors[id][1] << 8) | g_colors[id][2];
}

API int api_struct_supported(int stype)
{
    StructureConfig sc;
    return getStructureConfig(stype, g.mc, &sc);
}

API int api_struct_region_size(int stype)
{
    StructureConfig sc;
    if (!getStructureConfig(stype, g.mc, &sc))
        return 0;
    return sc.regionSize;
}

// Since 1.18.2 pillager outposts do not generate within 10 chunks of a
// village generation attempt (regardless of biome).
static int outpostNearVillage(int bx, int bz)
{
    StructureConfig vc;
    if (g.mc < MC_1_18 || !getStructureConfig(Village, g.mc, &vc))
        return 0;
    int cx = bx >> 4, cz = bz >> 4;
    int rs = vc.regionSize;
    int rx0 = floordiv(cx - 10, rs), rx1 = floordiv(cx + 10, rs);
    int rz0 = floordiv(cz - 10, rs), rz1 = floordiv(cz + 10, rs);
    for (int rz = rz0; rz <= rz1; rz++)
    {
        for (int rx = rx0; rx <= rx1; rx++)
        {
            Pos p;
            if (!getStructurePos(Village, g.mc, g.seed, rx, rz, &p))
                continue;
            if (abs((p.x >> 4) - cx) <= 10 && abs((p.z >> 4) - cz) <= 10)
                return 1;
        }
    }
    return 0;
}

static int viablePos(int stype, int rx, int rz, Pos *p)
{
    if (!getStructurePos(stype, g.mc, g.seed, rx, rz, p))
        return 0;
    if (!isViableStructurePos(stype, &g, p->x, p->z, 0))
        return 0;
    if (!isViableStructureTerrain(stype, &g, p->x, p->z))
        return 0;
    if (stype == Outpost && outpostNearVillage(p->x, p->z))
        return 0;
    return 1;
}

/* Writes the block positions (x,z pairs) of viable structures whose generation
 * chunk lies within the block area [x0,x1]x[z0,z1]. Returns the count. */
API int api_structures(int stype, int x0, int z0, int x1, int z1, int *out, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(stype, g.mc, &sc))
        return 0;
    int rb = sc.regionSize * 16;
    int n = 0;
    for (int rz = floordiv(z0, rb); rz <= floordiv(z1, rb) && n < max; rz++)
    {
        for (int rx = floordiv(x0, rb); rx <= floordiv(x1, rb) && n < max; rx++)
        {
            Pos p;
            if (!viablePos(stype, rx, rz, &p))
                continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1)
                continue;
            out[2*n+0] = p.x;
            out[2*n+1] = p.z;
            n++;
        }
    }
    return n;
}

API int api_spawn(int *out)
{
    Pos p = getSpawn(&g);
    out[0] = p.x;
    out[1] = p.z;
    return 1;
}

API int api_strongholds(int *out, int max)
{
    StrongholdIter sh;
    initFirstStronghold(&sh, g.mc, g.seed);
    int n = 0;
    while (n < max)
    {
        int more = nextStronghold(&sh, &g);
        out[2*n+0] = sh.pos.x;
        out[2*n+1] = sh.pos.z;
        n++;
        if (more <= 0)
            break;
    }
    return n;
}

/* out[i] = 1 for slime chunks in the w*h chunk area starting at (cx,cz). */
API int api_slime(int cx, int cz, int w, int h, unsigned char *out)
{
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            out[j*w+i] = (unsigned char) isSlimeChunk(g.seed, cx + i, cz + j);
    return 1;
}

//==============================================================================
// Multi-structure clusters (double / triple / quad farms)
//==============================================================================

// Bounding box of a structure relative to its generation chunk origin, plus
// the vertical size of its spawning volume.
static void structBox(int stype, int *bx0, int *bz0, int *bx1, int *bz1, int *ay)
{
    switch (stype)
    {
    case Swamp_Hut:  *bx0 = 0;   *bz0 = 0;   *bx1 = 7;  *bz1 = 9;  *ay = 7;  break;
    case Monument:   *bx0 = -29; *bz0 = -29; *bx1 = 29; *bz1 = 29; *ay = 23; break;
    case Outpost:    *bx0 = 0;   *bz0 = 0;   *bx1 = 15; *bz1 = 15; *ay = 20; break;
    default:         *bx0 = 0;   *bz0 = 0;   *bx1 = 15; *bz1 = 15; *ay = 0;  break;
    }
}

typedef struct { double x, z, r; } Circle;

static int inCircle(Circle c, double x, double z)
{
    double dx = x - c.x, dz = z - c.z;
    return dx*dx + dz*dz <= c.r*c.r + 1e-6;
}

static Circle circle2(double ax, double az, double bx, double bz)
{
    Circle c = { (ax+bx)/2, (az+bz)/2, 0 };
    c.r = sqrt((ax-c.x)*(ax-c.x) + (az-c.z)*(az-c.z));
    return c;
}

static Circle circle3(double ax, double az, double bx, double bz, double cx, double cz)
{
    double d = 2 * (ax*(bz-cz) + bx*(cz-az) + cx*(az-bz));
    Circle c = { 0, 0, -1 };
    if (fabs(d) < 1e-9)
        return c;
    double a2 = ax*ax+az*az, b2 = bx*bx+bz*bz, c2 = cx*cx+cz*cz;
    c.x = (a2*(bz-cz) + b2*(cz-az) + c2*(az-bz)) / d;
    c.z = (a2*(cx-bx) + b2*(ax-cx) + c2*(bx-ax)) / d;
    c.r = sqrt((ax-c.x)*(ax-c.x) + (az-c.z)*(az-c.z));
    return c;
}

// Minimal enclosing circle of up to 16 points, by brute force over the
// candidate circles defined by pairs and triples.
static Circle minCircle(const double *px, const double *pz, int n)
{
    Circle best = { 0, 0, 1e18 };
    for (int i = 0; i < n; i++)
    {
        for (int j = i+1; j < n; j++)
        {
            Circle c = circle2(px[i], pz[i], px[j], pz[j]);
            if (c.r < best.r)
            {
                int ok = 1;
                for (int k = 0; k < n && ok; k++) ok = inCircle(c, px[k], pz[k]);
                if (ok) best = c;
            }
            for (int k = j+1; k < n; k++)
            {
                Circle c3 = circle3(px[i], pz[i], px[j], pz[j], px[k], pz[k]);
                if (c3.r < 0 || c3.r >= best.r)
                    continue;
                int ok = 1;
                for (int l = 0; l < n && ok; l++) ok = inCircle(c3, px[l], pz[l]);
                if (ok) best = c3;
            }
        }
    }
    if (n == 1)
        best = (Circle) { px[0], pz[0], 0 };
    return best;
}

/* Radius of the smallest sphere around a point at the vertical middle of the
 * structures that contains all of their bounding boxes. */
static double clusterRadius(int stype, const Pos *p, int n, double *cx, double *cz)
{
    int bx0, bz0, bx1, bz1, ay;
    structBox(stype, &bx0, &bz0, &bx1, &bz1, &ay);
    double px[16], pz[16];
    int m = 0;
    for (int i = 0; i < n; i++)
    {
        px[m] = p[i].x + bx0;     pz[m++] = p[i].z + bz0;
        px[m] = p[i].x + bx1 + 1; pz[m++] = p[i].z + bz0;
        px[m] = p[i].x + bx0;     pz[m++] = p[i].z + bz1 + 1;
        px[m] = p[i].x + bx1 + 1; pz[m++] = p[i].z + bz1 + 1;
    }
    Circle c = minCircle(px, pz, m);
    *cx = c.x;
    *cz = c.z;
    return sqrt(c.r*c.r + ay*ay/4.0);
}

/* Cheap test before clusterRadius(): the structures' bounding rectangle has
 * to fit into the sphere's diameter. */
static int clusterTooWide(int stype, const Pos *p, int n, int radius)
{
    int bx0, bz0, bx1, bz1, ay;
    structBox(stype, &bx0, &bz0, &bx1, &bz1, &ay);
    int minx = p[0].x, maxx = p[0].x, minz = p[0].z, maxz = p[0].z;
    for (int i = 1; i < n; i++)
    {
        if (p[i].x < minx) minx = p[i].x;
        if (p[i].x > maxx) maxx = p[i].x;
        if (p[i].z < minz) minz = p[i].z;
        if (p[i].z > maxz) maxz = p[i].z;
    }
    double w = maxx - minx + bx1 - bx0 + 1, d = maxz - minz + bz1 - bz0 + 1;
    double maxSpan = 2 * sqrt((double) radius*radius - ay*ay/4.0);
    return w > maxSpan || d > maxSpan;
}

/* Scans every 2x2 window of regions in [rx0,rx1]x[rz0,rz1] for groups of at
 * least 'minCount' viable structures that fit in a sphere of 'radius' blocks.
 * Output per cluster (4 ints): count, afkX, afkZ, radius*10. The members are
 * written into 'members' as 4 (x,z) pairs per cluster (unused pairs are 0).
 * Returns the number of clusters. */
API int api_clusters(int stype, int minCount, int radius,
        int rx0, int rz0, int rx1, int rz1, int *out, int *members, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(stype, g.mc, &sc))
        return 0;
    int w = rx1 - rx0 + 2, h = rz1 - rz0 + 2;
    if (w <= 1 || h <= 1 || w * h > 4096)
        return 0;
    Pos *pos = (Pos *) malloc(sizeof(Pos) * w * h);
    char *ok = (char *) malloc(w * h);
    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            ok[j*w+i] = (char) viablePos(stype, rx0 + i, rz0 + j, &pos[j*w+i]);

    int n = 0;
    for (int j = 0; j < h-1 && n < max; j++)
    {
        for (int i = 0; i < w-1 && n < max; i++)
        {
            Pos cand[4];
            int k = 0;
            int idx[4] = { j*w+i, j*w+i+1, (j+1)*w+i, (j+1)*w+i+1 };
            for (int q = 0; q < 4; q++)
                if (ok[idx[q]]) cand[k++] = pos[idx[q]];
            if (k < minCount || k < 2)
                continue;

            // try the largest subset first
            Pos bestSet[4];
            int bestN = 0;
            double bestR = 1e18, bestX = 0, bestZ = 0;
            for (int mask = 1; mask < (1 << k); mask++)
            {
                int cnt = __builtin_popcount(mask);
                if (cnt < minCount || cnt < 2 || cnt < bestN)
                    continue;
                Pos sub[4];
                int s = 0;
                for (int q = 0; q < k; q++)
                    if (mask & (1 << q)) sub[s++] = cand[q];
                if (clusterTooWide(stype, sub, s, radius))
                    continue;
                double cx, cz;
                double r = clusterRadius(stype, sub, s, &cx, &cz);
                if (r > radius)
                    continue;
                if (cnt > bestN || r < bestR)
                {
                    bestN = cnt; bestR = r; bestX = cx; bestZ = cz;
                    memcpy(bestSet, sub, sizeof(Pos) * s);
                }
            }
            if (!bestN)
                continue;

            // a pair/triple may also be found from a neighbouring window, or
            // be part of a larger cluster: keep only the maximal one
            int dup = 0;
            for (int c = 0; c < n && !dup; c++)
            {
                int contained = 0;
                for (int q = 0; q < bestN; q++)
                    for (int m = 0; m < out[4*c]; m++)
                        if (members[8*c+2*m] == bestSet[q].x && members[8*c+2*m+1] == bestSet[q].z)
                            contained++;
                if (contained == bestN)
                    dup = 1;
                else if (contained == out[4*c])
                    dup = -1 - c; // the earlier cluster is a subset: replace it
            }
            if (dup > 0)
                continue;
            int slot = dup < 0 ? -1 - dup : n;

            out[4*slot+0] = bestN;
            out[4*slot+1] = (int) floor(bestX);
            out[4*slot+2] = (int) floor(bestZ);
            out[4*slot+3] = (int) round(bestR * 10);
            for (int q = 0; q < 4; q++)
            {
                members[8*slot+2*q+0] = q < bestN ? bestSet[q].x : 0;
                members[8*slot+2*q+1] = q < bestN ? bestSet[q].z : 0;
            }
            if (slot == n)
                n++;
        }
    }
    free(pos);
    free(ok);
    return n;
}

//==============================================================================
// Quad witch hut seed search (48-bit quad-bases, then the upper 16 bits)
//==============================================================================

static const uint64_t *hutLowBits(int quality)
{
    switch (quality)
    {
    case 0:  return low20QuadIdeal;
    case 1:  return low20QuadClassic;
    case 2:  return low20QuadHutNormal;
    default: return low20QuadHutBarely;
    }
}

/* Tests the 48-bit seeds (high << 20 | low20 - salt) for high in
 * [hiStart, hiStart+hiCount) and writes quad-hut bases to 'out'. */
API int api_quad_hut_bases(int quality, uint32_t hiStart, uint32_t hiCount,
        uint64_t *out, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(Swamp_Hut, g.mc, &sc))
        return 0;
    const uint64_t *low = hutLowBits(quality);
    int n = 0;
    for (uint64_t hi = hiStart; hi < (uint64_t) hiStart + hiCount && n < max; hi++)
    {
        for (int i = 0; low[i] && n < max; i++)
        {
            uint64_t s48 = (hi << 20) | ((low[i] - sc.salt) & 0xfffff);
            if (isQuadBase(sc, s48, 128))
                out[n++] = s48;
        }
    }
    return n;
}

/* For a quad-base, tries upper 16 bits in [upStart, upStart+upCount) and
 * writes full seeds where all four huts in regions (0,0)-(1,1) are in swamps. */
API int api_quad_hut_complete(uint64_t base, int mc, uint32_t upStart, uint32_t upCount,
        uint64_t *out, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(Swamp_Hut, mc, &sc))
        return 0;
    Pos p[4];
    getStructurePos(Swamp_Hut, mc, base, 0, 0, &p[0]);
    getStructurePos(Swamp_Hut, mc, base, 0, 1, &p[1]);
    getStructurePos(Swamp_Hut, mc, base, 1, 0, &p[2]);
    getStructurePos(Swamp_Hut, mc, base, 1, 1, &p[3]);

    Generator gq;
    setupGenerator(&gq, mc, 0);
    int n = 0;
    for (uint32_t up = upStart; up < upStart + upCount && up < 0x10000 && n < max; up++)
    {
        uint64_t seed = base | ((uint64_t) up << 48);
        applySeed(&gq, DIM_OVERWORLD, seed);
        int q;
        for (q = 0; q < 4; q++)
            if (!isViableStructurePos(Swamp_Hut, &gq, p[q].x, p[q].z, 0))
                break;
        if (q == 4)
            out[n++] = seed;
    }
    return n;
}

/* Generic per-seed test used by the seed search: does the current seed have a
 * cluster of >= minCount structures within 'regRadius' regions of the origin?
 * The generator is only seeded once a geometric candidate is found, which
 * leaves it on an arbitrary seed afterwards.
 * Writes the AFK position to out[0..1]. Positions are checked geometrically
 * before any (expensive) biome check. */
API int api_seed_has_cluster(uint64_t seed, int stype, int minCount, int radius,
        int regRadius, int *out)
{
    StructureConfig sc;
    if (!getStructureConfig(stype, g.mc, &sc))
        return 0;
    int seeded = 0;
    int bx0, bz0, bx1, bz1, ay;
    structBox(stype, &bx0, &bz0, &bx1, &bz1, &ay);
    for (int rz = -regRadius; rz < regRadius; rz++)
    {
        for (int rx = -regRadius; rx < regRadius; rx++)
        {
            Pos p[4];
            int k = 0;
            for (int q = 0; q < 4; q++)
            {
                if (getStructurePos(stype, g.mc, seed, rx + (q & 1), rz + (q >> 1), &p[k]))
                    k++;
            }
            if (k < minCount)
                continue;
            double cx, cz;
            // geometric pre-filter on all candidates of this window
            int found = 0;
            for (int mask = 1; mask < (1 << k) && !found; mask++)
            {
                int cnt = __builtin_popcount(mask);
                if (cnt < minCount)
                    continue;
                Pos sub[4];
                int s = 0;
                for (int q = 0; q < k; q++)
                    if (mask & (1 << q)) sub[s++] = p[q];
                if (clusterTooWide(stype, sub, s, radius))
                    continue;
                if (clusterRadius(stype, sub, s, &cx, &cz) > radius)
                    continue;
                if (!seeded)
                {
                    applySeed(&g, DIM_OVERWORLD, seed);
                    seeded = 1;
                }
                int q;
                for (q = 0; q < s; q++)
                {
                    if (!isViableStructurePos(stype, &g, sub[q].x, sub[q].z, 0)) break;
                    if (!isViableStructureTerrain(stype, &g, sub[q].x, sub[q].z)) break;
                    if (stype == Outpost && outpostNearVillage(sub[q].x, sub[q].z)) break;
                }
                if (q == s)
                {
                    out[0] = (int) floor(cx);
                    out[1] = (int) floor(cz);
                    found = 1;
                }
            }
            if (found)
                return minCount;
        }
    }
    return 0;
}
