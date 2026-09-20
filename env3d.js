/* ============================================================
   TRUSTLINE: ABYSS — 3D ENVIRONMENT (Three.js r128, vendored)
   First-person view forward from the submarine.

   Realism here comes from what actually dominates real
   underwater footage: heavy exponential fog, two lamp beams
   full of suspended particulate, and silhouettes resolving
   out of the murk. Geometry is deliberately cheap.

   Same public API as the 2D ENV so game.js is agnostic:
     start()  setCheckpoint(i)  setMode(m)  pulse()  supported()
   ============================================================ */

const ENV3D = (() => {

let renderer, scene, camera, clock;
let floor, rocks, kelp, grass, fishM, motes, beamL, beamR, lampL, lampR, ambient, hemi, sun;
let biolum, BIO = [];
const FISH_TIME = { value: 0 };   // shared clock for the fish vertex shader
let boat, chaseFill, beacons = [], beaconData = [], onClue = null;
let fauna = [];

/* The boat moves through a world that stays put. Objects that fall behind
   are recycled ahead ALONG THE BOAT'S HEADING, so the world stays populated
   whichever way the player drives. */
const BOAT = {
  pos: null, quat: null,
  yaw: 0, pitch: 0, speed: 0, throttle: 0, auto: true
};
const KEYS = Object.create(null);
let view = 'cockpit';           // 'cockpit' | 'chase'
let snapCam = false;
const CRUISE = 7.0;             // autopilot cruise speed
let rockData = [], fishData = [];
let cp = 0, mode = 'title', running = false, speed = 5.2, boost = 0, shakeAmt = 0;

/* Adaptive quality. The scene is heavy (11k particles, 240 instanced
   boulders, ~1600 plant blades). On a weak demo machine that can stutter,
   so the first ~2s are sampled and the scene downgrades itself if the
   frame rate is poor. 'P' cycles it manually. */
let quality = 'high', samples = [], adapted = false, lastDt = 1/60;
let paused = false;
const FULL = {};

const DEPTH = 190;        // how far into the fog the world extends
const RECYCLE = 26;       // z past the camera at which objects wrap

/* ---- per-checkpoint atmosphere: the same mood arc, in 3D ----
   Deep water, not a reef. At 2140m the only meaningful light is the
   one you brought with you, so the fog is near-black navy, ambient is
   just enough to keep silhouettes from going solid, and the lamps do
   the work. The distant "sun" is kept at a trace intensity — it is not
   sunlight, it is the faint downwelling glow that stops the water
   reading as empty space. Fog density is high: things resolve out of
   the murk instead of fading in politely. */
const ATMO = [
  { fog:0x06222f, den:.0290, lamp:0xffe3b4, lampI:2.5, amb:0x11566b, ambI:.42, floor:0x2c4a48, sun:0x7fc4e0, sunI:.30 },
  { fog:0x05202e, den:.0330, lamp:0xffdcaa, lampI:2.6, amb:0x0f4d66, ambI:.38, floor:0x27423f, sun:0x74b8db, sunI:.26 },
  { fog:0x07262c, den:.0300, lamp:0xffd49a, lampI:2.7, amb:0x14605e, ambI:.42, floor:0x2e4a3e, sun:0x84cfc6, sunI:.29 },
  { fog:0x041a2b, den:.0395, lamp:0xeef2ff, lampI:2.4, amb:0x0b3f5e, ambI:.30, floor:0x22383f, sun:0x6aa8d2, sunI:.21 },
  { fog:0x04182a, den:.0360, lamp:0xe6eeff, lampI:2.45, amb:0x0d4467, ambI:.33, floor:0x243748, sun:0x71aedb, sunI:.23 }
];
const atmo = () => ATMO[Math.min(cp, ATMO.length - 1)];

/* ---- WebGL availability ---- */
function supported(){
  if (typeof THREE === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
             (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch(e){ return false; }
}

/* ---- procedural caustics texture ---- */
function causticTexture(){
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
      // interfering waves -> caustic web
      let n = Math.sin(u * 3 + Math.sin(v * 2) * 1.6)
            + Math.sin(v * 3 + Math.sin(u * 2.3) * 1.4)
            + Math.sin((u + v) * 2.1);
      n = Math.pow(Math.max(0, n / 3 + .35), 3.2);
      const i = (y * S + x) * 4, val = Math.min(255, n * 340);
      img.data[i] = val; img.data[i+1] = val; img.data[i+2] = val; img.data[i+3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  return tex;
}

/* ---- soft round sprite for particulate ---- */
function moteTexture(){
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(.35, 'rgba(230,245,255,.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/* ---- seabed: displaced plane with sediment texture + normal map ---- */
let TEX = {};
function makeFloor(a){
  const W = 260, D = DEPTH + 60, SEG = 190;
  const geo = new THREE.PlaneGeometry(W, D, SEG, Math.floor(SEG * D / W));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), z = pos.getZ(i);
    // broad dunes, seamless in z at the scroll period
    const broad = Math.sin(x * .055) * 2.6
                + Math.sin(z * .041 + 1.3) * 3.4
                + Math.sin((x + z) * .017) * 5.2;
    // fine relief from the same noise that drives the texture
    const fine = (FORGE.fbm(x * .09 + 40, z * .09 + 40, 4, 512) - .5) * 3.4
               + (FORGE.fbm(x * .4, z * .4, 3, 512) - .5) * .85;
    pos.setY(i, broad + fine);
  }
  geo.computeVertexNormals();

  TEX.sed = TEX.sed || FORGE.sediment(512);
  TEX.sed.map.repeat.set(16, 16);
  TEX.sed.normalMap.repeat.set(16, 16);
  TEX.caustic = TEX.caustic || causticTexture();

  const mat = new THREE.MeshStandardMaterial({
    color: a.floor, roughness: .97, metalness: .0,
    map: TEX.sed.map, normalMap: TEX.sed.normalMap,
    normalScale: new THREE.Vector2(1.5, 1.5)
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -11.5;

  // caustics as a separate additive skin just above the bed
  const cg = geo.clone();
  const cm = new THREE.MeshBasicMaterial({
    map: TEX.caustic, transparent: true, opacity: .085,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const caus = new THREE.Mesh(cg, cm);
  caus.position.y = .06;
  m.add(caus);
  m.userData.caustic = cm;
  return m;
}

/* Place a boulder. Large ones are pushed further off the boat's axis so the
   sub always has a corridor — otherwise you fly straight through a rock face. */
function placeRock(o, initial){
  o.s = 1.6 + Math.random() * 8.5;
  o.sx = o.sx || (.72 + Math.random() * .62);
  o.sy = o.sy || (.70 + Math.random() * .80);
  o.sz = o.sz || (.72 + Math.random() * .62);
  const side = Math.random() < .5 ? -1 : 1;
  o.x = side * (5 + o.s * 1.15 + Math.random() * 52);
  o.y = -12.8 + Math.random() * 1.6;
  o.z = initial ? -Math.random() * DEPTH : -DEPTH + Math.random() * 14;
}

/* ---- boulders: fBm-displaced spheres, smooth normals, rock texture ---- */
function makeRocks(){
  const geo = new THREE.IcosahedronGeometry(1, 4);        // dense enough for real lumps
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    const n = FORGE.fbm(v.x * 1.6 + 9, v.z * 1.6 + 9, 4, 64)
            + FORGE.ridged(v.y * 2.1 + 3, v.x * 2.1 + 3, 3, 64) * .5;
    v.multiplyScalar(.72 + n * .62);
    pos.setXYZ(i, v.x, v.y * .78, v.z);
  }
  geo.computeVertexNormals();                              // smooth, not flatShading

  TEX.rock = TEX.rock || FORGE.rock(512);
  TEX.rock.map.repeat.set(2.2, 2.2);
  TEX.rock.normalMap.repeat.set(2.2, 2.2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x5d706e, roughness: .93, metalness: .0,
    map: TEX.rock.map, normalMap: TEX.rock.normalMap,
    normalScale: new THREE.Vector2(1.9, 1.9)
  });
  const N = 240;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  rockData = [];
  for (let i = 0; i < N; i++){
    const o = { rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28 };
    placeRock(o, true);
    rockData.push(o);
    d.position.set(o.x, o.y, o.z);
    // Non-uniform scale per axis: 240 copies of one lump read as 240 copies
    // of one lump. Squashing each one differently hides the shared mesh.
    d.rotation.set(o.rx, o.ry, o.rz);
    d.scale.set(o.s * o.sx, o.s * .62 * o.sy, o.s * o.sz);
    d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
    // and a little tint drift, warmer for the sediment-buried ones
    c.setHSL(.45 + (Math.random() - .5) * .10,
             .06 + Math.random() * .12,
             .30 + Math.random() * .22);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/* ---- fish ---- */
/* ---- geometry merge ----
   r128's core does not ship BufferGeometryUtils (the name only appears in a
   warning string), so this is the 25-line version: concatenate the standard
   attributes and re-base the indices. Enough to assemble a fish out of
   primitives and still draw it as one instanced call. */
function mergeGeos(list){
  let vc = 0, ic = 0;
  for (const g of list){
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3),
        nor = new Float32Array(vc * 3),
        uvs = new Float32Array(vc * 2);
  const idx = new (vc > 65535 ? Uint32Array : Uint16Array)(ic);
  let vo = 0, io = 0;
  for (const g of list){
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uvs.set(u.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else         for (let i = 0; i < p.count;       i++) idx[io++] = i + vo;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* A flat fin from a 2D outline, standing in the vertical plane. */
function finGeo(pts, opts){
  opts = opts || {};
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh);
  if (opts.horizontal) g.rotateX(-Math.PI / 2);   // pectorals lie flat
  g.rotateY(-Math.PI / 2);                        // shape's +X becomes +Z
  if (opts.pos) g.translate(opts.pos[0], opts.pos[1], opts.pos[2]);
  return g;
}

/* ---- fish ----
   Was a six-sided cone. A cone reads as a cone at any distance, and in a
   scene this dark the silhouette is all you get, so it is worth the
   geometry: a laterally compressed lathed body, a forked caudal fin, a
   dorsal and a pair of pectorals. The tail beat lives in the vertex
   shader, like the kelp, so 46 fish still cost one draw call. */
function fishGeometry(){
  // body of revolution: nose at +Z, tail at -Z
  const prof = [], SEG = 16;
  for (let i = 0; i <= SEG; i++){
    const t = i / SEG;                                  // 0 tail .. 1 nose
    const r = Math.sin(Math.pow(t, .72) * Math.PI) * .40 + .015;
    prof.push(new THREE.Vector2(Math.max(.012, r), (t - .45) * 1.55));
  }
  const body = new THREE.LatheGeometry(prof, 11);
  body.rotateX(Math.PI / 2);         // lathe axis Y -> Z
  body.scale(.66, 1.18, 1);          // narrow across, deep top-to-bottom

  const tail = finGeo([[-.10, 0], [-.62, .46], [-.46, .02], [-.62, -.46]],
                      { pos: [0, 0, -.62] });
  const dorsal = finGeo([[.18, 0], [-.02, .40], [-.34, .34], [-.30, 0]],
                        { pos: [0, .22, .08] });
  const anal = finGeo([[.02, 0], [-.10, -.24], [-.34, -.20], [-.30, 0]],
                      { pos: [0, -.20, -.14] });
  const pecL = finGeo([[0, 0], [-.30, .22], [-.34, -.02]],
                      { horizontal: true, pos: [ .17, -.04, .22] });
  const pecR = finGeo([[0, 0], [-.30, -.22], [-.34, .02]],
                      { horizontal: true, pos: [-.17, -.04, .22] });

  return mergeGeos([body, tail, dorsal, anal, pecL, pecR]);
}

function makeFish(){
  const geo = fishGeometry();
  const N = 46;

  // per-instance phase so the school does not beat in unison
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) phase[i] = Math.random() * 6.283;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4c6f7a, roughness: .62, metalness: .22,
    emissive: 0x0a1f26, emissiveIntensity: .18,
    side: THREE.DoubleSide                 // the fins are single-sided planes
  });

  // tail beat: amplitude ramps from nothing at the head to full at the tail
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FISH_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        `#include <common>
         uniform float uTime;
         attribute float aPhase;`)
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float bend = smoothstep(0.45, -0.85, position.z);
         transformed.x += sin(uTime * 5.2 + aPhase + position.z * 2.6) * bend * 0.26;`);
  };

  const mesh = new THREE.InstancedMesh(geo, mat, N);
  fishData = [];
  for (let i = 0; i < N; i++){
    fishData.push({
      x: (Math.random() - .5) * 110,
      y: -9 + Math.random() * 17,
      z: -20 - Math.random() * (DEPTH - 20),
      s: .45 + Math.random() * .7,
      ph: Math.random() * 6.28,
      sp: .4 + Math.random() * 1.1,
      amp: 1.2 + Math.random() * 3.4,
      drift: (Math.random() - .5) * .8
    });
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/* ---- suspended particulate, three size classes.
       Real marine snow is mostly haze with occasional bright flakes;
       one uniform particle size is the tell that it is fake. ---- */
const MOTE_LAYERS = [
  { n: 7000, size: .17, op: .40 },   // fine haze
  { n: 3200, size: .38, op: .62 },   // mid
  { n:  850, size: .80, op: .85 }    // bright flakes catching the lamp
];
function makeMotes(){
  const tex = moteTexture();
  const group = new THREE.Group();
  group.userData.layers = [];
  for (const L of MOTE_LAYERS){
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(L.n * 3);
    for (let i = 0; i < L.n; i++){
      p[i*3]   = (Math.random() - .5) * 90;
      p[i*3+1] = (Math.random() - .5) * 48;
      p[i*3+2] = -Math.random() * DEPTH;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({
      size: L.size, map: tex, transparent: true, opacity: L.op,
      depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, color: 0xa8ccdd
    });
    const pts = new THREE.Points(geo, mat);
    group.add(pts);
    group.userData.layers.push(pts);
  }
  return group;
}

/* ---- visible lamp beams (additive cones) ---- */
function makeBeam(a){
  const geo = new THREE.ConeGeometry(15, 88, 28, 1, true);
  geo.translate(0, -44, 0);
  geo.rotateX(-Math.PI / 2);          // point down -Z
  const mat = new THREE.MeshBasicMaterial({
    color: a.lamp, transparent: true, opacity: .075,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  return new THREE.Mesh(geo, mat);
}

/* ---- clue beacons: things worth driving to ---- */
/* ---- clue beacon ----
   The pillar is centred on the core, not stacked above it. It used to run
   from the core upward, which meant the thing you could see was 60 units of
   column and the thing you could actually collect was a 13-unit bubble at
   the very bottom of it — so flying to the light did nothing unless your
   depth happened to match. Now the column marks the whole catch volume. */
const CLUE_R_H = 16;     // horizontal catch radius
const CLUE_R_V = 46;     // vertical half-height, matches the visible pillar

function makeBeacon(){
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(3.0, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .16,
                                  blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(CLUE_R_H * .55, CLUE_R_H * .55, CLUE_R_V * 2, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .07,
                                  blending: THREE.AdditiveBlending, depthWrite: false,
                                  side: THREE.DoubleSide }));
  g.add(column);                                  // centred on the core
  g.userData.core = core; g.userData.halo = halo; g.userData.column = column;
  return g;
}

/* Sequential targeting: exactly one beacon is live at a time, and it is the
   only one that glows amber. Collect it and the next lights up. Everything
   else stays a dim marker, so at any moment there is one unambiguous thing
   to fly at. */
const CLUE_ACTIVE  = 0xffa312;   // the one you are being sent to
const CLUE_PENDING = 0x1d4a5e;   // known about, not your problem yet
const CLUE_DONE    = 0x57d99a;   // logged

function activeClueIndex(){
  for (let i = 0; i < beaconData.length; i++) if (!beaconData[i].found) return i;
  return -1;
}

/* Scatter one beacon per clue, out in front of the boat. */
function setClueSites(n){
  beacons.forEach(b => scene.remove(b));
  beacons = []; beaconData = [];
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(BOAT.quat);
  const rightV = new THREE.Vector3(1, 0, 0).applyQuaternion(BOAT.quat);
  for (let i = 0; i < n; i++){
    const dist = 45 + i * 30 + Math.random() * 20;
    const side = (i % 2 ? 1 : -1) * (14 + Math.random() * 28);
    const p = BOAT.pos.clone()
      .addScaledVector(fwd, dist)
      .addScaledVector(rightV, side);
    p.y = BOAT.pos.y - 14 + Math.random() * 34;
    const b = makeBeacon();
    b.position.copy(p);
    scene.add(b);
    beacons.push(b);
    beaconData.push({ found: false, idx: i });
  }
}

function updateBeacons(dt, t){
  const active = activeClueIndex();

  for (let i = 0; i < beacons.length; i++){
    const b = beacons[i], d = beaconData[i];
    const isActive = (i === active);
    const core = b.userData.core, halo = b.userData.halo, column = b.userData.column;

    b.rotation.y += dt * (isActive ? 1.4 : .35);
    core.rotation.x += dt * (isActive ? 2.2 : .6);

    const pulse = (Math.sin(t * (isActive ? 3.2 : 1.2) + i) + 1) * .5;
    const tint = d.found ? CLUE_DONE : isActive ? CLUE_ACTIVE : CLUE_PENDING;

    // core, halo AND pillar all carry the same colour — the whole marker is
    // the target, not just the little cube at the middle of it
    core.material.color.setHex(tint);
    halo.material.color.setHex(tint);
    column.material.color.setHex(tint);

    core.scale.setScalar(isActive ? 1.5 + pulse * .5 : .55);
    halo.scale.setScalar(isActive ? 1.7 + pulse * .55 : .7);
    halo.material.opacity = d.found ? .05 : isActive ? .38 + pulse * .22 : .04;

    // the live pillar is a solid column of amber light you cannot miss;
    // the dormant ones are thin cold markers
    column.visible = !d.found;
    column.scale.setScalar(isActive ? 1 : .28);
    column.material.opacity = isActive ? (.46 + pulse * .20) : .04;

    if (d.found || !isActive) continue;

    /* Catch test is a vertical cylinder, not a sphere, so flying into the
       pillar anywhere along its height counts. */
    const dx = b.position.x - BOAT.pos.x;
    const dz = b.position.z - BOAT.pos.z;
    const dy = b.position.y - BOAT.pos.y;
    if (dx*dx + dz*dz < CLUE_R_H*CLUE_R_H && Math.abs(dy) < CLUE_R_V){
      d.found = true;
      if (onClue) onClue(d.idx);
    }
  }
}

/* ---- sea life: drifting ambience, recycled like everything else ---- */
function spawnFauna(n){
  fauna.forEach(f => scene.remove(f.mesh));
  fauna = [];
  for (let i = 0; i < n; i++){
    const type = CREATURES.pick();
    const mesh = CREATURES.make(type);
    const far = type === 'whale';
    const o = {
      mesh, type,
      seed: Math.random() * 6.28,
      scale: (mesh.userData.scale || 1) * (far ? 1 : .75 + Math.random() * .7),
      speed: far ? .7 + Math.random() * .5 : 1.4 + Math.random() * 2.6,
      yaw: Math.random() * 6.28,
      bobAmp: far ? 1.4 : .6 + Math.random() * 2.2,
      bobSpd: .25 + Math.random() * .5,
      x: 0, y: 0, z: 0
    };
    placeFauna(o, true);
    mesh.scale.setScalar(o.scale);
    scene.add(mesh);
    fauna.push(o);
  }
}

function placeFauna(o, initial){
  const far = o.type === 'whale';
  const spread = far ? 190 : 120;
  o.x = BOAT.pos.x + (Math.random() - .5) * spread;
  o.y = BOAT.pos.y + (far ? 14 + Math.random() * 30 : -6 + Math.random() * 34);
  const fwd = forwardVec();
  const d = initial ? Math.random() * DEPTH : DEPTH * (.7 + Math.random() * .3);
  o.z = BOAT.pos.z + fwd.z * d + (Math.random() - .5) * spread;
  o.x += fwd.x * d;
  o.yaw = Math.random() * 6.28;
}

/* Creature contact. These used to be pure ambience; now brushing one costs
   hull and shoves the boat off course, so the water between checkpoints is
   something you have to actually fly through rather than past.

   The cooldown matters: without it a single overlap fires every frame and
   drains the whole hull in under a second. One hit, then a second of
   invulnerability while you get clear. */
let hitCooldown = 0, onHit = null;

function creatureRadius(o){
  // rough body half-length; the whale is genuinely huge, a jelly is not
  const base = { whale: 11, ray: 6.5, turtle: 3.4, squid: 3.8, jelly: 3.0 }[o.type] || 4;
  return base * (o.scale / (o.mesh.userData.scale || 1)) + 3.2;   // + the sub's own hull
}

function updateFauna(dt, t, forward){
  hitCooldown = Math.max(0, hitCooldown - dt);

  for (const o of fauna){
    // each creature swims its own heading, independent of the boat
    o.x += -Math.sin(o.yaw) * o.speed * dt;
    o.z += -Math.cos(o.yaw) * o.speed * dt;
    const bob = Math.sin(t * o.bobSpd + o.seed) * o.bobAmp;

    const dx = o.x - BOAT.pos.x, dz = o.z - BOAT.pos.z;
    const along = dx * forward.x + dz * forward.z;
    const lateral = Math.hypot(dx, dz);
    if (along < -RECYCLE * 2 || lateral > DEPTH * 1.2) placeFauna(o, false);

    o.mesh.position.set(o.x, o.y + bob, o.z);
    o.mesh.rotation.y = o.yaw;
    if (o.mesh.userData.anim) o.mesh.userData.anim(t, o.seed);

    // ---- contact ----
    if (hitCooldown > 0) continue;
    const dy = (o.y + bob) - BOAT.pos.y;
    const r = creatureRadius(o);
    if (dx*dx + dy*dy + dz*dz > r*r) continue;

    hitCooldown = 1.1;
    shakeAmt = Math.max(shakeAmt, .9);

    // shove the boat away from the creature and scrub its speed
    const n = Math.hypot(dx, dz) || 1;
    BOAT.pos.x -= (dx / n) * 6.5;
    BOAT.pos.z -= (dz / n) * 6.5;
    BOAT.speed *= .35;
    BOAT.auto = false;                  // you are flying now, not the autopilot

    // and knock the creature clear so you do not immediately re-collide
    o.x += (dx / n) * 9; o.z += (dz / n) * 9;

    if (onHit) onHit(o.type);
  }
}

/* ---- checkpoint beacon: the thing you are navigating toward ---- */
let checkpoint = null;

function makeCheckpoint(){
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffa312, transparent: true, opacity: .9, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++){
    const r = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 3.4, .34, 8, 40), ringMat);
    r.userData.spin = (i % 2 ? -1 : 1) * (.35 + i * .12);
    r.rotation.x = Math.PI / 2 + i * .4;
    g.add(r);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc247 }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa312, transparent: true, opacity: .22,
                                  blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  // vertical column so it is findable from a distance
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 300, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffa312, transparent: true, opacity: .16,
                                  blending: THREE.AdditiveBlending, depthWrite: false,
                                  side: THREE.DoubleSide }));
  g.add(col);
  g.userData.core = core; g.userData.halo = halo;
  return g;
}

/* Drop the checkpoint out ahead of the boat at the start of a leg. */
function placeCheckpoint(){
  if (!checkpoint){ checkpoint = makeCheckpoint(); scene.add(checkpoint); }
  const fwd = forwardVec();
  checkpoint.position.copy(BOAT.pos)
    .addScaledVector(fwd, 210 + Math.random() * 60);
  checkpoint.position.y = BOAT.pos.y + (Math.random() - .5) * 52;
  checkpoint.visible = true;
}

/* The checkpoint will not accept you until every clue beacon on this leg has
   been scanned. Locked it burns cold blue and spins slowly; unlocked it goes
   back to amber and speeds up, so the state is readable from across the
   water without looking at the HUD. */
function cluesComplete(){
  if (forcedOpen) return true;
  return beaconData.length > 0 && beaconData.every(b => b.found);
}

function updateCheckpoint(dt, t){
  if (!checkpoint || !checkpoint.visible) return;
  const open = cluesComplete();

  /* The checkpoint is amber either way — it is always the place you are
     trying to get to. Locked, it just idles: slow rings, shallow pulse.
     Open, it spins up and breathes hard. */
  const spinK = open ? 1 : .3;
  checkpoint.children.forEach(c => { if (c.userData.spin) c.rotation.z += dt * c.userData.spin * spinK; });
  const pulse = (Math.sin(t * (open ? 2.4 : .8)) + 1) * .5;
  checkpoint.userData.halo.scale.setScalar(1 + pulse * (open ? .30 : .08));
  checkpoint.userData.core.scale.setScalar((open ? .95 : .6) + pulse * (open ? .35 : .1));

  const d = BOAT.pos.distanceTo(checkpoint.position);
  if (d < 18){
    if (open){
      checkpoint.visible = false;
      if (onArrive) onArrive();
    } else if (onBlocked && t - lastBlocked > 2.2){
      lastBlocked = t;                       // throttle: this fires every frame otherwise
      onBlocked(beaconData.filter(b => !b.found).length);
    }
  }
}
let onArrive = null, onBlocked = null, lastBlocked = -99;
/* When the leg's scan power is spent the boat can no longer manoeuvre and
   the checkpoint opens regardless of how much you found. You are never
   stranded; you just arrive knowing less. */
let powerOut = false, forcedOpen = false;

/* ------------------------------------------------------------ init */
function init(){
  const cv = document.getElementById('env3d');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Lifted a little: the scene is much darker than it used to be, and ACES
  // rolls the shadows off hard. The post grade puts the contrast back.
  renderer.toneMappingExposure = 1.18;

  const a = atmo();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(a.fog);
  scene.fog = new THREE.FogExp2(a.fog, a.den);

  camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, .1, 500);
  camera.position.set(0, 0, 0);

  hemi = new THREE.HemisphereLight(a.amb, 0x081c22, a.ambI);
  scene.add(hemi);
  ambient = new THREE.AmbientLight(a.amb, .11);
  scene.add(ambient);

  // surface light from above — what makes this read as sunlit water
  sun = new THREE.DirectionalLight(a.sun, a.sunI);
  sun.position.set(28, 120, 34);
  scene.add(sun);

  floor = makeFloor(a); scene.add(floor);
  rocks = makeRocks();  scene.add(rocks);

  TEX.kelp = TEX.kelp || FORGE.kelp(256);
  kelp  = FLORA.kelp(TEX.kelp);   scene.add(kelp);
  grass = FLORA.grass(TEX.kelp);  scene.add(grass);
  fishM = makeFish();   scene.add(fishM);
  motes = makeMotes();  scene.add(motes);
  biolum = makeBiolum(); scene.add(biolum);

  // the boat itself; its lamps replace the free-floating ones
  BOAT.pos  = new THREE.Vector3(0, 0, 0);
  BOAT.quat = new THREE.Quaternion();
  boat = SUB.build(new THREE.Color(a.lamp));
  scene.add(boat);

  // rides with the chase camera so the hull reads against the dark
  chaseFill = new THREE.PointLight(0x7fb8d8, 0, 34, 2);
  scene.add(chaseFill);
  bindInput();

  spawnFauna(14);

  FULL.rocks = rocks.count; FULL.kelp = kelp.count; FULL.grass = grass.count;

  // Bloom, vignette, grade. Optional: if it will not initialise we just
  // render the scene straight to the screen as before.
  if (typeof POST !== 'undefined') POST.init(renderer);

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
}

/* ---- bioluminescence: the only native light down here ----
   Sparse, slow, and it blinks. These are the particles bloom was
   added for — a handful of hard little lights in a lot of dark. */
function makeBiolum(){
  const N = 150;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3);
  BIO = [];
  for (let i = 0; i < N; i++){
    const o = {
      x: (Math.random() - .5) * 90,
      y: (Math.random() - .5) * 44,
      z: -Math.random() * DEPTH,
      ph: Math.random() * 6.28,
      sp: .25 + Math.random() * .7,
      drift: (Math.random() - .5) * .5
    };
    BIO.push(o);
    p[i*3] = o.x; p[i*3+1] = o.y; p[i*3+2] = o.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({
    size: .42, map: moteTexture(), transparent: true, opacity: .8,
    depthWrite: false, blending: THREE.AdditiveBlending,
    sizeAttenuation: true, color: 0x58cfc4
  });
  return new THREE.Points(geo, mat);
}

function applyQuality(q){
  quality = q;
  const low = q === 'low';
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.8));
  // drop the 7000-particle haze layer first — biggest cost, least missed
  if (motes && motes.userData.layers) motes.userData.layers[0].visible = !low;
  if (rocks) rocks.count = low ? Math.floor(FULL.rocks * .5) : FULL.rocks;
  if (kelp)  kelp.count  = low ? Math.floor(FULL.kelp  * .5) : FULL.kelp;
  if (grass) grass.count = low ? Math.floor(FULL.grass * .45) : FULL.grass;
  if (biolum) biolum.visible = true;   // cheap and it is most of the mood
  fauna.forEach((f, i) => { f.mesh.visible = !low || i < 6; });
  if (scene) scene.fog.density *= 1;   // unchanged; fog is free
  // Keep the grade and the vignette on low — they cost almost nothing and
  // they are what makes the water read as deep. Only bloom and grain,
  // which are the per-pixel costs, get dialled back.
  if (typeof POST !== 'undefined') POST.setStrength(low ? .45 : 1);
}

function sampleFrame(dt){
  if (adapted || dt <= 0) return;
  samples.push(1 / dt);
  if (samples.length < 120) return;
  adapted = true;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  if (median < 42) applyQuality('low');
}

function bindInput(){
  const track = (e, down) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (DRIVE_KEYS.has(k)){
      KEYS[k] = down;
      /* Any input drops the autopilot — EXCEPT once scan power is spent.
         With no thrust available, letting a keypress disengage the
         autopilot leaves the boat dead in the water with no way to reach
         the checkpoint. The player would be stranded permanently. */
      if (down && !powerOut) BOAT.auto = false;
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', e => track(e, true));
  window.addEventListener('keyup',   e => track(e, false));
  window.addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });
}
const DRIVE_KEYS = new Set(['w','a','s','d','q','e',' ','Shift',
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);

function key(...names){ return names.some(n => KEYS[n]); }

/* Submarine handling, modelled on the reference build: thrust builds speed
   against drag rather than setting it, pitch self-levels when released, and
   a lateral current pushes the boat off course. Movement should feel weighty. */
const TURN = 1.0, PITCH_RATE = 1.15, ACCEL = 24, MAX_SPD = 32, DRAG = .90;
let current = 2.4;                        // lateral drift strength

/* Vertical envelope. The old limits were -9.2..34 — about 43 units, which at
   full speed is crossed in under three seconds, so the boat spent most of its
   time pinned against an invisible ceiling. */
const KEEL_Y = -8.5, CEIL_Y = 150;
/* Dive planes need water flow, but leaving them with zero authority at zero
   speed means pitching while coasting does nothing at all. This is the
   minimum flow the planes always get. */
const MIN_PLANE_FLOW = 9;

/* ---- relative bearing, starboard-positive ----
   Forward is (-sin yaw, -cos yaw), so the yaw that points at a delta is
   atan2(-dx, -dz). The bearing RELATIVE to the bow is then yaw - that.

   Note the order. Both the sonar scope and the waypoint compass used to
   compute `world - yaw`, which is the mirror image: a contact off the
   starboard bow was reported at -90 and painted on the port side of the
   scope, and the HUD needle pointed away from the thing it was meant to
   lead you to. Verified against the hand-worked cases: at yaw 0 a contact
   at +X is starboard and must read +90. */
function relBearingDeg(dx, dz){
  const world = Math.atan2(-dx, -dz);
  const rel = (BOAT.yaw - world) * 180 / Math.PI;
  return ((rel % 360) + 540) % 360 - 180;            // -180..180
}

function forwardVec(){
  return new THREE.Vector3(
    -Math.sin(BOAT.yaw) * Math.cos(BOAT.pitch),
     Math.sin(BOAT.pitch),
    -Math.cos(BOAT.yaw) * Math.cos(BOAT.pitch));
}

function driveBoat(dt){
  const thrust = key(' ', 'Shift') && !powerOut;
  const left   = key('a','ArrowLeft'),  right = key('d','ArrowRight');
  const up     = key('w','ArrowUp'),    down  = key('s','ArrowDown');

  if (BOAT.auto){
    BOAT.speed += (CRUISE - BOAT.speed) * dt * 1.2;
    BOAT.pitch *= .985;
  } else {
    if (left)  BOAT.yaw += TURN * dt;
    if (right) BOAT.yaw -= TURN * dt;
    if (up)    BOAT.pitch = Math.min( .6, BOAT.pitch + PITCH_RATE * dt);
    if (down)  BOAT.pitch = Math.max(-.6, BOAT.pitch - PITCH_RATE * dt);
    if (!up && !down) BOAT.pitch *= .985;            // planes self-centre
    if (thrust) BOAT.speed = Math.min(MAX_SPD, BOAT.speed + ACCEL * dt);
    else        BOAT.speed *= Math.pow(DRAG, dt * 60);
  }
  BOAT.throttle = BOAT.speed / MAX_SPD;

  const fwd = forwardVec();

  // horizontal travel comes from thrust...
  BOAT.pos.x += fwd.x * BOAT.speed * dt;
  BOAT.pos.z += fwd.z * BOAT.speed * dt;
  BOAT.pos.x += Math.sin(performance.now() * .0003) * current * dt;   // ocean current

  // ...vertical from the planes, which keep authority even while coasting
  const flow = Math.max(MIN_PLANE_FLOW, BOAT.speed);
  BOAT.pos.y += Math.sin(BOAT.pitch) * flow * dt;

  // pinned against a limit? level the planes, or the boat reads as
  // climbing hard while going nowhere
  if (BOAT.pos.y <= KEEL_Y){ BOAT.pos.y = KEEL_Y; if (BOAT.pitch < 0) BOAT.pitch = 0; }
  if (BOAT.pos.y >= CEIL_Y){ BOAT.pos.y = CEIL_Y; if (BOAT.pitch > 0) BOAT.pitch = 0; }

  BOAT.quat.setFromEuler(new THREE.Euler(BOAT.pitch, BOAT.yaw, 0, 'YXZ'));
  if (boat){
    boat.position.copy(BOAT.pos);
    boat.rotation.set(BOAT.pitch, BOAT.yaw, 0);
  }
  return fwd;
}

/* Place the camera for the current view. */
function placeCamera(forward, t){
  const sway = Math.sin(t * .55) * .30 + Math.sin(t * 1.31) * .09;
  const sk = shakeAmt;
  const jitter = new THREE.Vector3(
    (Math.random() - .5) * sk * 3.2, (Math.random() - .5) * sk * 3.2, 0);

  if (view === 'chase'){
    // level chase boom — follows heading, not pitch, so diving stays readable
    const flat = new THREE.Vector3(-Math.sin(BOAT.yaw), 0, -Math.cos(BOAT.yaw));
    const want = BOAT.pos.clone().addScaledVector(flat, -19);
    want.y += 7.5;
    want.add(jitter);
    if (snapCam){ camera.position.copy(want); snapCam = false; }
    else camera.position.lerp(want, 1 - Math.pow(.0016, Math.min(.05, lastDt)));
    camera.position.y += sway * .3;
    const look = BOAT.pos.clone().addScaledVector(forward, 8);
    camera.lookAt(look);
    if (chaseFill){
      chaseFill.position.copy(camera.position).add(new THREE.Vector3(0, 3, 0));
      chaseFill.intensity = .70;
    }
    camera.rotation.z += Math.sin(t * .43) * .008 + (Math.random() - .5) * sk * .07;
  } else {
    // inside the sail, looking out
    const eye = BOAT.pos.clone()
      .addScaledVector(forward, 2.2)
      .add(new THREE.Vector3(0, 1.1 + sway, 0)).add(jitter);
    camera.position.copy(eye);
    camera.quaternion.copy(BOAT.quat);
    camera.rotation.z += Math.sin(t * .43) * .012 + (Math.random() - .5) * sk * .09;
    camera.rotation.x += Math.sin(t * .61) * .009;
    if (chaseFill) chaseFill.intensity = 0;
  }
}

/* Recycle one scattered object when it falls behind the boat. */
function recycle(o, forward, lateral, depth){
  const dx = o.x - BOAT.pos.x, dy = (o.y || 0) - BOAT.pos.y, dz = o.z - BOAT.pos.z;
  const along = dx * forward.x + dy * forward.y + dz * forward.z;
  if (along > -RECYCLE) return false;
  const ahead = depth + along;                       // push it out in front
  o.x += forward.x * ahead + (Math.random() - .5) * lateral;
  o.z += forward.z * ahead + (Math.random() - .5) * lateral;
  return true;
}

/* The 3D view is clipped to whatever rect we are told to fill — the porthole
   during gameplay, the whole window on the title screens. Without this the
   canvas is centred on the screen while the porthole is not, so the boat
   renders below the window it is supposed to be seen through. */
let viewRect = null;

function applyViewport(){
  const cv2 = renderer.domElement;
  const r = viewRect;
  if (r){
    cv2.style.position = 'fixed';
    cv2.style.left = r.left + 'px';  cv2.style.top = r.top + 'px';
    cv2.style.width = r.width + 'px'; cv2.style.height = r.height + 'px';
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
  } else {
    cv2.style.position = 'fixed';
    cv2.style.left = '0'; cv2.style.top = '0';
    cv2.style.width = '100vw'; cv2.style.height = '100vh';
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
  }
  camera.updateProjectionMatrix();
}

function onResize(){ applyViewport(); }

/* ---- ease atmosphere toward the current checkpoint ---- */
const cur = { fog:new THREE.Color(), lamp:new THREE.Color(), amb:new THREE.Color(),
              den:.017, lampI:2.6, ambI:.5, init:false };

function blendAtmo(dt){
  const a = atmo(), k = Math.min(1, dt * 1.1);
  if (!cur.init){
    cur.fog.setHex(a.fog); cur.lamp.setHex(a.lamp); cur.amb.setHex(a.amb);
    cur.den = a.den; cur.lampI = a.lampI; cur.ambI = a.ambI; cur.init = true;
  }
  cur.fog.lerp(new THREE.Color(a.fog), k);
  cur.lamp.lerp(new THREE.Color(a.lamp), k);
  cur.amb.lerp(new THREE.Color(a.amb), k);
  cur.den   += (a.den   - cur.den)   * k;
  cur.lampI += (a.lampI - cur.lampI) * k;
  cur.ambI  += (a.ambI  - cur.ambI)  * k;

  scene.background.copy(cur.fog);
  scene.fog.color.copy(cur.fog);
  // slow turbidity drift — passing through siltier and clearer water
  const silt = 1 + Math.sin(clock.elapsedTime * .11) * .16
                 + Math.sin(clock.elapsedTime * .047) * .09;
  scene.fog.density = cur.den * silt;
  hemi.color.copy(cur.amb); hemi.intensity = cur.ambI;
  ambient.color.copy(cur.amb);
  if (sun){
    sun.color.lerp(new THREE.Color(a.sun), k);
    sun.intensity += (a.sunI - sun.intensity) * k;
  }
  SUB.setLampColor(cur.lamp);
  SUB.setLampIntensity(mode === 'game' ? cur.lampI * 1.25 : cur.lampI * .4);
  SUB.setBeamOpacity(mode === 'game' ? .60 : .18);
  SUB.setVisible(view === 'chase');          // never see your own hull from inside
  floor.material.color.lerp(new THREE.Color(a.floor), k);
}

/* ------------------------------------------------------------ loop */
const dummy = typeof THREE !== 'undefined' ? new THREE.Object3D() : null;

function tick(){
  if (!running) return;

  /* Fully suspended: the intro film covers the whole window, so the scene
     behind it is invisible and every frame of it is stolen from the video
     decoder. Keep the rAF alive so we can resume, but do no simulation and
     no rendering -- the 4-pass post chain in particular is expensive.
     getDelta() is drained so the clock does not jump on resume. */
  if (paused){
    clock.getDelta();
    requestAnimationFrame(tick);
    return;
  }

  const dt = Math.min(.05, clock.getDelta());
  const t  = clock.elapsedTime;
  lastDt = dt;
  sampleFrame(dt);
  shakeAmt *= .935;
  boost *= .94;

  blendAtmo(dt);

  const forward = driveBoat(dt);
  const v = (BOAT.speed + boost) * dt;             // how far the world "passed"
  placeCamera(forward, t);
  SUB.update(dt, BOAT.throttle, t);
  updateBeacons(dt, t);
  updateCheckpoint(dt, t);
  updateFauna(dt, t, forward);

  // seabed follows the boat, snapped to the displacement period so it
  // reads as continuous ground rather than a sliding sheet
  const PX = 2 * Math.PI / .055, PZ = 2 * Math.PI / .041;
  floor.position.x = Math.round(BOAT.pos.x / PX) * PX;
  floor.position.z = Math.round(BOAT.pos.z / PZ) * PZ;
  floor.userData.caustic.map.offset.y -= dt * .05;
  floor.userData.caustic.map.offset.x += dt * .012;

  // boulders
  for (let i = 0; i < rockData.length; i++){
    const o = rockData[i];
    if (recycle(o, forward, 150, DEPTH)) o.s = 1.6 + Math.random() * 8.5;
    dummy.position.set(o.x, o.y, o.z);
    dummy.rotation.set(o.rx, o.ry, o.rz);
    dummy.scale.set(o.s * o.sx, o.s * .62 * o.sy, o.s * o.sz);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;

  // plants: the sway lives in the vertex shader, we only reposition clumps
  FLORA.UTIME.value = t;
  FISH_TIME.value = t;
  FLORA.advance(kelp,  forward, BOAT.pos, RECYCLE, DEPTH);
  FLORA.advance(grass, forward, BOAT.pos, RECYCLE, DEPTH);

  // fish
  for (let i = 0; i < fishData.length; i++){
    const f = fishData[i];
    f.x += f.drift * dt * 3;
    recycle(f, forward, 110, DEPTH - 20);
    const yy = f.y + Math.sin(t * f.sp + f.ph) * f.amp;
    dummy.position.set(f.x, yy, f.z);
    dummy.rotation.set(0, Math.atan2(-forward.x, -forward.z) + (f.drift > 0 ? .3 : -.3), 0);
    dummy.scale.setScalar(f.s);
    dummy.updateMatrix(); fishM.setMatrixAt(i, dummy.matrix);
  }
  fishM.instanceMatrix.needsUpdate = true;

  // particulate keeps a cloud around the boat
  motes.userData.layers.forEach((pts, li) => {
    const mp = pts.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++){
      const o = { x: mp.getX(i), y: mp.getY(i), z: mp.getZ(i) };
      o.y -= dt * (.22 + li * .12);
      if (recycle(o, forward, 90, DEPTH)) o.y = BOAT.pos.y + (Math.random() - .5) * 48;
      if (o.y < BOAT.pos.y - 26) o.y = BOAT.pos.y + 24;
      mp.setXYZ(i, o.x, o.y, o.z);
    }
    mp.needsUpdate = true;
  });

  // bioluminescence: drifts, blinks, and is recycled like everything else
  if (biolum){
    const bp = biolum.geometry.attributes.position;
    for (let i = 0; i < BIO.length; i++){
      const o = BIO[i];
      o.y += Math.sin(t * o.sp + o.ph) * dt * .5;
      o.x += o.drift * dt;
      if (recycle(o, forward, 90, DEPTH)) o.y = BOAT.pos.y + (Math.random() - .5) * 44;
      bp.setXYZ(i, o.x, o.y, o.z);
    }
    bp.needsUpdate = true;
    // collective slow pulse, so the field breathes instead of sitting static
    biolum.material.opacity = .34 + Math.sin(t * .7) * .16;
  }

  // hull-impact red wash, decaying with the shake that caused it
  if (typeof POST !== 'undefined' && POST.available()) POST.setFlash(shakeAmt * .5);

  if (!(typeof POST !== 'undefined' && POST.render(scene, camera, t)))
    renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------ API */
return {
  supported,
  start(){
    if (running) return;
    init(); running = true; clock.start(); tick();
  },
  setCheckpoint(i){ cp = i; },
  setMode(m){ mode = m; },
  pulse(){ boost = 26; },
  shake(i){ shakeAmt = Math.max(shakeAmt, i); },

  /* ---- third-person / free navigation ---- */
  toggleView(){ view = view === 'cockpit' ? 'chase' : 'cockpit'; snapCam = true; return view; },
  getView(){ return view; },
  setViewport(rect){ viewRect = rect; if (renderer) applyViewport(); },
  setClueSites(n, cb){ onClue = cb; setClueSites(n); },
  clearClueSites(){ beacons.forEach(b => scene.remove(b)); beacons = []; beaconData = []; },
  resumeAuto(){ BOAT.auto = true; BOAT.pitch *= .3; },
  setCurrent(c){ current = c; },
  isDriving(){ return !BOAT.auto; },
  boatSpeed(){ return (BOAT.speed || 0) * 1.94384; },   // m/s -> knots, the HUD says KT
  heading(){ return ((-BOAT.yaw * 180 / Math.PI) % 360 + 360) % 360; },
  depth(){ return Math.round(2140 - BOAT.pos.y); },
  pitch(){ return BOAT.pitch; },
  throttle(){ return BOAT.throttle; },

  /* navigation telemetry for the HUD */
  checkpointInfo(){
    if (!checkpoint || !checkpoint.visible) return null;
    return this.bearingTo(checkpoint.position);
  },

  /* Relative bearing to a world point, in the same convention the sonar
     scope uses: forward is (-sin yaw, -cos yaw), so the yaw that points at
     p is atan2(-dx, -dz) and the error is that minus BOAT.yaw.

     This used to read `bearing - heading()`, but heading() returns the
     COMPASS heading, which is -yaw. That made the error come out as
     theta + yaw instead of theta - yaw: correct only while yaw was 0, and
     mirrored the moment you turned. The compass needle then drove you away
     from the target and stayed confidently pinned near zero while it did. */
  bearingTo(p){
    const dx = p.x - BOAT.pos.x, dz = p.z - BOAT.pos.z;
    let rel = relBearingDeg(dx, dz);
    return { dist: Math.round(BOAT.pos.distanceTo(p)), rel, vert: p.y - BOAT.pos.y };
  },

  /* What the HUD should be steering you at right now: the live clue while
     any are outstanding, otherwise the checkpoint. One arrow and one number,
     never a choice about which of three markers you are meant to chase. */
  navTarget(){
    const a = activeClueIndex();
    if (a >= 0 && beacons[a]){
      const info = this.bearingTo(beacons[a].position);
      info.kind = 'clue';
      info.index = a;
      return info;
    }
    const cp = this.checkpointInfo();
    if (cp) cp.kind = 'waypoint';
    return cp;
  },
  startLeg(cb){ onArrive = cb; placeCheckpoint(); },
  onCreatureHit(cb){ onHit = cb; },
  onCheckpointBlocked(cb){ onBlocked = cb; },
  /* Out of power: kill thrust, hand the boat to the autopilot so it still
     drifts to the checkpoint, and open the gate. */
  setPowerOut(v){
    powerOut = !!v;
    if (powerOut){ forcedOpen = true; BOAT.auto = true; }
  },
  resetLegPower(){ powerOut = false; forcedOpen = false; },
  isPowerOut(){ return powerOut; },
  cluesComplete(){ return cluesComplete(); },
  clueProgress(){ return { found: beaconData.filter(b => b.found).length, total: beaconData.length }; },

  /* Live radar picture, heading-up: bearing 0 is dead ahead, so the scope
     works as a navigation instrument rather than a scripted display. */
  radarContacts(range){
    range = range || 320;
    if (!BOAT.pos) return [];
    const out = [];
    const rel = (p) => {
      const dx = p.x - BOAT.pos.x, dz = p.z - BOAT.pos.z;
      const dist = Math.hypot(dx, dz);
      // starboard-positive, 0 dead ahead — see relBearingDeg
      const b = (relBearingDeg(dx, dz) + 360) % 360;
      return { b, r: Math.min(.97, dist / range), dist };
    };
    const activeIdx = activeClueIndex();
    for (let i = 0; i < beacons.length; i++){
      const q = rel(beacons[i].position);
      if (q.dist > range) continue;
      const found = beaconData[i].found;
      const live  = (i === activeIdx);
      out.push({ b: q.b, r: q.r, s: found ? 2 : (live ? 3 : 1),
                 kind: found ? 'found' : (live ? 'clue' : 'cluedim'),
                 tag: found ? '\u2713' : (live ? 'CLUE' : '') });
    }
    if (checkpoint && checkpoint.visible){
      const q = rel(checkpoint.position);
      out.push({ b: q.b, r: Math.min(.93, q.r), s: 3, kind: 'waypoint', tag: 'WPT',
                 edge: q.dist > range });
    }
    return out;
  },
  /* Suspend the whole render loop while something opaque is over the top
     of it (the intro film). Frees the GPU for video decode. */
  setPaused(v){ paused = !!v; },
  isPaused(){ return paused; },
  toggleQuality(){ applyQuality(quality === 'high' ? 'low' : 'high'); return quality; },
  getQuality(){ return quality; }
};

})();
