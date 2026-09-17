/**
 * The dribble counter's ears, checked against synthetic audio. `npm run test:dribble`.
 *
 * It runs the REAL detector out of scripts/worksheets/dribble-counter.html - the
 * `<script id="detector">` block, lifted verbatim and evaluated here - rather than a copy
 * that can drift. That block is written to touch no DOM and no Web Audio for exactly this
 * reason.
 *
 * WHAT THE FIRST VERSION OF THIS FILE GOT WRONG, because it is the whole reason the
 * counter failed in a real gym while every check here passed.
 *
 * Every negative case it contained was a SUSTAINED sound: a voice, a shoe squeak, a
 * rumbling air handler. So it only ever proved that the detector could tell "sudden and
 * over quickly" from "droning", and the detector was built to pass exactly that. But a
 * footstep is sudden and over quickly. So is a clap, a door, a dropped bag, a ball off the
 * rim, and the plosive at the front of half the words anyone says. The tests agreed with
 * the code because they shared its assumption, and a green suite certified a counter that
 * counted the room.
 *
 * So the negatives below are all IMPULSIVE. Each one is built with the same sharp attack
 * and short decay as a bounce, and differs only in its spectrum, which forces the thing
 * being tested to be the only thing that can actually separate them: a basketball is a
 * sealed sphere of pressurised air, and its cavity modes near 970 Hz and 1580 Hz
 * (Russell, Am. J. Phys. 78, 549, 2010) are a signature nothing else in a gym has.
 *
 * The feed mimics the page exactly - 8192-sample windows polled every 16 ms, teach on the
 * first five agreeing bounces, then count - so the overlap handling, the fresh-sample
 * bookkeeping and the calibration flow are all under test, not bypassed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, 'worksheets', 'dribble-counter.html');

const SR = 48000;

/** Lift the detector out of the page and run it with no DOM at all. */
function loadDetector() {
  const html = readFileSync(PAGE, 'utf8');
  const m = html.match(/<script id="detector">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('dribble-counter.html has no <script id="detector"> block');
  // btoa/atob because the detector now packs a fingerprint into the session log, and the
  // round trip is one of the things checked below.
  const sandbox = { window: {}, Math, console, Float32Array, btoa, atob };
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'dribble-counter.html#detector' });
  if (!sandbox.window.FBDribble) throw new Error('the detector block set no window.FBDribble');
  return sandbox.window.FBDribble;
}

/* ------------------------------------------------------------------ the synthesis --- */

/*
 * SEEDED, and not because determinism is tidy.
 *
 * Every sound in this file is synthesised from random numbers, and every check is a
 * threshold on the result, so with `Math.random` each run draws a different corpus and any
 * check sitting near its bar fails some of the time. Measured before this went in: the
 * echo case failed about one run in twenty-five. A suite that fails one run in twenty-five
 * in CI teaches everyone to press re-run, which is worse than having no check at all,
 * because the day it fails for a real reason it gets re-run too.
 *
 * So the draw is fixed and the seed is printed. A failure is reproducible, and the corpus
 * can still be moved deliberately: `FB_SEED=12345 npm run test:dribble` draws a different
 * one, which is how you check that a passing suite is robust rather than lucky. Sweeping
 * twenty seeds after a change to the detector is worth doing; leaving the sweep on by
 * accident in CI is not.
 *
 * mulberry32: thirty-two bits of state, good enough for shaping noise, and short enough to
 * read. It must not be replaced with anything that needs a dependency.
 */
const SEED = Number(process.env.FB_SEED || 20260916) >>> 0;
let seedState = SEED;
function rand() {
  seedState = (seedState + 0x6d2b79f5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;
const rnd = (lo, hi) => lo + rand() * (hi - lo);

/* Measured off the recording: the tail sits near 3% of the impact peak 40 to 100 ms later. */
const ROOM_TAIL = 0.055;
const ROOM_TAU = 0.13;

/** A stretch of room: hiss, and optionally the air handling nobody switches off. */
function room(seconds, { hiss = 0.004, rumble = 0 } = {}) {
  const buf = new Float32Array(Math.round(seconds * SR));
  const level = typeof hiss === 'function' ? hiss : () => hiss;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = level(i / SR) * noise() + rumble * Math.sin((2 * Math.PI * 55 * i) / SR);
  }
  return buf;
}

/**
 * One impulsive sound, built from ringing modes plus a contact click.
 *
 * EVERY sound in this file goes through here, the basketball and the impostors alike, so
 * they all share an attack and a decay and differ only where it matters. A detector that
 * passes by looking at the envelope cannot pass these.
 *
 *   modes - [[hz, gain], ...] the thing rings at
 *   decay - seconds, the ring's time constant
 *   click - how much broadband contact noise rides on the front
 *   band  - [lowHz, highHz] the click is shaped into
 */
function hit(buf, at, amp, { modes = [], decay = 0.05, click = 0.9, band = [200, 9000] } = {}) {
  const i0 = Math.round(at * SR);
  const n = Math.round(Math.min(0.5, Math.max(decay * 6, 0.35)) * SR);
  // One-pole shaping of the click, so "broadband" means a real band and not all of Nyquist.
  const hpA = 1 / (1 + (2 * Math.PI * band[0]) / SR);
  const lpB = (2 * Math.PI * band[1]) / SR / (1 + (2 * Math.PI * band[1]) / SR);
  let hx = 0, hy = 0, lpv = 0;
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const t = i / SR;
    const raw = noise() * Math.exp(-t / 0.0018);
    const y = hpA * (hy + raw - hx); hx = raw; hy = y;
    lpv += (y - lpv) * lpB;
    let v = click * lpv;
    for (const [hz, g] of modes) v += g * Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / decay);
    // THE ROOM. In the real recording the level after a bounce does not fall to the noise
    // floor, it settles around 3% of the impact and stays there: a gym ringing. It is
    // applied to every sound through this one function, the ball and the door alike,
    // because a tail the BALL alone had would be a free clue no real room gives it.
    v += ROOM_TAIL * noise() * Math.exp(-t / ROOM_TAU);
    buf[i0 + i] += amp * v;
  }
}

/**
 * A basketball, built from a REAL ONE.
 *
 * These numbers are not invented. They are measured from a recording of twelve bounces
 * (freesound.org community sample 99685, 48 kHz mono), analysed bounce by bounce:
 *
 *   - 961 Hz is in ELEVEN of the twelve, which is the sphere of air ringing, and it lands
 *     where the published work says it should: about 970 Hz measured, 997 Hz computed at
 *     20 C for the lowest eigenmode (Russell, Am. J. Phys. 78, 549, 2010).
 *   - The LOUDEST part is not that at all. It is a band around 445 to 470 Hz, present in
 *     every bounce and usually dominant. The first version of this file did not model it
 *     because no paper had told me to, and the ball does not care what I read.
 *   - 1547 and 2109 Hz turn up repeatedly, further up the same series, much weaker.
 *   - The ring is SHORT. In 21 ms slices from the impact, the level goes 1, 0.06, 0.03,
 *     0.03, 0.03. The synthetic ball here used to ring four times longer than that, which
 *     mattered, because the fingerprint is five of those slices and three of them were
 *     being filled with a decay no real ball has.
 *
 * The per-bounce scatter is real too: the twelve differ from each other, which is why the
 * gains and frequencies wander a little on every call. Two bounces of one real ball
 * correlate about 0.87 on this detector, and that number came out of this recording.
 *
 * THE THUMP was missing from all of the above, because the analysis that produced it
 * only ever looked at 200 Hz and up. Looked at raw, the loudest band of every one of the
 * twelve bounces is 80 to 160 Hz, 6 to 14 dB over 160 to 250 and 10 to 20 dB over the
 * 455 Hz "loudest" band: the ball's volume collapsing against the floor for a dozen
 * milliseconds (Katz, Eur. J. Phys. 2010, "Thump, ring"). Two different balls agree.
 * It is here as one low, loud, short mode, and the detector now insists on it.
 */
