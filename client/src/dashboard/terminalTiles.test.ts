import { describe, expect, it } from 'vitest';
import { MAX_TILES, gridShape, narrowTile, selectTiles, tileCandidates, tilesShown, togglePick, type TileAgent } from './terminalTiles';

const ag = (id: string, status: string, repoId = 'r1', role: string | undefined = undefined): TileAgent => ({ id, status, repoId, role });

describe('gridShape', () => {
  it('fits n tiles in 1, 2, 4 or 6 slots', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => gridShape(n).slots)).toEqual([1, 1, 2, 4, 4, 6, 6]);
  });
  it('lays them out in columns', () => {
    expect(gridShape(1)).toEqual({ slots: 1, cols: 1, rows: 1 });
    expect(gridShape(2)).toEqual({ slots: 2, cols: 2, rows: 1 });
    expect(gridShape(3)).toEqual({ slots: 4, cols: 2, rows: 2 });
    expect(gridShape(5)).toEqual({ slots: 6, cols: 3, rows: 2 });
  });
  it('never goes past the cap', () => {
    expect(gridShape(9).slots).toBe(MAX_TILES);
  });
});

describe('tileCandidates', () => {
  const all = [ag('a', 'idle'), ag('b', 'working'), ag('c', 'done'), ag('d', 'preparing', 'r2'), ag('ceo', 'working', 'r1', 'ceo')];
  it('is the floor’s agents, busy ones first, in their order otherwise, without the CEO', () => {
    expect(tileCandidates(all, 'r1')).toEqual(['b', 'c', 'a']);
  });
  it('is everyone on every floor when no floor is picked', () => {
    expect(tileCandidates(all, null)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('keeps their order when busy ones are not first', () => {
    expect(tileCandidates(all, 'r1', false)).toEqual(['a', 'b', 'c']);
  });
  it('puts agents who need help before the idle ones', () => {
    expect(tileCandidates([ag('a', 'idle'), ag('b', 'error')], null)).toEqual(['b', 'a']);
  });
});

describe('selectTiles', () => {
  it('shows the first six candidates when nobody picked', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(selectTiles(ids, null)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(selectTiles(ids, [])).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('keeps the picked ones in the order picked, dropping those who left', () => {
    expect(selectTiles(['a', 'b', 'c'], ['c', 'x', 'a'])).toEqual(['c', 'a']);
  });
  it('falls back to the candidates when every pick is gone', () => {
    expect(selectTiles(['a', 'b'], ['x'])).toEqual(['a', 'b']);
  });
  it('caps picks too, and counts each agent once', () => {
    const ids = 'abcdefgh'.split('');
    expect(selectTiles(ids, ids)).toHaveLength(MAX_TILES);
    expect(selectTiles(ids, ['a', 'a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('togglePick', () => {
  it('adds an agent', () => {
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b']);
  });
  it('removes one already there', () => {
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('refuses a seventh', () => {
    const six = 'abcdef'.split('');
    expect(togglePick(six, 'g')).toBe(six);
  });
});

describe('tilesShown', () => {
  it('is one tile when it is expanded', () => {
    expect(tilesShown(['a', 'b', 'c'], 'b')).toEqual(['b']);
  });
  it('is all of them otherwise, also when the expanded one is gone', () => {
    expect(tilesShown(['a', 'b'], null)).toEqual(['a', 'b']);
    expect(tilesShown(['a', 'b'], 'z')).toEqual(['a', 'b']);
  });
});

describe('narrowTile', () => {
  it('is the active tile while it is still there', () => {
    expect(narrowTile(['a', 'b'], 'b')).toBe('b');
  });
  it('is the first one otherwise', () => {
    expect(narrowTile(['a', 'b'], 'z')).toBe('a');
    expect(narrowTile(['a', 'b'], null)).toBe('a');
    expect(narrowTile([], 'a')).toBeNull();
  });
});
