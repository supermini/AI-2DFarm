// Guards the 2D dashboard's bundle: the 3D office is gone, and no client file may bring it back. Reads the sources with
// plain fs (no bundler), so it runs in milliseconds and a failure names the file and the import. Every kind of import
// counts: static, `export … from`, side-effect, dynamic and `import type`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.dirname(fileURLToPath(import.meta.url));

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listSources(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

interface Import {
  spec: string;
  /** `import type …` / `export type … from`. */
  typeOnly: boolean;
  dynamic: boolean;
  line: number;
}

/** Blanks comments (keeping line breaks) so an example in a comment is not an import. Strings are left alone. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Every module specifier a source file imports: static (`import`, `export … from`, side-effect) and dynamic. */
function parseImports(source: string): Import[] {
  const src = stripComments(source);
  const lineOf = (index: number) => src.slice(0, index).split('\n').length;
  const out: Import[] = [];
  // import|export [type] <names / * as x / { … }> from 'x'
  const named = /\b(?:import|export)\s+(type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\*\s+as\s+[\w$]+|\{[^}]*\}))?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(named)) out.push({ spec: m[2], typeOnly: !!m[1], dynamic: false, line: lineOf(m.index) });
  // import 'x'
  for (const m of src.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/g)) {
    out.push({ spec: m[1], typeOnly: false, dynamic: false, line: lineOf(m.index) });
  }
  // import('x'), also `typeof import('x')` and `await import('x')`
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push({ spec: m[1], typeOnly: false, dynamic: true, line: lineOf(m.index) });
  }
  return out;
}

/** The 3D libraries (three.js and what only the 3D scene uses). */
function isThreeLib(spec: string): boolean {
  return /^(three(\/|$)|@react-three\/|@dimforge\/rapier3d|postprocessing$|n8ao$)/.test(spec);
}

/** What a file imports from the 3D office: a 3D library, or a path into world/ or photo/. */
function forbidden(file: string, imp: Import): string | null {
  if (isThreeLib(imp.spec)) return imp.spec;
  if (!imp.spec.startsWith('.')) return null;
  const target = rel(path.resolve(path.dirname(file), imp.spec));
  return /^(world|photo)(\/|$)/.test(target) ? target : null;
}

// This file's own samples of imports sit in strings.
const allFiles = listSources(SRC).filter((f) => rel(f) !== 'noWorldImports.test.ts');

describe('the import parser', () => {
  it('finds static, type, side-effect, re-export and dynamic imports, and ignores comments', () => {
    const imports = parseImports(
      [
        "import a from './a';",
        "import { b, type C } from '../world/b';",
        "import type { D } from './d';",
        "import * as e from 'three';",
        "import './f.css';",
        'import {',
        '  g,',
        "} from '@react-three/fiber';",
        "export { h } from './h';",
        "export * from './i';",
        "export type { J } from './j';",
        "const k = lazy(() => import('./k'));",
        "// import x from './commented';",
        "/* import y from './blocked'; */",
        "export const n = 1; // from 'nope'",
      ].join('\n'),
    );
    expect(imports.map((i) => [i.spec, i.typeOnly, i.dynamic])).toEqual([
      ['./a', false, false],
      ['../world/b', false, false],
      ['./d', true, false],
      ['three', false, false],
      ['@react-three/fiber', false, false],
      ['./h', false, false],
      ['./i', false, false],
      ['./j', true, false],
      ['./f.css', false, false],
      ['./k', false, true],
    ]);
    expect(parseImports("import {\n a,\n} from 'x';")[0].line).toBe(1);
  });

  it('knows the 3D libraries', () => {
    for (const s of ['three', 'three/examples/jsm/loaders/GLTFLoader.js', '@react-three/drei', '@react-three/rapier', '@dimforge/rapier3d-compat']) {
      expect(isThreeLib(s), s).toBe(true);
    }
    for (const s of ['react', 'zustand', './three', '../../shared/types', 'threejs-helper']) expect(isThreeLib(s), s).toBe(false);
  });
});

describe('no client file imports the 3D office', () => {
  it('finds sources to check', () => {
    expect(allFiles.length).toBeGreaterThan(50);
  });

  it('imports no three, @react-three, world/ or photo/', () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      for (const imp of parseImports(fs.readFileSync(file, 'utf8'))) {
        const bad = forbidden(file, imp);
        if (bad) offenders.push(`${rel(file)}:${imp.line} imports '${imp.spec}'${imp.typeOnly ? ' (type-only)' : ''}${imp.dynamic ? ' (dynamic)' : ''}`);
      }
    }
    expect(offenders, 'The 3D office was removed; these files bring it back:\n  ' + offenders.join('\n  ')).toEqual([]);
  });

  it('has no world/ or photo/ folder', () => {
    for (const d of ['world', 'photo']) expect(fs.existsSync(path.join(SRC, d)), d).toBe(false);
  });
});