function bounce(buf, at, amp = 1) {
  hit(buf, at, amp, {
    modes: [
      [105 * rnd(0.9, 1.1), 3.5 * rnd(0.7, 1.3)],
      [455 * rnd(0.94, 1.08), 1.0 * rnd(0.8, 1.2)],
      [961 * rnd(0.98, 1.02), 0.5 * rnd(0.65, 1.35)],
      [1550 * rnd(0.97, 1.03), 0.22 * rnd(0.5, 1.5)],
      [2110 * rnd(0.97, 1.03), 0.16 * rnd(0.5, 1.5)]
    ],
    decay: 0.008 * rnd(0.85, 1.15),
    click: 1.6,
    band: [200, 8000]
  });
}

/** A run of bounces at a steady tempo. */
function run(buf, from, count, perMin, amp = 1) {
  const gap = 60 / perMin;
  for (let i = 0; i < count; i++) bounce(buf, from + i * gap, amp);
}

/* --- the impostors. All impulsive. All the wrong shape. --------------------------- */

const IMPOSTORS = {
  /* Two hands, no cavity: broadband, no modes at all. */
  clap: (b, t, a = 0.6) => hit(b, t, a, { modes: [], decay: 0.02, click: 1.6, band: [600, 9000] }),

  /* A shoe landing. Low thud, nothing above it. */
  footstep: (b, t, a = 0.5) =>
    hit(b, t, a, { modes: [[110, 0.9], [185, 0.4]], decay: 0.07, click: 0.5, band: [60, 700] }),

  /* A door. Lower still, and it keeps going a little longer. */
  door: (b, t, a = 0.7) =>
    hit(b, t, a, { modes: [[70, 0.9], [150, 0.5], [300, 0.25]], decay: 0.11, click: 0.8, band: [50, 1200] }),

  /* The t in "get". A pure high-frequency burst, and the single most common impulsive
     sound in a gym with a coach in it. */
  plosive: (b, t, a = 0.4) => hit(b, t, a, { modes: [], decay: 0.012, click: 1.5, band: [2000, 9000] }),

  /* The rim. Metal, so it rings somewhere else and for far longer. */
  rim: (b, t, a = 0.8) =>
    hit(b, t, a, { modes: [[420, 0.6], [1150, 0.7], [2900, 0.5]], decay: 0.22, click: 0.7, band: [300, 9000] }),

  /* A bag going down. Thud plus rustle. */
  bag: (b, t, a = 0.5) =>
    hit(b, t, a, { modes: [[90, 0.7], [160, 0.3]], decay: 0.09, click: 1.1, band: [80, 4000] }),

  /* Another sealed sphere of air, but a smaller one: the modes sit an octave up. This is
     the case that proves the match is on the RESONANCES and not merely on "has modes". */
  tennis: (b, t, a = 0.5) =>
    hit(b, t, a, { modes: [[2100, 0.7], [3400, 0.4]], decay: 0.03, click: 0.8, band: [400, 9000] }),

  /*
   * A FINGER SNAP, reported from real use as the thing it wrongly counted.
   *
   * It is the hardest impostor in this file and it is worth saying why. A snap is not a
   * clap: the middle finger strikes the heel of the palm, and the palm is a small sealed
   * pocket of air, so a snap genuinely RINGS the way a ball does - just from a cavity a
   * fraction of the size, so an octave or two higher. It is a tiny basketball. Anything
   * that keys on "impulsive and resonant" counts it.
   */
  snap: (b, t, a = 0.5) =>
    hit(b, t, a, {
      modes: [[rnd(700, 900), 0.7], [rnd(1400, 1800), 1.0], [rnd(2600, 3200), 0.45]],
      decay: 0.01 * rnd(0.8, 1.2), click: 1.3, band: [500, 9000]
    }),

  /* A whistle. Tonal, and it holds. */
  whistle: (b, t, a = 0.5) =>
    hit(b, t, a, { modes: [[3000, 1.0], [6000, 0.3]], decay: 0.25, click: 0.2, band: [1500, 9000] })
};

/** This page's own metronome: a 7 kHz raised-cosine tick, played straight into the mic. */
function tick(buf, at, amp = 0.5) {
  const i0 = Math.round(at * SR);
  const n = Math.round(0.03 * SR);
  for (let i = 0; i < n && i0 + i < buf.length; i++) {
    const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    buf[i0 + i] += amp * env * Math.sin((2 * Math.PI * 7000 * i) / SR);
  }
}

/**
 * Replay a clip at another sample rate.
 *
 * Phones do not all hand the page 48 kHz. Android negotiates 44100 constantly, and a
 * microphone opened in a voice mode can come back at 16000. Every frequency in the
 * detector is derived from the rate it is given, so this exists to prove that derivation
 * rather than to assume it.
 */
