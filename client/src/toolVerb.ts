// What an agent's current tool reads like in a status line ("Editing", "Browsing"). Shared by the terminal panel and
// the dashboard.

export function toolVerb(tool: string | null): string {
  if (!tool) return '';
  if (tool.startsWith('mcp__playwright__')) return 'Browsing';
  if (tool === 'Bash' || tool === 'PowerShell') return 'Running';
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') return 'Editing';
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return 'Reading';
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'Researching';
  return tool;
}
