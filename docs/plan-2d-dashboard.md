# Plan: a 2D dashboard fork of cubefarm

Status: **done**. The decisions are recorded in §7. Written against `supermini/AI-cubefarm` at `157efde` (cubefarm 0.3.20, MIT,
upstream `leonvanzyl/cubefarm`). Every file reference below was checked against that commit.

## 1. Overview

Keep everything cubefarm's orchestrator does (floors, agents running real coding-agent CLIs, auto-assign, the
build → QA → fix → merge loop, the CEO and its office tools, team changes, previews, PR theatre, mission control,
notifications, cloud agents, the time-lapse journal) and replace the 3D office with a 2D web dashboard organized
around three roles: **CEO** (planning, triage, chat, team changes and approvals), **Developer** (agents, live
terminals, Kanban, work in progress) and **Reviewer/QA** (pull requests, QA reports and screenshots, the app/PR
theatre, the merge gate). The dashboard reuses the existing client data layer (`store.ts`, `api.ts`, `net.ts`) and
grows `client/src/pocket/` from a phone app into the desktop dashboard.

**Non-goals:** any change to server behavior or the REST/WebSocket contract; the 3D world, its physics, camera,
characters and "office life" (toys, dog, weather, holidays, visitors, ping-pong, coffee, fridge, decor and coins,
photo mode); a new UI framework; a redesign of how the swarm works.

## 2. Target architecture