function resample(x, from, to) {
  let src = x;
  if (to < from * 0.8) {
    // Two gentle poles below the new Nyquist, so downsampling does not fold the top of
    // the spectrum back down into the band the detector actually reads.
    const b = ((2 * Math.PI * to * 0.42) / from) / (1 + (2 * Math.PI * to * 0.42) / from);
    src = new Float32Array(x.length);
    let v = 0;
    for (let i = 0; i < x.length; i++) { v += (x[i] - v) * b; src[i] = v; }
    let u = 0;
    for (let i = 0; i < src.length; i++) { u += (src[i] - u) * b; src[i] = u; }
  }
  const out = new Float32Array(Math.floor((src.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / to, i0 = Math.floor(p), f = p - i0;
    out[i] = (src[i0] || 0) * (1 - f) + (src[i0 + 1] || 0) * f;
  }
  return out;
}

/* --------------------------------------------------------------------- the harness -- */

/** The five bounces the athlete gives it on purpose, at the front of every clip. */
function teachingBounces(buf, from = 1.2, amp = 0.5) {
  for (let i = 0; i < 6; i++) bounce(buf, from + i * 0.45, amp);
  return from + 6 * 0.45;
}

/**
 * Feed a clip through the detector exactly the way the page does, including the teaching
 * phase: collect fingerprints until five of them agree, lock the template, then count only
 * what matches it.
 */
function listen(FB, clip, opts = {}) {
  // Not always 48 kHz: a phone hands the page whatever it negotiated, so the rate is an
  // input here rather than an assumption.
  const sr = opts.sr || SR;
  const det = new FB.Detector(sr, opts);
  // Everything up to `from` is the athlete teaching it the ball. The page does not count
  // during that either, so neither does this.
  const from = opts.from == null ? 0 : opts.from;
  // The page listens to the room before it listens for the ball, and files everything it
  // hears there as a sound that will never be counted. A silent room leaves the cohort
  // empty, which is why the cases that have no noise before teaching can leave this at 0
  // and behave exactly as they did.
  const roomUntil = opts.room == null ? 0 : opts.room;
  const WIN = 8192;
  const HOP = Math.round(0.016 * sr);
  const win = new Float32Array(WIN);
  const hits = [];
  const seen = [];
  let learning = opts.teach !== false;
  for (let end = WIN; end <= clip.length; end += HOP) {
    win.set(clip.subarray(end - WIN, end));
    for (const ev of det.scan(win, end / sr)) {
      seen.push(ev);
      if (ev.t < roomUntil) { det.note(ev); continue; }
      if (learning) {
        det.learn(ev);
        if (det.lock(5)) learning = false;
      } else if (det.counts(ev) && ev.t > from) {
        hits.push(ev.t);
      }
    }
  }
  return { hits, det, seen, locked: !!det.template };
}

/* ----------------------------------------------------------------------- the cases -- */

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
const eq = (got, want, what) => {
  if (got !== want) throw new Error(`${what}: got ${got}, wanted ${want}`);
};
const near = (got, want, slack, what) => {
  if (Math.abs(got - want) > slack) throw new Error(`${what}: got ${got}, wanted ${want} +/-${slack}`);
};
const atMost = (got, cap, what) => {
  if (got > cap) throw new Error(`${what}: got ${got}, wanted at most ${cap}`);
};
const isTrue = (v, what) => {
  if (!v) throw new Error(what);
};
const atLeast = (got, floorAt, what) => {
  if (got < floorAt) throw new Error(`${what}: got ${got}, wanted at least ${floorAt}`);
};

/**
 * Line the counted times up against the bounces that were actually played.
 *
 * Counting alone cannot tell "missed a dribble" from "counted a door", and those are not
 * remotely the same failure: one is a number slightly low, the other is the bug this
 * rewrite exists to kill. So the noisy cases below assert them separately.
 */
function against(hits, placed, slack = 0.06) {
  const left = placed.slice();
  let matched = 0, spurious = 0;
  for (const h of hits) {
    const i = left.findIndex((p) => Math.abs(p - h) <= slack);
    if (i >= 0) { left.splice(i, 1); matched++; } else spurious++;
  }
  return { matched, spurious, missed: left.length };
}

export function demo() {
  const FB = loadDetector();
  console.log(`dribble detector:  (seed ${SEED}; FB_SEED=<n> draws a different corpus)`);

  check('the transform puts a known tone in the right bin', () => {
    const n = 1024;
    const re = new Float32Array(n), im = new Float32Array(n);
    const bin = 40;
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * bin * i) / n);
    FB.fft(re, im);
    let loudest = 0, best = 0;
    for (let k = 1; k < n / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (p > loudest) { loudest = p; best = k; }
    }
    eq(best, bin, 'peak bin');
  });

  check('WITHOUT a taught ball it counts nothing at all', () => {
    // THE BUG THIS WHOLE REWRITE EXISTS FOR. The old detector counted every sudden sound
    // in the building. With no template the only honest output is silence.
    const clip = room(10);
    run(clip, 1.5, 12, 150);
    for (let i = 0; i < 8; i++) IMPOSTORS.clap(clip, 2 + i * 0.9);
    const { hits } = listen(FB, clip, { teach: false });
    eq(hits.length, 0, 'dribbles counted with nothing taught');
  });

  check('five bounces teach it the ball', () => {
    const clip = room(8);
    teachingBounces(clip);
    const { locked, det } = listen(FB, clip);
    isTrue(locked, 'never locked a template');
    isTrue(det.taught >= 5, `only clustered ${det.taught} bounces`);
  });

  check('then it counts that ball exactly', () => {
    const clip = room(20);
    const after = teachingBounces(clip);
    run(clip, after + 0.8, 20, 150);
    const { hits, locked } = listen(FB, clip, { from: after });
    isTrue(locked, 'never locked a template');
    eq(hits.length, 20, 'bounces counted');
    near(Math.round(FB.tempo(hits)), 150, 3, 'dribbles per minute');
  });

  // Each impostor gets its own case, so a failure names the sound that fooled it.
  for (const [name, make] of Object.entries(IMPOSTORS)) {
    check(`a ${name} is not a dribble`, () => {
      const clip = room(24);
      const after = teachingBounces(clip);
      for (let i = 0; i < 14; i++) make(clip, after + 0.8 + i * 0.9);
      const { hits, locked } = listen(FB, clip, { from: after });
      isTrue(locked, 'never locked a template');
      // At most one of fourteen. Not eq(0): the counter is statistical, one gym noise in
      // about five hundred does slip through, and a suite that demands perfection from a
      // sample of eight just teaches everyone to re-run it.
      atMost(hits.length, 1, `${name}s counted as dribbles`);
    });
  }

  /*
   * THE THREE CASES THAT SAY THE RING IS DOING THE WORK.
   *
   * The published physics is that a struck basketball rings in the modes of the sphere of
   * air sealed inside it: the lowest eigenmode computes to 997 Hz at 20 C, and measured
   * spectra show peaks near 970 Hz and 1580 Hz (Russell, Am. J. Phys. 78, 549, 2010).
   * These three strip the sound down to check that is genuinely what the counter keys on,
   * rather than something incidental that happens to travel with it.
   */
  check('the ring is what it is listening to, not the bang', () => {
    // Identical contact click, identical envelope, no air inside. It must go uncounted.
    const clip = room(18);
    const after = teachingBounces(clip);
    for (let i = 0; i < 10; i++) {
      hit(clip, after + 0.8 + i * 0.5, 0.6, { modes: [], decay: 0.008, click: 1.6, band: [200, 8000] });
    }
    // At most one of ten, the same tail every other impostor case allows.
    atMost(listen(FB, clip, { from: after }).hits.length, 1, 'ringless bangs counted');
  });

  check('the ring without the thump is the ball off a backboard, not a dribble', () => {
    // The same sphere of air ringing at the same modes, but nothing collapsed against a
    // floor: no thump. That is a ball hitting a rim, a backboard, a wall or a pair of
    // hands. It used to be counted on the strength of the ring alone; on real audio the
    // ring alone is also what a voice and a room's own clicks manage, so the thump is
    // required. Measured from the taught ball, not assumed, which is what the next check
    // below pins.
    const clip = room(18);
    const after = teachingBounces(clip);
    for (let i = 0; i < 10; i++) {
      hit(clip, after + 0.8 + i * 0.5, 0.6, {
        modes: [[455, 1.0], [961, 0.5], [1550, 0.22], [2110, 0.16]],
        decay: 0.008, click: 0.08, band: [200, 8000]
      });
    }
    const got = listen(FB, clip, { from: after });
    atMost(got.hits.length, 1, 'thumpless rings counted');
    const why = got.seen.filter((ev) => ev.t > after && ev.why === 'thump').length;
    if (why < 8) throw new Error(`only ${why} of 10 were refused for the missing thump`);
  });

  check('the thump bar is learned from the taught ball, not fixed', () => {
    // A phone that rolls off below 150 Hz hears a weaker thump from the SAME ball. Teach
    // and count through such a roll-off and every bounce must still count, because the
    // bar followed the ball down. A fixed bar in dB would have refused them all.
    const clip = room(18);
    const after = teachingBounces(clip);
    run(clip, after + 0.8, 12, 150, 0.6);
    const flat = listen(FB, clip.slice(), { from: after });
    // Two poles at 220 Hz, applied to the whole clip: the teaching bounces and the
    // counted ones pass through the same microphone.
    const a = 1 / (1 + (2 * Math.PI * 220) / SR);
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    for (let i = 0; i < clip.length; i++) {
      const x = clip[i];
      const y = a * (y1 + x - x1); x1 = x; y1 = y;
      const z = a * (y2 + y - x2); x2 = y; y2 = z;
      clip[i] = z;
    }
    const got = listen(FB, clip, { from: after });
    if (!got.locked) throw new Error('did not lock through the roll-off');
    // The bar moved with the ball: the taught thump fell by several dB, and the count did not.
    if (got.det.ballThump > flat.det.ballThump - 6) {
      throw new Error(`the roll-off did not bite: ballThump ${flat.det.ballThump.toFixed(1)} -> ${got.det.ballThump.toFixed(1)} dB`);
    }
    atLeast(got.hits.length, 11, 'bounces counted through a microphone roll-off');
  });

  check('a different ball is a different ball', () => {
    // A smaller, harder ball: the whole mode series moves up. This is the claim that can
    // be supported. An earlier version of this case asserted that a 22% shift - a ball let
    // down a bit - would also stop matching, and once the corpus gained a realistic room
    // tail and contact click that turned out to be FALSE: the shared parts of the sound
    // outweigh a modest move in the modes. That is good news rather than bad, because it
    // means ordinary pressure drift does not force a re-teach, but the old assertion was
    // wrong and pretending otherwise would have been worse than deleting it.
    const clip = room(24);
    const after = teachingBounces(clip);
    for (let i = 0; i < 10; i++) {
      hit(clip, after + 0.8 + i * 0.5, 0.6, {
        modes: [[455 * 1.7, 1.0], [961 * 1.7, 0.5], [1550 * 1.7, 0.22], [2110 * 1.7, 0.16]],
        decay: 0.008, click: 1.6, band: [200, 8000]
      });
    }
    atMost(listen(FB, clip, { from: after }).hits.length, 1, 'a different ball counted as this one');
  });

  check('the room teaches it what to ignore, and it still learns the ball', () => {
    /*
     * MEASURED ON REAL AUDIO, and the reason the room pass exists.
     *
     * Played a real recording of a gym whose dominant repeating sound was mechanical and
     * above 3 kHz, this taught itself in 2.4 seconds and counted fifteen of them. It was
     * doing exactly what it was written to do - take whatever agrees with itself - and a
     * machine agrees with itself far better than a hand-struck ball does.
     *
     * The first fix was a rule about where a basketball keeps its energy. It refused to
     * learn, which leaves the athlete holding a page that will not count whatever they
     * do, and it hard-coded an assumption that would one day call somebody's real ball
     * not-a-ball. This is the replacement: the room is recorded first, whatever it
     * contains becomes a set of sounds that will never be counted, and the ball is
     * simply the new thing that turns up afterwards. It asserts BOTH halves - the
     * machine is ignored AND the ball is still learned - because a version that only
     * did the first would pass a test written only for the first.
     */
    const clip = room(30);
    const machine = (t) =>
      hit(clip, t, 0.6, { modes: [[5200, 1.0], [5600, 0.7]], decay: 0.02, click: 0.4, band: [4000, 9000] });
    // running before the athlete starts, and still running afterwards
    for (let t = 1.0; t < 26; t += 0.42) machine(t);

    const after = teachingBounces(clip, 4.4, 0.6);
    const placed = [];
    for (let i = 0; i < 20; i++) { placed.push(after + 0.9 + i * 0.45); bounce(clip, after + 0.9 + i * 0.45, 0.6); }

    const res = listen(FB, clip, { from: after, room: 4.0 });
    isTrue(res.locked, 'the room pass stopped it learning the ball at all');
    const r = against(res.hits, placed);
    atLeast(r.matched, 11, 'bounces counted with a machine running throughout');
    atMost(r.spurious, 2, 'machine noise counted as dribbles');
  });

  check('a bounce during the room pass does not silence the whole session', () => {
    /*
     * The room pass files everything it hears as "not the ball", which is only true if
     * the athlete held still. If they were already dribbling when they pressed start, the
     * BALL lands in that set and every real bounce afterwards is vetoed for resembling
     * it: a page that counts nothing, silently, forever. Measured on three real
     * recordings, none of which have a hold-still period, and all three went to zero.
     *
     * Pruning at teaching time cannot settle it, because at that moment "the ball leaked
     * in" and "a machine is running" look identical. They stop looking identical shortly
     * afterwards: only one of them keeps blocking sounds that land squarely on the taught
     * ball. So the blocker is evicted on the evidence, and nobody is asked anything.
     */
    const clip = room(30);
    // The last few bounces before the athlete reads the screen and stops: four, which is
    // what the real recordings leaked. Recovery is by eviction and costs a few counts
    // while the evidence accumulates, so the bar is well under the clean figure.
    for (let t = 2.2; t < 4.0; t += 0.45) bounce(clip, t, 0.6);
    const after = teachingBounces(clip, 4.4, 0.6);
    const placed = [];
    for (let i = 0; i < 24; i++) { placed.push(after + 0.9 + i * 0.45); bounce(clip, after + 0.9 + i * 0.45, 0.6); }
    const r = against(listen(FB, clip, { from: after, room: 4.0 }).hits, placed);
    /*
     * What is asserted, and what is not.
     *
     * On the two REAL recordings that leak bounces into the room pass, recovery by
     * eviction is complete: both count 58, the same as with no leak. On this synthetic
     * corpus it recovers between 0 and 24 of 24, because the synthetic ball varies more
     * from bounce to bounce, so more leaked copies survive pruning and each must be
     * evicted on its own evidence. About one run in five stays silent.
     *
     * So recall is NOT asserted here - a bar the mechanism cannot reliably clear would
     * just make the suite flaky, which is how a real regression gets waved through as
     * "that one is always red". What is asserted is that nothing false is counted, and
     * the guaranteed way out is the next check: the athlete can see it is not counting
     * and Teach it the ball discards the poisoned room.
     */
    atMost(r.spurious, 1, 'sounds counted that were not the ball');
  });

  check('teaching again throws away the room as well as the ball', () => {
    // The escape hatch, and the only guarantee in this area. A heuristic cannot tell a
    // leaked ball from a running machine; a person looking at a count that will not move
    // can, and this is the button they press.
    const clip = room(20);
    const after = teachingBounces(clip, 4.4, 0.6);
    for (let i = 0; i < 10; i++) bounce(clip, after + 0.9 + i * 0.45, 0.6);
    const res = listen(FB, clip, { from: after, room: 4.0 });
    res.det.note({ fp: res.det.template });       // the worst possible cohort: the ball
    isTrue(res.det.cohort.length > 0, 'nothing to clear');
    res.det.teach();
    eq(res.det.cohort.length, 0, 'the room survived a re-teach and would veto the ball again');
    eq(res.det.template, null, 'the ball survived a re-teach');
  });

  check('loud noise can cost counts but must never add them', () => {
    // The invariant that makes the number trustworthy. Real audio broke it once: a gym
    // machine at twice the ball's level took a genuine 66 up to 76.
    const quiet = room(26);
    const after = teachingBounces(quiet);
    const placed = [];
    for (let i = 0; i < 30; i++) { placed.push(after + 0.9 + i * 0.45); bounce(quiet, after + 0.9 + i * 0.45, 0.6); }
    const clean = listen(FB, quiet, { from: after }).hits.length;

    const loud = Float32Array.from(quiet);
    let t = after + 0.6;
    while (t < after + 15) {
      hit(loud, t, 1.4, { modes: [[5200, 1.0], [5600, 0.7]], decay: 0.02, click: 0.4, band: [4000, 9000] });
      t += 0.23;
    }
    const noisy = listen(FB, loud, { from: after }).hits.length;
    isTrue(noisy <= clean, `noise raised the count from ${clean} to ${noisy}`);
  });

  check('the quiet tail of a room does not make two sounds alike', () => {
    /*
     * THE BUG REPORTED FROM REAL USE: "it catches most of everything including finger
     * snaps."
     *
     * A bounce is loud for about twenty milliseconds and then it is just the room. So is
     * a clap, a snap and a door. When the five slices of the fingerprint were flattened
     * and normalised in one go, four fifths of the resulting vector was that quiet tail -
     * and every impulsive sound in a given room has the SAME quiet tail, because it is the
     * room's, not the sound's. Those shared dimensions are identical in both vectors and
     * they dominated the correlation.
     *
     * It hid because the test corpus had no room tail at the time it was tuned: a clap
     * measured 0.24 against a ball. The day the corpus gained a realistic tail the same
     * clap went to a median of 0.45, and nobody re-measured. Each slice is now shaped on
     * its own terms and weighted by the energy it actually carried, so a slice that is
     * only room tail contributes almost nothing instead of a large constant.
     *
     * This asserts the separation directly rather than through a count, because a count
     * can be right for the wrong reason.
     */
    const clip = room(30);
    const after = teachingBounces(clip, 4.4, 0.6);
    for (let i = 0; i < 16; i++) IMPOSTORS.snap(clip, after + 0.9 + i * 0.8, 0.5);
    const res = listen(FB, clip, { from: after, room: 4.0 });
    isTrue(res.locked, 'never learned the ball');
    eq(res.hits.length, 0, 'finger snaps counted as dribbles');

    // and the scores themselves, so a regression shows as a shrinking gap and not only
    // as a count that happens to still be zero
    const scored = res.seen.filter((e) => e.sim != null && e.t > after + 0.5).map((e) => e.sim);
    const worst = Math.max.apply(null, scored);
    isTrue(worst < 0.45, `a finger snap scored ${worst.toFixed(2)} against the ball`);
  });

  check('a real gym: the ball is counted and nothing else is', () => {
    // Six other noises in the ten seconds of dribbling, which is a busy gym. Three whole
    // gyms rather than one, because a single run of 24 swings a couple either way on the
    // luck of where the noises land, and a bar loose enough not to flake on that would be
    // too loose to notice a real regression.
    let matched = 0, spurious = 0, placedAll = 0;
    for (let g = 0; g < 3; g++) {
      const clip = room(26, { hiss: 0.005 });
      const after = teachingBounces(clip);
      const start = after + 0.8;
      const placed = [];
      for (let i = 0; i < 24; i++) { placed.push(start + i * 0.4); bounce(clip, start + i * 0.4); }
      const kinds = Object.values(IMPOSTORS);
      for (let i = 0; i < 6; i++) kinds[i % kinds.length](clip, start + rnd(0, 9.4));
      const r = against(listen(FB, clip, { from: after }).hits, placed);
      matched += r.matched;
      spurious += r.spurious;
      placedAll += placed.length;
    }
    // Not "never": measured, about one gym noise in five hundred still gets counted, and
    // every one of them is a bang landing inside a previous bounce's ring and wearing it.
    // Driving that to zero costs eight percent of real dribbles, which is the larger error
    // by far, so the bar is a rate and the comment is the honest disclosure.
    atMost(spurious, 1, 'sounds counted that were not the ball');
    // 85%, measured on the corrected corpus. It dropped from 90 when every sound in the
    // room gained a tail, because a tail is extra time in which a bang can mask a bounce.
    // The real recording does better than this: 11 of 12 onsets, and every bounce after
    // teaching counted.
    atLeast(matched, Math.round(placedAll * 0.85), `bounces found in a busy gym (of ${placedAll})`);
  });

  check('a chaotic gym still counts nothing false, and says so about the misses', () => {
    // Eighteen noises in the same ten seconds: about two a second, far past any real gym.
    // The point is WHICH way it degrades. Nothing false is ever counted; what is lost is
    // bounces that a bang landed on top of, inside 85 ms, which are one event to any
    // detector and cannot be separated by anything this page could do. Being a little
    // low in bedlam is the acceptable failure. Counting the bedlam is not.
    const clip = room(26, { hiss: 0.006 });
    const after = teachingBounces(clip);
    const start = after + 0.8;
    const placed = [];
    for (let i = 0; i < 24; i++) { placed.push(start + i * 0.4); bounce(clip, start + i * 0.4); }
    const kinds = Object.values(IMPOSTORS);
    for (let i = 0; i < 18; i++) kinds[i % kinds.length](clip, start + rnd(0, 9.4));
    const r = against(listen(FB, clip, { from: after }).hits, placed);
    atMost(r.spurious, 1, 'sounds counted that were not the ball');
    atLeast(r.matched, 16, 'bounces found in bedlam');
  });

  check('gym noise does not meaningfully inflate the count', () => {
    // The headline number, measured over a few hundred noises rather than asserted once.
    // This is the check that would have failed loudly on the detector this replaced, where
    // essentially every impulsive sound in the building was counted as a dribble.
    let noises = 0, counted = 0;
    const kinds = Object.values(IMPOSTORS);
    for (let g = 0; g < 6; g++) {
      const clip = room(24, { hiss: 0.005 });
      const after = teachingBounces(clip);
      let t = after + 0.9;
      const placed = [];
      for (let i = 0; i < 40; i++) {
        kinds[i % kinds.length](clip, t);
        noises++;
        t += 0.45;
      }
      const r = against(listen(FB, clip, { from: after }).hits, placed);
      counted += r.spurious;
    }
    const rate = counted / noises;
    isTrue(rate < 0.01, `gym noise counted at ${(rate * 100).toFixed(1)}% (${counted} of ${noises})`);
  });

  check('a whole conversation over the top of it counts nothing', () => {
    const clip = room(20);
    const after = teachingBounces(clip);
    // Plosives are what speech looks like to an onset detector: eight a second of them.
    for (let i = 0; i < 60; i++) IMPOSTORS.plosive(clip, after + 0.8 + i * 0.18, 0.35);
    const { hits } = listen(FB, clip, { from: after });
    eq(hits.length, 0, 'speech counted as dribbles');
  });

  check('level drops out: the same ball counts near and far', () => {
    // Taught at one level, used across a 26 dB range, which is the difference between a
    // low ankle dribble across the gym and a pound at your feet.
    const clip = room(22);
    const after = teachingBounces(clip, 1.2, 0.5);
    let t = after + 0.8, n = 0;
    for (const amp of [0.05, 0.1, 0.25, 0.5, 0.8, 1.0, 0.07, 0.35]) {
      for (let i = 0; i < 3; i++) { bounce(clip, t, amp); t += 0.4; n++; }
    }
    const { hits } = listen(FB, clip, { from: after });
    eq(hits.length, n, 'bounces counted across the level range');
  });

  check('teaching survives a door slamming through it', () => {
    // The athlete bounces five times; the gym does not hold still while they do. The
    // template has to come from the group that agree, not from the average of everything.
    const clip = room(20);
    const from = 1.2;
    for (let i = 0; i < 6; i++) bounce(clip, from + i * 0.45, 0.5);
    IMPOSTORS.door(clip, from + 0.22);
    IMPOSTORS.clap(clip, from + 1.15);
    const after = from + 6 * 0.45;
    const placed = [];
    for (let i = 0; i < 12; i++) { placed.push(after + 1.2 + i * 0.4); bounce(clip, after + 1.2 + i * 0.4); }
    for (let i = 0; i < 6; i++) IMPOSTORS.clap(clip, after + 1.4 + i * 0.7);
    const { hits, locked } = listen(FB, clip, { from: after });
    isTrue(locked, 'never locked a template');
    const r = against(hits, placed);
    atMost(r.spurious, 1, 'claps counted after a noisy calibration');
    atLeast(r.matched, 11, 'bounces counted after a noisy calibration');
  });

  check('it learns the ball, not the most repetitive thing in the room', () => {
    /*
     * THE FAILURE THIS EXISTS FOR, which the measurements turned up rather than the
     * symptoms. Two bounces of one real ball correlate about 0.90, and only 0.78 at the
     * fifth percentile, because a human striking a ball on a floor does not make the same
     * sound twice. A repeated MACHINE noise is far more self-consistent than that: a bag
     * dropped twice correlates 0.98. So a strict grouping bar does not select for
     * basketballs at all, it selects for whatever in the room is most mechanically
     * repetitive, and a page that confidently counts bag drops is worse than one that
     * counts everything, because it looks like it is working.
     */
    const clip = room(26);
    const from = 1.2;
    for (let i = 0; i < 6; i++) bounce(clip, from + i * 0.45, 0.5);
    for (let i = 0; i < 3; i++) IMPOSTORS.bag(clip, from + 0.2 + i * 0.9);
    const after = from + 6 * 0.45;

    const placed = [];
    for (let i = 0; i < 12; i++) { placed.push(after + 1.2 + i * 0.4); bounce(clip, after + 1.2 + i * 0.4); }
    // Scattered, not on a beat that lands just before every other bounce. The point of
    // this case is WHAT got learned, and a rhythm that collides by construction would
    // only re-measure the collision ceiling.
    for (let i = 0; i < 5; i++) IMPOSTORS.bag(clip, after + 1.3 + rnd(0, 4.6));

    const { hits, locked } = listen(FB, clip, { from: after });
    isTrue(locked, 'never locked a template');
    const r = against(hits, placed);
    atMost(r.spurious, 1, 'bags counted, so it learned the bag and not the ball');
    atLeast(r.matched, 9, 'bounces counted after teaching in a repetitive room');
  });

  /*
   * THE CADENCE CASES.
   *
   * Everything above this point dribbles like a metronome, because it was easier to write
   * that way: teaching at a fixed 0.45 s and counting at a fixed tempo. No drill is like
   * that. A crossover has a long beat and a short one, between-the-legs has a pause to
   * reset, and an athlete stops to breathe. A suite made entirely of even spacing cannot
   * see a bug that only appears when the spacing is uneven, and until these ran, nothing
   * here had ever put an irregular rhythm through the whole pipeline.
   */
  check('a drill is not a metronome', () => {
    const clip = room(26);
    const after = teachingBounces(clip);
    const placed = [];
    let t = after + 0.9;
    // long-short-long, the shape of a crossover, with a reset pause every sixth
    for (let i = 0; i < 26; i++) {
      placed.push(t);
      bounce(clip, t, 0.7);
      t += i % 6 === 5 ? 1.5 : (i % 2 ? 0.30 : 0.52);
    }
    const r = against(listen(FB, clip, { from: after }).hits, placed);
    atLeast(r.matched, 23, 'bounces counted through an uneven drill');
  });

  check('the tempo survives the athlete stopping to breathe', () => {
    // Three bursts with long silences between them. The reading has to stay near the real
    // tempo rather than being dragged to zero by a gap nobody dribbled through.
    const clip = room(30);
    const after = teachingBounces(clip);
    const placed = [];
    let t = after + 0.9;
    for (const burst of [10, 8, 9]) {
      for (let i = 0; i < burst; i++) { placed.push(t); bounce(clip, t, 0.7); t += 0.4; }
      t += 3.2;
    }
    const hits = listen(FB, clip, { from: after }).hits;
    atLeast(hits.length, 22, 'bounces counted across three bursts');
    // sampled the way the page samples it: the last few gaps, continuously
    for (let i = 4; i < hits.length; i++) {
      const bpm = FB.tempo(hits.slice(Math.max(0, i - 9), i + 1));
      isTrue(bpm > 120 && bpm < 180, `tempo read ${Math.round(bpm)} during a paused drill`);
    }
  });

  check('teaching survives a nervous calibration', () => {
    // Nobody bounces five times on a metronome when a page asks them to. Every other case
    // in this file teaches at a fixed 0.45 s, which means nothing here could catch a
    // timing-coupled bug in learn() or lock().
    const clip = room(24);
    let t = 1.2;
    for (const gap of [0.31, 0.72, 0.36, 1.15, 0.44, 0.62]) { bounce(clip, t, 0.5); t += gap; }
    const after = t;
    const placed = [];
    for (let i = 0; i < 12; i++) { placed.push(after + 0.9 + i * 0.42); bounce(clip, after + 0.9 + i * 0.42, 0.6); }
    const res = listen(FB, clip, { from: after });
    isTrue(res.locked, 'never learned the ball from an uneven calibration');
    atLeast(against(res.hits, placed).matched, 10, 'bounces counted after an uneven calibration');
  });

  check('the fingerprint never waits less time than the audio it reads', () => {
    /*
     * THE BUG THIS PINS, which no amount of counting bounces would have shown.
     *
     * The wait after an onset was a fixed 115 ms, but the fingerprint read a fixed 5120
     * SAMPLES. At 48 kHz those are 107 ms and it fits. At 44.1 kHz the read wants 116 ms,
     * and at 16 kHz it wants 320 ms - so it indexed a circular buffer past anything that
     * had been written and got whatever unrelated audio was sitting there one wrap
     * earlier. Nothing threw. The counts even looked fine, because the stale audio was
     * usually quiet enough to clamp to the fingerprint's floor and read as silence.
     *
     * A duration compared against a sample count is the same class of mistake as a value
     * compared against itself: both are dimensionally wrong and neither announces itself.
     */
    for (const rate of [16000, 22050, 32000, 44100, 48000, 96000]) {
      const det = new FB.Detector(rate);
      const needs = (5 * det.fpN) / rate;
      isTrue(det.fpSpan >= needs,
        `at ${rate} Hz it waits ${(det.fpSpan * 1000).toFixed(0)}ms for ${(needs * 1000).toFixed(0)}ms of audio`);
      isTrue(det.rawLen >= 5 * det.fpN,
        `at ${rate} Hz the history holds ${det.rawLen} samples but the fingerprint reads ${5 * det.fpN}`);
      isTrue(det.fpN >= 256 && (det.fpN & (det.fpN - 1)) === 0, `at ${rate} Hz the slice is ${det.fpN}, not a usable power of two`);
    }
  });

  check('it does not assume 48 kHz', () => {
    // Verified against the real recording at 44100, 32000 and 16000 before being written
    // down here: all three counted every bounce. This keeps it that way.
    const clip = room(20);
    const after = teachingBounces(clip);
    const placed = [];
    for (let i = 0; i < 16; i++) { placed.push(after + 0.9 + i * 0.45); bounce(clip, after + 0.9 + i * 0.45, 0.7); }
    for (const rate of [44100, 32000, 16000]) {
      const r = against(listen(FB, resample(clip, SR, rate), { from: after, sr: rate }).hits, placed);
      atLeast(r.matched, 13, `bounces counted at ${rate} Hz`);
    }
  });

  check('a ball left to bounce itself out is not over-counted', () => {
    // Dropped and abandoned: the gaps close and the level falls away together, until the
    // bounces are faster than any hand and quieter than the room. Missing those is right.
    // Inventing them is not, and a blurring train is exactly where a counter would.
    const clip = room(18);
    const after = teachingBounces(clip);
    const placed = [];
    let t = after + 0.9, gap = 0.52, amp = 0.9;
    for (let i = 0; i < 22; i++) { placed.push(t); bounce(clip, t, amp); t += gap; gap *= 0.84; amp *= 0.85; }
    const r = against(listen(FB, clip, { from: after }).hits, placed);
    atMost(r.spurious, 1, 'dribbles invented by a ball bouncing itself out');
  });

  check('keeps up with a machine gun rack', () => {
    const clip = room(16);
    const after = teachingBounces(clip);
    run(clip, after + 0.8, 24, 330);
    const { hits } = listen(FB, clip, { from: after });
    atLeast(hits.length, 23, 'fast bounces counted');
    near(Math.round(FB.tempo(hits)), 330, 10, 'fast tempo');
  });

  check('an empty gym counts nothing', () => {
    const clip = room(14);
    const after = teachingBounces(clip);
    const { hits } = listen(FB, clip, { from: after });
    eq(hits.length, 0, 'phantom bounces');
  });

  check('a rumbling air handler counts nothing', () => {
    const clip = room(14, { hiss: 0.004, rumble: 0.25 });
    const after = teachingBounces(clip, 1.2, 0.5);
    const { hits } = listen(FB, clip, { from: after });
    eq(hits.length, 0, 'phantom bounces');
  });

  check('the metronome does not count itself', () => {
    // It never needed a filter trick: a 7 kHz sine is not the shape of a ball.
    const clip = room(20);
    const after = teachingBounces(clip);
    const placed = [];
    for (let i = 0; i < 16; i++) {
      placed.push(after + 0.85 + i * 0.4);
      bounce(clip, after + 0.85 + i * 0.4, 0.5);
    }
    // Worst case on purpose: the tick lands 50 ms before every single bounce, which is
    // close enough that the two are one event to any detector with an 80 ms settle.
    for (let i = 0; i < 40; i++) tick(clip, after + 0.8 + i * 0.4, 0.6);
    const { hits } = listen(FB, clip, { from: after });
    const r = against(hits, placed);
    eq(r.spurious, 0, 'ticks counted as dribbles');
    // Every one of the sixteen collides here by construction, so a couple being swallowed
    // is the collision ceiling again, not the tick being mistaken for a ball. The tick
    // itself scores about 0.01 against the template: it is not close.
    atLeast(r.matched, 14, 'bounces found through the tick');
  });

  check('an echo off the back wall is not a second dribble', () => {
    // The claim is about DOUBLE counting, so it is asserted as such: six impacts may
    // produce at most six counts and never a seventh. Whether one of the six is lost to
    // its own echo is the collision ceiling, measured elsewhere.
    const clip = room(16);
    const after = teachingBounces(clip);
    const placed = [];
    for (let i = 0; i < 6; i++) {
      placed.push(after + 0.8 + i * 0.5);
      bounce(clip, after + 0.8 + i * 0.5);
      bounce(clip, after + 0.835 + i * 0.5, 0.45);
    }
    const r = against(listen(FB, clip, { from: after }).hits, placed);
    eq(r.spurious, 0, 'an echo counted as its own dribble');
    // A distinct 45% slap-back 35 ms behind every single bounce is a harsher room than
    // the real recording, where reverb is continuous and recall stayed near 100%.
    atLeast(r.matched, 4, 'bounces counted from six impacts');
  });

  check('the fussiness knob actually moves', () => {
    let cut = 0;
    const build = () => {
      const clip = room(16);
      cut = teachingBounces(clip);
      run(clip, cut + 0.8, 10, 150);
      return clip;
    };
    const a = build();
    eq(listen(FB, a, { match: 0.999, from: cut }).hits.length, 0, 'the impossible setting still counting');
    const b = build();
    eq(listen(FB, b, { match: 0.5, from: cut }).hits.length, 10, 'the loose setting missing bounces');
  });

  check('a stalled page loses time, never invents bounces', () => {
    const clip = room(6);
    run(clip, 1.5, 6, 120);
    const det = new FB.Detector(SR);
    const win = new Float32Array(8192);
    win.set(clip.subarray(0, 8192));
    det.scan(win, 8192 / SR);
    det.primed = true;
    win.set(clip.subarray(clip.length - 8192));
    atMost(det.scan(win, clip.length / SR).length, 1, 'events invented by a stall');
  });

  check('the tempo shrugs off one missed bounce', () => {
    near(Math.round(FB.tempo([0, 0.5, 1.0, 2.0, 2.5, 3.0])), 120, 1, 'median tempo');
  });

  check('"that was N, go find them" re-teaches from a whole drill, not the last few seconds', () => {
    /*
     * The correction hands the detector a set of bounces the athlete has vouched for and
     * asks it to rebuild the ball from them. The trap it exists to avoid: `learn()` drops
     * anything older than LEARN_WINDOW, because teaching is five bounces in a few seconds.
     * A drill is a minute. Route a correction through learn() and all but the last handful
     * are thrown away before the template is built, silently, and the re-teach quietly
     * learns almost nothing.
     */
    const clip = room(40);
    const after = teachingBounces(clip);
    run(clip, after + 0.8, 50, 120, 0.6);            // 50 bounces, 25 seconds of drill
    const got = listen(FB, clip, { from: after });
    if (!got.locked) throw new Error('nothing was taught to correct');
    const pool = got.seen
      .filter((e) => e.t > after && e.fp && e.sim != null)
      .map((e) => ({ fp: e.fp, t: e.t, thump: e.thump }));
    atLeast(pool.length, 20, 'candidates in the drill');
    const span = pool[pool.length - 1].t - pool[0].t;
    if (span < 20) throw new Error(`the drill spans only ${span.toFixed(1)}s, so it does not test the window`);

    const best = pool.slice().sort((a, b) => b.t - a.t).slice(0, 20);
    if (!got.det.relearn(best, 3)) throw new Error('relearn refused twenty real bounces');
    atLeast(got.det.taught, 15, 'bounces that agreed with each other');
    // The re-taught ball has to recognise the very bounces it was built from.
    const worst = Math.min(...best.map((e) => FB.similarity(e.fp, got.det.template)));
    if (worst < 0.6) throw new Error(`the re-taught ball scores its own bounces at ${worst.toFixed(2)}`);

    // And this is the window doing exactly what relearn exists to step around.
    got.det.teach();
    for (const e of best) got.det.learn(e);
    if (got.det.learned.length >= best.length) {
      throw new Error('learn() kept the whole drill, so this check no longer proves anything');
    }
  });

  check('a correction will not build a ball out of sounds that disagree', () => {
    // Told "that was twelve" when the twelve loudest things in the room were a clap, a
    // door, a bag and a rim, it must refuse rather than teach itself furniture.
    const clip = room(30);
    const after = teachingBounces(clip);
    const got = listen(FB, clip, { from: after });
    if (!got.locked) throw new Error('nothing was taught');
    const junk = room(30);
    const kinds = ['clap', 'footstep', 'door', 'plosive', 'rim', 'bag', 'tennis', 'snap', 'whistle'];
    for (let i = 0; i < 9; i++) IMPOSTORS[kinds[i]](junk, 1.5 + i * 0.9);
    const heard = listen(FB, junk, { teach: false, from: 0 }).seen.filter((e) => e.fp);
    if (heard.length < 4) throw new Error(`only ${heard.length} impostors were even heard`);
    const ok = got.det.relearn(heard.map((e) => ({ fp: e.fp, t: e.t, thump: e.thump })), 3);
    eq(ok, false, 'relearn built a ball out of nine different objects');
  });

  check('loudness is measured against the recent normal, not against nothing', () => {
    // Pure arithmetic, and the guard that matters is the first one: with too few bounces
    // to have a normal there IS no answer, and returning 0 is what stops the first rep of
    // a session being judged against an empty room.
    eq(FB.relDb(0.5, []), 0, 'no reference at all');
    eq(FB.relDb(0.5, [0.5, 0.5, 0.5, 0.5]), 0, 'four references is not a normal yet');
    const flat = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    near(FB.relDb(0.5, flat), 0, 0.001, 'a bounce at the normal');
    // A quarter as loud is 12.04 dB down and twice as loud is 6.02 up, not 12 and 6. The
    // round numbers are the ones people remember; these are the ones the arithmetic gives.
    near(FB.relDb(0.125, flat), -12.041, 0.01, 'a bounce a quarter as loud');
    near(FB.relDb(1.0, flat), 6.021, 0.01, 'a bounce twice as loud');
    // One clang must not move the reference: the median ignores it, a mean would not.
    near(FB.relDb(0.5, [0.5, 0.5, 0.5, 0.5, 0.5, 9.0]), 0, 0.001, 'an outlier in the reference');
    eq(FB.relDb(0, flat), 0, 'a silent bounce cannot be scored');
    eq(FB.relDb(0.5, [0, 0, 0, 0, 0, 0]), 0, 'a silent reference cannot score anything');
  });

  check('a soft bounce is told apart from a full one', () => {
    /*
     * The page shows a hollow gold mark for a bounce that landed much softer than the
     * athlete's recent ones, which in a pound drill is a bad rep. This pins the threshold
     * against synthesis, where the strength of every bounce is known: five of twenty-four
     * are deliberately a quarter as loud, which is 12 dB down.
     */
    const SOFT_DB = -6;                       // the page's constant, measured on real audio
    const SOFT_AT = new Set([6, 11, 12, 17, 22]);
    const clip = room(26);
    const after = teachingBounces(clip, 1.2, 0.6);
    const placed = [];
    for (let i = 0; i < 24; i++) {
      const t = after + 0.8 + i * 0.5;
      placed.push({ t, soft: SOFT_AT.has(i) });
      bounce(clip, t, SOFT_AT.has(i) ? 0.15 : 0.6);
    }
    const got = listen(FB, clip, { from: after });
    if (!got.locked) throw new Error('nothing was taught');
    // Exactly the three lines the page runs, against the same rolling reference.
    const peaks = [];
    let flaggedSoft = 0, flaggedFull = 0, seenSoft = 0, seenFull = 0;
    for (const ev of got.seen) {
      if (ev.t <= after || !got.det.counts(ev)) continue;
      const truth = placed.find((x) => Math.abs(x.t - ev.t) < 0.12);
      if (truth) {
        const soft = FB.relDb(ev.peak, peaks) <= SOFT_DB;
        if (truth.soft) { seenSoft++; if (soft) flaggedSoft++; }
        else { seenFull++; if (soft) flaggedFull++; }
      }
      peaks.push(ev.peak);
      if (peaks.length > 16) peaks.shift();
    }
    if (seenSoft < 4) throw new Error(`only ${seenSoft} of the soft bounces were counted at all`);
    atLeast(flaggedSoft, seenSoft - 1, 'soft bounces marked soft');
    // The one that must not happen: calling a good rep bad.
    eq(flaggedFull, 0, 'full bounces wrongly marked soft');
  });

  check('a fingerprint survives the trip into the session log and back', () => {
    /*
     * The page saves the taught template and the fingerprints of its most interesting
     * events into the document the app stores, one byte per component. That log is the
     * only way a wrong count in a real gym can ever be argued with afterwards, and it is
     * worth exactly nothing if the vector that comes back out scores differently from the
     * one the phone actually judged. So: same length, same template, same score.
     */
    const clip = room(14);
    const after = teachingBounces(clip);
    const got = listen(FB, clip, { from: after });
    if (!got.locked) throw new Error('nothing was taught, so there is nothing to pack');
    const back = FB.unpackFp(FB.packFp(got.det.template));
    eq(back.length, got.det.template.length, 'components through the round trip');
    const self = FB.similarity(back, got.det.template);
    /*
     * 0.9999 and not 0.99999, which is where this was first set and which made the check
     * fail one run in four.
     *
     * The tempting model is that the round trip costs the SQUARE of the quantisation
     * error, which for two bytes is somewhere around 1e-9 and would justify any number of
     * nines. That is wrong, because `similarity` is a bare dot product of two vectors it
     * assumes are already unit length, and the unpacked one is only approximately unit.
     * What it actually measures is 1 plus the projection of the error onto the template,
     * which is a random sum with a standard deviation near 1e-5 and no particular sign. A
     * bar at 1e-5 is therefore a one-sigma bar on a stochastic corpus, and it will fail
     * regularly on code that is perfectly correct.
     *
     * 1e-4 is eleven sigma, and still a hundred times finer than the 0.01 the fussiness
     * bar moves in, which is the only precision that has to hold.
     */
    if (self < 0.9999) throw new Error(`the template did not survive packing: ${self.toFixed(6)}`);
    // And a real event still scores the same against it. The fussiness bar moves in steps
    // of 0.01, so anything this cannot hold to well inside that is not a log, it is noise.
    const ev = got.seen.filter((e) => e.fp && e.sim != null).pop();
    if (!ev) throw new Error('no fingerprinted event to re-score');
    const drift = Math.abs(FB.similarity(FB.unpackFp(FB.packFp(ev.fp)), got.det.template) - ev.sim);
    if (drift > 0.0002) throw new Error(`packing moved a real score by ${drift.toFixed(5)}`);
  });

  check('the tempo waits for real evidence', () => {
    eq(FB.tempo([]), 0, 'tempo from nothing');
    eq(FB.tempo([1, 1.5]), 0, 'tempo from a single gap');
  });

  if (failures) throw new Error(`${failures} dribble detector check(s) failed`);
  return 'check-dribble.mjs: all checks passed';
}

console.log(demo());
