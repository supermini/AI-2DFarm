// Every office sound, synthesized with WebAudio (no audio files): the mixer's 2D core. One shared AudioContext: sounds
// go through their group's gain (footsteps, typing, toys, alerts; or straight on), then the master gain, so volume and
// mute apply to everything at once, then a gentle compressor. Audio is optional: when it's blocked or unavailable
// (headless browsers), sounds just don't play, but window.__swarmSfx still records them.
// Messages read aloud (voiceMessages.ts) have their own 'voice' group, which skips the bus that ducks everything else.
// While the 🎙 listens (mic.ts) everything dips, the voice too, and event cues wait until it closes.

import { normalizeAudioPrefs, parseAudioPrefs, SOUND_GROUPS, sliderGain, type AudioPrefs, type SoundGroup } from './audioPrefs';
import { DROP_NEW, PLAY, type Vec3, voiceToDrop } from './sfxMix';

export type { SoundGroup } from './audioPrefs';
export type { Vec3 } from './sfxMix';

const PREFS_KEY = 'cubefarm:audio';

function loadPrefs(): AudioPrefs {
  try {
    return parseAudioPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return parseAudioPrefs(null);
  }
}

let prefs = loadPrefs();
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bus: GainNode | null = null; // every sound but the voice, so a message read aloud can duck them
let unlocked = false;
const groupGains: Partial<Record<SoundGroup, GainNode>> = {};
const groupLevels = {} as Record<SoundGroup, number>;
for (const g of SOUND_GROUPS) groupLevels[g] = sliderGain(prefs[g]);

const COMPRESSOR_TRIM = 10 ** (-2.81 / 20);
const DUCKED = 10 ** (-8 / 20);
const MIC_DUCKED = 10 ** (-15 / 20); // what's left of a message being read while the mic listens
let speakingDuck = false; // a message is being read aloud
let micOpen = false;

const masterLevel = () => (prefs.muted ? 0 : sliderGain(prefs.volume));

/** The shared context and master gain, or null until the first user gesture / when audio is unavailable. */
export function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!unlocked) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = masterLevel();
      // Gentle: it only touches the loudest moments (many sounds at once), so single sounds are unchanged.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      // The compressor adds its own makeup gain (+2.8 dB for these settings, measured in Chromium): take it back off.
      const trim = ctx.createGain();
      trim.gain.value = COMPRESSOR_TRIM;
      master.connect(comp).connect(trim).connect(ctx.destination);
      bus = ctx.createGain();
      bus.connect(master);
      for (const g of SOUND_GROUPS) {
        const gain = ctx.createGain();
        gain.gain.value = groupLevels[g];
        gain.connect(g === 'voice' ? master : bus);
        groupGains[g] = gain;
      }
      spatial?.wire(ctx, groupGains as Record<SoundGroup, GainNode>, bus);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    // Don't queue sounds on a stopped clock: they'd all fire at once when it starts.
    return ctx.state === 'running' && master ? { ctx, out: master } : null;
  } catch {
    return null;
  }
}

/** Start audio from a user gesture (the first click or key). */
export function unlockAudio() {
  unlocked = true;
  audio();
}

for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlockAudio, { once: true, capture: true });

/** Whether the first click or key has happened (sounds may still be unavailable). */
export const audioUnlocked = () => unlocked;

// ---------- volume & mute ----------

export const getAudioPrefs = () => prefs;

export function subscribeAudio(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Glide a gain to a new level (a short ramp, so slider drags don't click). */
function glide(gain: GainNode, level: number) {
  if (!ctx) return;
  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(level, ctx.currentTime, 0.015);
  } catch {
    // audio is optional
  }
}

/** One sound group's level, 0-1 (default 1), under the master volume. */
export function setGroupLevel(group: SoundGroup, level: number) {
  groupLevels[group] = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));
  const gain = groupGains[group];
  if (gain) glide(gain, groupLevels[group] * (group === 'voice' && micOpen ? MIC_DUCKED : 1));
}

export function setAudioPrefs(patch: Partial<AudioPrefs>) {
  const clamped: Record<string, unknown> = { ...prefs, ...patch };
  for (const k of ['volume', ...SOUND_GROUPS] as const) clamped[k] = Math.max(0, Math.min(100, Number(clamped[k])));
  prefs = normalizeAudioPrefs(clamped);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage may be unavailable (private mode); the setting just won't be remembered
  }
  if (master) glide(master, masterLevel());
  for (const g of SOUND_GROUPS) setGroupLevel(g, sliderGain(prefs[g]));
  for (const fn of listeners) fn();
}

