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

function newCp(){ return { questioned:false, investigated:false, evidence:[], found:[], fresh:true }; }

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
  $('clues').innerHTML = sc.clues.map((c, i) =>
    `<li class="${S.cp.found.includes(i) ? 'verified' : 'unverified'}">${c}</li>`).join('');

  // scatter one beacon per clue for this checkpoint
  if (WORLD.setClueSites){
    WORLD.setClueSites(sc.clues.length, idx => {
      if (S.cp.found.includes(idx)) return;
      S.cp.found.push(idx);
      AUDIO.telemetry();
      showPing('\u25c8 CLUE LOGGED \u00b7 ' + (sc.clues[idx] || ''));
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

  // buttons
  $$act('question').disabled    = S.cp.questioned;
  $$act('investigate').disabled = S.cp.investigated || S.battery < DRONE_COST;

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

function setLamp(id, cls){
  const el = $(id); if (!el) return;
  el.className = 'lamp' + (cls ? ' ' + cls : '');
}

/* Switch between the cockpit console and the clean navigation view.
   Inside view is unchanged; navigation hides the console entirely and
   gives the 3D the whole window, with corner-anchored telemetry. */
function setView(){
  const view = WORLD.toggleView ? WORLD.toggleView() : 'cockpit';
  const nav = view === 'chase';
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
  AUDIO.click();
}

function onWaypoint(){
  AUDIO.chime();
  showPing('WAYPOINT REACHED \u00b7 ATLAS IS WAITING \u2014 PRESS V');
}

let pingTimer;
function showPing(text){
  const el = $('clue-tick');
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
  const cp = WORLD.checkpointInfo ? WORLD.checkpointInfo() : null;

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
  cc.textContent = `\u25c8 CLUES ${found}/${total}`;
  cc.className = 'cc' + (found >= total && total > 0 ? '' : ' partial');

  bar('nh-hull',  'nhb-hull',  S.hull,  { unit: '%' });
  bar('nh-drone', 'nhb-drone', S.battery, { unit: '%' });
  bar('nh-cal',   'nhb-cal',   S.calibration);
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
    setLamp('lamp-hull', S.hull < 35 ? 'dead' : S.hull < 70 ? 'warn' : 'on');
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

  AUDIO.click();

  if (a === 'question'){
    S.cp.questioned = true;
    AUDIO.chirp();
    S.time += QUESTION_TIME;
    S.cp.evidence.push({ kind:'', text:`ATLAS reasoning requested. Cites: ${sc.atlas.cites.join(', ')}.` });
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
    bump(sc.scoring.investigate.delta);
    render();
    return;
  }

  commit(a); // trust | override
}

function bump(d){ S.calibration = Math.max(0, Math.min(100, S.calibration + d)); }

function commit(a){
  const sc  = scenario();
  sc.clues.forEach((_, i) => { if (!S.cp.found.includes(i)) S.cp.found.push(i); });
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
  if (WORLD.startLeg) WORLD.startLeg(onWaypoint);
  WORLD.pulse();
  render();
}

/* ---------------- debrief ---------------- */
function debrief(breached){
  clearInterval(S.timer);
  WORLD.setMode('title');
  if (breached) AUDIO.breach();

  let profile, desc;
  const errors = S.overtrust + S.undertrust;

  if (breached){
    profile = 'HULL BREACH';
    desc = `The boat was lost at checkpoint ${S.record[S.record.length-1].cp} of 10. Miscalibrated decisions cost hull integrity, and enough of them cost the mission. Reaching the safe zone was never only about the final call — it was about not spending the boat getting there.`;
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
  if (WORLD.startLeg) WORLD.startLeg(onWaypoint);
  S.timer = setInterval(() => { S.time++; updateHud(); }, 1000);
  if (S.hudTick) clearInterval(S.hudTick);
  S.hudTick = setInterval(() => { updateNavHud(); refreshRadar(); }, 100);
  AUDIO.init(); AUDIO.setHull(100);
  if (S.sonarPing) clearInterval(S.sonarPing);
  S.sonarPing = setInterval(() => AUDIO.ping(), 6400);
  WORLD.setMode('game');
  show('screen-game');
  render();
  requestAnimationFrame(syncViewport);
}

WORLD.start();
SONAR.init('scope');
GAUGES.init('gauges');

$('btn-begin').onclick   = () => { AUDIO.init(); AUDIO.click(); show('screen-brief'); playBriefing(); };
$('btn-start').onclick   = startMission;
$('btn-next').onclick    = next;
$('btn-restart').onclick = () => { $('outcome').hidden = true; WORLD.setMode('title'); WORLD.setCheckpoint(0); show('screen-title'); };
document.querySelectorAll('.sw').forEach(b => b.onclick = () => act(b.dataset.act));

/* Keyboard. 1-4 are the four actions. Shift+1..0 jumps checkpoints for the
   judge demo. M mutes. Enter/Space advances the outcome card. */
const ACTS = ['trust', 'question', 'investigate', 'override'];
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const gameUp = $('screen-game').classList.contains('active');

  if (e.key === 'm' || e.key === 'M'){ AUDIO.init(); AUDIO.toggleMute(); return; }
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
      else if ($('screen-brief').classList.contains('active')) $('btn-start').click();
    }
    return;
  }

  // judge mode: shift+digit jumps straight to a checkpoint
  if (e.shiftKey && /^[!@#$%^&*()]$/.test(e.key)){
    const idx = ')!@#$%^&*('.indexOf(e.key);
    if (idx >= 0 && idx < SCENARIOS.length){
      e.preventDefault();
      S.i = idx; S.cp = newCp(); WORLD.setCheckpoint(S.i); render();
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
