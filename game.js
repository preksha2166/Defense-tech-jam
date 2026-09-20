/* ============================================================
   TRUSTLINE: ABYSS — GAME LOGIC
   Reads SCENARIOS from scenarios.js. No content lives here.
   ============================================================ */

const $  = id => document.getElementById(id);

/* Renderer selection: WebGL 3D when the machine can take it, 2D canvas otherwise.
   A demo laptop without WebGL still gets a working game. */
const WORLD = (typeof ENV3D !== 'undefined' && ENV3D.supported()) ? ENV3D : ENV;
const USING_3D = WORLD === ENV3D;
document.getElementById(USING_3D ? 'env' : 'env3d').style.display = 'none';
const DRONE_COST = 25, QUESTION_TIME = 15, DRONE_TIME = 30;
const HULL_PER_POINT = 0.95;   // a -18 call costs ~17% of the hull.
                               // Tuned so a careless run still reaches the debrief —
                               // the diagnosis is the teaching payload — while a run of
                               // sustained blanket distrust genuinely loses the boat.

let S; // state

function newState(){
  return {
    i: 0,                 // checkpoint index
    calibration: 50,      // 0-100
    hull: 100,            // mission ends at 0
    battery: 100,
    time: 0,
    history: { correct:0, incorrect:0, uncertain:0 },
    record: [],           // one entry per committed decision
    overtrust: 0, undertrust: 0,
    cp: null,             // per-checkpoint scratch
    timer: null
  };
}

/* Each checkpoint runs in two phases:
     'transit' — flying the leg, scanning the three clue beacons. The
                 decision switches are locked; the checkpoint marker will
                 not accept you until every clue is logged.
     'decide'  — on station. The dashboard is up and ATLAS wants an answer.
   Without WebGL there is nothing to fly, so we start on station. */
function newCp(){
  return { questioned:false, investigated:false, evidence:[], found:[],
           fresh:true, phase: USING_3D ? 'transit' : 'decide',
           power: SCAN_POWER, powerOut: false };
}
const inTransit = () => S && S.cp && S.cp.phase === 'transit';

/* ---------------- screens ---------------- */
function show(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  syncViewport();
}

/* Pin the 3D canvas to the porthole during gameplay so the world cannot
   bleed behind the console; full-window on the title and briefing screens. */
function syncViewport(){
  if (!WORLD.setViewport) return;
  const playing = $('screen-game').classList.contains('active');
  const nav = document.querySelector('.cockpit').classList.contains('navmode');
  const ph = document.querySelector('.porthole');
  if (playing && !nav && ph){
    const r = ph.getBoundingClientRect();
    if (r.width > 20 && r.height > 20){
      WORLD.setViewport({ left: r.left, top: r.top, width: r.width, height: r.height });
      return;
    }
  }
  WORLD.setViewport(null);
}
window.addEventListener('resize', () => setTimeout(syncViewport, 60));

/* The porthole changes size when the view toggles (CSS transition) and when
   the window resizes. Timers racing that transition left the canvas stuck at
   the old size, so observe the element itself instead. */