export const toggleMute = () => setAudioPrefs({ muted: !prefs.muted });

/** Turns every sound but the voice down by about 8 dB (while a message is read aloud), or back up. */
export function duckOthers(on: boolean) {
  speakingDuck = on;
  applyDuck();
}

function applyDuck() {
  if (!ctx || !bus) return;
  const down = speakingDuck || micOpen;
  try {
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(down ? DUCKED : 1, ctx.currentTime, down ? 0.06 : 0.25);
  } catch {
    // audio is optional
  }
  setGroupLevel('voice', groupLevels.voice);
}

// The jukebox (music.ts, 3D only) ducks under voices and the mic: it registers how, and holds taken before it loads
// take it then.
interface DuckHold {
  release: (() => void) | null;
}
const duckHolds = new Set<DuckHold>();
let musicDuck: (() => () => void) | null = null;

/** Ducks the music, when there is any, until the returned function is called: for spoken messages, voice clips, the 🎙. */
export function holdMusicDuck(): () => void {
  const h: DuckHold = { release: musicDuck?.() ?? null };
  duckHolds.add(h);
  return () => {
    if (duckHolds.delete(h)) h.release?.();
  };
}

/** music.ts says how to duck it (`hold` ducks until its result is called). */
export function onMusicDuck(hold: () => () => void) {
  musicDuck = hold;
  for (const h of duckHolds) h.release ??= hold();
}

/** The 🎙 opened or closed: other sounds and a message being read dip while it listens, and cues wait for it. */
export function setMicOpen(on: boolean) {
  if (micOpen === on) return;
  micOpen = on;
  applyDuck();
  if (!on && pending && !timer) timer = setTimeout(flush, GATHER_MS);
}

// ---------- the 3D office's side (sfxSpatial.ts) ----------

/** How walls muffle a sound (acoustics.ts's Occlusion): its gain, and a lowpass cutoff (Hz). */
export interface Muffle {
  gain: number;
  cutoff: number;
}

/** What the 3D office adds to the mixer: sounds placed in the world, the listener, the rooms' reverb. */
export interface Spatial {
  /** For the probe: a sound at `pos`'s level from distance (0 out of earshot; `falloff` replaces the office's model) and its pan. */
  measure(pos: Vec3, falloff?: (d: number) => number): { gain: number; pan: number };
  /** Whether a sound at `pos` plays: null when it's too far, else its level from distance and how the walls muffle it. */
  hear(pos: Vec3): { near: number; walls: Muffle | null } | null;
  /** The nodes a sound at `pos` goes through into `dest` (a panner; a lowpass when walls muffle it): returns their input. */
  route(c: AudioContext, pos: Vec3, walls: Muffle | null, dest: AudioNode): AudioNode;
  /** The context is made: the groups' room sends (into the reverb, which returns to `bus`) and the listener. */
  wire(c: AudioContext, groups: Readonly<Record<SoundGroup, GainNode>>, bus: GainNode): void;
  /** Where the listener stands and faces, for captions' arrows. */
  ears(): { at: Readonly<Vec3>; fwd: Readonly<Vec3> };
  /** Where a sound that plays everywhere comes from (the gong), for its caption's arrow. */
  anchorOf(name: string): Vec3 | null;
  /** More about a sound for its caption (the song a jukebox entry is). */
  detailOf(name: string): Promise<string | undefined>;
}

let spatial: Spatial | null = null;

/** The 3D office's side of the mixer joins (sfxSpatial.ts, once, as it loads). */
export function registerSpatial(s: Spatial) {
  spatial = s;
  if (ctx && bus) s.wire(ctx, groupGains as Record<SoundGroup, GainNode>, bus);
}

/** The 3D office's side, or null with only the 2D core loaded (pocket mode). */
export const spatialSide = () => spatial;

// ---------- the probe (window.__swarmSfx) ----------

/** One sound that was asked for, as recorded for QA and e2e. */
export interface SfxRecord {
  name: string;
  group: SoundGroup | null;
  /** Where in the world, or null for a non-positional sound. */
  at: Vec3 | null;
  /** Peak after distance and the group level, before the master volume (0 when culled for distance). */
  gain: number;
  /** -1 (left) to 1 (right) from where the listener faces; a non-positional sound's own `pan` (default 0). */
  pan: number;
  /** Whether it was actually scheduled (false while locked, unavailable, too far away or over the voice cap). */
  played: boolean;
  /** Where its panner really was when it played, for sounds on long-lived panners (typing); else absent. */
  from?: Vec3 | null;
  /** The jukebox's music: its volume level (1-6) and whether it's ducked under an alert or speech. */
  level?: number;
  ducked?: boolean;
  /** The jukebox's music: whether its vinyl crackle bed is playing (lo-fi songs). */
  crackle?: boolean;
  /** Heard through a wall or from another space (gain already lowered). */
  occluded?: boolean;
  /** The room's reverb (room:… entries): the room and its wet level. */
  room?: string;
  wet?: number;
  /** The soundtrack (score:… entries): its mood and the one before. */
  mood?: string;
  prev?: string;
  /** performance.now() when it was asked for. */
  t: number;
}

