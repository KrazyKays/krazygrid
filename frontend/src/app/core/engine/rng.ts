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