if (typeof ResizeObserver !== 'undefined'){
  const ro = new ResizeObserver(() => syncViewport());
  const startObserving = () => {
    const ph = document.querySelector('.porthole');
    if (ph) ro.observe(ph);
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', startObserving);
  else startObserving();
}

/* ---------------- briefing reveal ---------------- */
function playBriefing(){
  document.querySelectorAll('#screen-brief [data-delay]').forEach(el => {
    el.style.animationDelay = (el.dataset.delay * 1.05) + 's';
  });
}

/* ---------------- render ---------------- */
function scenario(){ return SCENARIOS[S.i]; }

function render(){
  const sc = scenario();
  WORLD.setCheckpoint(S.i);

  $('cp-label').textContent = `CHECKPOINT ${sc.id} — ${sc.name}`;
  $('cp-brief').textContent = sc.brief;

  // route ribbon
  const r = $('route'); r.innerHTML = '';
  SCENARIOS.forEach((_, n) => {
    if (n) {
      const seg = document.createElement('div');
      seg.className = 'seg' + (n <= S.i ? ' done' : '');
      r.appendChild(seg);
    }
    const node = document.createElement('div');
    node.className = 'node' + (n < S.i ? ' done' : n === S.i ? ' now' : '');
    r.appendChild(node);
  });

  // sensor dials + sonar scope
  GAUGES.set(sc.sensors, sc.atlas.cites);
  monitorSensors(sc, S.cp && S.cp.fresh);
  if (S.cp) S.cp.fresh = false;
  refreshRadar();

  // clues — dimmed until the player drives to the site, or commits a decision
  $('clues').innerHTML = sc.clues.map((c, i) => S.cp.found.includes(i)
    ? `<li class="verified">${c}</li>`
    : `<li class="missing">SENSOR SITE ${i + 1} — NOT SCANNED. No data.</li>`
  ).join('');

  /* Scatter one beacon per clue — ONCE per checkpoint, at the start of the
     leg. This has to be guarded: logging a clue calls render(), and
     setClueSites() rebuilds every beacon from scratch with found=false.
     So each pickup silently wiped the engine's record of the sweep and
     re-scattered the remaining clues around the boat's new position — the
     gate could never close, and the clue you were chasing jumped away the
     moment you caught the one before it. */
  if (WORLD.setClueSites && inTransit() && !S.cp.sited){
    S.cp.sited = true;
    WORLD.setClueSites(sc.clues.length, idx => {
      if (S.cp.found.includes(idx)) return;
      S.cp.found.push(idx);
      AUDIO.telemetry();
      showClueCard(idx, sc.clues[idx], sc.clues.length);
      updateNavHud();
      render();
    });
  }
  renderNavBrief();

  // history
  const h = S.history;
  $('history').innerHTML = `
    <div class="hcell ok"><span class="n">${h.correct}</span><span class="l">CORRECT</span></div>
    <div class="hcell no"><span class="n">${h.incorrect}</span><span class="l">INCORRECT</span></div>
    <div class="hcell un"><span class="n">${h.uncertain}</span><span class="l">UNCERTAIN</span></div>`;

  // evidence log
  const ev = $('evidence');
  ev.innerHTML = S.cp.evidence.length
    ? S.cp.evidence.map(e => `<li class="${e.kind}">${e.text}</li>`).join('')
    : '<li class="empty">No evidence gathered.</li>';

  // ATLAS
  $('atlas-rec').textContent = '"' + sc.atlas.recommendation + '"';
  const pct = Math.round(sc.atlas.confidence * 100);
  $('conf-fill').style.width = pct + '%';
  $('conf-v').textContent = pct + '%';
  const reason = $('atlas-reason');
  reason.hidden = !S.cp.questioned;
  reason.textContent = '"' + sc.atlas.reasoning + '"';

  // buttons — nothing is decidable until you are on station
  const transit = inTransit();
  $$act('trust').disabled       = transit;
  $$act('override').disabled    = transit;
  $$act('question').disabled    = transit || S.cp.questioned;
  $$act('investigate').disabled = transit || S.cp.investigated || S.battery < DRONE_COST;
  document.querySelector('.switches').classList.toggle('locked', transit);

  updateHud();
  renderNavBrief();
}

function $$act(a){ return document.querySelector(`.sw[data-act="${a}"]`); }

function alarm(on){
  const c = document.querySelector('.cockpit');
  if (!c) return;
  c.classList.remove('alarm');
  if (on){ void c.offsetWidth; c.classList.add('alarm'); }
}

/* ============================================================
   CHANGE FEEDBACK
   Every dashboard value that moves gets a pulse, a floating delta
   and a tick; every sensor that crosses a threshold gets a banner
   and an audible alert. Nothing important changes silently.
   ============================================================ */
const STAT_PREV = Object.create(null);

function flashStat(id, value, opts){
  opts = opts || {};
  const el = $(id);
  if (!el) return;
  const prev = STAT_PREV[id];
  STAT_PREV[id] = value;
  if (prev === undefined || Math.abs(value - prev) < .5) return;

  const delta = value - prev;
  const good  = opts.invert ? delta < 0 : delta > 0;

  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');

  const row = el.closest('.ro') || el.closest('.r');
  if (row){
    row.classList.remove('flare', 'bad'); void row.offsetWidth;
    row.classList.add('flare'); if (!good) row.classList.add('bad');
  }

  const chip = document.createElement('span');
  chip.className = 'delta ' + (good ? 'up' : 'down');
  chip.textContent = (delta > 0 ? '+' : '') + Math.round(delta) + (opts.unit || '');
  el.appendChild(chip);
  setTimeout(() => chip.remove(), 1600);

  AUDIO.statTick(good);
}

/* --- sensor threshold monitoring --- */
const tierOf = v => v < 50 ? 'crit' : v < 70 ? 'warn' : 'ok';
let SENSOR_TIER = Object.create(null);

function monitorSensors(sc, reset){
  if (!sc) return;
  let worst = null;
  const rank = { crit: 2, warn: 1, ok: 0 };

  for (const [name, val] of Object.entries(sc.sensors)){
    const tier = tierOf(val);
    const was  = reset ? 'ok' : SENSOR_TIER[name];   // arriving fresh, anything
    SENSOR_TIER[name] = tier;                        // below nominal is news
    if (was === tier) continue;
    if (!worst || rank[tier] > rank[worst.tier]) worst = { name, tier, val };
  }
  // on arrival only announce problems; recovery chimes are for mid-checkpoint
  if (!worst || (reset && worst.tier === 'ok')) return;

  const gw = document.querySelector('.gauge-wrap');
  if (gw){
    gw.classList.remove('alarm', 'warn'); void gw.offsetWidth;
    if (worst.tier === 'crit') gw.classList.add('alarm');
    else if (worst.tier === 'warn') gw.classList.add('warn');
  }

  const el = $('sensor-alert');
  if (el){
    el.textContent = worst.tier === 'crit'
        ? `\u26a0 ${worst.name} DEGRADED \u2014 ${worst.val}% RELIABILITY`
      : worst.tier === 'warn'
        ? `\u25b3 ${worst.name} MARGINAL \u2014 ${worst.val}%`
        : `\u2713 ${worst.name} NOMINAL \u2014 ${worst.val}%`;
    el.className = worst.tier === 'ok' ? 'clear' : worst.tier;
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(window.__sensorAlertT);
    window.__sensorAlertT = setTimeout(() => { el.hidden = true; }, 2800);
  }

  if (worst.tier === 'crit')      AUDIO.alertCrit();
  else if (worst.tier === 'warn') AUDIO.alertWarn();
  else                            AUDIO.alertClear();
}

/* ============================================================
   INDICATOR BANK
   setLamp only repaints when the state actually changes, so the CSS
   blink animation is not restarted every frame (which would freeze it
   on its first frame and look broken). A state change also flares the
   bank and, for warn/crit, starts an audible tick in time with the
   blink so the panel reads without looking at it.
   ============================================================ */
const LAMP_STATE = Object.create(null);
const LAMP_TICK  = Object.create(null);
const BLINK_MS   = { warn: 1400, crit: 550 };

function setLamp(id, cls){
  const el = $(id); if (!el) return;
  cls = cls || '';
  if (LAMP_STATE[id] === cls) return;          // no change, leave the animation alone
  LAMP_STATE[id] = cls;
  el.className = 'lamp' + (cls ? ' ' + cls : '');

  const bank = document.querySelector('.lamps');
  if (bank){ bank.classList.remove('flare'); void bank.offsetWidth; bank.classList.add('flare'); }

  clearInterval(LAMP_TICK[id]);
  delete LAMP_TICK[id];
  if (cls === 'warn' || cls === 'crit'){
    AUDIO.blip(cls);
    LAMP_TICK[id] = setInterval(() => {
      // only tick while the game is actually on screen
      if (!$('screen-game').classList.contains('active')) return;
      AUDIO.blip(cls);
    }, BLINK_MS[cls]);
  }
}

/* Stop every tick — used when the mission ends, so the debrief is quiet. */
function silenceLamps(){
  for (const k in LAMP_TICK) clearInterval(LAMP_TICK[k]);
  for (const k in LAMP_TICK) delete LAMP_TICK[k];
}

/* Switch between the cockpit console and the clean navigation view.
   Inside view is unchanged; navigation hides the console entirely and
   gives the 3D the whole window, with corner-anchored telemetry. */
function applyView(nav){
  const ck = document.querySelector('.cockpit');
  ck.classList.toggle('external', nav);
  ck.classList.toggle('navmode', nav);
  $('navhud').hidden = !nav;
  if (nav && WORLD.startLeg && !S.legStarted){
    S.legStarted = true;
    WORLD.startLeg(onWaypoint);
  }
  syncViewport();
  updateNavHud();
}

/* Force a view rather than toggling — used when a leg starts (out into the
   water) and when you arrive on station (back to the dashboard). */
function setNavView(nav){
  if (!WORLD.getView) return;
  if ((WORLD.getView() === 'chase') !== nav && WORLD.toggleView) WORLD.toggleView();
  applyView(nav);
}

function setView(){
  const view = WORLD.toggleView ? WORLD.toggleView() : 'cockpit';
  applyView(view === 'chase');
  AUDIO.click();
}

/* Reaching the checkpoint ends the transit phase and drops you straight
   into the dashboard \u2014 you do not press anything to get there. */
function onWaypoint(){
  if (!S.cp || S.cp.phase === 'decide') return;
  S.cp.phase = 'decide';
  AUDIO.chime();
  atlasSay(scenario().atlas.recommendation);
  if (WORLD.clearClueSites) WORLD.clearClueSites();   // the leg is over
  const cc = $('clue-card'); if (cc) cc.hidden = true;
  setNavView(false);
  showPing('\u25c9 ON STATION \u00b7 ATLAS IS AWAITING YOUR DECISION');
  render();
}

/* Creature contact. Ambience became hazard: brushing one costs hull, which
   is the same pool the decision scoring draws on, so careless flying eats
   the margin you need for the calls that matter. */
const CREATURE_DAMAGE = 6;

/* ---- scan power: the thing that makes flying matter ----
   Each leg gives you a fixed budget that only drains under thrust. Three
   clue markers are scattered further than that budget comfortably reaches,
   so you cannot have all three AND fly carelessly. Whatever you fail to
   scan you simply do not know when you reach the console — the clue stays
   blank, and you decide on a thinner picture.

   That is the whole point of the flying half. Before this, the console
   showed you every clue whether you had earned it or not, which made the
   transit a corridor rather than a choice.

   Tuning note: drain is proportional to throttle and throttle is
   speed/MAX_SPD, so the cost per unit of DISTANCE is constant
   (DRAIN / MAX_SPD) no matter how fast you fly. That is deliberate — it
   means flying slowly to conserve power does not work, and the only thing
   that actually saves power is choosing a shorter route.

   Budgeted against the real path: the checkpoint sits ~240 units out, and
   detouring through all three beacons costs roughly 390. At 8 per second
   over a 32 m/s top speed that is ~0.17 power per unit, giving a budget of
   roughly 580 units of travel. Measured against real flying rather than
   the straight-line ideal: a clean run through all three beacons and on to
   the checkpoint is ~400 units, so a competent pilot gets everything with
   slack. Overshooting markers and circling back burns 30-50% more, which
   is where the second and third clue start to slip away. */
const SCAN_POWER   = 100;
const SCAN_DRAIN   = 5.5;    // per second at full thrust
const SCAN_IDLE    = 0;      // holding station is free; only travel costs

/* Creature contact. Ambience became hazard: brushing one costs hull, which
   is the same pool the decision scoring draws on, so careless flying eats
   the margin you need for the calls that matter. */
function onCreatureHit(type){
  if (!S || S.hull <= 0) return;
  S.hull = Math.max(0, S.hull - CREATURE_DAMAGE);
  AUDIO.impact(); AUDIO.klaxon(); AUDIO.setHull(S.hull);
  alarm(true);
  showPing('\u26a0 CONTACT \u2014 ' + String(type).toUpperCase() +
           ' \u00b7 HULL \u2212' + CREATURE_DAMAGE + '%');
  updateHud(); updateNavHud();
  if (S.hull <= 0){ $('outcome').hidden = true; debrief(true); }
}

/* The clue itself, on screen, the moment you scan it. This is the actual
   payload of flying the leg — the three observations you will be weighing
   against ATLAS at the console — so it gets a card rather than a ticker.
   It lives outside .cockpit because the external view hides the cockpit,
   porthole and all, which is exactly where you are when you scan one. */
let clueCardTimer;
function showClueCard(idx, text, total){
  const el = $('clue-card');
  if (!el){ showPing('◈ CLUE LOGGED · ' + (text || '')); return; }
  const done = S.cp.found.length;
  el.querySelector('.cc-n').textContent = `CLUE ${done} / ${total}`;
  el.querySelector('.cc-tag').textContent =
    done >= total ? '✓ SWEEP COMPLETE · CHECKPOINT OPEN' : '✓ LOGGED';
  el.querySelector('.cc-body').textContent = text || '';
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(clueCardTimer);
  clueCardTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

/* Burn scan power while flying. When it runs out the boat loses thrust,
   the autopilot takes it the rest of the way, and the checkpoint opens on
   whatever evidence you managed to gather. You are never stranded — you
   just arrive knowing less than you wanted to. */
function drainPower(dt){
  if (!S || !S.cp || !inTransit() || S.cp.powerOut) return;
  const thr = WORLD.throttle ? WORLD.throttle() : 0;
  S.cp.power = Math.max(0, S.cp.power - dt * (SCAN_IDLE + SCAN_DRAIN * thr));
  if (S.cp.power <= 0){
    S.cp.powerOut = true;
    if (WORLD.setPowerOut) WORLD.setPowerOut(true);
    AUDIO.alertCrit();
    const missed = scenario().clues.length - S.cp.found.length;
    showPing(missed > 0
      ? `⚠ SCAN POWER EXHAUSTED · ${missed} CLUE${missed === 1 ? '' : 'S'} UNSCANNED · PROCEEDING`
      : '⚠ SCAN POWER EXHAUSTED · PROCEEDING TO CHECKPOINT');
  }
}

/* Bumping a locked checkpoint should say why, not silently do nothing. */
function onCheckpointBlocked(remaining){
  AUDIO.alertWarn();
  showPing(`⚠ CHECKPOINT LOCKED · ${remaining} CLUE${remaining === 1 ? '' : 'S'} STILL TO SCAN`);
  const obj = $('nh-objective');
  if (obj){
    obj.style.animation = 'none'; void obj.offsetWidth;
    obj.style.animation = 'clueIn .3s';
  }
}

/* ATLAS's voice. Routed through one helper so muting, interrupting and the
   avatar state stay in step, and so the whole feature is one no-op away
   from being switched off. */
function atlasSay(text, opts){
  if (typeof ATLAS_AV === 'undefined') return;
  if (typeof TUTORIAL !== 'undefined' && TUTORIAL.isRunning()) return;  // don't talk over the tour
  ATLAS_AV.speak(text, Object.assign({ rest: 'idle' }, opts || {}));
}

function setVoice(on){
  if (typeof ATLAS_AV === 'undefined') return;
  ATLAS_AV.setMuted(!on);
  const b = $('atlas-voice');
  if (b){
    b.textContent = on ? '● VOICE ON' : '○ VOICE OFF';
    b.classList.toggle('off', !on);
  }
  try { localStorage.setItem('trustline.voice', on ? '1' : '0'); } catch (e){}
}

let pingTimer;
function showPing(text){
  // #clue-tick is inside the porthole, which the external view hides
  // entirely — so in nav mode the notice goes to the HUD's own slot.
  const nav = !$('navhud').hidden;
  const el = $(nav ? 'nav-ping' : 'clue-tick');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(pingTimer);
  pingTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---- navigation telemetry, refreshed continuously ---- */
/* The scope shows two things at once: the scripted sensor returns that carry
   the checkpoint's narrative, and live navigation contacts (clue beacons and
   the waypoint) so the player can actually steer by it. */
function refreshRadar(){
  const sc = scenario();
  if (!sc) return;
  const scripted = (CONTACTS[sc.id] || []).map(c => ({ ...c, kind: 'sensor' }));
  const live = WORLD.radarContacts ? WORLD.radarContacts() : [];
  SONAR.set(scripted.concat(live), sc.sensors.SONAR);
}

function updateNavHud(){
  if ($('navhud').hidden) return;
  const sc = scenario();
  /* Steer the player at one thing at a time: the live clue beacon while any
     are outstanding, then the checkpoint. */
  const cp = WORLD.navTarget ? WORLD.navTarget()
           : WORLD.checkpointInfo ? WORLD.checkpointInfo() : null;
  const cl = $('nh-target-label');
  if (cl) cl.textContent = (cp && cp.kind === 'clue')
    ? 'NEXT CLUE · ' + (cp.index + 1) + ' OF ' + (sc ? sc.clues.length : 3)
    : 'NEXT WAYPOINT';

  $('nh-cp').textContent    = (S.i + 1) + ' / ' + SCENARIOS.length;
  $('nh-depth').textContent = WORLD.depth();
  $('nh-speed').textContent = WORLD.boatSpeed().toFixed(1);
  $('nh-hdg').textContent   = String(Math.round(WORLD.heading())).padStart(3, '0');

  if (cp){
    $('nh-dist').textContent = cp.dist;
    const v = $('nh-vert');
    if (cp.vert > 4){ v.textContent = '\u25b2 climb'; v.className = 'cv up'; }
    else if (cp.vert < -4){ v.textContent = '\u25bc dive'; v.className = 'cv down'; }
    else { v.textContent = '\u25cf level'; v.className = 'cv'; }
    $('nh-needle').style.transform = `translate(-50%,-100%) rotate(${cp.rel}deg)`;
  } else {
    $('nh-dist').textContent = '\u2014';
    $('nh-vert').textContent = '\u25cf arrived';
  }

  // clues collected out of total
  const prog = WORLD.clueProgress ? WORLD.clueProgress()
                                  : { found: S.cp.found.length, total: sc ? sc.clues.length : 0 };
  const found = Math.max(prog.found, S.cp.found.length);
  const total = prog.total || (sc ? sc.clues.length : 0);
  const cc = $('nh-clues');
  const allFound = found >= total && total > 0;
  cc.textContent = `\u25c8 CLUES ${found}/${total}`;
  cc.className = 'cc' + (allFound ? '' : ' partial');

  // the standing objective tells you which half of the leg you are in
  const obj = $('nh-objective');
  if (obj){
    obj.textContent = allFound
      ? '\u25c9 CLUE SWEEP COMPLETE \u00b7 PROCEED TO THE CHECKPOINT'
      : `\u25c8 SCAN ALL ${total} CLUE MARKERS \u2014 THE CHECKPOINT IS LOCKED`;
    obj.className = allFound ? 'open' : '';
  }

  bar('nh-hull',  'nhb-hull',  S.hull,  { unit: '%' });
  bar('nh-drone', 'nhb-drone', S.battery, { unit: '%' });
  bar('nh-cal',   'nhb-cal',   S.calibration);
  bar('nh-scan',  'nhb-scan',  S.cp ? S.cp.power : 0, { unit: '%' });
  const m = String(Math.floor(S.time / 60)).padStart(2, '0');
  const sec = String(S.time % 60).padStart(2, '0');
  $('nh-time').textContent = `${m}:${sec}`;
}

function bar(valId, barId, pct, opts){
  const v = $(valId), b = $(barId);
  if (!v || !b) return;
  v.textContent = Math.round(pct);
  flashStat(valId, pct, opts);
  const cls = pct < 30 ? 'crit' : pct < 60 ? 'warn' : '';
  v.className = 'v ' + cls;
  b.className = cls;
  b.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function renderNavBrief(){
  const el = $('nav-brief');
  if (!el) return;
  const sc = scenario();
  if (!sc){ el.textContent = ''; return; }
  const done = S.cp.found.length, total = sc.clues.length;
  el.innerHTML = `<b>${sc.name}</b> &nbsp;&middot;&nbsp; ${sc.brief} ` +
    `&nbsp;&middot;&nbsp; <span class="${done === total ? 'found' : ''}">` +
    `CLUES ${done}/${total} VERIFIED</span>`;
}

function updateHud(){
  const sc = scenario();
  if (sc){                                  // no scenario once the mission is over
    setLamp('lamp-atlas', sc.atlas.confidence < .6 ? 'warn' : 'on');
    setLamp('lamp-drone', S.battery < DRONE_COST ? 'dead' : 'on');
    setLamp('lamp-hull', S.hull < 25 ? 'crit' : S.hull < 60 ? 'warn' : 'on');

    // SCAN — the leg's power budget
    const pw = S.cp ? S.cp.power : 100;
    setLamp('lamp-scan', !inTransit() ? 'on'
                       : pw <= 0  ? 'dead'
                       : pw < 25  ? 'crit'
                       : pw < 55  ? 'warn' : 'on');

    // EVIDENCE — how much of the clue sweep is in hand
    const got = S.cp ? S.cp.found.length : 0, need = sc.clues.length;
    setLamp('lamp-evid', got >= need ? 'on' : got === 0 ? 'crit' : 'warn');

    // LINK — degraded whenever the array ATLAS is leaning on is weak
    const worstCited = Math.min(...sc.atlas.cites.map(c => sc.sensors[c] || 100));
    setLamp('lamp-link', worstCited < 50 ? 'crit' : worstCited < 70 ? 'warn' : 'on');
  }

  $('stat-cal').textContent  = Math.round(S.calibration);
  flashStat('stat-cal', S.calibration);
  $('stat-bat').textContent  = S.battery + '%';
  flashStat('stat-bat', S.battery, { unit: '%' });
  const hEl = $('stat-hull');
  if (hEl){
    hEl.textContent = Math.round(S.hull) + '%';
    flashStat('stat-hull', S.hull, { unit: '%' });
    hEl.className = 'v' + (S.hull < 35 ? ' crit' : S.hull < 70 ? ' warn' : '');
  }
  const m = String(Math.floor(S.time / 60)).padStart(2,'0');
  const s = String(S.time % 60).padStart(2,'0');
  $('stat-time').textContent = `${m}:${s}`;
}

/* ---------------- actions ---------------- */
function act(a){
  const sc = scenario();
  if (inTransit()){                 // clues first, then decide
    AUDIO.click();
    showPing('◈ SCAN ALL THREE CLUE MARKERS, THEN REACH THE CHECKPOINT');
    return;
  }

  AUDIO.click();

  if (a === 'question'){
    S.cp.questioned = true;
    AUDIO.chirp();
    S.time += QUESTION_TIME;
    S.cp.evidence.push({ kind:'', text:`ATLAS reasoning requested. Cites: ${sc.atlas.cites.join(', ')}.` });
    atlasSay(sc.atlas.reasoning, { state: 'thinking' });
    bump(sc.scoring.question.delta);
    render();
    return;
  }

  if (a === 'investigate'){
    S.cp.investigated = true;
    AUDIO.droneLaunch();
    setTimeout(() => AUDIO.telemetry(), 1500);
    S.battery -= DRONE_COST;
    S.time += DRONE_TIME;
    S.cp.evidence.push({ kind:'drone', text:'DRONE — ' + sc.drone.reveals });
    setTimeout(() => atlasSay(sc.drone.reveals), 1600);
    bump(sc.scoring.investigate.delta);
    render();
    return;
  }

  commit(a); // trust | override
}

function bump(d){ S.calibration = Math.max(0, Math.min(100, S.calibration + d)); }

function commit(a){
  const sc  = scenario();
  /* Deliberately NOT revealing the clues you failed to scan. They were the
     stake you were flying for; handing them over at the moment of decision
     would make the transit pointless. The outcome card tells you what was
     really out there, so nothing is hidden forever — only hidden while it
     could still have changed your mind. */
  if (WORLD.clearClueSites) WORLD.clearClueSites();
  if (WORLD.resumeAuto) WORLD.resumeAuto();
  const rule = sc.scoring[a];
  const gathered = S.cp.questioned || S.cp.investigated;

  let delta = rule.delta;
  if (rule.ifEvidence !== undefined && !gathered) delta = rule.elseDelta;

  // did the player follow a wrong ATLAS, or reject a right one?
  if (a === 'trust'    && !sc.atlas.correct) S.overtrust++;
  if (a === 'override' &&  sc.atlas.correct) S.undertrust++;

  // ATLAS track record, as the player now sees it
  if (sc.atlas.confidence < 0.6)    S.history.uncertain++;
  else if (sc.atlas.correct)        S.history.correct++;
  else                              S.history.incorrect++;

  bump(delta);

  // a miscalibrated call is paid for in hull integrity
  let damage = 0;
  if (delta < 0){
    damage = Math.round(-delta * HULL_PER_POINT);
    S.hull = Math.max(0, S.hull - damage);
    AUDIO.impact(); AUDIO.klaxon(); AUDIO.setHull(S.hull);
    WORLD.shake && WORLD.shake(Math.min(1, -delta / 18));
    alarm(true);
  } else {
    AUDIO.chime();
  }

  S.record.push({ cp: sc.id, name: sc.name, action: a, delta, damage, note: rule.note, gathered });
  updateHud();
  showOutcome(a, delta, rule.note, damage);
}

/* ---------------- outcome ---------------- */
function showOutcome(a, delta, note, damage){
  const sc = scenario();
  const good = delta > 0;

  const v = $('outcome-verdict');
  v.className = 'outcome-verdict ' + (good ? 'good' : 'bad');
  v.textContent = good ? 'SOUND DECISION' : 'MISCALIBRATED';

  $('outcome-truth').textContent =
    (a === 'trust' ? 'You accepted the recommendation. ' : 'You overrode ATLAS. ') +
    (sc.atlas.correct ? 'ATLAS was correct.' : 'ATLAS was wrong.');

  $('outcome-note').textContent = note;

  /* Whatever you failed to scan is revealed here — after the decision, where
     it can teach without having helped. */
  const missed = sc.clues.filter((_, i) => !S.cp.found.includes(i));
  const mEl = $('outcome-missed');
  if (mEl){
    mEl.hidden = missed.length === 0;
    if (missed.length) mEl.innerHTML =
      `<div class="om-h">◇ ${missed.length} CLUE${missed.length === 1 ? '' : 'S'} YOU NEVER SCANNED</div>` +
      missed.map(c => `<div class="om-i">${c}</div>`).join('');
  }

  const d = $('outcome-delta');
  d.className = 'outcome-delta ' + (good ? 'pos' : 'neg');
  d.innerHTML = (delta > 0 ? '+' : '') + delta + ' TRUST CALIBRATION' +
    (damage ? `<span class="dmg">HULL &minus;${damage}%  &middot;  ${Math.round(S.hull)}% REMAINING</span>` : '');

  $('btn-next').textContent = S.hull <= 0 ? 'ABANDON BOAT' : 'CONTINUE';

  $('outcome').hidden = false;
}

function next(){
  $('outcome').hidden = true;
  if (S.hull <= 0){ debrief(true); return; }     // lost the boat
  AUDIO.thrust();
  S.i++;
  if (S.i >= SCENARIOS.length){ debrief(); return; }
  S.cp = newCp();
  S.legStarted = false;
  if (WORLD.resetLegPower) WORLD.resetLegPower();
  if (WORLD.startLeg){ S.legStarted = true; WORLD.startLeg(onWaypoint); }
  WORLD.pulse();
  render();
  if (USING_3D) setNavView(true);        // out into the water for the next leg
}

/* ---------------- debrief ---------------- */
function debrief(breached){
  clearInterval(S.timer);
  clearInterval(S.hudTick);
  clearInterval(S.sonarPing);
  silenceLamps();
  AUDIO.setMusicVolume(0.10);        // duck under the diagnosis, do not cut it

  /* Leave the external view before showing the debrief. #navhud is a
     sibling of the screens at z-index 6, so it is not hidden by switching
     screens: finishing the mission from the nav view used to leave the
     corner cards and the "REACH THE WAYPOINT" banner painted over the
     profile text — on top of the one screen that carries the lesson. */
  if (typeof setNavView === 'function') setNavView(false);
  $('navhud').hidden = true;
  const cc = $('clue-card');  if (cc) cc.hidden = true;
  const np = $('nav-ping');   if (np) np.hidden = true;
  WORLD.setMode('title');
  if (breached) AUDIO.breach();

  let profile, desc;
  const errors = S.overtrust + S.undertrust;

  if (breached){
    profile = 'HULL BREACH';
    desc = `The boat was lost at checkpoint ${S.i + 1} of 10. Miscalibrated decisions cost hull integrity, and enough of them cost the mission. Reaching the safe zone was never only about the final call — it was about not spending the boat getting there.`;
    renderDebrief(profile, desc); return;
  }


  const bothWays = S.overtrust >= 1 && S.undertrust >= 1;
  if (bothWays && errors >= 4){
    profile = 'ERRATIC';
    desc = 'You misread ATLAS in both directions — trusting it where the sensors contradicted it, and rejecting it where they backed it up. That is not scepticism, it is coin-flipping. Calibration means your confidence in a teammate moves with the evidence, consistently, in one direction at a time.';
  } else if (S.overtrust >= 3 && S.overtrust > S.undertrust){
    profile = 'OVERTRUST';
    desc = 'You followed recommendations that the sensor picture did not support. ATLAS sounded certain and you took certainty for correctness. Confidence is a statement about the model, not about the water.';
  } else if (S.undertrust >= 3 && S.undertrust > S.overtrust){
    profile = 'UNDERTRUST';
    desc = 'You rejected well-evidenced recommendations. After ATLAS was wrong once you stopped reading its reasoning — but blanket distrust throws away a teammate that was right more often than not. Scepticism is selective; distrust is not.';
  } else {
    profile = 'CALIBRATED COMMANDER';
    desc = errors === 0
      ? 'You read every checkpoint correctly. You trusted ATLAS where the sensors backed it — including at 41% confidence — and rejected it where they did not, including at 94%. That is the whole skill.'
      : `Your reliance on ATLAS tracked the evidence behind it. ${errors} call${errors>1?'s':''} went the wrong way, but there is no pattern to them — you were not deferring to the AI or reflexively fighting it. That is calibration with normal human error, which is the realistic target.`;
  }

  renderDebrief(profile, desc);
}

function renderDebrief(profile, desc){
  $('profile').textContent = profile;
  $('profile-desc').textContent = desc;

  const investigations = S.record.filter(r => r.gathered).length;
  $('score-grid').innerHTML = `
    <div class="score-cell"><span class="n">${Math.round(S.calibration)}</span><span class="l">TRUST CALIBRATION</span></div>
    <div class="score-cell"><span class="n">${S.overtrust}</span><span class="l">OVERTRUST EVENTS</span></div>
    <div class="score-cell"><span class="n">${S.undertrust}</span><span class="l">UNDERTRUST EVENTS</span></div>
    <div class="score-cell"><span class="n">${investigations}/${S.record.length}</span><span class="l">EVIDENCE-BACKED</span></div>
    <div class="score-cell"><span class="n">${Math.round(S.hull)}%</span><span class="l">HULL INTEGRITY</span></div>
    <div class="score-cell"><span class="n">${S.battery}%</span><span class="l">DRONE REMAINING</span></div>`;

  $('record').innerHTML = S.record.map(r => `
    <li>
      <div class="rh">
        <span>CP${r.cp} — ${r.name} &middot; ${r.action.toUpperCase()}${r.gathered ? ' (evidence gathered)' : ''}</span>
        <span class="${r.delta > 0 ? 'pos' : 'neg'}">${r.delta > 0 ? '+' : ''}${r.delta}${r.damage ? ` &middot; hull &minus;${r.damage}%` : ''}</span>
      </div>
      <div class="rn">${r.note}</div>
    </li>`).join('');

  show('screen-debrief');
}

/* ---------------- boot ---------------- */
function startMission(){
  S = newState();
  S.cp = newCp();
  S.legStarted = true;
  if (WORLD.resetLegPower) WORLD.resetLegPower();
  if (WORLD.onCreatureHit) WORLD.onCreatureHit(onCreatureHit);
  if (WORLD.onCheckpointBlocked) WORLD.onCheckpointBlocked(onCheckpointBlocked);
  if (WORLD.startLeg) WORLD.startLeg(onWaypoint);
  S.timer = setInterval(() => { S.time++; updateHud(); }, 1000);
  if (S.hudTick) clearInterval(S.hudTick);
  S.hudTick = setInterval(() => { drainPower(0.1); updateNavHud(); refreshRadar(); }, 100);
  AUDIO.init(); AUDIO.setHull(100);
  AUDIO.startMusic();
  if (S.sonarPing) clearInterval(S.sonarPing);
  S.sonarPing = setInterval(() => AUDIO.ping(), 6400);
  WORLD.setMode('game');
  show('screen-game');
  render();
  // the mission opens in the water, not at the console
  if (USING_3D) setNavView(true);
  requestAnimationFrame(syncViewport);
}

WORLD.start();
SONAR.init('scope');
GAUGES.init('gauges');

/* ---- ATLAS avatar + voice ---- */
if (typeof ATLAS_AV !== 'undefined'){
  ATLAS_AV.mount($('atlas-av'));
  let voiceOn = true;
  try { voiceOn = localStorage.getItem('trustline.voice') !== '0'; } catch (e){}
  setVoice(voiceOn);
  const vb = $('atlas-voice');
  if (vb) vb.onclick = () => { AUDIO.click(); setVoice(ATLAS_AV.muted()); };
}

/* ============================================================
   INTRO FILM
   Plays in place of the typed briefing. Ends -> ACKNOWLEDGE fires
   automatically. Skip -> same thing, immediately. It is wired so
   there is no path where the player gets stuck staring at it:
   skip button, ESC, Enter, Space, or a click on the video itself.
   ============================================================ */
const INTRO = (() => {
  const wrap = $('intro-wrap'), vid = $('intro-video');
  let done = false;

  /* Whatever ends the film -- finishing, skipping, or failing to load --
     lands here exactly once, and does what ACKNOWLEDGE used to do. */
  function finish(){
    if (done) return;
    done = true;
    if (vid){ try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch(e){} }
    if (wrap) wrap.hidden = true;
    if (WORLD.setPaused) WORLD.setPaused(false);
    beginMission();
  }

  /* No video, or it will not decode: fall back to the typed briefing so
     the game still opens. */
  function fallback(){
    if (done) return;
    done = true;
    if (wrap) wrap.hidden = true;
    if (WORLD.setPaused) WORLD.setPaused(false);
    const txt = $('brief-text');
    if (txt){ txt.hidden = false; playBriefing(); }
  }

  function play(){
    if (!wrap || !vid){ fallback(); return; }
    done = false;
    wrap.hidden = false;
    /* The film covers the whole window. Every frame the 3D scene draws
       behind it is invisible and stolen from the video decoder, so put the
       renderer to sleep for the duration. */
    if (WORLD.setPaused) WORLD.setPaused(true);
    vid.currentTime = 0;
    vid.muted = false;
    vid.volume = 1;

    /* BEGIN MISSION was a real click, so sound-on autoplay is normally
       allowed. If the browser still refuses, offer a click-to-play rather
       than silently showing a frozen frame. */
    const p = vid.play();
    if (p && p.catch) p.catch(() => {
      const hint = $('intro-hint');
      if (hint){
        hint.hidden = false;
        hint.onclick = () => { hint.hidden = true; vid.muted = false; vid.play().catch(fallback); };
      }
    });
  }

  if (vid){
    vid.addEventListener('ended', finish);
    vid.addEventListener('error', fallback);
    vid.addEventListener('click', finish);
    vid.addEventListener('timeupdate', () => {
      const bar = $('intro-progress');
      if (bar && vid.duration) bar.style.width = (vid.currentTime / vid.duration * 100) + '%';
    });
  }
  const sk = $('btn-skip-intro');
  if (sk) sk.onclick = (e) => { e.stopPropagation(); AUDIO.click(); finish(); };

  document.addEventListener('keydown', e => {
    if (done || !wrap || wrap.hidden) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' '){
      e.preventDefault(); e.stopPropagation(); finish();
    }
  }, true);

  return { play, finish, running(){ return wrap && !wrap.hidden && !done; } };
})();

$('btn-begin').onclick = () => {
  AUDIO.init(); AUDIO.click();
  show('screen-brief');
  INTRO.play();
};

/* First run gets the guided tour. It needs the cockpit built and a leg
   under way, so it starts the mission first and opens the tutorial over
   the top of it. */
function beginMission(){
  startMission();
  if (typeof TUTORIAL !== 'undefined' && !TUTORIAL.seen()){
    setTimeout(() => TUTORIAL.start({ onDone: () => { if (USING_3D) setNavView(true); } }), 500);
  }
}
$('btn-start').onclick = beginMission;

const tb = $('btn-tutorial');
if (tb) tb.onclick = () => {
  AUDIO.init(); AUDIO.click();
  startMission();
  setTimeout(() => TUTORIAL.start({ onDone: () => { if (USING_3D) setNavView(true); } }), 500);
};
$('btn-next').onclick    = next;
$('btn-restart').onclick = () => {
  $('outcome').hidden = true; silenceLamps();
  AUDIO.setMusicVolume(0.22);
  WORLD.setMode('title'); WORLD.setCheckpoint(0); show('screen-title');
};
document.querySelectorAll('.sw').forEach(b => b.onclick = () => act(b.dataset.act));

/* Keyboard. 1-4 are the four actions. Shift+1..0 jumps checkpoints for the
   judge demo. M mutes. Enter/Space advances the outcome card. */
const ACTS = ['trust', 'question', 'investigate', 'override'];
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const gameUp = $('screen-game').classList.contains('active');

  if (e.key === 'm' || e.key === 'M'){
    AUDIO.init();
    const m = AUDIO.toggleMute();
    if (typeof ATLAS_AV !== 'undefined') setVoice(!m);
    return;
  }
  if (e.key === 'v' || e.key === 'V'){ setView(); return; }
  if (e.key === 'c' || e.key === 'C'){ WORLD.resumeAuto && WORLD.resumeAuto(); AUDIO.click(); return; }
  if (e.key === 'p' || e.key === 'P'){
    const q = WORLD.toggleQuality ? WORLD.toggleQuality() : 'n/a';
    const el = $('cp-label');
    if (el){ const old = el.textContent; el.textContent = 'GRAPHICS: ' + q.toUpperCase();
             setTimeout(() => { el.textContent = old; }, 1200); }
    return;
  }

  if (!$('outcome').hidden){
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); next(); }
    return;
  }
  if (!gameUp){
    if (e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if ($('screen-title').classList.contains('active')) $('btn-begin').click();
      else if ($('screen-brief').classList.contains('active') && !INTRO.running()) beginMission();
    }
    return;
  }

  /* Judge mode: shift+digit jumps straight to a checkpoint. 1-9 are CP1-CP9,
     0 is CP10.

     Read e.code, not e.key. e.key gives the *shifted* character, which is
     US-layout-specific — on a UK keyboard shift+3 is £, on German QWERTZ
     shift+7 is /. Any layout that misses the expected symbol used to fall
     through to the digit handler below and commit a real, irreversible
     decision: shift+3 silently spent 25% of the drone battery.

     So: match on the physical key, and return unconditionally for any
     shift+digit, whether or not the jump itself is in range. */
  if (e.shiftKey && (/^Digit[0-9]$/.test(e.code || '') || /^[!@#$%^&*()]$/.test(e.key))){
    e.preventDefault();
    const digit = /^Digit[0-9]$/.test(e.code || '')
      ? +e.code.slice(5)
      : ')!@#$%^&*('.indexOf(e.key);       // US-layout fallback, same 0-9 map
    const idx = (digit === 0 ? 10 : digit) - 1;
    if (idx >= 0 && idx < SCENARIOS.length){
      S.i = idx;
      S.cp = newCp();
      /* Judge mode lands you on station with the sweep already done. The
         five-minute demo is about the decision, and making a judge fly
         three beacons first is exactly how a demo stalls. */
      S.cp.phase = 'decide';
      SCENARIOS[idx].clues.forEach((_, n) => S.cp.found.push(n));
      S.legStarted = true;
      WORLD.setCheckpoint(S.i);
      if (WORLD.clearClueSites) WORLD.clearClueSites();
      setNavView(false);
      render();
    }
    return;
  }
  if (/^[wasdqe]$/i.test(e.key)) return;    // driving, not deciding
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 4){
    const btn = $$act(ACTS[n - 1]);
    if (btn && !btn.disabled) act(ACTS[n - 1]);
  }
});
