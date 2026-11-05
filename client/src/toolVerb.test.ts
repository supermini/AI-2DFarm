import { describe, expect, it } from 'vitest';
import { toolVerb } from './toolVerb';

describe('toolVerb', () => {
  it.each([
    [null, ''],
    ['Bash', 'Running'],
    ['Edit', 'Editing'],
    ['Grep', 'Reading'],
    ['WebSearch', 'Researching'],
    ['mcp__playwright__browser_click', 'Browsing'],
    ['Task', 'Task'],
  ])('%s -> %s', (tool, verb) => {
    expect(toolVerb(tool)).toBe(verb);
  });
});