const PROBE_SIZE = 50;
const probe: SfxRecord[] = [];
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__swarmSfx = probe;

type SoundListener = (rec: SfxRecord, heard: boolean) => void;
let soundListener: SoundListener | null = null;

/**
 * Captions (captions.ts) hear of every sound recorded in __swarmSfx: `heard` is false when it's out of earshot, or when
 * its caller says it didn't play (a loop going silent). Mute and the volume sliders don't count: a muted office still
 * gets its captions.
 */
export function onSoundRecorded(fn: SoundListener | null) {
  soundListener = fn;
}

/**
 * Records a sound in window.__swarmSfx (the last 50). tone() and noise() call it themselves; long-lived loops call it
 * when they start. `peak` is the sound's level before distance; returns the record so `played` can be set later.
 * Sounds frequent enough to crowd everything else out (typing) pass a `log` of their own. A sound with its own distance
 * model (the jukebox) passes `falloff`: its gain at `d` metres, in place of the office's.
 */
export function recordSfx(
  name: string,
  { group, pos, pan = 0, peak, played, falloff }: { group?: SoundGroup; pos?: Vec3; pan?: number; peak: number; played?: boolean; falloff?: (d: number) => number },
  log: SfxRecord[] = probe,
) {
  const m = pos && spatial ? spatial.measure(pos, falloff) : null;
  const atDistance = m ? m.gain : 1;
  const rec: SfxRecord = {
    name,
    group: group ?? null,
    at: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
    gain: peak * atDistance * (group ? groupLevels[group] : 1),
    pan: m ? m.pan : pan,
    played: played ?? false,
    t: performance.now(),
  };
  log.push(rec);
  if (log.length > PROBE_SIZE) log.splice(0, log.length - PROBE_SIZE);
  if (log === probe) soundListener?.(rec, atDistance > 0 && played !== false);
  return rec;
}

// ---------- routing (exported for long-lived loops that manage their own nodes) ----------

/** Where a sound of this group connects (its group gain, or the master without one), or null while audio is off. */
export function groupOutput(group?: SoundGroup): AudioNode | null {
  const a = audio();
  if (!a) return null;
  return (group && groupGains[group]) || bus || a.out;
}

type AlertListener = (c: BaseAudioContext, start: number, end: number) => void;
let alertListener: AlertListener | null = null;

/** The music ducks under the alerts group: `fn` hears of every alert sound that plays (context times). */
export function onAlertSound(fn: AlertListener | null) {
  alertListener = fn;
}

function alerted(opts: PlaceOpts, c: BaseAudioContext, start: number, end: number) {
  if (opts.group === 'alerts') alertListener?.(c, start, end);
}

// ---------- voices ----------

interface Voice {
  end: number; // context time it finishes
  loud: number;
  env: GainNode;
  src: AudioScheduledSourceNode;
}

const voices: Voice[] = [];

/** Options every building block takes. */
export interface PlaceOpts {
  /** For __swarmSfx. */
  name?: string;
  /** Mixer group; without one the sound goes straight to the master gain. */
  group?: SoundGroup;
  /** Where in the world (metres): in the 3D office the sound pans and fades with distance, and isn't played beyond ~16 m. */
  pos?: Vec3;
  /** A fixed stereo position, -1 (left) to 1 (right), for sounds without `pos` (the player's own feet). */
  pan?: number;
  /** Part of a sound already in __swarmSfx (recordSfx): one entry for a sound made of several parts. */
  into?: SfxRecord;
}

/**
 * Records a sound for the probe and decides whether it plays. Returns where to connect it (a panner, its group or
 * the master; through a muffling lowpass when walls are in the way), how much the walls turn it down (`scale`) and its
 * loudness for the voice cap, or null to skip it.
 */