```
                       ┌──────────────────────── server/ (unchanged) ─────────────────────────┐
                       │ swarm.ts · ceo.ts · cliRunner.ts/agentRunner.ts · ptyHost.ts · github │
                       │ mergeGate.ts · qa*.ts · previews.ts/prTheatre.ts · metrics.ts · …     │
                       │      REST /api/*      WS /ws (snapshot + ServerEvent)   WS /ws/term   │
                       └───────────▲──────────────────────▲─────────────────────────▲─────────┘
                                   │ shared/types.ts (contract, unchanged)          │
┌──────────────────────────────── client/src ───────────────────────────────────────┼─────────┐
│  api.ts (commands)    net.ts (socket + watch)    store.ts (zustand, apply(ev))     │         │
│        ▲                       ▲                        ▲                          │         │
│        └────────────┬──────────┴────────────────────────┘                          │         │
│              dashboard/  (grown from pocket/)                                      │         │
│   Shell: role nav (CEO · Developer · Reviewer · Metrics · Settings), floor picker  │         │
│   ├─ CEO       → Phone Chat, CeoTab, IssueForm, Approvals, Interview (as dialogs)  │         │
│   ├─ Developer → KanbanBoard (drag-to-assign), Team, TerminalView/LiveTerminal ────┘         │
│   ├─ Reviewer  → PR queue, QA report + shots, AppViewer (main | PR | compare)                │
│   ├─ Metrics   → MissionConsole OpsTab, TimeLapse                                            │
│   └─ Settings  → ManagerConsole Settings/Floors/Team tabs, Notify, Cloud, Voice, A11y         │
│  ui/   HTML components kept (Kanban, Terminal, AppViewer, Phone chat, Manager tabs…)         │
│  world/, photo/, 3D-only ui/ (HUD, sounds, toys HUDs)  ──► deleted (or behind a flag first)  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `server/` stays as is. It keeps sending game-only state (`weather`, `progress`, `pong`, presence `pose`/`emote`/
  `ping`/`visitors`, `reward`): the dashboard ignores it. This costs a little bandwidth and needs no server change.
- `shared/` stays as is. No new field turned out to be needed (see §7).
- The client already splits cleanly. `App.tsx` lazy-loads `Office.tsx` (3D) or `pocket/Pocket.tsx`. Most "big"
  panels are already plain HTML in `client/src/ui/`: `KanbanView`, `TerminalView` + `LiveTerminal` (xterm on
  `/ws/term`), `AppViewer` (PR theatre), `ManagerConsole` (Floors, Mission control, CEO, Team, Issues, Settings,
  Time-lapse, Accessibility), `MissionConsole`, `Phone` (CEO chat, hires), `Interview`, `CardView`.
- **The real coupling is the other way round.** Non-3D files import from `world/`. Those imports must be cut
  before `world/` can go:

| Importer | Imports from `world/` | Fix |
| --- | --- | --- |
| `store.ts` | `confetti` (`emitMerge`, `mergeBursts`, `recentQaRecord`, `rememberQa`), `presence/presenceState`, `gongRunner`, `layout.ROOF`, `decor/rewards`, `fridge` type | Move the pure bits the store needs (`rememberQa`/`recentQaRecord`) to `client/src/qaRecord.ts`. Make the effect hooks (merge confetti, gong, rewards, presence) a small registry that `world/` subscribes to, so the store doesn't import them. Drop `ROOF` and `SnackId` use. |
| `replay.ts` | `gongState.setGongVolume`, `sky/useDayTime.setReplayTime` | The same hook registry (the replay emits "replay time" / "muted"; the 3D side listens). |
| `pocket/PocketTeam.tsx`, `ui/TerminalView.tsx` | `draw.toolVerb` (pure) | Move `toolVerb` to `client/src/toolVerb.ts` (re-export from `draw.ts` while 3D exists). |
| `ui/TerminalView.tsx` | `camera/rig.followAgent` | Pass it in as an optional prop (`onFollow`); the dashboard doesn't pass it. |
| `ui/CardView.tsx` | `whiteboard` (`bodyExcerpt`, `cardLabel`, `canPeel`, `locateCard`), `stickies.Col` | Move the pure card helpers to `client/src/cards.ts`. `locateCard` depends on board geometry: replace it with a column lookup on `KanbanColumns`. |
| `ui/AgentSettings.tsx`, `ui/portrait.ts` | `appearance`, `LookPreview` (3D) | The look editor goes. The 2D avatar keeps the agent's colour and initial, as pocket already does. |
| `ui/AgentCard.tsx`, `ui/captions.ts`, `ui/SetupWizard.tsx`, `ui/StartScreen.tsx`, `ui/Catalogue.tsx`, `ui/ProfileSettings.tsx`, `ui/progressProbe.ts`, `ui/Overlays.tsx` (graphics, day mode) | assorted | `SetupWizard` is needed (first-run): drop its `requestLook` call. The rest are 3D-only and get deleted together with `world/`. |
| `perf.tsx` | R3F, `gfx/` | 3D-only, deleted. |

## 3. Feature → surface mapping

"2D today" = what pocket mode (`client/src/pocket/`) or an HTML panel that pocket can open already provides.

| Capability | Logic lives in | 2D today? | Plan |
| --- | --- | --- | --- |
| First-run setup (company, manager, CEO) | `server/index.ts` `/api/setup`, `ui/SetupWizard.tsx` | no (shown only from 3D `StartScreen`) | reuse `SetupWizard` in the shell, drop the 3D look step |
| Connect / create / disconnect a floor (repo or local folder) | `swarm.ts`, `workspace.ts`, `github.ts`; `ui/ProjectPicker.tsx`, `ManagerConsole` Floors tab | no (pocket says "connect from the 3D office") | reuse `FloorsTab` + `ProjectPicker` under Settings → Floors |
| CEO planning a floor (`planFloor`), onboarding (`onboardFloor`) | `ceo.ts` (`ceoJobPrompt`), `swarm.ts` CEO job queue | partial (only from the 3D console) | CEO panel: "Plan floor" / "Onboard" buttons + job queue |
| CEO issue filing & triage | `ceo.ts` tools, `triage.ts`, `shared/issues.ts` | partial (Kanban "file issue") | CEO panel: `IssueForm` + triage list (`qa.ceoLooking`) |
| CEO chat / phone, read-aloud replay | `swarm.ts` messages, `voice.ts`; `ui/Phone.tsx` `Chat` | yes (pocket Chat tab) | reuse `Chat`; drop the phone's games tab |
| CEO's own model, effort, prompt, review | `ManagerConsole` `CeoTab`, `/api/ceo/review` | no | reuse `CeoTab` in the CEO panel |
| Team changes & approvals (hire / let go requests, lobby interview) | `swarm.ts` `scale_team`, `proposals`; `PocketApprovals.tsx`, `ui/Interview.tsx` | yes | reuse `Approvals`; open `Interview` as a dialog instead of in the 3D lobby |
| Hire / fire / configure an agent (CLI, model, effort, host local/cloud) | `swarm.ts`, `clis.ts`, `shared/models.ts`; `ui/AgentSettings.tsx` `AgentSetup` | partial (pocket: approvals only; 3D: Team tab + desk) | reuse `ManagerConsole` `TeamTab` + `AgentSetup`, no look editor |
| "What they're told" (agent prompt preview) | `prompts.ts`, `/api/agents/:id/prompt`; `AgentSettings` `PromptPreview` | no | reuse `PromptPreview` in the agent drawer |
| Pipeline per floor (building / QA / fixing / ready / needs you) | `store.ts` `kanbanFor`; `pocketData.pipelineOf` | yes (Company tab) | reuse in the Developer overview and the Metrics header |
| Kanban backlog → merged, assign, send to QA, merge, close | `store.ts` `kanbanFor`, `api.assign`/`sendToQa`/`mergePull`/`closeIssue`; `ui/KanbanView.tsx` | yes (stacked columns, no drag) | new `KanbanBoard`: side-by-side columns with drag-to-assign (§4.3), reusing `KanbanView`'s actions |
| Issue dependencies (`Depends on #N`, wait for deps) | `shared/issues.ts` (`blockers`, `waitsMessage`), `server/deps.ts`, `api.assign(…, waitForDeps)` | partial (card note) | show blockers on cards; "assign anyway / wait" choice as today |
| Card detail (issue body, PR, QA status) | `ui/CardView.tsx`, `world/whiteboard.ts` helpers | no (3D whiteboard only) | reuse `CardView` as a side drawer after moving the helpers (§2) |
| Live per-agent terminal (watch, type, Esc to interrupt, resize) | `terminal.ts`, `ptyHost.ts`, `/ws/term`; `ui/LiveTerminal.tsx`, `TerminalView.tsx` | yes (from Team) | reuse; add a multi-terminal grid (§4.4) |
| Agent message, stop, clear desk, sign-in (cloud) | `/api/agents/:id/*`; `pocketData.agentActions` | yes | reuse |
| Workers list (latest line of each agent) | `outbox.ts` `latest` events, `ui/WorkersPanel.tsx` | no (3D HUD) | reuse in the Developer panel (sets `watch.workers`) |
| Office doctor (stuck agents, one-click fixes) | `watchdog.ts`; `MissionConsole` | no | reuse inside Metrics → alarms |
| QA: browser testing via Playwright MCP | `qaPrompt.ts`, `agentRunner.ts`/`cliRunner.ts`, `browser.ts` | n/a (server) | nothing to build; its result shows in the Reviewer panel |
| QA review reports, checks, screenshots | `qaOutcome.ts`, `qaShots.ts`, `QaView.checks/shots/summary/commentUrl`; `qaCard.ts`, `AppViewer` QA panel | partial (`qaCardNote` line) | Reviewer panel: report + checks + screenshot strip (§4.5) |
| PR fix loop (send back, retry QA) | `sendBack.ts`, `fixOutcome.ts`, `qaRetry.ts`, `api.sendBack`/`sendToQa` | yes (Approvals for stuck PRs) | reuse; also on every PR row |
| Auto-merge / merge gate / GitHub checks | `mergeGate.ts`, `QaView.mergeNote`, `RepoView` auto-merge setting, `ops.ciPass` | partial | Reviewer: merge-gate column with `mergeNote`, "Merge" / "Merge anyway"; floor setting in Settings |
| PR ownership, orphan QA | `prOwnership.ts`, `qaOrphans.ts` | n/a | shows through `QaView` / doctor findings |
| Running the app: floor preview (main) | `previews.ts`, `previewRunner.ts`, `previewGateway.ts`; `AppViewer` | yes (pocket opens `AppViewer`) | reuse |
| PR theatre: PR previews, main vs PR side by side, synced scroll | `prTheatre.ts`, `syncProxy.ts`, `api.startPrPreview`/`previewSync`; `AppViewer` + `channels.ts`, `theatre.ts` | partial (in `AppViewer`; the "big screen" is 3D) | reuse `AppViewer` full-width in the Reviewer panel |
| Mission control: per-floor pipeline, merges today/hour + sparkline, lead time, QA wait, QA pass, CI pass, cost, usage meter, alarms | `metrics.ts`, `ledger.ts`, `issueAges.ts`, `pacing.ts`; `OpsView`; `ui/MissionConsole.tsx`, `ops.ts` | no (3D console + `world/MissionControl.tsx`) | reuse `OpsTab` as the Metrics panel |
| Usage pacing / pause banners, resume full speed | `pacing.ts`, `UsageView`; pocket `Banners` | yes | reuse in the shell header |
| Office self-update (now / later) | `officeUpdate.ts` (server + client) | partial (banner) | reuse `ManagerConsole` settings bits |
| Notifications (desktop, Web Push, ntfy / chat webhooks) | `notifier.ts`, `notify.ts`, `webPush.ts`; `ui/NotifySettings.tsx`, `pwa.ts` | yes | reuse; notification links (`?tab=`) map to the new routes |
| Cloud agents (Upstash Box) | `cloud.ts`, `box*.ts`; `ui/CloudSettings.tsx` | no | reuse `CloudSettings` in Settings |
| Voice (ElevenLabs read-aloud, mic dictation) | `voice.ts`, `elevenlabs.ts`; `ui/VoiceSettings.tsx`, `MicButton`, `voice*.ts` | partial (replay in chat) | keep: settings + mic in chat/terminal. Drop 3D spatial audio |
| Time-lapse (journal replay) | `journal.ts`, `shared/journal.ts`; `replay.ts`, `ui/TimeLapse.tsx` | no | keep: Metrics → Time-lapse replays the dashboard itself (open question 6) |
| Activity ticker | `ticker.ts`, `shared/activity.ts` | no (3D signs) | small "recent activity" feed in the shell |
| Accessibility settings | `ui/a11y*.ts`, `AccessibilitySettings.tsx` | yes | reuse (drop 3D-only options: motion comfort for the camera) |
| Photo mode, clips, instant replay | `client/src/photo/` | no | **drop** (game content) |
| Presence (other viewers' avatars, emotes, pings) | `server/presence.ts`, `world/presence/` | no | **drop** (server keeps sending it; ignored) |
| Coins, decor, catalogue, achievements, careers card | `progress` in snapshot, `ui/Catalogue.tsx`, `CareerCard.tsx`, `shared/careers.ts` | no | **drop** (game content). `TeamStats` from `CareerCard` may be kept as plain numbers (open question 5) |
| Office life: toys, dog/roomba, ping-pong, coffee, fridge, gong, confetti, weather, outside city, holiday themes, visitors, day/night, music, babble, footsteps | `world/**`, `ui/*Sfx*`, `music.ts`, `shared/pong.ts`, `outside.ts`, `themes.ts`, `server/weather.ts`, `demoVisitors.ts` | no | **drop** (game content) |
| Phone mini-games (tetris, snake, pet) | `ui/games/` | n/a | **drop** |
| Elevator, floor travel, player movement, gamepad, camera views | `world/` | n/a | **drop**; replaced by the floor picker |

## 4. 2D panel designs

All panels use the existing `useStore` selectors and `api.*` commands, the `Panel` component (`ui/Panel.tsx`), the
`pk-*` classes and `styles.css` tokens. Routing is a hash route (`#/ceo`, `#/dev/:floor`, `#/review/:floor/:pr?`,
`#/metrics`, `#/settings/:tab`), kept in a tiny pure `route.ts` (tested) so notification links and reloads land on the
same screen. No router library.

### 4.1 Shell (`dashboard/Shell.tsx`)

- **Layout (desktop ≥ 1024 px):** left rail with role tabs (🧠 CEO, 🔨 Developer, 🔍 Reviewer, 🛰️ Metrics, ⚙️
  Settings), each with a badge. Top bar: floor picker (all floors / one floor, colour + floor number), the connection,
  usage and update banners (pocket `Banners`), and a recent-activity chip. Main area: the role's panel. Right drawer:
  the context item (card, agent, PR), closable with Esc (`dialogFocus.ts`).
- **Narrow (< 760 px):** the rail becomes pocket's bottom tab bar. This keeps the phone use case working.
- **Badges:** CEO = `approvalsBadge(waitingOnYou(…))` + unread messages (`unreadMessages`); Developer = agents in
  `error`; Reviewer = PRs `needsYou` + ready to merge; Metrics = `ops.alarms.length + doctor.length`.
- **Watch:** today `currentWatch` derives the watch from `floor` + `overlay` + `workersOpen`. The dashboard needs
  several terminals' lines at once: `Watch.agents` is already an array, so add a pure `dashboardWatch(state)` (tested)
  that lists every agent whose terminal tile is visible, and have `net.ts` use it in dashboard mode. No server change.

### 4.2 CEO panel

Content (two columns):
- **Left:** the CEO card (status, current job, queue: `ceo.job`, `ceo.queue`), "Plan floor…" (mission text →
  `api.planFloor`), "Onboard floor" (`api.onboardFloor`), "Review the company now" (`api.ceoReview`), then **Chat**
  (`Phone`'s `Chat`, with `MicButton` and read-aloud).
- **Right:** **Approvals** (`PocketApprovals`'s `Approvals`: hires to set up and approve with `AgentSetup` overrides,
  let-go notes, stuck PRs), **Triage** (PRs with `qa.ceoLooking`), **File an issue** (`IssueForm` from `KanbanView`,
  with a floor select and optional "assign to"), and the CEO's settings (`CeoTab`: model, effort, prompt).
- Data: `ceo`, `messages`, `phoneReadAt`, `requests`, `qa`, `repos`. Commands: `messageCeo`, `phoneRead`,
  `approveRequest`, `rejectRequest`, `createIssue`, `planFloor`, `onboardFloor`, `ceoReview`, `updateSettings`.

### 4.3 Developer panel: Kanban with drag-to-assign + team

- **Top:** the floor's pipeline strip (`pipelineOf`) and the team row: one chip per agent (colour avatar, status pill
  `StatusPill`, `toolVerb(currentTool)`, issue/PR on hand). The chips are **drop targets**.
- **Board:** five side-by-side columns from `kanbanFor(repo, team, qa)`: Backlog · In progress · QA · Ready ·
  Merged. Cards show `#n`, title, tone, agent, blockers (`shared/issues.ts`), `qaCardNote`.
- **Drag-to-assign:** dragging a backlog card onto an agent chip calls `api.assign(agentId, n)`. If the card has
  open blockers, it asks first ("wait for #12, or start now?") and passes `waitForDeps`. Dragging a PR card from
  QA/Ready onto an agent calls `api.sendToQa(repo, pr, agentId)`. Dropping on a busy agent is a plain notice, not a
  confirmation: the office refuses with a 409 and `dropAction` returns `busy`. Native HTML5 drag and drop plus
  pointer events for touch, with **keyboard and click alternatives**
  (select a card → "Assign to…" menu using `assignChoices`), so it stays accessible and testable. The pure decision
  `dropAction(card, column, agent) → {kind:'assign'|'qa'|'busy'|'blocked'|'none', …}` lives in
  `dashboard/dnd.ts` and is unit-tested first.
- **Card click** opens `CardView` in the drawer (body excerpt, PR link, QA, actions: close, send to QA, merge).
- **Workers list** (`WorkersPanel`) collapsible on the right, with each agent's latest line.

### 4.4 Per-agent terminal viewer

- **Agent drawer** (click a chip): `TerminalView` as is (status, message box, Stop, Clear desk, assign, sign-in,
  `AgentSetup`, `PromptPreview`), minus "Follow with camera".
- **Terminal grid** (`#/dev/:floor/terminals`): a 1/2/4/6-tile grid of `LiveTerminal`s, one per selected agent,
  each with a header (name, status, Stop, ⤢ expand). Click into a tile to type; Esc interrupts, as in the CLI (the
  tile shows a hint). Tiles not on screen unmount, so their `/ws/term` socket closes. Cap at 6 tiles, so the
  browser keeps up and `scale.test.ts`'s server budgets aren't stressed.
- Data: `/ws/term` per agent (`LiveTerminal`), `agents[id]`, `logs` for the watched agents.

### 4.5 Reviewer / QA panel with PR theatre

- **PR queue (left, ~35 %):** every open PR on the selected floor(s), grouped by stage: Testing · Failed / fixing ·
  Needs you · Passed (waiting on merge gate) · Merged today. A row shows PR #, title, author agent, QA agent, round,
  status pill, `mergeNote` ("waiting for checks: Vercel"), CI badge.
- **Detail (right):** tabs **Report** (QA `summary` as Markdown, `checks` list, link to `commentUrl`), **Screenshots**
  (`shots` strip from `/api/repos/:repo/pulls/:n/qa-shots/:i`, click to enlarge with caption/page), **App**
  (`AppViewer` with the PR channel: main | PR | compare side by side with synced scroll, start/stop PR preview,
  log tail), **Actions** (Retry QA → `sendToQa`, Send back with note → `sendBack`, Merge / Merge anyway →
  `mergePull`, Close → `closePull`).
- Data: `qa`, `prPreviews`, `repos[].pulls`, `settings`. `qaKey`, `channels.ts`, `theatre.ts` are reused as is.
- Pure grouping `reviewQueue(repos, qa) → groups` in `dashboard/review.ts`, unit-tested first.

### 4.6 Metrics panel

- Reuse `MissionConsole`'s `OpsTab` as is: total + per-floor numbers (ready, building, in QA, fixing, to merge, needs
  you, triage), merges today/hour + 24 h sparkline, lead time, QA wait, QA pass, CI pass/duration, team busy/idle/
  errors, cost today (incl. CEO), the usage meter, alarms and doctor findings with one-click fixes.
