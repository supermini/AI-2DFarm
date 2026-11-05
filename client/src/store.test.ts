import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentView, IssueInfo, LogLine, OpsAlarm, PullInfo, RepoView, ServerEvent, WorldSnapshot } from '../../shared/types';

// The merge chime, through the store's own apply(): sounds are mocked (they need a browser).
vi.mock('./ui/sfx', () => ({ alarm: vi.fn(), audioUnlocked: () => false, chirp: vi.fn(), cue: vi.fn(), getAudioPrefs: vi.fn(() => ({ mergeChime: true })) }));

const { kanbanFor, useStore } = await import('./store');
const { alarm, cue, getAudioPrefs } = await import('./ui/sfx');
const { EMPTY_OPS } = await import('./ops');

const pr = (number: number, state: PullInfo['state'], headRefName = `feature/${number}`) => ({ number, state, headRefName }) as PullInfo;
const repo = (floor: number, ...pulls: PullInfo[]) => ({ id: `acme/floor${floor}`, floor, pulls }) as RepoView;
const snapshot = (repos: RepoView[], agents: Partial<AgentView>[] = []) =>
  ({ type: 'snapshot', data: { repos, agents, qa: [], requests: [], messages: [], phoneReadAt: 0, settings: {}, ceo: {}, usage: {}, clis: [] } as unknown as WorldSnapshot }) as const;

describe('the merge chime', () => {
  const chimes = () => vi.mocked(cue).mock.calls.filter(([c]) => c === 'merged').length;

  beforeEach(() => {
    useStore.setState({ loaded: false, repos: [] });
    vi.mocked(cue).mockClear();
    vi.mocked(getAudioPrefs).mockReturnValue({ mergeChime: true } as ReturnType<typeof getAudioPrefs>);
  });

  it('never sounds for merges in the first snapshot, or in a snapshot after a reconnect', () => {
    const { apply } = useStore.getState();
    apply(snapshot([repo(1, pr(1, 'MERGED'), pr(2, 'OPEN'))]));
    apply(snapshot([repo(1, pr(1, 'MERGED'), pr(2, 'MERGED'))])); // #2 merged while we were disconnected
    expect(chimes()).toBe(0);
  });

  it('sounds on open → MERGED, once per update', () => {
    const { apply } = useStore.getState();
    apply(snapshot([repo(1, pr(1, 'MERGED'), pr(2, 'OPEN'), pr(3, 'OPEN'))]));
    apply({ type: 'repo', repo: repo(1, pr(1, 'MERGED'), pr(2, 'OPEN'), pr(3, 'OPEN')) }); // nothing new
    expect(chimes()).toBe(0);
    apply({ type: 'repo', repo: repo(1, pr(1, 'MERGED'), pr(2, 'MERGED'), pr(3, 'MERGED')) });
    expect(chimes()).toBe(1);
  });

  it('stays quiet unless it is turned on', () => {
    vi.mocked(getAudioPrefs).mockReturnValue({ mergeChime: false } as ReturnType<typeof getAudioPrefs>);
    const { apply } = useStore.getState();
    apply(snapshot([repo(1, pr(5, 'OPEN'))]));
    apply({ type: 'repo', repo: repo(1, pr(5, 'MERGED')) });
    expect(chimes()).toBe(0);
  });

  it('stays quiet in a replay', () => {
    const { apply } = useStore.getState();
    apply(snapshot([repo(1, pr(5, 'OPEN'))]));
    apply({ type: 'repo', repo: repo(1, pr(5, 'MERGED')) }, 'play');
    expect(chimes()).toBe(0);
  });

  it('sounds the same for a merge in a batch of floor patches, which keep what they leave out', () => {
    const { apply } = useStore.getState();
    apply(snapshot([{ ...repo(1, pr(3, 'OPEN')), fullName: 'acme/floor1' }, repo(2)]));
    apply({ type: 'repos', repos: [{ id: 'acme/floor1', pulls: [pr(3, 'MERGED')] }, { id: 'acme/gone', pulls: [] }] });
    expect(chimes()).toBe(1);
    expect(useStore.getState().repos.map((r) => [r.id, r.fullName])).toEqual([
      ['acme/floor1', 'acme/floor1'],
      ['acme/floor2', undefined],
    ]);
  });
});

