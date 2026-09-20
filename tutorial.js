/* ============================================================
   TRUSTLINE: ABYSS — GUIDED TUTORIAL

   A spotlight tour narrated by ATLAS. It runs once on a first
   play, can be replayed from the title screen, and is skippable
   at any point with ESC.

   Design notes:
   - The tour is DATA (the STEPS array). Adding or reordering a
     step is one object, no code.
   - Steps declare which phase they belong to. Transit steps only
     make sense with the nav HUD up; console steps need the
     cockpit. The runner switches views for you rather than
     telling you to press V.
   - The spotlight is four dimming panels around the target, not
     an SVG mask. That keeps the highlighted control genuinely
     clickable and costs nothing to animate.
   ============================================================ */

const TUTORIAL = (() => {

const KEY = 'trustline.tutorial.done';
let idx = -1, running = false, els = {}, onDone = null, steps = [];

/* ---------------- content ----------------
   target:  CSS selector to spotlight (null = centred, no spotlight)
   phase:   'any' | 'transit' | 'console'
   say:     what ATLAS speaks (also shown, so muted players lose nothing)
*/
const STEPS = [
  { phase: 'any', target: null, title: 'ATLAS ONLINE',
    say: "Commander. I am ATLAS, your surviving analysis system. Before we move, let me walk you through the boat and what I need from you." },

  { phase: 'any', target: null, title: 'WHAT THIS MISSION IS',
    say: "Ten checkpoints stand between us and the safe zone. At each one I will read the sensors and recommend an action. I am not always right. Your job is not to obey me, and it is not to ignore me. It is to judge when I have earned your agreement." },

  /* ---- transit half ---- */
  { phase: 'transit', target: '#nh-objective', title: 'STEP ONE — THE CLUE SWEEP',
    say: "Every leg begins out here in the water, with you flying. Three clue markers are scattered ahead. This banner tells you what the boat still owes before the checkpoint will open." },

  { phase: 'transit', target: '.nh.tr', title: 'YOUR NEXT TARGET',
    say: "One marker is live at a time and it burns amber. This card gives its distance, whether to climb or dive, and the needle points at it. Fly into the pillar of light. Anywhere along its height counts." },

  { phase: 'transit', target: '.nh.bc', title: 'FLYING THE BOAT',
    say: "Space builds thrust against drag. Left and right work the rudder, up and down the dive planes. Press C to hand control back to the autopilot at any time." },

  { phase: 'transit', target: '.nh.tl', title: 'WHERE YOU ARE',
    say: "Depth, speed and heading. We are at roughly two thousand one hundred metres. Nothing down here is lit except what we bring with us." },

  { phase: 'transit', target: '.nh.bl', title: 'WHAT IT COSTS',
    say: "Watch the hull. The wildlife out here is not scenery. Striking a ray or a whale costs six percent of the hull, and the hull is the same pool your decisions draw on. Careless flying spends the margin you will need later." },

  /* ---- console half ---- */
  { phase: 'console', target: '.clue-strip', title: 'STEP TWO — WHAT YOU FOUND',
    say: "Reach the checkpoint with all three clues and the console comes up automatically. These are the observations you collected. They are the evidence, and they are the reason flying matters." },

  { phase: 'console', target: '.gauge-wrap', title: 'THE SENSOR ARRAY',
    say: "Five instruments, each with a reliability percentage. A low number does not mean danger. It means that instrument cannot be trusted to tell you either way. The ones ringed in amber are the ones I used." },

  { phase: 'console', target: '.scope-box', title: 'THE SONAR SCOPE',
    say: "Heading up, live. Straight up is dead ahead. Amber is your target, green is a clue already logged." },

  { phase: 'console', target: '.crt', title: 'ME',
    say: "My recommendation, and how confident I am in it. Read that number carefully. Confidence describes the quality of my data. It is not a promise that I am right." },

  { phase: 'console', target: '#history', title: 'MY TRACK RECORD',
    say: "Every call I have made so far, scored. Use it. A system that has been wrong twice deserves more scrutiny, but it does not deserve to be ignored." },

  { phase: 'console', target: '.sw.trust', title: 'TRUST',
    say: "Accept my recommendation. This commits you. Correct when the instruments back me up, expensive when they do not." },

  { phase: 'console', target: '.sw.question', title: 'QUESTION',
    say: "Ask me to justify myself. I will tell you my reasoning and name the sensors I leaned on. It costs fifteen seconds and nothing else. It is never the wrong move." },

  { phase: 'console', target: '.sw.investigate', title: 'INVESTIGATE',
    say: "Launch the drone and find the truth. Twenty five percent of its battery per run, which buys you four across the whole mission. There are seven checkpoints where it would pay. Choose." },

  { phase: 'console', target: '.sw.override', title: 'OVERRIDE',
    say: "Reject me and decide for yourself. Full credit only if you questioned or investigated first. Being right for no reason is not judgement." },

  { phase: 'console', target: '.readouts', title: 'YOUR SCORE',
    say: "Calibration measures whether your reliance on me tracked the evidence. It rises when you read the instruments correctly, in either direction, and falls when you follow me blindly or fight me out of habit." },

  { phase: 'any', target: null, title: 'THE ONLY RULE THAT MATTERS',
    say: "High confidence is not proof. Low confidence is not error. Several quiet instruments agreeing beat one loud one. When the picture is thin, spend the drone. Take us out, Commander." }
];

/* ---------------- chrome ---------------- */
function build(){
  if (els.root) return;
  const root = document.createElement('div');
  root.id = 'tut';
  root.hidden = true;
  root.innerHTML = `
    <div class="tut-shade" data-side="t"></div>
    <div class="tut-shade" data-side="b"></div>
    <div class="tut-shade" data-side="l"></div>
    <div class="tut-shade" data-side="r"></div>
    <div class="tut-ring"></div>
    <div class="tut-card">
      <div class="tut-head">
        <div class="tut-av"></div>
        <div class="tut-id">
          <div class="tut-name">ATLAS</div>
          <div class="tut-step"></div>
        </div>
        <button class="tut-skip" type="button">SKIP TOUR &times;</button>
      </div>
      <div class="tut-title"></div>
      <div class="tut-body"></div>
      <div class="tut-foot">
        <div class="tut-dots"></div>
        <div class="tut-btns">
          <button class="tut-back" type="button">BACK</button>
          <button class="tut-next primary" type="button">NEXT</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  els = {
    root,
    shades: [...root.querySelectorAll('.tut-shade')],
    ring:  root.querySelector('.tut-ring'),
    card:  root.querySelector('.tut-card'),
    av:    root.querySelector('.tut-av'),
    step:  root.querySelector('.tut-step'),
    title: root.querySelector('.tut-title'),
    body:  root.querySelector('.tut-body'),
    dots:  root.querySelector('.tut-dots'),
    next:  root.querySelector('.tut-next'),
    back:  root.querySelector('.tut-back'),
    skip:  root.querySelector('.tut-skip')
  };

  els.next.onclick = () => go(idx + 1);
  els.back.onclick = () => go(idx - 1);
  els.skip.onclick = () => finish(true);

  document.addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(true); }
    else if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); go(idx + 1); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); go(idx + 1); }
    else if (e.key === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); go(idx - 1); }
  }, true);          // capture, so the game's own handler never sees these

  if (typeof ATLAS_AV !== 'undefined') ATLAS_AV.mount(els.av);
  window.addEventListener('resize', () => { if (running) position(); });
}

/* Four panels around the hole. Leaves the target itself untouched and
   fully interactive, which an overlay with pointer-events would not. */
function spotlight(rect){
  const pad = 8;
  const [t, b, l, r] = els.shades;
  if (!rect){
    els.ring.style.opacity = '0';
    t.style.cssText = 'inset:0';
    [b, l, r].forEach(s => s.style.cssText = 'display:none');
    return;
  }
  const x = Math.max(0, rect.left - pad), y = Math.max(0, rect.top - pad);
  const w = rect.width + pad * 2, h = rect.height + pad * 2;
  [b, l, r].forEach(s => s.style.display = '');
  t.style.cssText = `left:0;top:0;right:0;height:${y}px`;
  b.style.cssText = `left:0;top:${y + h}px;right:0;bottom:0`;
  l.style.cssText = `left:0;top:${y}px;width:${x}px;height:${h}px`;
  r.style.cssText = `left:${x + w}px;top:${y}px;right:0;height:${h}px`;
  els.ring.style.cssText =
    `opacity:1;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
}

/* Park the card somewhere it does not cover the thing it describes. */
function position(){
  const s = steps[idx];
  if (!s) return;
  const el = s.target ? document.querySelector(s.target) : null;
  const vis = el && el.getBoundingClientRect().width > 4 && el.offsetParent !== null;
  const rect = vis ? el.getBoundingClientRect() : null;
  spotlight(rect);

  els.card.classList.toggle('centred', !rect);
  if (!rect){ els.card.style.cssText = ''; return; }

  const cw = els.card.offsetWidth || 400, ch = els.card.offsetHeight || 200;
  const gap = 18, vw = innerWidth, vh = innerHeight;
  let left, top;

  const below = vh - rect.bottom, above = rect.top;
  if (below > ch + gap + 10){ top = rect.bottom + gap; }
  else if (above > ch + gap + 10){ top = rect.top - ch - gap; }
  else { top = Math.max(gap, (vh - ch) / 2); }

  left = rect.left + rect.width / 2 - cw / 2;
  left = Math.max(gap, Math.min(vw - cw - gap, left));
  top  = Math.max(gap, Math.min(vh - ch - gap, top));
  els.card.style.cssText = `left:${left}px;top:${top}px`;
}

function go(n){
  if (n < 0) return;
  if (n >= steps.length) return finish(false);
  idx = n;
  const s = steps[idx];

  // put the player in the right half of the game for this step
  if (typeof setNavView === 'function'){
    if (s.phase === 'transit') setNavView(true);
    else if (s.phase === 'console') setNavView(false);
  }

  els.step.textContent = `TUTORIAL · ${idx + 1} / ${steps.length}`;
  els.title.textContent = s.title;
  els.body.textContent = s.say;
  els.back.disabled = idx === 0;
  els.next.textContent = idx === steps.length - 1 ? 'BEGIN MISSION' : 'NEXT';

  els.dots.innerHTML = steps.map((_, i) =>
    `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('');

  els.card.classList.remove('pop'); void els.card.offsetWidth; els.card.classList.add('pop');

  // let the view switch settle before measuring
  requestAnimationFrame(() => requestAnimationFrame(position));
  setTimeout(position, 260);

  if (typeof ATLAS_AV !== 'undefined'){
    ATLAS_AV.stop();
    ATLAS_AV.speak(s.say, { rest: 'listening' });
  }
}

function start(opts){
  opts = opts || {};
  build();
  steps = STEPS.filter(s => opts.consoleOnly ? s.phase !== 'transit' : true);
  onDone = opts.onDone || null;
  running = true;
  els.root.hidden = false;
  document.body.classList.add('tut-open');
  go(0);
}

function finish(skipped){
  if (!running) return;
  running = false;
  els.root.hidden = true;
  document.body.classList.remove('tut-open');
  if (typeof ATLAS_AV !== 'undefined'){ ATLAS_AV.stop(); ATLAS_AV.setState('idle'); }
  try { localStorage.setItem(KEY, '1'); } catch (e){}
  const cb = onDone; onDone = null;
  cb && cb(!!skipped);
}

return {
  start, finish,
  isRunning(){ return running; },
  seen(){ try { return localStorage.getItem(KEY) === '1'; } catch (e){ return false; } },
  reset(){ try { localStorage.removeItem(KEY); } catch (e){} },
  stepCount(){ return STEPS.length; }
};

})();
