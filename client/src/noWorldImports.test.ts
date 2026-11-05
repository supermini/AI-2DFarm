// Guards the 2D dashboard's bundle: nothing outside the 3D office's code may import world/, photo/ or three.js, and
// nothing the phone's pocket mode or the 2D dashboard loads may reach the 3D code. Reads the sources with plain fs (no
// bundler), so it runs in milliseconds and its failures name the file, the import and the chain that led there.
//
// Two checks:
//  1. Direct: every client file outside the 3D set must not import the 3D code (static `import` / `export … from`,
//     side-effect imports and dynamic `import()`). `import type` counts too: it is erased today, but a type-only
//     import is the first step to a value one, and the pure modules should not even name the 3D code's types.
//  2. Transitive: follow imports (static and dynamic: a lazy chunk still ships) from pocket/Pocket.tsx and dashboard/**
//     and fail if any reached file is in the 3D set or imports a 3D library. The only dynamic import allowed to
//     reach the 3D set is one listed in LAZY_3D, on purpose, with its reason.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.dirname(fileURLToPath(import.meta.url));

// ---------- the 3D set ----------

/** Folders that are 3D code throughout (relative to client/src, with a trailing slash). */
const THREE_D_DIRS = ['world/', 'photo/'];

/**
 * 3D-only files (relative to client/src). A test file `X.test.ts(x)` belongs to the set when `X.ts(x)` does.
 * Keep each entry with its reason; a file the 2D side needs does not belong here, it must be split instead.
 */
const THREE_D_FILES: Record<string, string> = {
  'Office.tsx': 'the 3D office: App.tsx lazy-loads it, a phone never does',
  'perf.tsx': 'render pausing and adaptive DPR for the R3F canvas',
  // The 3D HUD and its panels (mounted by Office.tsx).
  'ui/HUD.tsx': 'the 3D view\'s HUD',
  'ui/CameraHud.tsx': 'camera controls of the 3D view',
  'ui/ElevatorPanel.tsx': 'the elevator panel, floors as seen in the 3D building',
  'ui/BlasterHud.tsx': 'the blaster toy\'s HUD',
  'ui/PongHud.tsx': 'the pong toy\'s HUD',
  'ui/RoofHud.tsx': 'the roof\'s HUD',
  'ui/CoinChip.tsx': 'the coin counter over the 3D view',
  'ui/Catalogue.tsx': 'the decor catalogue, placed in the 3D office',
  'ui/HeldHint.tsx': 'the hint for what the player carries',
  'ui/PresenceHud.tsx': 'other visitors\' markers over the 3D view',
  'ui/VisitorsList.tsx': 'the visitors list of the 3D view',
  'ui/Tutorial.tsx': 'the walking tutorial',
  'ui/StartScreen.tsx': 'the 3D office\'s start screen (requests the player\'s look)',
  'ui/ThemeSettings.tsx': 'holiday themes of the 3D scene',
  'ui/OutsideSettings.tsx': 'weather and city outside the 3D windows',
  'ui/ProfileSettings.tsx': 'the visitor profile (look editor, poses in the 3D office)',
  'ui/ControlsSettings.tsx': 'the 3D player\'s key bindings',
  'ui/Overlays.tsx': 'the 3D view\'s overlay layer (camera, sky, graphics, photo mode)',
  // 3D-only since the plan began.
  'ui/LookEditor.tsx': 'the character look editor: draws the 3D figure',
  'ui/CareerCard.tsx': 'the 3D-only half of the career card (the 2D half is TeamStats.tsx)',
  'ui/portrait.ts': 'renders a character portrait with three.js',
  'ui/Phone3D.tsx': 'the in-world phone: the mini-games and the 3D-office extras',
  'ui/HolidayStrip.tsx': 'the holiday theme strip of the 3D office',
  'ui/games/': 'the phone\'s mini-games (draw with world/draw.ts), reached only through Phone3D.tsx',
  'ui/AgentCard.tsx': 'the 3D HUD\'s agent card (reports to world/activityProbe); only HUD.tsx imports it',
  'ui/progressProbe.ts': 'the 3D HUD\'s progress probe over world/decor; only HUD.tsx imports it',
  // The 3D office's sound: spatial mixers and players that read world/ state (layout, doors, sky, weather, gong).
  'ui/sfxSpatial.ts': 'the spatial half of the sound engine (sfx.ts is the core a 2D view may use)',
  'ui/acoustics.ts': 'room acoustics from world/layout',
  'ui/cheerSfx.ts': 'the gong party\'s cheers (world/gong*)',
  'ui/eventSfx.ts': 'sounds of the 3D world\'s sky events',
  'ui/footsteps.ts': 'footsteps on the 3D floor surfaces',
  'ui/music.ts': 'the jukebox player (world/jukeboxSongs)',
  'ui/musicMix.ts': 'the jukebox mixer',
  'ui/outsideMix.ts': 'sound mixing for outside the windows (world/layout, sky)',
  'ui/outsideSfx.ts': 'the city and weather ambience',
  'ui/peopleSoundRules.ts': 'people\'s sounds by body stage (world/body)',
  'ui/peopleSounds.ts': 'people\'s voices and steps in the 3D office',
  'ui/roomSfx.ts': 'per-room ambience',
  'ui/score.ts': 'the office\'s adaptive music (sky, gong)',
  'ui/weatherMix.ts': 'the weather mixer',
  'ui/weatherSfx.ts': 'weather sounds (world/weather)',
  // Tests with no module of the same name: they test several 3D sound modules together.
  'ui/outsideRoof.test.ts': 'tests outsideMix.ts and acoustics.ts together',
};

