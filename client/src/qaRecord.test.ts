import { describe, expect, it } from 'vitest';
import type { QaView } from '../../shared/types';
import { recentQaRecord, rememberQa } from './qaRecord';

const qa = (n: number) => ({ repoId: 'o/r', prNumber: n }) as QaView;

describe('recent QA records', () => {
  it('remembers a record by key', () => {
    rememberQa('o/r#1', qa(1));
    expect(recentQaRecord('o/r#1')).toMatchObject({ prNumber: 1 });
    expect(recentQaRecord('o/r#404')).toBeUndefined();
  });

  it('keeps only the last 30', () => {
    for (let i = 100; i < 131; i++) rememberQa(`o/r#${i}`, qa(i));
    expect(recentQaRecord('o/r#100')).toBeUndefined();
    expect(recentQaRecord('o/r#130')).toBeDefined();
  });
});