describe('what only the 3D office drew', () => {
  it('leaves the state alone, live and in a replay (old journals still carry these events)', () => {
    const { apply } = useStore.getState();
    apply(snapshot([repo(1)]));
    const before = useStore.getState();
    const events = [
      { type: 'weather', weather: {} },
      { type: 'visitors', visitors: [] },
      { type: 'visitorPose', pose: {} },
      { type: 'visitorEmote' },
      { type: 'visitorPing' },
      { type: 'progress', progress: {} },
      { type: 'reward', reward: {} },
      { type: 'pong', repoId: 'acme/floor1', board: [] },
    ] as unknown as ServerEvent[];
    for (const ev of events) {
      apply(ev);
      apply(ev, 'play');
      apply(ev, 'seek');
    }
    expect(useStore.getState()).toBe(before);
  });
});

describe('mission control in the store', () => {
  const alarmFor = (id: string): OpsAlarm => ({ id, kind: 'pr', repoId: 'acme/floor1', floor: 1, prNumber: 7, agentId: null, text: 'PR #7 needs you', since: 1 });
  const ops = (...ids: string[]) => ({ type: 'ops', ops: { ...EMPTY_OPS, alarms: ids.map(alarmFor) } }) as const;

  beforeEach(() => {
    useStore.setState({ loaded: false, repos: [], ops: EMPTY_OPS });
    vi.mocked(alarm).mockClear();
  });

  it('sounds the alarm when a new alarm arrives, never for the snapshot or one already ringing', () => {
    const { apply } = useStore.getState();
    apply({ ...snapshot([]), data: { ...snapshot([]).data, ops: { ...EMPTY_OPS, alarms: [alarmFor('pr:a#1')] } } });
    expect(alarm).not.toHaveBeenCalled();
    apply(ops('pr:a#1'));
    expect(alarm).not.toHaveBeenCalled();
    apply(ops('pr:a#1', 'agent:x'));
    expect(alarm).toHaveBeenCalledTimes(1);
    apply(ops('agent:x')); // handled: the beacon stops, nothing sounds
    expect(alarm).toHaveBeenCalledTimes(1);
    expect(useStore.getState().ops.alarms.map((a) => a.id)).toEqual(['agent:x']);
  });

  it('marks backlog issues auto-assign would start as paced while Claude usage holds them back', () => {
    const issue = (number: number, body = '', labels: string[] = []) => ({ number, title: `#${number}`, body, url: '', labels, createdAt: '' }) as IssueInfo;
    const r = { ...repo(1), issues: [issue(1), issue(2, 'Depends on #1'), issue(3, '', ['bug'])], autoAssign: true, autoMerge: true } as RepoView;
    const notes = (usage?: { state: 'normal' | 'pacing' | 'paused' }, autoAssign = true) => kanbanFor({ ...r, autoAssign }, [], {}, usage).backlog.map((c) => c.note);
    expect(notes()).toEqual([undefined, '⏳ after #1', 'bug']);
    expect(notes({ state: 'normal' })).toEqual([undefined, '⏳ after #1', 'bug']);
    expect(notes({ state: 'pacing' })).toEqual(['⏸ paced', '⏳ after #1', '⏸ paced · bug']);
    expect(notes({ state: 'paused' })).toEqual(['⏸ paused', '⏳ after #1', '⏸ paused · bug']);
    expect(notes({ state: 'pacing' }, false)).toEqual([undefined, '⏳ after #1', 'bug']); // nothing starts on its own there anyway
  });
});

