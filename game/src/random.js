// A tiny seeded random number generator (mulberry32) so a fixed seed always
// builds the same city, the same traffic and the same screenshot scenes.

/** Create a generator from an integer seed. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return {
    /** Next float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + this.next() * (max - min);
    },
    /** One element of an array, uniformly. */
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return this.next() < p;
    },
  };
}
