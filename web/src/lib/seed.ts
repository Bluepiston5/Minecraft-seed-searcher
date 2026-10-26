// Minecraft Java seeds are signed 64-bit integers. Non-numeric input is
// hashed with Java's String.hashCode(), exactly like the game does.

export function javaStringHash(s: string): bigint {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return BigInt(h);
}

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

/** Parses user input into a signed 64-bit seed, or null for empty input. */
export function parseSeed(input: string): bigint | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[+-]?\d+$/.test(s)) {
    const n = BigInt(s);
    if (n >= INT64_MIN && n <= INT64_MAX) return n;
  }
  return javaStringHash(s);
}

export function randomSeed(): bigint {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return BigInt.asIntN(64, a[0]);
}

export const toUnsigned = (s: bigint) => BigInt.asUintN(64, s);
export const toSigned = (s: bigint) => BigInt.asIntN(64, s);