describe('kanbanFor: In progress', () => {
  const r = (...pulls: PullInfo[]) => ({ ...repo(1, ...pulls), issues: [{ number: 192, title: 'Cancelled', body: '', labels: [] }], autoMerge: false }) as unknown as RepoView;
  const barbara = (patch: Partial<AgentView>) => ({ id: 'b', name: 'Barbara', role: 'agent', task: 'issue', status: 'working', issueNumber: 192, issueTitle: 'Cancelled', prNumber: null, branch: 'swarm/issue-192-barbara', ...patch }) as AgentView;

  it('shows an agent working on an issue, and one who finished without a PR', () => {
    expect(kanbanFor(r(), [barbara({})], {}).progress.map((c) => c.note)).toEqual(['working']);
    expect(kanbanFor(r(), [barbara({ status: 'done' })], {}).progress.map((c) => c.note)).toEqual(['finished · no PR']);
  });

  it('shows no card once their PR is open, closed or merged: never "finished · no PR" for a PR that was closed', () => {
    const done = barbara({ status: 'done', prNumber: 198 });
    expect(kanbanFor(r(pr(198, 'OPEN')), [done], {}).progress).toEqual([]);
    expect(kanbanFor(r(), [done], {}).progress).toEqual([]); // GitHub's list leaves closed PRs out
    expect(kanbanFor(r(pr(198, 'CLOSED')), [done], {}).progress).toEqual([]);
    expect(kanbanFor(r(pr(198, 'MERGED')), [done], {}).progress).toEqual([]);
  });

  it('never takes the agent testing a PR for its author', () => {
    const tester = barbara({ id: 't', name: 'Tess', task: 'qa', issueNumber: null, prNumber: 198, branch: 'qa/pr-198' });
    const author = barbara({ status: 'done', prNumber: 198 });
    expect(kanbanFor(r(pr(198, 'OPEN')), [tester, author], {}).qa.map((c) => c.agent?.id)).toEqual(['b']);
    expect(kanbanFor(r(pr(198, 'OPEN')), [tester], {}).qa.map((c) => c.agent)).toEqual([undefined]);
    expect(kanbanFor(r(), [tester], {}).progress).toEqual([]);
  });

  it('shows nothing for an agent whose task was cleared', () => {
    expect(kanbanFor(r(), [barbara({ status: 'idle', task: null, issueNumber: null, prNumber: null, branch: null })], {}).progress).toEqual([]);
  });

  it('marks an issue whose PR was closed as waiting for the manager, in the backlog', () => {
    const held = { ...r(), held: [{ issue: 192, pr: 198 }] } as RepoView;
    expect(kanbanFor(held, [], {}).backlog).toMatchObject([{ number: 192, note: '⏸ PR #198 closed · assign by hand', tone: 'warn' }]);
    expect(kanbanFor(r(), [], {}).backlog[0].tone).toBeUndefined();
  });
});

describe('batched agents and watched terminal lines (#228)', () => {
  const line = (id: number, kind: LogLine['kind'] = 'tool') => ({ id, t: id, kind, text: `line ${id}` }) as LogLine;
  const ken = { id: 'ken', name: 'Ken', role: 'agent', status: 'working', currentTool: 'Read', repoId: 'acme/floor1', log: [] } as Partial<AgentView>;

  beforeEach(() => {
    useStore.setState({ loaded: false });
    useStore.getState().apply(snapshot([repo(1)], [ken]));
    vi.mocked(cue).mockClear();
  });

  it('merges a batch of agent changes in one update, and makes someone new from a full view', () => {
    const { apply } = useStore.getState();
    apply({ type: 'agents', agents: [{ id: 'ken', currentTool: 'Edit' }, { ...ken, id: 'ada', name: 'Ada' } as AgentView, { id: 'gone', currentTool: 'Bash' }] });
    const s = useStore.getState();
    expect(s.agents.ken).toMatchObject({ name: 'Ken', currentTool: 'Edit', status: 'working' });
    expect(s.agents.ada.name).toBe('Ada');
    expect(s.agents.gone).toBeUndefined();
    expect(cue).toHaveBeenCalledWith('welcome');
    apply({ type: 'agents', agents: [{ id: 'ken', status: 'error' }] });
    expect(cue).toHaveBeenCalledWith('error');
  });

  it('appends live lines once, replaces the buffer on a catch-up, and keeps the latest listed line', () => {
    const { apply } = useStore.getState();
    apply({ type: 'logs', catchUp: true, tails: { ken: [line(1), line(2, 'result')] } });
    // a line the catch-up already had arrives again with the batch after it
    apply({ type: 'logs', tails: { ken: [line(2, 'result'), line(3, 'text')] } });
    expect(useStore.getState().logs.ken.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(useStore.getState().latest.ken.id).toBe(3);
    apply({ type: 'latest', lines: { grace: line(9) } });
    expect(useStore.getState().latest).toMatchObject({ ken: { id: 3 }, grace: { id: 9 } });
    apply({ type: 'logs', catchUp: true, tails: { ken: [line(7)] } });
    expect(useStore.getState().logs.ken.map((l) => l.id)).toEqual([7]);
  });
});
