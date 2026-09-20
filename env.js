/* ============================================================
   TRUSTLINE: ABYSS — LIVING ENVIRONMENT  (high-res painterly)
   Procedural underwater world. No image assets.
   Drawn in a 1920x1080 virtual space, "cover"-scaled to the
   viewport at device pixel ratio, so composition is stable
   and edges stay crisp on retina.
   API:  ENV.start()  ENV.setCheckpoint(i)  ENV.setMode(m)  ENV.pulse()
   ============================================================ */

const ENV = (() => {

const VW = 1920, VH = 1080;                 // virtual design space
let cv, ctx, t = 0, scroll = 0, cp = 0;
let running = false, mode = 'title';
let fish = [], snow = [], kelp = [], glows = [], wash = [], corals = [];

/* ---- palettes: one per checkpoint, tracking the story's mood ---- */
const PAL = [
  { name:'calibration',
    sky:['#2a86a6','#125169','#08283a','#041420'],
    far:'#17506a', mid:'#0e3a52', near:'#041724',
    rim:'#6fdcf0', kelp:'#1a8a88', kelpLit:'#3fd6b4', coral:'#2f9fa8',
    fish:['#7df0f8','#5ad0f0','#9ff7dc'], glow:'#b6f7ff',
    ray:'rgba(160,245,255,.10)', haze:'rgba(30,120,155,.20)' },

  { name:'uncertainty',
    sky:['#1f6f96','#0f4363','#071f33','#030f1a'],
    far:'#123f5e', mid:'#0a2c46', near:'#03121e',
    rim:'#54b6e4', kelp:'#12667e', kelpLit:'#26a8b6', coral:'#237f9c',
    fish:['#6fd6f4','#8cbcf8','#a9e8ff'], glow:'#c8e8ff',
    ray:'rgba(140,215,255,.085)', haze:'rgba(25,95,145,.22)' },

  { name:'recovery',
    sky:['#3a9484','#186049','#0b3326','#05180f'],
    far:'#1a5d44', mid:'#103f2e', near:'#061c13',
    rim:'#86e8a4', kelp:'#34a05a', kelpLit:'#7fe08c', coral:'#c98f4a',
    fish:['#a8f0a2','#ffd98f','#8fe8c0'], glow:'#ffdca8',
    ray:'rgba(255,215,150,.12)', haze:'rgba(60,140,95,.22)' },

  { name:'conflict',
    sky:['#175b80','#0a3550','#041c2c','#020c14'],
    far:'#0d3a54', mid:'#07273c', near:'#020f18',
    rim:'#3f9cc8', kelp:'#0d5566', kelpLit:'#1a8c98', coral:'#1c6f8c',
    fish:['#5fb0d8','#7fc8e8','#98dcf4'], glow:'#a0dcf8',
    ray:'rgba(120,200,245,.065)', haze:'rgba(18,75,115,.26)' },

  { name:'final',
    sky:['#1e5a8c','#0d2f52','#050f22','#01060e'],
    far:'#0d3358', mid:'#071f3c', near:'#020a14',
    rim:'#6f9fe0', kelp:'#0e4a62', kelpLit:'#1a7a90', coral:'#2a5f9c',
    fish:['#7fafe8','#9cc4f8','#bcd8ff'], glow:'#d0dcff',
    ray:'rgba(165,195,255,.06)', haze:'rgba(30,60,120,.28)' }
];
function pal(){ return PAL[Math.min(cp, PAL.length - 1)]; }

/* ---- layered noise for organic terrain ---- */
function ridge(x, seed, amp, base, f){
  return base
    + Math.sin(x * f + seed) * amp
    + Math.sin(x * f * 2.17 + seed * 1.7) * amp * 0.45
    + Math.sin(x * f * 4.63 + seed * 3.1) * amp * 0.20
    + Math.sin(x * f * 9.41 + seed * 5.3) * amp * 0.09;
}

/* ---- world population ---- */
function seed(){
  fish = []; snow = []; kelp = []; glows = []; wash = []; corals = [];

  for (let i = 0; i < 20; i++)
    fish.push({
      x: Math.random()*VW, y: 140 + Math.random()*(VH-420),
      sp: .5 + Math.random()*1.6, len: 8 + Math.random()*15,
      ph: Math.random()*6.28, amp: 12 + Math.random()*40,
      depth: Math.random() < .45 ? .35 : .9,
      c: (Math.random()*3)|0, dir: Math.random() < .5 ? 1 : -1
    });

  for (let i = 0; i < 150; i++)
    snow.push({ x: Math.random()*VW, y: Math.random()*VH,
                sp: .2 + Math.random()*1.1, r: .8 + Math.random()*2.4,
                a: .08 + Math.random()*.34 });

  for (let i = 0; i < 20; i++)
    kelp.push({ x: i*128 + Math.random()*80, h: 70 + Math.random()*190,
                ph: Math.random()*6.28, w: 3.5 + Math.random()*5,
                leaves: 4 + ((Math.random()*5)|0) });

  for (let i = 0; i < 26; i++)
    corals.push({ x: Math.random()*VW*1.4, r: 18 + Math.random()*46,
                  arms: 3 + ((Math.random()*4)|0), ph: Math.random()*6.28 });

  for (let i = 0; i < 30; i++)
    glows.push({ x: Math.random()*VW, y: 180 + Math.random()*(VH-460),
                 ph: Math.random()*6.28, sp: .012 + Math.random()*.03,
                 r: 1.5 + Math.random()*3 });
}

/* ---- terrain silhouette with soft vertical shading ---- */
function cave(par, sd, topAmp, topBase, botAmp, botBase, col, rim, alpha){
  const off = scroll * par;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;

  // ceiling
  const gT = ctx.createLinearGradient(0, 0, 0, topBase + topAmp * 2);
  gT.addColorStop(0, col); gT.addColorStop(1, shade(col, -14));
  ctx.fillStyle = gT;
  ctx.beginPath(); ctx.moveTo(-10, -10);
  for (let x = -10; x <= VW + 10; x += 9) ctx.lineTo(x, ridge(x + off, sd, topAmp, topBase, .0016));
  ctx.lineTo(VW + 10, -10); ctx.closePath(); ctx.fill();

  // floor
  const gF = ctx.createLinearGradient(0, VH - botBase - botAmp * 2, 0, VH);
  gF.addColorStop(0, shade(col, 8)); gF.addColorStop(1, shade(col, -18));
  ctx.fillStyle = gF;
  ctx.beginPath(); ctx.moveTo(-10, VH + 10);
  for (let x = -10; x <= VW + 10; x += 9) ctx.lineTo(x, VH - ridge(x + off, sd + 9, botAmp, botBase, .0018));
  ctx.lineTo(VW + 10, VH + 10); ctx.closePath(); ctx.fill();

  // rim light
  if (rim){
    ctx.strokeStyle = rim; ctx.lineWidth = 2.5;
    ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * .32;
    ctx.beginPath();
    for (let x = -10; x <= VW + 10; x += 9){
      const y = ridge(x + off, sd, topAmp, topBase, .0016);
      x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let x = -10; x <= VW + 10; x += 9){
      const y = VH - ridge(x + off, sd + 9, botAmp, botBase, .0018);
      x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/* lighten/darken a hex colour */
function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/* ---- god rays ---- */
function rays(p){
  for (let i = 0; i < 6; i++){
    const x = ((i * 380 + t * .55) % (VW + 900)) - 450;
    const sway = Math.sin(t * .006 + i) * 60;
    const g = ctx.createLinearGradient(0, -40, 0, VH * .86);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.22, p.ray); g.addColorStop(.6, p.ray);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + sway, -40); ctx.lineTo(x + sway + 120, -40);
    ctx.lineTo(x + sway + 420, VH * .95); ctx.lineTo(x + sway + 40, VH * .95);
    ctx.closePath(); ctx.fill();
  }
}

/* ---- coral fans on the seabed ---- */
function drawCorals(p){
  const off = scroll * .78;
  ctx.strokeStyle = p.coral; ctx.lineCap = 'round';
  for (const c of corals){
    const bx = ((c.x - off) % (VW + 300) + VW + 300) % (VW + 300) - 150;
    const by = VH - ridge(c.x + off, 16, 40, 120, .0018) + 8;
    ctx.globalAlpha = .55;
    for (let a = 0; a < c.arms; a++){
      const ang = -Math.PI/2 + (a - (c.arms-1)/2) * .42 + Math.sin(t*.01 + c.ph)*.05;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(ang)*c.r*.6, by + Math.sin(ang)*c.r*.7,
                           bx + Math.cos(ang)*c.r, by + Math.sin(ang)*c.r);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/* ---- kelp: tapered spine with alternating leaves ---- */
function drawKelp(p){
  const off = scroll * .86;
  for (const k of kelp){
    const bx = ((k.x - off) % (VW + 260) + VW + 260) % (VW + 260) - 130;
    const by = VH - ridge(k.x + off, 16, 40, 120, .0018) + 10;

    // spine
    ctx.beginPath(); ctx.moveTo(bx, by);
    const pts = [];
    for (let s = 0; s <= 1.001; s += .1){
      const sway = Math.sin(t * .014 + k.ph + s * 2.4) * (s * s * 58);
      pts.push([bx + sway, by - s * k.h]);
    }
    ctx.strokeStyle = p.kelp; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = k.w;
    pts.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.stroke();
    // lit edge
    ctx.strokeStyle = p.kelpLit; ctx.lineWidth = k.w * .35; ctx.globalAlpha = .6;
    pts.forEach(([x,y], i) => i ? ctx.lineTo(x-2,y) : ctx.moveTo(x-2,y));
    ctx.beginPath();
    pts.forEach(([x,y], i) => i ? ctx.lineTo(x - k.w*.28, y) : ctx.moveTo(x - k.w*.28, y));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // leaves
    for (let l = 1; l <= k.leaves; l++){
      const s = l / (k.leaves + 1);
      const idx = Math.min(pts.length - 1, Math.round(s * (pts.length - 1)));
      const [lx, ly] = pts[idx];
      const side = l % 2 ? 1 : -1;
      const len = 16 + s * 26;
      ctx.fillStyle = s > .5 ? p.kelpLit : p.kelp;
      ctx.globalAlpha = .82;
      ctx.beginPath();
      ctx.ellipse(lx + side * len * .5, ly, len * .5, k.w * .8,
                  side * .35 + Math.sin(t*.014 + k.ph)*.12, 0, 6.28);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/* ---- fish ---- */
function drawFish(p, layer){
  for (const f of fish){
    if ((layer === 'far') !== (f.depth < .6)) continue;
    f.x += f.sp * f.dir;
    if (f.x > VW + 80) f.x = -80;
    if (f.x < -80) f.x = VW + 80;
    const y = f.y + Math.sin(t * .022 + f.ph) * f.amp;
    const x = f.x;
    const L = f.len, d = f.dir;

    ctx.save();
    ctx.globalAlpha = f.depth < .6 ? .38 : .92;
    ctx.fillStyle = p.fish[f.c];
    // body
    ctx.beginPath();
    ctx.ellipse(x, y, L, L * .42, Math.sin(t*.03 + f.ph) * .12, 0, 6.28);
    ctx.fill();
    // tail
    ctx.beginPath();
    ctx.moveTo(x - d * L * .9, y);
    ctx.lineTo(x - d * L * 1.7, y - L * .5);
    ctx.lineTo(x - d * L * 1.7, y + L * .5);
    ctx.closePath(); ctx.fill();
    // dorsal
    ctx.globalAlpha *= .7;
    ctx.beginPath();
    ctx.moveTo(x - L*.2, y - L*.35);
    ctx.lineTo(x + L*.1, y - L*.95);
    ctx.lineTo(x + L*.45, y - L*.3);
    ctx.closePath(); ctx.fill();
    // eye glint
    ctx.globalAlpha = 1; ctx.fillStyle = p.glow;
    ctx.beginPath(); ctx.arc(x + d * L * .58, y - L*.1, L*.11, 0, 6.28); ctx.fill();
    ctx.restore();
  }
}

/* ---- bioluminescent motes ---- */
function drawGlows(p){
  ctx.save();
  for (const g of glows){
    g.ph += g.sp;
    const a = (Math.sin(g.ph) + 1) * .5;
    const x = ((g.x - scroll * .55) % VW + VW) % VW;
    const rg = ctx.createRadialGradient(x, g.y, 0, x, g.y, g.r * 9);
    rg.addColorStop(0, p.glow);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a * .5; ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, g.y, g.r * 9, 0, 6.28); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = p.glow;
    ctx.beginPath(); ctx.arc(x, g.y, g.r, 0, 6.28); ctx.fill();
  }
  ctx.restore();
}

/* ---- marine snow ---- */
function drawSnow(){
  ctx.fillStyle = '#dff4ff';
  for (const s of snow){
    s.x -= s.sp; s.y += s.sp * .25;
    if (s.x < -6){ s.x = VW + 6; s.y = Math.random() * VH; }
    if (s.y > VH) s.y = 0;
    ctx.globalAlpha = s.a;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- the submarine ---- */
function drawSub(p){
  const cx = VW * .40, cy = VH * .56 + Math.sin(t * .011) * 20;
  const pitch = Math.sin(t * .008) * 1.1 * Math.PI / 180;

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(pitch);
  const S = 1.5;  // overall sub scale
  ctx.scale(S, S);

  // headlight cone
  const hg = ctx.createLinearGradient(90, 0, 640, 0);
  hg.addColorStop(0, 'rgba(255,220,150,.32)');
  hg.addColorStop(.4, 'rgba(255,220,150,.13)');
  hg.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.moveTo(88, -10); ctx.lineTo(640, -130);
  ctx.lineTo(640, 130); ctx.lineTo(88, 10); ctx.closePath(); ctx.fill();

  // hull body
  const hull = ctx.createLinearGradient(0, -36, 0, 36);
  hull.addColorStop(0, '#5c7683'); hull.addColorStop(.35, '#3b525d');
  hull.addColorStop(1, '#1d2b33');
  ctx.fillStyle = hull;
  ctx.beginPath(); ctx.ellipse(0, 0, 96, 32, 0, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.moveTo(60, -30); ctx.quadraticCurveTo(104, -22, 106, 0);
  ctx.quadraticCurveTo(104, 22, 60, 30); ctx.closePath(); ctx.fill();

  // rust bands
  ctx.fillStyle = 'rgba(150,84,40,.75)';
  [-52, -14, 26].forEach(bx => {
    ctx.beginPath();
    ctx.ellipse(bx, 0, 6, 31, 0, 0, 6.28); ctx.fill();
  });

  // conning tower
  ctx.fillStyle = '#3b525d';
  ctx.beginPath();
  ctx.moveTo(-26, -28); ctx.lineTo(-20, -62);
  ctx.lineTo(18, -62); ctx.lineTo(26, -28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5c7683';
  ctx.fillRect(-20, -62, 38, 6);
  // periscope + mast
  ctx.strokeStyle = '#2a3c45'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -62); ctx.lineTo(-8, -94); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -62); ctx.lineTo(6, -82); ctx.stroke();

  // tail fins
  ctx.fillStyle = '#243840';
  ctx.beginPath(); ctx.moveTo(-88, -14); ctx.lineTo(-136, -46);
  ctx.lineTo(-132, 0); ctx.lineTo(-88, 14); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-88, 14); ctx.lineTo(-132, 0);
  ctx.lineTo(-136, 46); ctx.lineTo(-88, 18); ctx.closePath(); ctx.fill();

  // nose observation dome
  const dome = ctx.createRadialGradient(92, -8, 2, 96, 0, 26);
  dome.addColorStop(0, 'rgba(210,250,255,.75)');
  dome.addColorStop(1, 'rgba(90,190,215,.30)');
  ctx.fillStyle = dome;
  ctx.beginPath(); ctx.arc(94, 0, 22, -Math.PI/2, Math.PI/2); ctx.fill();
  ctx.strokeStyle = 'rgba(180,240,255,.5)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(94, 0, 22, -Math.PI/2, Math.PI/2); ctx.stroke();

  // portholes
  const blink = (Math.sin(t * .04) + 1) * .5;
  for (let i = 0; i < 4; i++){
    const px = -46 + i * 28;
    const pg = ctx.createRadialGradient(px, 0, 1, px, 0, 16);
    pg.addColorStop(0, '#ffe2a8'); pg.addColorStop(.35, 'rgba(240,169,76,.85)');
    pg.addColorStop(1, 'rgba(240,169,76,0)');
    ctx.globalAlpha = .7 + blink * .3;
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, 0, 16, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffdca0';
    ctx.beginPath(); ctx.arc(px, 0, 5.5, 0, 6.28); ctx.fill();
  }

  // red running light on the tower
  ctx.globalAlpha = .35 + blink * .65;
  const rl = ctx.createRadialGradient(-2, -70, 0, -2, -70, 14);
  rl.addColorStop(0, '#ff8a92'); rl.addColorStop(1, 'rgba(239,95,107,0)');
  ctx.fillStyle = rl;
  ctx.beginPath(); ctx.arc(-2, -70, 14, 0, 6.28); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();

  // prop wash
  if (t % 2 < 1)
    wash.push({ x: cx - 210, y: cy + (Math.random()*44 - 22),
                r: 2 + Math.random()*7, life: 1, drift: .3 + Math.random()*.5 });
  ctx.fillStyle = '#d8f2fb';
  for (let i = wash.length - 1; i >= 0; i--){
    const b = wash[i];
    b.x -= 2.2; b.y -= b.drift; b.life -= .012;
    if (b.life <= 0){ wash.splice(i, 1); continue; }
    ctx.globalAlpha = b.life * .42;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * b.life, 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- forward lamps, seen from inside the boat ---- */
function drawLamps(p){
  const ox = VW * .5, oy = VH * 1.02;   // lamps sit below/behind the viewer
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  [[-360, .30], [0, .40], [360, .30]].forEach(([dx, a]) => {
    const g = ctx.createRadialGradient(ox + dx, oy, 40, ox + dx, oy, VH * 1.15);
    g.addColorStop(0, `rgba(255,228,170,${a * .30})`);
    g.addColorStop(.45, `rgba(190,230,235,${a * .09})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ox + dx, oy, VH * 1.15, 0, 6.28); ctx.fill();
  });
  ctx.restore();

  // motes caught in the beam
  ctx.fillStyle = 'rgba(255,240,200,.45)';
  for (const s2 of snow){
    if (s2.y < VH * .35) continue;
    const d = Math.abs(s2.x - ox) / VW;
    ctx.globalAlpha = Math.max(0, (.55 - d)) * s2.a * 2.2;
    ctx.beginPath(); ctx.arc(s2.x, s2.y, s2.r * 1.5, 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---- frame ---- */
function frame(){
  if (!running) return;
  t++; scroll += 1.5;
  const p = pal();
  const w = cv.width, h = cv.height;

  // cover-fit the virtual space to the real canvas
  const k = Math.max(w / VW, h / VH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(k, 0, 0, k, (w - VW * k) / 2, (h - VH * k) / 2);

  // water column
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, p.sky[0]); g.addColorStop(.34, p.sky[1]);
  g.addColorStop(.68, p.sky[2]); g.addColorStop(1, p.sky[3]);
  ctx.fillStyle = g; ctx.fillRect(-VW, -VH, VW * 3, VH * 3);

  rays(p);
  cave(.30, 3, 58, 150, 46, 120, p.far, p.rim, .55);   // distant walls
  drawFish(p, 'far');
  drawGlows(p);

  // depth haze between layers
  ctx.fillStyle = p.haze; ctx.fillRect(-VW, -VH, VW * 3, VH * 3);

  cave(.64, 7, 84, 210, 70, 175, p.mid, p.rim, .92);   // mid walls
  drawCorals(p);
  drawKelp(p);
  if (mode === 'game') drawLamps(p);
  drawFish(p, 'near');
  cave(1.5, 13, 64, 70, 96, 90, p.near, null, 1);      // foreground
  drawSnow();

  // vignette
  const v = ctx.createRadialGradient(VW*.45, VH*.5, VH*.42, VW*.45, VH*.5, VH*1.15);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,6,12,.55)');
  ctx.fillStyle = v; ctx.fillRect(-VW, -VH, VW * 3, VH * 3);

  requestAnimationFrame(frame);
}

function resize(){
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width  = Math.floor(window.innerWidth  * dpr);
  cv.height = Math.floor(window.innerHeight * dpr);
}

return {
  start(){
    cv = document.getElementById('env');
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    seed();
    if (!running){ running = true; frame(); }
  },
  setCheckpoint(i){ cp = i; },
  setMode(m){ mode = m; },
  pulse(){ scroll += 260; },
  shake(){ /* 2D fallback: CSS handles the judder */ },
  toggleQuality(){ return 'n/a'; },
  toggleView(){ return 'cockpit'; },
  setViewport(){},
  getView(){ return 'cockpit'; },
  setClueSites(){}, clearClueSites(){}, resumeAuto(){},
  isDriving(){ return false; }, boatSpeed(){ return 0; },
  heading(){ return 0; }, depth(){ return 2140; },   // metres, same scale as ENV3D
  pitch(){ return 0; }, throttle(){ return 0; },
  checkpointInfo(){ return null; }, startLeg(){}, setCurrent(){},
  // no flying in the 2D fallback, so the transit phase is skipped entirely
  onCreatureHit(){}, onCheckpointBlocked(){}, cluesComplete(){ return true; },
  setPowerOut(){}, resetLegPower(){}, isPowerOut(){ return false; },
  setPaused(){}, isPaused(){ return false; },
  clueProgress(){ return { found:0, total:0 }; },
  radarContacts(){ return []; },
  getQuality(){ return 'n/a'; }
};

})();
