/* ============================================================
   TRUSTLINE: ABYSS — PROCEDURAL AUDIO (Web Audio API)
   Every sound is synthesised at runtime. No audio files.
   Browsers block audio until a user gesture, so AUDIO.init()
   is called from the first click. Every call is wrapped so a
   failure here can never break the game.
   ============================================================ */

const AUDIO = (() => {

let ctx = null, master = null, bed = null, bedGain = null, groanGain = null;
let ready = false, muted = false, noiseBuf = null;

const now = () => ctx.currentTime;

function makeNoise(){
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++){          // brown noise: deeper, more watery
    const w = Math.random() * 2 - 1;
    last = (last + .02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

/* short-tail delay — stands in for the echo of a steel hull */
function makeVerb(mix){
  const dly = ctx.createDelay(1);   dly.delayTime.value = .17;
  const fb  = ctx.createGain();     fb.gain.value = .34;
  const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
  const wet = ctx.createGain();     wet.gain.value = mix;
  dly.connect(fb); fb.connect(lp); lp.connect(dly);
  dly.connect(wet); wet.connect(master);
  return dly;
}

function init(){
  if (ready) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = .55;
    master.connect(ctx.destination);
    noiseBuf = makeNoise();

    // ---- continuous bed: deep water rumble ----
    bed = ctx.createBufferSource();
    bed.buffer = noiseBuf; bed.loop = true;
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = 'lowpass'; bedLp.frequency.value = 210; bedLp.Q.value = .6;
    bedGain = ctx.createGain(); bedGain.gain.value = .0;
    bed.connect(bedLp); bedLp.connect(bedGain); bedGain.connect(master);
    bed.start();
    bedGain.gain.linearRampToValueAtTime(.30, now() + 3);

    // ---- hull stress drone: gain rises as integrity falls ----
    const g1 = ctx.createOscillator(); g1.type = 'sine'; g1.frequency.value = 47;
    const g2 = ctx.createOscillator(); g2.type = 'sine'; g2.frequency.value = 70.5;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 5;
    lfo.connect(lfoAmt); lfoAmt.connect(g1.frequency);
    groanGain = ctx.createGain(); groanGain.gain.value = 0;
    g1.connect(groanGain); g2.connect(groanGain); groanGain.connect(master);
    g1.start(); g2.start(); lfo.start();

    ready = true;
  } catch(e){ ready = false; }
}

/* ---- primitives ---- */
function tone(freq, dur, type, vol, glideTo, dest){
  if (!ready || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, now());
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), now() + dur);
  g.gain.setValueAtTime(0, now());
  g.gain.linearRampToValueAtTime(vol, now() + Math.min(.02, dur * .2));
  g.gain.exponentialRampToValueAtTime(.0001, now() + dur);
  o.connect(g); g.connect(dest || master);
  o.start(); o.stop(now() + dur + .05);
}

function noise(dur, freq, q, vol, type){
  if (!ready || muted) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now());
  g.gain.exponentialRampToValueAtTime(.0001, now() + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); s.stop(now() + dur + .05);
}

/* ---- the kit ---- */
const API = {
  init,
  get ready(){ return ready; },
  toggleMute(){ muted = !muted; if (master) master.gain.value = muted ? 0 : .55; return muted; },

  /* active sonar: bright ping into a long watery tail */
  ping(){
    if (!ready || muted) return;
    const v = makeVerb(.45);
    tone(1180, .5, 'sine', .16, 620, v);
    tone(1180, .5, 'sine', .10, 620);
    setTimeout(() => tone(880, .35, 'sine', .05, 520, v), 60);
  },

  /* ATLAS speaks */
  chirp(){ tone(1760, .05, 'square', .035); setTimeout(() => tone(2340, .06, 'square', .03), 55); },

  /* panel switch */
  click(){ noise(.05, 2400, 1.2, .18, 'bandpass'); tone(180, .05, 'square', .05); },

  /* drone launches and recedes */
  droneLaunch(){
    if (!ready || muted) return;
    noise(1.4, 900, 2.4, .20);
    tone(320, 1.6, 'sawtooth', .07, 1450);
    setTimeout(() => tone(1400, 2.2, 'sawtooth', .035, 260), 900);
  },

  /* drone telemetry returns */
  telemetry(){
    [0, 90, 180].forEach((d, i) => setTimeout(() => tone(1320 + i * 210, .07, 'square', .04), d));
  },

  /* decision confirmed, evidence held up */
  chime(){
    tone(660, .5, 'sine', .10, 660);
    setTimeout(() => tone(990, .6, 'sine', .08), 90);
  },

  /* decision was miscalibrated */
  klaxon(){
    if (!ready || muted) return;
    for (let i = 0; i < 3; i++){
      setTimeout(() => {
        tone(226, .34, 'sawtooth', .13, 196);
        tone(113, .34, 'square', .07);
      }, i * 420);
    }
  },

  /* hull takes damage */
  impact(){
    if (!ready || muted) return;
    noise(.9, 130, .7, .5, 'lowpass');
    tone(64, 1.1, 'sine', .28, 38);
    setTimeout(() => noise(1.6, 420, 1.1, .12), 120);   // debris / settling
  },

  /* hull integrity 0-100 -> stress drone loudness */
  setHull(pct){
    if (!ready || !groanGain) return;
    const stress = Math.max(0, (100 - pct) / 100);
    groanGain.gain.linearRampToValueAtTime(stress * stress * .16, now() + 1.2);
  },

  /* mission over */
  breach(){
    if (!ready || muted) return;
    noise(2.6, 90, .6, .6, 'lowpass');
    tone(52, 2.8, 'sine', .3, 26);
    if (bedGain) bedGain.gain.linearRampToValueAtTime(.06, now() + 2.5);
  },

  /* checkpoint cleared — the boat moves on */
  thrust(){ noise(1.8, 160, .9, .16, 'lowpass'); },

  /* a sensor has crossed into the amber band */
  alertWarn(){
    tone(1040, .09, 'square', .05);
    setTimeout(() => tone(1320, .11, 'square', .045), 105);
  },

  /* a sensor has crossed into the red band — more insistent */
  alertCrit(){
    if (!ready || muted) return;
    for (let i = 0; i < 3; i++){
      setTimeout(() => {
        tone(1560, .08, 'square', .07);
        tone(780,  .08, 'square', .04);
      }, i * 150);
    }
  },

  /* a sensor has recovered */
  alertClear(){
    tone(880, .10, 'sine', .045);
    setTimeout(() => tone(1320, .14, 'sine', .04), 90);
  },

  /* a dashboard value moved — short neutral tick */
  statTick(up){
    tone(up ? 1180 : 620, .07, 'sine', .035, up ? 1480 : 460);
  }
};

return API;

})();
