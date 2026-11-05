# Contributing

How to run cubefarm from source, test it and publish it. Agent sessions working on this repo also follow [CLAUDE.md](CLAUDE.md).

This is `supermini/AI-cubefarm`, a fork of [leonvanzyl/cubefarm](https://github.com/leonvanzyl/cubefarm): a 2D dashboard over the same server. Keep `server/` close to upstream (see the README's [This fork](README.md#this-fork)).

## Run it from source

```bash
git clone https://github.com/supermini/AI-cubefarm.git
cd AI-cubefarm
npm install
npm run dev    # or: npm run demo
```

Open http://localhost:5317 (`SWARM_CLIENT_PORT` moves Vite, `SWARM_PORT` the server). The server restarts when code in `server/` or `shared/` changes, and the client reloads itself.

For the built office: `npm run build && npm start`, then http://127.0.0.1:4317. Without a build, the server is API-only: it serves no page, because `server/index.ts` serves `dist/` only when it exists.

All three run `scripts/office.mjs`, the launcher: `--dev` runs the server from source plus Vite, and without it (`npm start`) it runs `bin/cubefarm.js` on the build. It also keeps the checkout up to date: when the office has finished its work and a new commit is on `origin`, or when you type `u` + Enter in its terminal, it stops the office, fast-forwards, installs and builds as needed, and starts it again. See [Updating the office](docs/how-it-works.md#updating-the-office).

## Testing

```bash
npm test             # run every test once (Vitest)
npm run test:watch   # re-run tests as you edit
npm run typecheck
npm run build
npm run test:e2e     # optional browser smoke tests (Playwright): builds, boots a demo office and drives it
```

- Tests sit next to the code they cover as `*.test.ts`, anywhere under `client/`, `server/`, `shared/` or `scripts/` (e.g. `shared/issues.test.ts`). Vitest finds them through `vitest.config.ts`; `tsc` type-checks them and the Vite build leaves them out, since nothing in the app imports them.
- Keep them fast and offline: no network, no GitHub (`gh`), no Claude sessions and no real `~/.cubefarm`. Test pure logic directly, fake anything that would spend usage, and use a temp `SWARM_HOME` and random free ports for anything that needs a server. `npm test` already points `SWARM_HOME` at a temp folder.
- `client/src/noWorldImports.test.ts` fails if a client file imports a 3D library or a folder of the removed 3D office.
- e2e is not part of CI. Before a pull request, `typecheck`, `test` and `build` must pass. Don't run `test:e2e` unless an issue asks for it. If your change shows up in the dashboard, boot your own demo office, check it in a real browser with the Playwright tools, and put screenshots in the pull request. QA then tests every pull request in a real browser in a demo office.
- `npm run test:e2e` is an optional local tool. It runs `e2e/*.spec.ts` headless against a demo office on port 4399 (`E2E_PORT` changes it) with a temp `SWARM_HOME`. It uses your installed Google Chrome when there is one, otherwise (or with `E2E_BROWSER=chromium`) Playwright's Chromium. If that browser is missing it stops at once and says so: run `npx playwright install chromium` once, into the shared cache (leave `PLAYWRIGHT_BROWSERS_PATH` unset). Just built? `E2E_SKIP_BUILD=1` reuses `dist/` instead of building again. Wait on what the page shows rather than sleeping.
- One e2e spec file per feature (`e2e/voice.spec.ts`, `e2e/console.spec.ts`, …), sharing `e2e/helpers.ts` (the `test` that fails on console errors and failed requests, and `openDashboard`). New e2e tests go in their feature's spec file or a new one, never appended to `smoke.spec.ts`, which keeps only the core boot and runs first (`playwright.config.ts`).
- GitHub Actions (`.github/workflows/ci.yml`, upstream's) runs `npm ci`, `npm run typecheck`, `npm test` and `npm run build` for every pull request and every push to `main`, then packs the npm package, installs it into an empty folder and boots it in demo mode (`scripts/smoke-package.mjs`). That `check` job always runs on Ubuntu, and on Windows and macOS for every push to `main`, every manual run and every pull request that touches something OS-sensitive (`server/`, `shared/`, `scripts/`, `bin/`, `.github/`, `package.json`, the lockfile or the root configs); a pull request that only changes `client/`, `e2e/` or docs shows `check (windows-latest)` and `check (macos-latest)` as skipped, which counts as passing. CI runs no browser tests. It needs no secrets. This fork has no CI of its own: run `npm run typecheck`, `npm test` and `npm run build` locally before you open a pull request.

### The agents' browser tool

Agents test in a browser through the Playwright MCP server, a pinned dependency (`@playwright/mcp` at an exact version in `package.json`) started as `node <its cli.js>` from the installed package (`server/browser.ts`), so a session never runs npx or touches the npm registry. It drives the installed Google Chrome. To bump it:

```bash
npm install --save-exact @playwright/mcp@<version>
node node_modules/@playwright/mcp/cli.js --help   # the flags in server/browser.ts still exist
npm test && npm run build && node scripts/smoke-package.mjs
```

Read its release notes first: a release that moves to a new Playwright may change which Chrome versions it supports.

## Architecture

```
client/  Vite + React + zustand (no 3D libraries)
  src/dashboard/  the 2D dashboard: the role screens (CEO, developer board and terminals, reviewer, metrics, settings),
                  the hash routes (route.ts), the right drawer
  src/pocket/     the dashboard's shared parts from pocket mode: the pipeline strip, the board, approvals, the team
  src/ui/         the panels: the Settings sections, terminal, Kanban, CEO chat, PR app viewer, time-lapse
bin/cubefarm.js  the `cubefarm` command: checks the machine, starts the server, opens the browser
scripts/office.mjs  the launcher for a checkout (npm run dev / demo / start): runs the office and updates it
server/  Node + Express + ws
  swarm.ts        orchestrator: floors, agents, scheduling, persistence, websocket fan-out
  agentRunner.ts  the older Agent SDK runtime (Settings → How agents run): Claude Code through the SDK, as a log
  cliRunner.ts    the default: one agent as the real CLI (Claude Code, Codex, OpenCode) in a pseudo-terminal: hooks, turn endings, the CEO's tools over MCP
  ptyHost.ts      the terminal keeper: its own process holding the CLIs' terminals and hooks through office restarts
  ptyClient.ts    the office's side of the keeper (ptyProtocol.ts: their messages)
  clis.ts         the CLIs agents can run (Claude Code, Codex, OpenCode): finding them, their command lines
  terminal.ts     each agent's terminal: a headless xterm mirror, its viewers, keystrokes to the running CLI
  github.ts       everything GitHub, via the gh CLI
  workspace.ts    clones + per-agent git worktrees
  previews.ts     one preview per floor, and the PR theatre's PR previews: ports, statuses, start / stop
  previewRunner.ts  checkout, install and run a floor's app in its preview worktree
  demo.ts         fake GitHub and fake agents for `npm run demo`
shared/types.ts   the websocket / REST contract
```

The server streams everything to the browser over one websocket (`/ws`); an open terminal has its own (`/ws/term?agent=<id>`). The dashboard's screens are React components over the store (`client/src/store.ts`), and each terminal is an xterm.js view of its agent's output. `CLAUDE.md` has the full code map.

## Publishing

This fork doesn't publish. `.github/workflows/release.yml` is upstream's and stays as it is: don't run it, and don't push a `v*` tag from this fork.

The npm package holds `bin/cubefarm.js` (the command), `dist/` (the built client) and `dist-server/` (the server, bundled into plain JavaScript by `scripts/build-server.mjs`, because Node won't run TypeScript from inside `node_modules`). The client's libraries are bundled into `dist/`, so users only install the server's dependencies.

Upstream releases are published by GitHub Actions (`.github/workflows/release.yml`), not from a laptop. Once `main` has what you want to ship and its CI is green: on GitHub, open **Actions → Release → Run workflow**, pick `patch`, `minor` or `major` and run it. The workflow bumps `package.json`, runs the tests, the build and the package smoke test, pushes a `Release x.y.z` commit and its `vx.y.z` tag to `main`, publishes to npm and creates a GitHub release whose notes list the PRs merged since the last one.

It publishes with [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm trusts that workflow file in this repo, so there is no npm token to store or renew, and every version gets a provenance statement. If anything fails before the push, nothing was released: fix it and run the workflow again (the same goes for a PR merged while it ran). If the publish itself fails after the push, that version number is used up on GitHub only, and the next run releases the one after it.

`npm pack --dry-run` lists exactly what would be published, and `node scripts/smoke-package.mjs` (after `npm run build`) installs the package into an empty folder and boots it in demo mode, like CI does.
