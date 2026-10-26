import { describe, expect, it } from 'vitest';
import { nextUint32 } from './rng';

describe('nextUint32 (mulberry32)', () => {
  it('reproduit le vecteur de référence partagé avec le backend', () => {
    let state = 42;
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = nextUint32(state);
      values.push(result.value);
      state = result.state;
    }
    expect(values).toEqual([2581720956, 1925393290, 3661312704, 2876485805, 750819978]);
  });
});
