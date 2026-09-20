/* ============================================================
   TRUSTLINE: ABYSS — COCKPIT INSTRUMENTS
   Two canvas widgets the player reads as physical hardware:
     SONAR  — phosphor scope with a rotating sweep and contacts
     GAUGES — analog needle dials, one per sensor
   Both animate independently of the game loop.
   ============================================================ */

/* ------------------------------------------------------------ SONAR */
const SONAR = (() => {
  let cv, ctx, R = 150, sweep = -Math.PI / 2, contacts = [], rel = 100;
  let running = false, dpr = 1, noiseSeed = 0;

  function fit(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = cv.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return;      // still hidden
    cv.width  = Math.floor(box.width  * dpr);
    cv.height = Math.floor(box.height * dpr);
    R = Math.min(cv.width, cv.height) / 2 - 6 * dpr;
  }

  function frame(){
    if (!running) return;
    fit();
    const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
    if (R <= 1){ requestAnimationFrame(frame); return; }   // not laid out yet
    sweep += .016;
    if (sweep > Math.PI * 1.5) sweep -= Math.PI * 2;
    noiseSeed++;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // scope face
    const face = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    face.addColorStop(0, '#041a12'); face.addColorStop(.7, '#02120c');
    face.addColorStop(1, '#010a07');
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fill();

    // range rings + bearing spokes
    ctx.strokeStyle = 'rgba(80,230,150,.20)'; ctx.lineWidth = 1 * dpr;
    for (let i = 1; i <= 4; i++){
      ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, 6.28); ctx.stroke();
    }
    for (let a = 0; a < 8; a++){
      const ang = a * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
    }

    // bearing labels
    ctx.fillStyle = 'rgba(90,240,160,.55)';
    ctx.font = `${9 * dpr}px ui-monospace,monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['AHEAD',-90],['STBD',0],['ASTERN',90],['PORT',180]].forEach(([lab, deg]) => {
      const a = deg * Math.PI / 180;
      ctx.fillText(lab, cx + Math.cos(a) * (R - 14 * dpr), cy + Math.sin(a) * (R - 14 * dpr));
    });

    // sweep wedge with phosphor decay
    for (let i = 0; i < 26; i++){
      const a = sweep - i * .035;
      ctx.strokeStyle = `rgba(90,255,170,${.26 * (1 - i / 26)})`;
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    // leading edge
    ctx.strokeStyle = 'rgba(160,255,205,.9)'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); ctx.stroke();

    // sensor noise — worse when sonar reliability is low
    const grains = Math.floor((100 - rel) * 1.1);
    ctx.fillStyle = 'rgba(120,255,180,.30)';
    for (let i = 0; i < grains; i++){
      const a = ((noiseSeed * 7 + i * 137) % 628) / 100;
      const d = ((noiseSeed * 3 + i * 91) % 100) / 100 * R;
      ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6 * dpr, 1.6 * dpr);
    }

    // contacts — scripted sensor returns decay with the sweep; live
    // navigation contacts (clue beacons, the waypoint) stay lit so the
    // scope can actually be steered by.
    const PALETTE = {
      waypoint: [255, 190, 90],
      clue:     [120, 230, 255],
      found:    [110, 235, 165],
      sensor:   [170, 255, 205]
    };
    for (const c of contacts){
      const nav = c.kind && c.kind !== 'sensor';
      const col = PALETTE[c.kind] || PALETTE.sensor;
      const a = (c.b - 90) * Math.PI / 180;
      let diff = sweep - a;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      if (diff >= 0 && diff < .05) c.lit = 1;
      if (nav) c.lit = Math.max(.55, (c.lit || 0) - .004);   // never fully fades
      else     c.lit = Math.max(0,   (c.lit || 0) - .006);

      const x = cx + Math.cos(a) * R * c.r, y = cy + Math.sin(a) * R * c.r;
      const size = (2.5 + c.s * 2) * dpr;

      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${.85 * c.lit})`);
      g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, size * 3.4, 0, 6.28); ctx.fill();

      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${.4 + .6 * c.lit})`;
      if (c.kind === 'waypoint'){
        // diamond, so the destination is distinguishable at a glance
        ctx.beginPath();
        ctx.moveTo(x, y - size * 1.6); ctx.lineTo(x + size * 1.6, y);
        ctx.lineTo(x, y + size * 1.6); ctx.lineTo(x - size * 1.6, y);
        ctx.closePath(); ctx.fill();
        // bearing line from the centre
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},.30)`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      } else if (c.kind === 'found'){
        ctx.beginPath(); ctx.arc(x, y, size, 0, 6.28); ctx.fill();
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},.75)`;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.arc(x, y, size * 2.1, 0, 6.28); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, size, 0, 6.28); ctx.fill();
      }

      if (c.tag && c.lit > .25){
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(1, c.lit + .2)})`;
        ctx.font = `${9 * dpr}px ui-monospace,monospace`;
        ctx.fillText(c.tag, x, y - size - 8 * dpr);
      }
    }

    // bow reference — the scope is heading-up, so straight up is dead ahead
    ctx.strokeStyle = 'rgba(160,255,205,.55)'; ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - 5 * dpr, cy - R + 9 * dpr);
    ctx.lineTo(cx, cy - R + 2 * dpr);
    ctx.lineTo(cx + 5 * dpr, cy - R + 9 * dpr);
    ctx.stroke();

    // glass curvature + scanlines
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1 * dpr;
    for (let y = 0; y < h; y += 3 * dpr){
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const glare = ctx.createLinearGradient(cx - R, cy - R, cx + R * .3, cy + R * .3);
    glare.addColorStop(0, 'rgba(190,255,220,.09)');
    glare.addColorStop(.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fill();

    requestAnimationFrame(frame);
  }

  return {
    init(id){
      cv = document.getElementById(id); ctx = cv.getContext('2d');
      fit(); window.addEventListener('resize', fit);
      if (!running){ running = true; frame(); }
    },
    set(cts, reliability){
      contacts = (cts || []).map(c => ({ ...c, lit: 0 }));
      rel = reliability;
    }
  };
})();