function place(kind: string, { name, group, pos, pan, into }: PlaceOpts, peak: number): { a: { ctx: AudioContext; out: GainNode }; dest: AudioNode; loud: number; scale: number } | null {
  const rec = into ?? recordSfx(name ?? kind, { group, pos, pan, peak });
  const where = pos && spatial ? spatial.hear(pos) : null;
  if (pos && spatial && !where) return null;
  const occ = where?.walls ?? null;
  const scale = occ?.gain ?? 1;
  if (occ && !rec.occluded) {
    rec.occluded = true;
    rec.gain *= scale;
  }
  const loud = peak * scale * (where?.near ?? 1);
  const a = audio();
  if (!a) return null;

  const now = a.ctx.currentTime;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
  const drop = voiceToDrop(voices, loud);
  if (drop === DROP_NEW) return null;
  if (drop !== PLAY) {
    const v = voices[drop];
    voices.splice(drop, 1);
    try {
      v.env.gain.cancelScheduledValues(now);
      v.env.gain.setTargetAtTime(0, now, 0.01);
      v.src.stop(now + 0.06);
    } catch {
      // already stopped
    }
  }

  let dest: AudioNode = (group && groupGains[group]) || bus || a.out;
  try {
    if (pos && where && spatial) dest = spatial.route(a.ctx, pos, occ, dest);
    else if (pan && a.ctx.createStereoPanner) {
      const p = a.ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(dest);
      dest = p;
    }
  } catch {
    return null;
  }
  rec.played = true;
  return { a, dest, loud, scale };
}

// ---------- building blocks (exported so toys can add their sounds through the same mixer) ----------

export interface ToneOpts extends PlaceOpts {
  freq: number;
  to?: number; // glide to this frequency by the end
  type?: OscillatorType;
  at?: number; // seconds from now
  dur: number;
  peak: number; // 0-1, before the master volume
  attack?: number;
}

