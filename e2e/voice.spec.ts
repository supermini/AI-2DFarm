import { type Page } from '@playwright/test';
import { CEO_ID } from '../shared/types';
import { expect, openDashboard, test } from './helpers';

// Messages read aloud (docs/voice.md), with the demo's fake ElevenLabs: a CEO reply is spoken away from the chat, the
// saved voice level and mute apply, two messages play one after the other, and a reload stays silent.

interface Spoken {
  id: number;
  provider: string;
  start: number;
  end: number | null;
  volume: number;
}

// One demo office serves every spec file: turn the voice on for these tests only.
test.beforeAll(async ({ request }) => {
  expect((await request.put('/api/voice/key', { data: { key: 'demo-voice-key-1234' } })).ok()).toBe(true);
  expect((await request.patch('/api/settings', { data: { voice: { provider: 'elevenlabs', voiceId: 'demoVoiceAvery00001', voiceName: 'Avery' } } })).ok()).toBe(true);
});

test.afterAll(async ({ request }) => {
  await request.patch('/api/settings', { data: { voice: { provider: 'off' } } });
  await request.put('/api/voice/key', { data: { key: '' } });
});

const spoken = (page: Page) => page.evaluate(() => ((window as unknown as { __swarmVoice?: Spoken[] }).__swarmVoice ?? []).map((s) => ({ ...s })));

/** The ids of the CEO's messages so far, to tell new replies from old. */
async function ceoIds(page: Page): Promise<number[]> {
  const state = await (await page.request.get('/api/state')).json();
  return (state.messages as { id: number; from: string }[]).filter((m) => m.from === 'ceo').map((m) => m.id);
}

async function textCeo(page: Page, text: string) {
  expect((await page.request.post('/api/ceo/message', { data: { text } })).ok()).toBe(true);
}

/** Waits until every message in `ids` has been read aloud and finished. */
async function heard(page: Page, ids: number[]): Promise<Spoken[]> {
  await expect.poll(async () => (await spoken(page)).filter((s) => ids.includes(s.id) && s.end !== null).length, { timeout: 30_000 }).toBe(ids.length);
  return (await spoken(page)).filter((s) => ids.includes(s.id));
}

/** The CEO's replies after `before`, once there are `n` of them. */
async function newReplies(page: Page, before: number[], n: number): Promise<number[]> {
  let ids: number[] = [];
  await expect
    .poll(
      async () => {
        ids = (await ceoIds(page)).filter((id) => !before.includes(id));
        return ids.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(n);
  return ids;
}

/** Reloads the dashboard with these sound settings saved in this browser. */
async function withAudio(page: Page, prefs: Record<string, unknown>) {
  await page.evaluate((p) => localStorage.setItem('cubefarm:audio', JSON.stringify(p)), prefs);
  await page.reload();
  await page.locator('.pk-title').click();
}

test('a CEO reply is read aloud away from the chat, and the saved voice level and mute apply', async ({ page }) => {
  await openDashboard(page, '/#/metrics');

  let before = await ceoIds(page);
  await textCeo(page, 'How is it going?');
  const [first] = await newReplies(page, before, 1);
  const [rec] = await heard(page, [first]);
  expect(rec.provider).toBe('elevenlabs');
  expect(rec.end! - rec.start).toBeGreaterThan(100); // the demo's chime lasts at least 0.4 s
  expect(rec.volume).toBeGreaterThan(0);

  // Half way is a quarter of the gain (slider levels are squared).
  await withAudio(page, { voice: 50 });
  before = await ceoIds(page);
  await textCeo(page, 'And the voice level?');
  const [second] = await newReplies(page, before, 1);
  const [quieter] = await heard(page, [second]);
  expect(quieter.volume).toBeCloseTo(rec.volume / 4, 5);

  await withAudio(page, { muted: true });
  before = await ceoIds(page);
  await textCeo(page, 'Can you hear me now?');
  const [third] = await newReplies(page, before, 1);
  const [muted] = await heard(page, [third]);
  expect(muted.volume).toBe(0);
  await page.evaluate(() => localStorage.removeItem('cubefarm:audio'));
});

test('two quick messages play one after the other, and a reload reads nothing again', async ({ page }) => {
  await openDashboard(page, '/#/metrics');
  const before = await ceoIds(page);
  // The first starts a CEO session; the second reaches it while it works and gets its own reply (queued texts would
  // be merged into one job).
  await textCeo(page, 'First question');
  await expect.poll(async () => (await (await page.request.get('/api/state')).json()).agents.find((a: { id: string }) => a.id === CEO_ID)?.status, { timeout: 30_000 }).toBe('working');
  await textCeo(page, 'Second question');
  const ids = (await newReplies(page, before, 2)).slice(0, 2);
  const [a, b] = (await heard(page, ids)).sort((x, y) => x.start - y.start);
  expect([a.id, b.id]).toEqual([...ids].sort((x, y) => x - y));
  expect(b.start).toBeGreaterThanOrEqual(a.end!);

  await page.reload();
  await page.locator('.pk-title').click();
  await page.waitForTimeout(2000); // long enough for a replayed message to start
  expect(await spoken(page)).toEqual([]);
});

test('with two office tabs open, each message is read in only one of them', async ({ page, baseURL }) => {
  const other = await page.context().newPage();
  await other.route(
    (url) => !url.href.startsWith(baseURL!) && !url.protocol.startsWith('data'),
    (route) => route.fulfill({ status: 200, body: '' }),
  );
  await openDashboard(page, '/#/metrics');
  await openDashboard(other, '/#/metrics');
  const before = await ceoIds(page);
  await textCeo(page, 'Who answers?');
  const [id] = await newReplies(page, before, 1);
  const readIn = async () => (await spoken(page)).some((s) => s.id === id && s.end !== null) || (await spoken(other)).some((s) => s.id === id && s.end !== null);
  await expect.poll(readIn, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(1000); // a second tab, if it wrongly spoke too, has started by now
  const count = (await spoken(page)).filter((s) => s.id === id).length + (await spoken(other)).filter((s) => s.id === id).length;
  expect(count).toBe(1);
  await other.close();
});
