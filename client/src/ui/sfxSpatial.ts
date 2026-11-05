// The mixer's 3D side (sfx.ts is the 2D core): sounds placed in the world pan and fade with distance from the camera
// (SoundListener.tsx moves the listener), the walls between muffle them (roomSfx.ts's occluder), and each group sends a
// little into the room you're in (roomSfx.ts's shared reverb). It registers itself with the core as it loads, with the
// 3D office: pocket mode never loads it, so the core and voice playback stay clear of world/.

import { useStore } from '../store';
import { GONG } from '../world/layout';
import { ROOM_SENDS, type Occlusion } from './acoustics';
import { SOUND_GROUPS } from './audioPrefs';
import { audio, groupOutput, recordSfx, registerSpatial } from './sfx';
import { audible, distance, distanceGain, MAX_DISTANCE, panOf, REF_DISTANCE, ROLLOFF, type Vec3 } from './sfxMix';

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let roomIn: GainNode | null = null; // what the groups send into the room's reverb

// ---------- the listener (the camera's ears) ----------

const ear = { x: 0, y: 1.65, z: 10 };
const earFwd = { x: 0, y: 0, z: -1 };
const earUp = { x: 0, y: 1, z: 0 };

function writeListener() {
  const l = ctx?.listener;
  if (!l) return;
  try {
    if (l.positionX) {
      l.positionX.value = ear.x;
      l.positionY.value = ear.y;
      l.positionZ.value = ear.z;
      l.forwardX.value = earFwd.x;
      l.forwardY.value = earFwd.y;
      l.forwardZ.value = earFwd.z;
      l.upX.value = earUp.x;
      l.upY.value = earUp.y;
      l.upZ.value = earUp.z;
    } else {
      // Older browsers (Firefox) only have the deprecated setters.
      l.setPosition(ear.x, ear.y, ear.z);
      l.setOrientation(earFwd.x, earFwd.y, earFwd.z, earUp.x, earUp.y, earUp.z);
    }
  } catch {
    // audio is optional
  }
}

/** Where the listener is and which way it faces (world metres, unit vectors). Called every frame: allocates nothing. */
export function setListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) {
  ear.x = px;
  ear.y = py;
  ear.z = pz;
  earFwd.x = fx;
  earFwd.y = fy;
  earFwd.z = fz;
  earUp.x = ux;
  earUp.y = uy;
  earUp.z = uz;
  if (ctx?.state === 'running') writeListener();
}

/** Where the listener is now (updated in place every frame). */
export const listenerAt = (): Readonly<Vec3> => ear;

const facing = { fwd: earFwd, up: earUp };

/** Which way the listener faces and what's up for them (unit vectors, updated in place every frame). */
export const listenerFacing = (): { readonly fwd: Readonly<Vec3>; readonly up: Readonly<Vec3> } => facing;

// ---------- routing (exported for long-lived loops that manage their own nodes) ----------

/** The room's send (every group's share of its sound) and where its reverb returns (the bus), or null while audio is off. */
export function roomBus(): { input: GainNode; output: GainNode } | null {
  return audio() && roomIn && bus ? { input: roomIn, output: bus } : null;
}

let occluder: ((pos: Vec3, d: number) => Occlusion | null) | null = null;

/** roomSfx.ts says how the walls muffle a sound at `pos`, `d` metres from the listener (null: no walls tracked). */
export function setOccluder(fn: ((pos: Vec3, d: number) => Occlusion | null) | null) {
  occluder = fn;
}

/** How the walls between the listener and `pos` muffle a sound there, or null when nothing's in the way. */
export const occlusionAt = (pos: Vec3, d = distance(ear, pos)) => occluder?.(pos, d) ?? null;

/** A PannerNode with the office's distance model, placed at `pos`. Connect it to groupOutput(). */
export function createPanner(c: BaseAudioContext, pos: Vec3) {
  const p = c.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = REF_DISTANCE;
  p.rolloffFactor = ROLLOFF;
  p.maxDistance = MAX_DISTANCE;
  setPannerPosition(p, pos.x, pos.y, pos.z);
  return p;
}

/** Moves a panner (safe to call every frame: allocates nothing). */
export function setPannerPosition(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}

registerSpatial({
  measure(pos, falloff) {
    const d = distance(ear, pos);
    return { gain: falloff ? falloff(d) : audible(d) ? distanceGain(d) : 0, pan: panOf(ear, earFwd, earUp, pos) };
  },
  hear(pos) {
    const d = distance(ear, pos);
    return audible(d) ? { near: distanceGain(d), walls: occlusionAt(pos, d) } : null;
  },
  route(c, pos, walls, dest) {
    let node: AudioNode = createPanner(c, pos);
    node.connect(dest);
    if (walls) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = walls.cutoff;
      f.Q.value = 0.5;
      f.connect(node);
      node = f;
    }
    return node;
  },
  wire(c, groups, b) {
    if (ctx === c) return;
    ctx = c;
    bus = b;
    roomIn = c.createGain();
    for (const g of SOUND_GROUPS) {
      if (ROOM_SENDS[g] <= 0) continue;
      const send = c.createGain();
      send.gain.value = ROOM_SENDS[g];
      groups[g].connect(send).connect(roomIn);
    }
    writeListener();
  },
  ears: () => ({ at: ear, fwd: earFwd }),
  anchorOf: (name) => (name === 'gong' && useStore.getState().floor !== 0 ? { x: GONG.x, y: GONG.y, z: GONG.z } : null),
  async detailOf(name) {
    if (!name.startsWith('jukebox:')) return undefined;
    const { SONGS } = await import('../world/jukeboxSongs');
    return SONGS.find((s) => `jukebox:${s.id}` === name)?.title;
  },
});

// ---------- the kitchenette fridge (world/KitchenFridge.tsx) ----------

/** The fridge's hum, quiet: a long-lived loop the fridge fades in and out (`level`, 0-1) and moves; `stop` ends it. */
export interface FridgeHum {
  level(v: number): void;
  stop(): void;
}

const HUM_PEAK = 0.012;

/** The compressor: a low 50 Hz buzz with its overtones through a lowpass, from a panner at `pos`. Null without audio. */
export function fridgeHum(pos: Vec3): FridgeHum | null {
  const a = audio();
  const out = groupOutput('toys');
  if (!a || !out) return null;
  try {
    const c = a.ctx;
    const env = c.createGain();
    env.gain.value = 0;
    const panner = createPanner(c, pos);
    env.connect(panner);
    const buzz = c.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 50;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 0.8;
    buzz.connect(lp).connect(env);
    const hum = c.createOscillator();
    hum.frequency.value = 100;
    const humG = c.createGain();
    humG.gain.value = 0.4;
    hum.connect(humG).connect(env);
    buzz.start();
    hum.start();
    let hooked = false;
    let level = 0;
    recordSfx('fridge:hum', { group: 'toys', pos, peak: HUM_PEAK, played: true });
    return {
      level(v) {
        if (Math.abs(v - level) < 0.02) return;
        level = v;
        if (v > 0 && !hooked) {
          panner.connect(out);
          hooked = true;
        }
        env.gain.setTargetAtTime(HUM_PEAK * v, c.currentTime, 0.25);
      },
      stop() {
        const t = c.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setTargetAtTime(0, t, 0.05);
        buzz.stop(t + 0.3);
        hum.stop(t + 0.3);
        buzz.onended = () => {
          try {
            panner.disconnect();
            env.disconnect();
          } catch {
            // already disconnected
          }
        };
      },
    };
  } catch {
    return null; // audio is optional
  }
}
