import { describe, expect, it } from 'vitest';
import { channel } from './effects';

describe('effect channels', () => {
  it('hand each emit to every listener until it unsubscribes', () => {
    const fx = channel<[n: number, tag: string]>();
    const a: string[] = [];
    const b: string[] = [];
    const offA = fx.on((n, tag) => a.push(`${tag}${n}`));
    fx.on((n, tag) => b.push(`${tag}${n}`));
    fx.emit(1, 'x');
    offA();
    fx.emit(2, 'y');
    expect(a).toEqual(['x1']);
    expect(b).toEqual(['x1', 'y2']);
  });

  it('drop an emit nobody listens for', () => {
    const fx = channel<[n: number]>();
    fx.emit(1);
    const got: number[] = [];
    fx.on((n) => got.push(n));
    expect(got).toEqual([]);
    expect(() => fx.emit(2)).not.toThrow();
    expect(got).toEqual([2]);
  });

  it('give a later listener the latest emit when sticky', () => {
    const fx = channel<[at: number | null]>(true);
    fx.emit(5);
    fx.emit(null);
    fx.emit(7);
    const got: (number | null)[] = [];
    const off = fx.on((at) => got.push(at));
    fx.emit(8);
    off();
    fx.emit(9);
    expect(got).toEqual([7, 8]);
  });

  it('collect the listeners’ answers with ask, none when nobody listens', () => {
    const fx = channel<[n: number], boolean>();
    expect(fx.ask(1)).toEqual([]);
    const off = fx.on((n) => n > 1);
    fx.on(() => false);
    expect(fx.ask(2)).toEqual([true, false]);
    off();
    expect(fx.ask(2)).toEqual([false]);
  });
});