- Second tab: **Time-lapse** (`TimeLapseTab` + `ReplayBar`), replaying through `store.apply(ev,'play'|'seek')`, so
  the dashboard itself plays back. Writes are already blocked while replaying (`api.ts`).

### 4.7 Settings

`ManagerConsole` tabs reused as sections: Floors & repos (with `ProjectPicker`, preview settings), Team (`TeamTab`),
Issues, Settings (session limit, default model, scaling, auto-merge), Notifications, Cloud agents, Voice,
Accessibility, office update. Dropped sections: Theme, Outside/Weather, Profile (presence), Controls (keys/gamepad),
graphics.

## 5. Phased work plan

Every phase ends with `npm run typecheck`, `npm test` and `npm run build` green, plus a check in a **demo office**
(per CLAUDE.md: `SWARM_HOME="$PWD/.swarm-home" SWARM_PORT=<reserved port> node --import tsx server/index.ts --demo`,
never port 4317/5317, never real mode). New UI logic is written test-first as pure helpers (`*.test.ts` next to the
code), the way the repo already does (`pocketData.test.ts`, `store.test.ts`).

### Phase 0: Decouple the client from `world/` (no visible change)

Phase 0 gained two issues found while decoupling: #22 (`ui/Phone.tsx` without `world/` imports: the holiday strip
and games stay in 3D) and #26 (`TerminalView`/`TeamStats` without `world/`: the career card stays in 3D).

