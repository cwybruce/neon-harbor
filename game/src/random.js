// A small seeded random generator (mulberry32): the same seed always deals the same
// city, traffic and shots, so the screenshots are repeatable.

export function createRandom(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with the seeded generator. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A number between lo and hi. */
export function range(random, lo, hi) {
  return lo + random() * (hi - lo);
}