/* ----------------------------------------------------------- GAUGES */
const GAUGES = (() => {
  let cv, ctx, dials = [], running = false, dpr = 1;

  function fit(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = cv.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return;      // still hidden
    cv.width  = Math.floor(box.width  * dpr);
    cv.height = Math.floor(box.height * dpr);
  }

  function dial(cx, cy, r, label, val, cited){
    const A0 = Math.PI * .75, A1 = Math.PI * 2.25;   // 270° sweep
    const frac = val / 100;
    const ang = A0 + (A1 - A0) * frac;
    const danger = val < 50, warn = val < 70;
    const hue = danger ? '#ef5f6b' : warn ? '#f0a94c' : '#4fd6e8';

    // bezel
    ctx.fillStyle = '#10181d';
    ctx.beginPath(); ctx.arc(cx, cy, r + 4 * dpr, 0, 6.28); ctx.fill();
    ctx.strokeStyle = cited ? '#f0a94c' : '#2b3a42';
    ctx.lineWidth = (cited ? 2 : 1.4) * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4 * dpr, 0, 6.28); ctx.stroke();

    // face
    const face = ctx.createRadialGradient(cx, cy - r * .3, 1, cx, cy, r);
    face.addColorStop(0, '#0d1f28'); face.addColorStop(1, '#050f15');
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.28); ctx.fill();

    // ticks
    for (let i = 0; i <= 10; i++){
      const a = A0 + (A1 - A0) * (i / 10);
      const inner = r * (i % 5 === 0 ? .70 : .80);
      ctx.strokeStyle = i / 10 < .5 ? 'rgba(239,95,107,.5)' : 'rgba(120,180,200,.45)';
      ctx.lineWidth = (i % 5 === 0 ? 2 : 1) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r * .90, cy + Math.sin(a) * r * .90);
      ctx.stroke();
    }

    // value arc
    ctx.strokeStyle = hue; ctx.lineWidth = 3 * dpr; ctx.lineCap = 'round';
    ctx.globalAlpha = .75;
    ctx.beginPath(); ctx.arc(cx, cy, r * .93, A0, ang); ctx.stroke();
    ctx.globalAlpha = 1;

    // needle
    ctx.strokeStyle = hue; ctx.lineWidth = 2.2 * dpr;
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(ang) * r * .16, cy - Math.sin(ang) * r * .16);
    ctx.lineTo(cx + Math.cos(ang) * r * .74, cy + Math.sin(ang) * r * .74);
    ctx.stroke();
    ctx.fillStyle = '#1b2930';
    ctx.beginPath(); ctx.arc(cx, cy, r * .12, 0, 6.28); ctx.fill();
    ctx.strokeStyle = hue; ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, r * .12, 0, 6.28); ctx.stroke();

    // readout
    ctx.fillStyle = hue; ctx.textAlign = 'center';
    ctx.font = `${11 * dpr}px ui-monospace,monospace`;
    ctx.fillText(Math.round(val) + '%', cx, cy + r * .52);
    ctx.fillStyle = cited ? '#f0a94c' : '#6f93a1';
    ctx.font = `${8 * dpr}px ui-monospace,monospace`;
    ctx.fillText(label + (cited ? ' ◂' : ''), cx, cy + r + 15 * dpr);

    // low-reading warning glow
    if (danger){
      const pulse = (Math.sin(Date.now() / 260) + 1) * .5;
      const g = ctx.createRadialGradient(cx, cy, r * .5, cx, cy, r * 1.5);
      g.addColorStop(0, `rgba(239,95,107,${.16 * pulse})`);
      g.addColorStop(1, 'rgba(239,95,107,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, 6.28); ctx.fill();
    }
  }

  function frame(){
    if (!running) return;
    fit();
    if (cv.width < 8 || cv.height < 8 || !dials.length){
      requestAnimationFrame(frame); return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textBaseline = 'middle';

    const cols = 3, n = dials.length;
    const rows = Math.ceil(n / cols);
    const cw = cv.width / cols, ch = cv.height / rows;
    const r = Math.max(6, Math.min(cw, ch) * .30);

    dials.forEach((d, i) => {
      d.cur += (d.target - d.cur) * .07;       // needle easing
      const cx = cw * (i % cols) + cw / 2;
      const cy = ch * Math.floor(i / cols) + ch / 2 - 5 * dpr;
      dial(cx, cy, r, d.label, d.cur, d.cited);
    });

    requestAnimationFrame(frame);
  }

  return {
    init(id){
      cv = document.getElementById(id); ctx = cv.getContext('2d');
      fit(); window.addEventListener('resize', fit);
      if (!running){ running = true; frame(); }
    },
    set(sensors, cites){
      const keys = Object.keys(sensors);
      dials = keys.map(k => {
        const prev = dials.find(d => d.label === k);
        return { label: k, target: sensors[k], cur: prev ? prev.cur : 0,
                 cited: (cites || []).includes(k) };
      });
    }
  };
})();
