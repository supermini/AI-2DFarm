import { describe, expect, it } from 'vitest';
import { shownAgents } from './visible';

describe('shownAgents', () => {
  it('is everyone any component shows, once each', () => {
    expect(shownAgents({ shown: {} })).toEqual([]);
    expect(shownAgents({ shown: { a: ['x', 'y'], b: ['y', 'z'], c: [] } })).toEqual(['x', 'y', 'z']);
  });
});