/**
 * Test files that reach the 3D code on purpose although the module they test is not 3D. They are never bundled.
 * client/src/store.test.ts drives the store's real apply() and checks that its effects.ts channels reach the 3D
 * office's subscribers (world/gongRunner.ts, world/confetti.ts), the one place the two sides are tested together.
 */
const TEST_BRIDGES: Record<string, string> = {
  'store.test.ts': 'checks the merge gong / confetti wiring from store.ts through effects.ts into world/',
};

/**
 * Dynamic `import()` edges from a 2D-reachable file into the 3D set, allowed because they are lazy on purpose
 * ("from -> to", relative to client/src). None today: App.tsx lazy-loads Office.tsx, but App.tsx is the entry that
 * picks the mode and is not reached from pocket/ or dashboard/.
 */
const LAZY_3D: Record<string, string> = {};

/** The walks start here: the phone's pocket mode and the 2D dashboard (every non-test file under dashboard/). */
const ROOT_FILES = ['pocket/Pocket.tsx'];
const ROOT_DIRS = ['dashboard/'];

// ---------- reading the sources ----------

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

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

export interface Import {
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
export function parseImports(source: string): Import[] {
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
export function isThreeLib(spec: string): boolean {
  return /^(three(\/|$)|@react-three\/|@dimforge\/rapier3d|postprocessing$|n8ao$)/.test(spec);
}

/** Resolves a relative specifier to a source file under client/src, or null (a package, a stylesheet, outside). */
function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// ---------- the 3D set, as a predicate ----------

function inList(file: string, list: Record<string, string>): boolean {
  const r = rel(file);
  return Object.keys(list).some((k) => (k.endsWith('/') ? r.startsWith(k) : r === k));
}

/** In the 3D set: a folder, a listed file, or the test of one (`X.test.ts` follows `X.ts`). */
export function inThreeD(file: string): boolean {
  const r = rel(file);
  if (THREE_D_DIRS.some((d) => r.startsWith(d))) return true;
  if (inList(file, THREE_D_FILES)) return true;
  const m = /^(.*)\.test\.(tsx?)$/.exec(r);
  return !!m && ['ts', 'tsx'].some((ext) => inList(path.join(SRC, `${m[1]}.${ext}`), THREE_D_FILES));
}

/** What a file imports from the 3D code itself: a world/ or photo/ file (or folder, resolved or not) or a 3D library. */
function forbiddenFrom(file: string, imp: Import): string | null {
  if (isThreeLib(imp.spec)) return imp.spec;
  if (!imp.spec.startsWith('.')) return null;
  const target = resolve(file, imp.spec);
  const shown = target ? rel(target) : path.posix.normalize(path.posix.join(path.posix.dirname(rel(file)), imp.spec));
  return THREE_D_DIRS.some((d) => shown.startsWith(d)) ? shown : null;
}

// This file's own samples of imports sit in strings.
const allFiles = listSources(SRC).filter((f) => rel(f) !== 'noWorldImports.test.ts');

// ---------- the tests ----------

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

describe('the 3D set', () => {
  it('lists only files and folders that exist', () => {
    const missing = [...Object.keys(THREE_D_FILES), ...Object.keys(TEST_BRIDGES), ...ROOT_FILES, ...ROOT_DIRS].filter((k) => !fs.existsSync(path.join(SRC, k)));
    expect(missing, 'renamed or removed: update the lists in noWorldImports.test.ts').toEqual([]);
  });

  it('puts a 3D module\'s test with it, and the 2D side\'s files outside', () => {
    expect(inThreeD(path.join(SRC, 'ui/musicMix.test.ts'))).toBe(true);
    expect(inThreeD(path.join(SRC, 'world/layout.test.ts'))).toBe(true);
    expect(inThreeD(path.join(SRC, 'store.ts'))).toBe(false);
    expect(inThreeD(path.join(SRC, 'ui/sfx.ts'))).toBe(false);
    expect(inThreeD(path.join(SRC, 'pocket/Pocket.tsx'))).toBe(false);
  });
});

describe('no file outside the 3D set imports the 3D code', () => {
  it('imports world/, photo/, three or @react-three only from the 3D set', () => {
    const offenders: string[] = [];
    for (const file of allFiles) {
      if (inThreeD(file) || inList(file, TEST_BRIDGES)) continue;
      for (const imp of parseImports(fs.readFileSync(file, 'utf8'))) {
        const bad = forbiddenFrom(file, imp);
        if (bad) {
          offenders.push(`${rel(file)}:${imp.line} imports '${imp.spec}'${bad !== imp.spec ? ` (${bad})` : ''}${imp.typeOnly ? ' (type-only)' : ''}${imp.dynamic ? ' (dynamic)' : ''}`);
        }
      }
    }
    expect(
      offenders,
      'These files are outside the 3D set but reach the 3D code. Move the shared part out of world/, or add the file to the 3D set in noWorldImports.test.ts if it is 3D-only:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });
});

describe('nothing the pocket or the dashboard loads reaches the 3D code', () => {
  /** Walks imports from `roots`; returns, per reached file, the file that first reached it. */
  function reach(roots: string[]): Map<string, string | null> {
    const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
    const queue = [...roots];
    while (queue.length) {
      const file = queue.shift()!;
      for (const imp of parseImports(fs.readFileSync(file, 'utf8'))) {
        if (imp.typeOnly) continue; // erased: loads nothing
        const target = resolve(file, imp.spec);
        if (!target || parent.has(target)) continue;
        if (inThreeD(target)) {
          // Reported by the check below; the walk does not go into the 3D code.
          parent.set(target, file);
          continue;
        }
        parent.set(target, file);
        queue.push(target);
      }
    }
    return parent;
  }

  const chain = (parent: Map<string, string | null>, file: string) => {
    const out: string[] = [];
    for (let f: string | null | undefined = file; f; f = parent.get(f)) out.unshift(rel(f));
    return out.join(' -> ');
  };

  const roots = [
    ...ROOT_FILES.map((f) => path.join(SRC, f)),
    ...allFiles.filter((f) => ROOT_DIRS.some((d) => rel(f).startsWith(d)) && !isTest(f)),
  ];

  it('has roots to walk', () => {
    expect(roots.length).toBeGreaterThan(1);
  });

  it('reaches no 3D file and no 3D library from pocket/Pocket.tsx or dashboard/', () => {
    const parent = reach(roots);
    const problems: string[] = [];
    for (const file of parent.keys()) {
      if (inThreeD(file)) {
        const from = parent.get(file)!;
        const lazy = parseImports(fs.readFileSync(from, 'utf8')).some((i) => i.dynamic && resolve(from, i.spec) === file);
        if (lazy && LAZY_3D[`${rel(from)} -> ${rel(file)}`]) continue;
        problems.push(`${chain(parent, file)}  (${rel(file)} is in the 3D set)`);
        continue;
      }
      for (const imp of parseImports(fs.readFileSync(file, 'utf8'))) {
        if (isThreeLib(imp.spec) && !imp.typeOnly) problems.push(`${chain(parent, file)}  (${rel(file)}:${imp.line} imports '${imp.spec}')`);
      }
    }
    expect(problems, 'The pocket / the dashboard would load 3D code:\n  ' + problems.join('\n  ')).toEqual([]);
  });

  it('keeps LAZY_3D to edges that still exist', () => {
    for (const edge of Object.keys(LAZY_3D)) {
      const [from, to] = edge.split(' -> ');
      const file = path.join(SRC, from);
      expect(fs.existsSync(file), `${edge}: ${from} is gone`).toBe(true);
      expect(parseImports(fs.readFileSync(file, 'utf8')).some((i) => i.dynamic && resolve(file, i.spec) === path.join(SRC, to)), `${edge}: no longer a dynamic import`).toBe(true);
    }
  });
});