- Move `toolVerb` → `client/src/toolVerb.ts`; card helpers → `client/src/cards.ts`; `rememberQa`/`recentQaRecord`
  → `client/src/qaRecord.ts`. Keep re-exports in `world/` so the 3D side is untouched.
- Add `client/src/effects.ts`: a tiny listener registry (`onMerge`, `onReward`, `onPresence`, `onReplayTime`,
  `onReplayMute`). `store.ts` and `replay.ts` emit; `world/` subscribes in `Game.tsx`. Remove all `world/` imports
  from `store.ts`, `replay.ts`, `pocket/`, `TerminalView` (`onFollow` prop), `CardView`, `SetupWizard`.
- Split `ui/sfx.ts` into a 2D core (cues, prefs, volume) and the 3D spatial part (`acoustics.ts`, `sfxMix`
  distances). Make `voicePlayback.ts`'s music ducking an optional hook, so voice and mic keep working with no
  `world/` import (§7 decision 8).
- Add a lint-style test `client/src/noWorldImports.test.ts` that reads the source files outside `world/`, `photo/`,
  `Office.tsx` and the 3D-only `ui/` list, and fails on any import of `world/`, `photo/`, `three` or `@react-three`.
- **Accept:** the 3D office and pocket mode behave exactly as before; the guard test passes.
- **Verify:** existing tests (`store.test.ts`, the moved helpers' tests move with them); demo office in both modes;
  `vite build` output: the pocket chunk contains no three.js (check `dist/assets` chunk names/sizes).

### Phase 1: Dashboard shell + role routing (on top of pocket)

- `client/src/dashboard/` (renamed/grown from `pocket/`; `mode.ts` gains `'dashboard'`): `Shell.tsx`, `route.ts`
  (+ test), `badges.ts` (+ test), `dashboardWatch` in `watch.ts` (+ test). Existing Company/Chat/Kanban/Team/
  Approvals content is mounted under the new roles unchanged. `SetupWizard` reachable from the shell.
- `?pocket=1` keeps working (alias to the dashboard).
- **Accept:** a fresh demo office opens on the dashboard on desktop; every role tab renders; deep links
  (`#/review/1/42`) survive reload; notification `?tab=` links still land on the right place.
- **Verify:** unit tests for `route`, `badges`, `dashboardWatch`; manual check in the demo at 1440 px and 390 px.

### Phase 2: CEO panel

- Compose §4.2 from `Chat`, `Approvals`, `CeoTab`, `IssueForm`, `Interview` (as a dialog), plan/onboard buttons.
- **Accept:** in the demo, message the CEO and get a reply; approve and reject a hire (`api.demoPropose` makes one);
  file an issue that appears in the backlog; start "Plan floor".
- **Verify:** pure helper tests (triage list, approvals ordering if new); manual demo run.

### Phase 3: Developer panel: Kanban with drag-to-assign, terminal grid

- `dnd.ts` (`dropAction`) test-first; `KanbanBoard.tsx`; agent chips as drop targets; keyboard "Assign to…" path;
  agent drawer (`TerminalView`); terminal grid; `WorkersPanel`.
- **Accept:** drag a backlog card to an idle agent → they start (demo fake session draws in their terminal); drag
  a blocked card → the dependency question; drag to a busy agent → a plain notice (the office refuses with a 409);
  keyboard-only assign works; type in a terminal tile, Esc interrupts; 4 tiles stream at once.
- **Verify:** `dnd.test.ts` (every column × agent state); manual demo; optionally a new `e2e/dashboard-kanban.spec.ts`
  (only if you ask for e2e: CI doesn't run it).

### Phase 4: Reviewer/QA panel with PR theatre

- `review.ts` (`reviewQueue`) test-first; queue + detail tabs; `AppViewer` embedded; QA shots viewer.
- **Accept:** in the demo, a PR moves Testing → Passed → merged in the queue live; screenshots show; main vs PR
  compare opens with synced scroll; Send back / Retry QA / Merge anyway work.
- **Verify:** `review.test.ts`; manual demo with the demo's fake previews.

### Phase 5: Metrics + Settings + time-lapse

- Mount `OpsTab`, `TimeLapseTab`/`ReplayBar`, and the kept `ManagerConsole` sections (§4.7) in the shell.
- **Accept:** every number on Mission control matches the 3D console in the same demo; doctor fixes work; time-lapse
  plays the sample day (`api.journalSample`) in the dashboard; connect a folder floor from Settings.
- **Verify:** manual side-by-side with the 3D console (still present at this point).

### Phase 6: Remove the 3D office

- **6a** (§7 decision 1): `App.tsx` imports `Office.tsx` only when `VITE_OFFICE_3D=1`, so the default build has
  no three.js. Keep this for one phase, to compare against.
- **6b**: delete `client/src/world/`, `client/src/photo/`, `Office.tsx`, `perf.tsx`,
  `hitches*`, `dprControl*`, the 3D-only `ui/` files (HUD, CameraHud, ElevatorPanel, BlasterHud, PongHud, RoofHud,
  CoinChip, Catalogue, HeldHint, PresenceHud, VisitorsList/Row, Tutorial, StartScreen, ThemeSettings,
  OutsideSettings, ProfileSettings, ControlsSettings, games/, sound/music/babble/footstep/weather/outside mixers and
  their tests), and the 3D e2e specs (camera, coffee, dog, faces, movement, outside, people, photo, pong, presence,
  sounds, toys, typing).
- Remove devDependencies: `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`,
  `@react-three/rapier`, `@dimforge/rapier3d-compat`, `n8ao`, `postprocessing`. Keep xterm, react-markdown, zustand.
- Update `scripts/bench.mjs` (it measures FPS/draw calls) to a dashboard benchmark or drop it; update `e2e/smoke`,
  `console`, `phone`, `help`, `mic`, `voice` specs to the dashboard; update `README.md`, `CLAUDE.md` code map,
  `docs/pocket.md`, `package.json` description/keywords. Keep `LICENSE` (MIT, Leon van Zyl) and add the fork's
  copyright line, not a replacement.
- **Accept:** `npm ls three` empty; `dist/` has no three.js chunk; `npm test`, `typecheck`, `build`,
  `node scripts/smoke-package.mjs` pass; demo office fully usable from the dashboard.
- **Verify:** the guard test from Phase 0 becomes "no file imports three at all"; bundle size before/after noted in
  the PR.

## 6. 3D-only interactions to re-express in 2D

| 3D interaction today | 2D equivalent |
| --- | --- |
| Peel a backlog sticky off the whiteboard (G) and carry it to an agent's desk to assign it (`CardView` `peel`, `StickyNotes.tsx`, `CardLift.tsx`) | Drag the card onto an agent chip, or "Assign to…" on the card (§4.3); dropping on a busy agent is a plain notice (the office refuses with a 409) |
| Carry a PR sticky to an agent to have them test it ("ghost" card) | Drag a QA/Ready PR card onto an agent chip → `sendToQa(…, agentId)` |
| Walk to a desk and open it to reach an agent's terminal | Click the agent chip / Team row → agent drawer; terminal grid for several |
| Follow an agent with the camera | Dropped; the agent drawer pins their status and terminal |
| Read a card on the whiteboard up close | Card drawer (`CardView`) from any Kanban card |
| PR theatre on the big screen / app monitor (`world/AppMonitor.tsx`) | Reviewer → App tab (`AppViewer` main / PR / compare) |
| Mission control wall (`world/MissionControl.tsx`) and the manager's console desk | Metrics panel (`OpsTab`) |
| Ride the elevator to change floor | Floor picker in the top bar |
| New agent waiting in the lobby → interview face to face (`Candidates.tsx`, `Interview`) | Approvals card → Interview dialog |
| CEO's let-go note left on a desk | Approvals card (already in pocket) |
| Pick up the CEO's phone on the desk | CEO panel chat, unread badge on the rail |
| Hiring at the lobby kiosk / desk (`hiring.ts`) | Settings → Team → Hire (or CEO panel) with `AgentSetup` |
| Gong / confetti on merge | A toast + the "merged today" counter ticking; optional chime (one sound kept, open question 5) |
| Activity signs over desks (`activitySign.ts`) | Status pill + `toolVerb` on agent chips |
| Time-lapse screen in the office (`TimeLapseScreen.tsx`) | Metrics → Time-lapse |

## 7. Risks & open questions

### Risks

- **`store.ts` coupling (highest risk).** The store imports confetti, gong, rewards and presence modules from
  `world/`. Phase 0's event registry must keep the 3D side behaving identically while both exist. Mitigation:
  store tests unchanged, plus a demo check in 3D mode before Phase 1 starts.
- **Watch semantics.** The server sends terminal lines only for watched agents (`shared/watch.ts`,
  `server/outbox.ts`). A wrong `dashboardWatch` gives empty terminals or floods the socket. Mitigation: pure,
  tested; cap the grid at 6.
- **The server keeps sending game state** (presence, weather, progress, pong). It's harmless, but `store.apply` has
  to keep accepting those events (no-ops) once their 3D consumers are gone, or replaying old journals breaks.
- **Merge conflicts with upstream.** This fork deletes ~62k LOC and edits `store.ts`/`App.tsx`, which upstream
  changes often. Pulling upstream fixes into `server/` stays easy (untouched); client merges will be manual.
- **e2e coverage drops.** Most e2e specs are 3D. Until dashboard specs exist, the UI is checked by unit tests of the
  pure helpers + manual demo runs.
- **`ManagerConsole` is large (847 lines) and imports both kept and dropped settings.** Splitting it into exported
  sections is mechanical but touches a hot file.
- **No `shared/` changes are planned.** If one turns out to be needed (for example a PR's CI check list beyond
  `mergeNote`/`ciPass`), it will be raised as its own justified change, not slipped into a phase.

### Decisions (accepted 2026-11-05)

These were open questions. The recommendations were accepted, and the phases above follow them.

1. **Removing 3D: build flag first, then delete.** Phase 6 runs in two steps. In 6a, `App.tsx` imports
   `Office.tsx` only when `import.meta.env.VITE_OFFICE_3D === '1'` (the default build leaves it out, so three.js
   isn't bundled). That stays for one phase, so the dashboard can be compared with the 3D office in the same demo.
   In 6b, `world/` and the rest of §5's list are deleted. *Why:* Phases 1–5 check the dashboard against the 3D
   console ("numbers match"). Deleting first would lose that reference, and the flag costs one line.
2. **UI stack: keep React 19 + zustand + `styles.css`/`pk-*`, no component library.** Every panel the dashboard
   needs already exists in this stack (`ui/*.tsx`). A library would mean restyling and re-testing working panels,
   would add a dependency, and would make upstream merges of `ui/` harder. Drag and drop uses native HTML5 DnD plus
   pointer events (§4.3), not a DnD library.
3. **Headless mode: not a separate mode, nothing to build.** The server already runs headless: `server/index.ts`
   serves `dist/` only when it exists (`if (fs.existsSync(dist))`), and `/api`, `/ws` and `/ws/term` work without
   it. Phase 6 adds one line to the README ("run the server without building the client for API-only use"). No
   server change. A supported "server-only npm package" is out of scope.
4. **Layout: desktop first, with a phone fallback.** On ≥ 1024 px, a left rail, a multi-column Kanban, the terminal
   grid and the Reviewer split view. Below 760 px, pocket's bottom tab bar, one column, and terminal grid hidden
   (one terminal at a time). Between 760 and 1024 px, a collapsed rail (icons only).
5. **Office life: drop all of it, except three things with no 3D dependency.** (a) The merge toast, plus one optional
   merge chime (default off), through a slimmed 2D `sfx` (see 8). (b) `TeamStats` (from `ui/CareerCard.tsx`) as plain
   per-agent numbers in Settings → Team, without the career card's game framing. (c) The activity ticker (`ticker`
   events) as the shell's "recent activity" feed. Weather, holidays, ping-pong, coins and decor, toys, the dog,
   coffee, the fridge, presence and photo mode are dropped.
6. **Time-lapse: keep.** It's a real review tool ("what happened overnight", `replayClock.ts` "since I was last
   here"), and its logic is outside `world/`. The only coupling, `replay.ts` → `gongState` and `sky/useDayTime`,
   is removed in Phase 0 by the effect registry. It ships in Phase 5 under Metrics.
7. **Fork identity: stay close to upstream.** Keep the package name `cubefarm`, keep `server/` byte-identical to
   upstream where possible, and never publish to npm from this fork (`release.yml` is left untouched and never
   run). In Phase 6: add a "This fork" section to the README (2D dashboard, upstream link, how to merge upstream
   `server/` fixes), update `package.json` `description`/`keywords` and the `CLAUDE.md` client code map, and keep
   `LICENSE` with a fork copyright line added. `CLAUDE.md`'s SAFETY section stays as is: its rules (demo mode only,
   isolated `SWARM_HOME`, never ports 4317/5317) are sound for any clone, even though the Windows live-office path
   doesn't exist here.
8. **Voice and mic dictation: keep.** They are useful in the CEO chat and the terminal message box, already work in
   pocket mode, and have no 3D dependency of their own. They do depend on the sound stack, though: `voicePlayback.ts`
   imports `music.ts` (ducking) and `sfx.ts`, and `sfx.ts` imports `acoustics.ts`, which imports `world/layout`.
   So Phase 0 adds a step: split `sfx.ts` into a 2D core (event cues, audio prefs, volume) and the 3D spatial part
   (`acoustics`, `sfxMix` distances), and make `voicePlayback`'s music ducking an optional hook. 3D spatial audio,
   music, babble and footsteps go in Phase 6.