/** One enveloped oscillator note. */
export function tone(opts: ToneOpts) {
  const { freq, to, type = 'sine', at = 0, dur, peak, attack = 0.015 } = opts;
  const p = place('tone', opts, peak);
  if (!p) return;
  const a = p.a;
  try {
    const t0 = a.ctx.currentTime + at;
    const osc = a.ctx.createOscillator();
    const gain = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak * p.scale, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(p.dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    voices.push({ end: t0 + dur + 0.05, loud: p.loud, env: gain, src: osc });
    alerted(opts, a.ctx, t0, t0 + dur);
  } catch {
    // audio is optional
  }
}

export interface NoiseOpts extends PlaceOpts {
  at?: number;
  dur: number;
  peak: number;
  filter?: BiquadFilterType;
  freq: number; // filter frequency
  to?: number; // sweep the filter to this frequency by the end
  q?: number;
  attack?: number;
}

let noiseBuf: AudioBuffer | null = null;

/** A burst of filtered white noise: footsteps, whooshes, pops. */
export function noise(opts: NoiseOpts) {
  const { at = 0, dur, peak, filter = 'lowpass', freq, to, q = 1, attack = 0.005 } = opts;
  const p = place('noise', opts, peak);
  if (!p) return;
  const a = p.a;
  try {
    if (!noiseBuf || noiseBuf.sampleRate !== a.ctx.sampleRate) {
      noiseBuf = a.ctx.createBuffer(1, a.ctx.sampleRate * 2, a.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = a.ctx.currentTime + at;
    const src = a.ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bq = a.ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(freq, t0);
    if (to) bq.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak * p.scale, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq).connect(gain).connect(p.dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    voices.push({ end: t0 + dur + 0.05, loud: p.loud, env: gain, src });
    alerted(opts, a.ctx, t0, t0 + dur);
  } catch {
    // audio is optional
  }
}

// For QA: __swarmSfxPing(x, y, z) plays a soft test blip at that spot, to hear (and see in __swarmSfx) it pan and fade.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__swarmSfxPing = (x: number, y: number, z: number) =>
    tone({ name: 'ping', group: 'alerts', pos: { x, y, z }, freq: 880, type: 'triangle', dur: 0.3, peak: 0.12 });
}

// ---------- the office's sounds ----------

let lastChirp = -Infinity;

/** The hands-free phone opening its mic (a soft rising pair), or closing it unheard (falling). Plays before the mic opens. */
export function listenChime(open: boolean) {
  (open ? [659.25, 987.77] : [783.99, 587.33]).forEach((freq, i) => tone({ name: open ? 'mic:open' : 'mic:close', group: 'alerts', freq, type: 'sine', at: i * 0.12, dur: 0.22, peak: 0.07, attack: 0.015 }));
}

/** The phone's message chirp: two quick rising blips (messages that arrive together chirp once). */
export function chirp() {
  if (performance.now() - lastChirp < 800) return;
  lastChirp = performance.now();
  [1046.5, 1568].forEach((freq, i) => tone({ name: 'chirp', group: 'alerts', freq, type: 'triangle', at: i * 0.11, dur: 0.18, peak: 0.12 }));
}

let lastAlarm = -Infinity;
const ALARM_GAP_MS = 30_000;

/**
 * Mission control's alarm, when something new needs the manager: a calm, low two-note chime, twice, more paging
 * system than siren. At most one every 30 seconds, however many alarms arrive.
 */
export function alarm() {
  if (performance.now() - lastAlarm < ALARM_GAP_MS) return;
  lastAlarm = performance.now();
  const o = { name: 'alarm', group: 'alerts', type: 'triangle', dur: 0.7, peak: 0.1, attack: 0.03 } as const;
  for (const at of [0, 1.1]) {
    tone({ ...o, freq: 659.3, at });
    tone({ ...o, freq: 523.3, at: at + 0.38, dur: 0.9 });
  }
}

export type Cue = 'error' | 'qaFailed' | 'ready' | 'merged' | 'welcome';

const CUES: Record<Cue, { rank: number; play: () => void }> = {
  // An agent hit an error: a soft low buzz.
  error: {
    rank: 5,
    play: () => [0, 0.2].forEach((at) => tone({ name: 'cue:error', group: 'alerts', freq: 110, type: 'sawtooth', at, dur: 0.16, peak: 0.035, attack: 0.02 })),
  },
  // QA failed a PR: a gentle descending "womp".
  qaFailed: {
    rank: 4,
    play: () => {
      tone({ name: 'cue:qaFailed', group: 'alerts', freq: 392, to: 370, type: 'triangle', dur: 0.26, peak: 0.12 });
      tone({ name: 'cue:qaFailed', group: 'alerts', freq: 311, to: 196, type: 'triangle', at: 0.26, dur: 0.55, peak: 0.12 });
    },
  },
  // A PR passed QA and is ready to merge: a short bright arpeggio.
  ready: {
    rank: 3,
    play: () => [784, 988, 1175, 1568].forEach((freq, i) => tone({ name: 'cue:ready', group: 'alerts', freq, type: 'triangle', at: i * 0.07, dur: 0.28, peak: 0.09 })),
  },
  // A PR was merged: a pop and a little cheer.
  merged: {
    rank: 2,
    play: () => {
      noise({ name: 'cue:merged', group: 'alerts', dur: 0.07, peak: 0.16, filter: 'bandpass', freq: 1400, q: 1.2, attack: 0.002 });
      tone({ name: 'cue:merged', group: 'alerts', freq: 523, to: 1046, type: 'square', at: 0.04, dur: 0.12, peak: 0.04 });
      [1046.5, 1318.5, 1568].forEach((freq) => tone({ name: 'cue:merged', group: 'alerts', freq, type: 'triangle', at: 0.14, dur: 0.5, peak: 0.05 }));
      noise({ name: 'cue:merged', group: 'alerts', at: 0.12, dur: 0.6, peak: 0.03, filter: 'bandpass', freq: 2500, q: 0.6, attack: 0.08 });
    },
  },
  // A hire was approved or a new teammate arrived: a small welcome jingle.
  welcome: {
    rank: 1,
    play: () => [659, 784, 1046.5].forEach((freq, i) => tone({ name: 'cue:welcome', group: 'alerts', freq, type: 'sine', at: i * 0.12, dur: i === 2 ? 0.5 : 0.2, peak: 0.12 })),
  },
};

const GATHER_MS = 150; // cues that arrive together are gathered, and only the most important plays
const GAP_MS = 1000; // at most one cue a second
let pending: Cue | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastRank = 0;
let lastAt = -Infinity;

const better = (a: Cue | null, b: Cue) => (a && CUES[a].rank >= CUES[b].rank ? a : b);

/** Play an event cue, rate-limited: bursts collapse into their most important cue. While the 🎙 listens it waits. */
export function cue(c: Cue) {
  const now = performance.now();
  if (micOpen) {
    pending = better(pending, c);
    return;
  }
  // Inside the gap after a cue, only something more important than what just played gets through.
  if (now - lastAt < GAP_MS && CUES[c].rank <= lastRank && !pending) return;
  pending = better(pending, c);
  if (timer) return;
  timer = setTimeout(flush, Math.max(GATHER_MS, lastAt + GAP_MS - now));
}

function flush() {
  timer = null;
  if (micOpen) return; // played when the mic closes
  const c = pending;
  pending = null;
  if (!c) return;
  lastAt = performance.now();
  lastRank = CUES[c].rank;
  CUES[c].play();
}
