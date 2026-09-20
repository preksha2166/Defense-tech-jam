/* ============================================================
   TRUSTLINE: ABYSS — ATLAS AVATAR + VOICE

   A small synthetic face for the AI teammate, so it reads as
   something you are talking TO rather than a text box.

   Procedural SVG, in keeping with the rest of the project: no
   image files, no libraries. The mouth is an equaliser rather
   than lips — it stays legible at 56px, it cannot land in the
   uncanny valley, and it is honest about being a machine.

   Voice is the Web Speech API, which every modern browser ships
   and which costs nothing to bundle. Everything degrades: no
   speechSynthesis means the avatar still animates for a
   plausible duration and the text is still on screen.

   Public API
     mount(el)                 build the avatar into a container
     setState(s)               idle | listening | thinking | speaking | alert
     speak(text, opts)         say it, animate the mouth, opts.onend
     stop()                    cut speech and settle
     setMuted(b) / muted()     voice on/off (avatar keeps animating)
     available()               is there a speech engine at all
   ============================================================ */

const ATLAS_AV = (() => {

const NS = 'http://www.w3.org/2000/svg';
/* One module, many faces. The cockpit CRT and the tutorial card both want
   an ATLAS, and a single set of element handles meant whichever mounted
   last silently stole the animation from the other. Each mount() now
   returns its own instance and the tick loop drives all of them. */
let faces = [];
let state = 'idle', muted = false, raf = 0, t0 = performance.now();
let speaking = false, utter = null, energy = 0, targetEnergy = 0;
let voice = null, voicesReady = false;

const PALETTE = {
  idle:      { main: '#4fd6e8', dim: '#1d5c68' },
  listening: { main: '#6fe4f0', dim: '#245f6b' },
  thinking:  { main: '#ffc247', dim: '#6b4d12' },
  speaking:  { main: '#8bffc4', dim: '#1d5c3f' },
  alert:     { main: '#ff6b6b', dim: '#6b2020' }
};

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* ---------------- build ---------------- */
function mount(container){
  if (!container) return null;
  container.innerHTML = '';
  container.classList.add('atlas-av');
  const F = { bars: [] };

  const svg = el('svg', { viewBox: '0 0 64 64', width: '58', height: '58',
                          xmlns: NS, 'aria-hidden': 'true' });

  // outer status ring
  F.ring = el('circle', { cx: 32, cy: 32, r: 29, fill: 'none',
                        stroke: '#1d5c68', 'stroke-width': 1.4, opacity: .8 });
  svg.appendChild(F.ring);

  // dashed telemetry ring, slowly rotating
  const dash = el('circle', { cx: 32, cy: 32, r: 25.5, fill: 'none',
                              stroke: '#1d5c68', 'stroke-width': 1,
                              'stroke-dasharray': '3 7', opacity: .55 });
  dash.style.transformOrigin = '32px 32px';
  dash.style.animation = 'atlasSpin 14s linear infinite';
  svg.appendChild(dash);

  // soft glow behind the head
  F.glow = el('circle', { cx: 32, cy: 32, r: 19, fill: '#4fd6e8', opacity: .10 });
  svg.appendChild(F.glow);

  // chassis
  F.face = el('rect', { x: 14, y: 16, width: 36, height: 32, rx: 10,
                      fill: '#07222b', stroke: '#2f7f90', 'stroke-width': 1.5 });
  svg.appendChild(F.face);

  // visor
  svg.appendChild(el('rect', { x: 18, y: 22, width: 28, height: 13, rx: 6,
                               fill: '#041319', stroke: '#17505e', 'stroke-width': 1 }));

  // eyes
  F.eyeL = el('rect', { x: 22.5, y: 26, width: 5, height: 5, rx: 2.5, fill: '#4fd6e8' });
  F.eyeR = el('rect', { x: 36.5, y: 26, width: 5, height: 5, rx: 2.5, fill: '#4fd6e8' });
  svg.appendChild(F.eyeL); svg.appendChild(F.eyeR);

  // mouth — five bars that rise and fall with speech
  for (let i = 0; i < 5; i++){
    const b = el('rect', { x: 23 + i * 4, y: 39, width: 2.4, height: 3, rx: 1.2,
                           fill: '#2f7f90' });
    F.bars.push(b); svg.appendChild(b);
  }

  // antenna
  svg.appendChild(el('line', { x1: 32, y1: 16, x2: 32, y2: 9,
                               stroke: '#2f7f90', 'stroke-width': 1.5 }));
  F.antenna = el('circle', { cx: 32, cy: 7.5, r: 2.4, fill: '#4fd6e8' });
  svg.appendChild(F.antenna);

  // shoulders, so it reads as a body not a floating head
  svg.appendChild(el('path', { d: 'M12 52 Q32 44 52 52', fill: 'none',
                               stroke: '#2f7f90', 'stroke-width': 1.5, opacity: .7 }));

  container.appendChild(svg);
  F.svg = svg; F.blinkAt = 0;
  faces = faces.filter(x => x.svg.isConnected);      // drop replaced mounts
  faces.push(F);
  if (!raf) raf = requestAnimationFrame(tick);
  primeVoices();
  return F;
}

/* ---------------- animation ---------------- */
function tick(now){
  raf = requestAnimationFrame(tick);
  if (!faces.length) return;
  const t = (now - t0) / 1000;
  const pal = PALETTE[state] || PALETTE.idle;

  // energy chases its target so the mouth eases instead of snapping
  energy += (targetEnergy - energy) * 0.25;
  if (speaking && Math.random() < .45) targetEnergy = 0.35 + Math.random() * 0.65;
  if (!speaking) targetEnergy = 0;

  const breathe = (Math.sin(t * (state === 'alert' ? 6 : 1.6)) + 1) * .5;
  const nod = speaking ? Math.sin(t * 7) * 0.5 : 0;

  for (const F of faces){
    if (!F.svg.isConnected) continue;      // detached card, skip it

    // mouth bars: centre louder than the edges, like a real meter
    for (let i = 0; i < F.bars.length; i++){
      const centre = 1 - Math.abs(i - 2) / 2.6;
      const wob = (Math.sin(t * 11 + i * 1.7) + 1) * .5;
      const h = 3 + energy * centre * wob * 13;
      F.bars[i].setAttribute('height', h.toFixed(2));
      F.bars[i].setAttribute('y', (42.5 - h / 2).toFixed(2));
      F.bars[i].setAttribute('fill', energy > .05 ? pal.main : pal.dim);
    }

    // blink, on each face's own schedule
    if (now > F.blinkAt){
      F.blinkAt = now + 2200 + Math.random() * 3800;
      blink(F);
    }

    // thinking: eyes narrow and scan side to side
    if (state === 'thinking'){
      const sweep = Math.sin(t * 2.4) * 1.6;
      F.eyeL.setAttribute('x', (22.5 + sweep).toFixed(2));
      F.eyeR.setAttribute('x', (36.5 + sweep).toFixed(2));
    } else {
      F.eyeL.setAttribute('x', 22.5); F.eyeR.setAttribute('x', 36.5);
    }

    F.eyeL.setAttribute('fill', pal.main);
    F.eyeR.setAttribute('fill', pal.main);
    F.antenna.setAttribute('fill', pal.main);
    F.ring.setAttribute('stroke', pal.dim);
    F.face.setAttribute('stroke', pal.dim);
    F.glow.setAttribute('fill', pal.main);
    F.glow.setAttribute('opacity', (0.07 + breathe * 0.10 + energy * 0.16).toFixed(3));
    F.antenna.setAttribute('r', (2.1 + breathe * 0.6 + energy * 0.5).toFixed(2));
    F.svg.style.transform = `translateY(${nod.toFixed(2)}px)`;
  }
}

function blink(F){
  if (!F || !F.eyeL) return;
  [F.eyeL, F.eyeR].forEach(e => { e.setAttribute('height', '1'); e.setAttribute('y', '28'); });
  setTimeout(() => {
    if (!F.eyeL) return;
    [F.eyeL, F.eyeR].forEach(e => { e.setAttribute('height', '5'); e.setAttribute('y', '26'); });
  }, 110);
}

/* ---------------- voice ---------------- */
function synth(){ return (typeof window !== 'undefined' && window.speechSynthesis) || null; }

/* Voices load asynchronously in most browsers, and getVoices() is empty on
   the first call. Ask twice: now, and again on voiceschanged. */
function primeVoices(){
  const s = synth();
  if (!s || voicesReady) return;
  const pick = () => {
    const all = s.getVoices();
    if (!all.length) return;
    voicesReady = true;
    // prefer a clear English voice; the machine quality comes from pitch/rate
    const score = v => {
      let n = 0;
      if (/^en/i.test(v.lang)) n += 10;
      if (/en-GB/i.test(v.lang)) n += 3;
      if (/google|microsoft|natural/i.test(v.name)) n += 4;
      if (/male|david|george|daniel|alex/i.test(v.name)) n += 2;
      if (v.localService) n += 1;
      return n;
    };
    voice = all.slice().sort((a, b) => score(b) - score(a))[0] || null;
  };
  pick();
  s.addEventListener && s.addEventListener('voiceschanged', pick, { once: false });
}

/* Strip the quotes the UI wraps recommendations in, and expand the notation
   the screen can show but a voice should not read out literally. */
function speakable(text){
  return String(text || '')
    .replace(/[""'']/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/(\d+)%/g, '$1 percent')
    .replace(/\s+/g, ' ')
    .trim();
}

function speak(text, opts){
  opts = opts || {};
  const clean = speakable(text);
  if (!clean){ opts.onend && opts.onend(); return; }

  const s = synth();
  setState(opts.state || 'speaking');
  speaking = true;

  const finish = () => {
    speaking = false;
    targetEnergy = 0;
    setState(opts.rest || 'idle');
    opts.onend && opts.onend();
  };

  if (!s || muted){
    // No engine, or the player muted us: still animate for a plausible
    // beat so the avatar and the on-screen text stay in step.
    const ms = Math.min(9000, 380 + clean.length * 48);
    clearTimeout(speak._t);
    speak._t = setTimeout(finish, ms);
    return;
  }

  try {
    s.cancel();
    utter = new SpeechSynthesisUtterance(clean);
    if (voice) utter.voice = voice;
    utter.rate  = opts.rate  != null ? opts.rate  : 0.98;
    utter.pitch = opts.pitch != null ? opts.pitch : 0.72;  // low = synthetic
    utter.volume = 1;
    utter.onend = finish;
    utter.onerror = finish;
    // word boundaries give the mouth a real beat to hit
    utter.onboundary = () => { targetEnergy = 0.55 + Math.random() * 0.45; };
    s.speak(utter);
    // Safety net: some engines never fire onend on long strings.
    clearTimeout(speak._t);
    speak._t = setTimeout(() => { if (speaking) finish(); },
                          Math.min(24000, 1500 + clean.length * 95));
  } catch (e){
    finish();
  }
}

function stop(){
  const s = synth();
  try { s && s.cancel(); } catch (e){}
  clearTimeout(speak._t);
  speaking = false; targetEnergy = 0;
  setState('idle');
}

function setState(next){
  if (PALETTE[next]) state = next;
}

return {
  mount, speak, stop, setState,
  isSpeaking(){ return speaking; },
  available(){ return !!synth(); },
  setMuted(v){ muted = !!v; if (muted) { try { synth() && synth().cancel(); } catch(e){} } },
  muted(){ return muted; },
  voiceName(){ return voice ? voice.name : null; }
};

})();
