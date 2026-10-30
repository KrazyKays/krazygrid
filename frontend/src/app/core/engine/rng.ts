/**
 * Générateur déterministe mulberry32.
 */
export function nextUint32(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0;
  const value = (t ^ (t >>> 14)) >>> 0;
  return { value, state: next };
}

/** Mélange deux entiers en une graine uint32 (dérivation des graines d'étage). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Enveloppe mutable autour de mulberry32, pratique pour la génération procédurale. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const roll = nextUint32(this.state);
    this.state = roll.state;
    return roll.value;
  }

  /** Entier dans [0, max). */
  int(max: number): number {
    return this.next() % max;
  }

  chance(probability: number): boolean {
    return this.next() / 0x100000000 < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
