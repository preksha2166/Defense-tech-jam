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
const FULL = {};

const DEPTH = 190;        // how far into the fog the world extends
const RECYCLE = 26;       // z past the camera at which objects wrap

/* ---- per-checkpoint atmosphere: the same mood arc, in 3D ---- */
const ATMO = [
  // Sunlit but not washed out. Fog is a saturated tropical blue-green with
  // enough density to give distance real falloff; ambient is strong but the
  // sun still creates direction, so surfaces keep shading instead of going
  // flat and milky.
  { fog:0x1f7f9e, den:.0125, lamp:0xffe9c4, lampI:2.4, amb:0x4fb8d0, ambI:.78, floor:0x4c7d70, sun:0xcdeeff, sunI:1.05 },
  { fog:0x186d92, den:.0150, lamp:0xffe4c0, lampI:2.5, amb:0x3fa0c4, ambI:.70, floor:0x426b68, sun:0xbde4ff, sunI:.95 },
  { fog:0x1f8c7c, den:.0135, lamp:0xffd49a, lampI:2.8, amb:0x4fc0a4, ambI:.76, floor:0x4f7d5e, sun:0xd6ffe4, sunI:1.02 },
  { fog:0x13597c, den:.0185, lamp:0xf0f4ff, lampI:2.3, amb:0x3286ac, ambI:.58, floor:0x38606a, sun:0xaed4f2, sunI:.82 },
  { fog:0x154d7e, den:.0170, lamp:0xe8f0ff, lampI:2.2, amb:0x3a76ae, ambI:.62, floor:0x3c5c78, sun:0xbcd6ff, sunI:.88 }
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
    map: TEX.caustic, transparent: true, opacity: .05,
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
    color: 0x8fa5a2, roughness: .93, metalness: .0,
    map: TEX.rock.map, normalMap: TEX.rock.normalMap,
    normalScale: new THREE.Vector2(1.9, 1.9)
  });
  const N = 240;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const d = new THREE.Object3D();
  rockData = [];
  for (let i = 0; i < N; i++){
    const o = { rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28 };
    placeRock(o, true);
    rockData.push(o);
    d.position.set(o.x, o.y, o.z);
    d.rotation.set(o.rx, o.ry, o.rz);
    d.scale.set(o.s, o.s * .62, o.s);
    d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/* ---- fish ---- */
function makeFish(){
  const geo = new THREE.ConeGeometry(.30, 1.6, 6);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8fb9c4, roughness: .8,
                                               emissive: 0x0d2b33, emissiveIntensity: .12 });
  const N = 46;
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
  { n: 7000, size: .17, op: .42 },   // fine haze
  { n: 3200, size: .38, op: .72 },   // mid
  { n:  850, size: .82, op: .95 }    // bright flakes catching the lamp
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
      sizeAttenuation: true, color: 0xdaf0ff
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
function makeBeacon(col){
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshBasicMaterial({ color: col }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .16,
                                  blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  const col2 = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 60, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .07,
                                  blending: THREE.AdditiveBlending, depthWrite: false,
                                  side: THREE.DoubleSide }));
  col2.position.y = 28; g.add(col2);
  g.userData.core = core; g.userData.halo = halo;
  return g;
}

/* Scatter one beacon per clue, out in front of the boat. */
function setClueSites(n){
  beacons.forEach(b => scene.remove(b));
  beacons = []; beaconData = [];
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(BOAT.quat);
  const rightV = new THREE.Vector3(1, 0, 0).applyQuaternion(BOAT.quat);
  for (let i = 0; i < n; i++){
    const dist = 55 + i * 34 + Math.random() * 26;
    const side = (i % 2 ? 1 : -1) * (16 + Math.random() * 38);
    const p = BOAT.pos.clone()
      .addScaledVector(fwd, dist)
      .addScaledVector(rightV, side);
    p.y = BOAT.pos.y - 14 + Math.random() * 34;
    const b = makeBeacon(0x6fe4f0);
    b.position.copy(p);
    scene.add(b);
    beacons.push(b);
    beaconData.push({ found: false, idx: i });
  }
}

function updateBeacons(dt, t){
  for (let i = 0; i < beacons.length; i++){
    const b = beacons[i], d = beaconData[i];
    b.rotation.y += dt * .8;
    b.userData.core.rotation.x += dt * 1.3;
    const pulse = (Math.sin(t * 2.4 + i) + 1) * .5;
    b.userData.halo.scale.setScalar(1 + pulse * .22);
    if (d.found){
      b.userData.core.material.color.setHex(0x57d99a);
      b.userData.halo.material.color.setHex(0x57d99a);
      b.userData.halo.material.opacity = .06;
      continue;
    }
    if (b.position.distanceTo(BOAT.pos) < 13){
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

function updateFauna(dt, t, forward){
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
  }
}

/* ---- checkpoint beacon: the thing you are navigating toward ---- */
let checkpoint = null;

function makeCheckpoint(){
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf0a94c, transparent: true, opacity: .85, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++){
    const r = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 3.4, .34, 8, 40), ringMat);
    r.userData.spin = (i % 2 ? -1 : 1) * (.35 + i * .12);
    r.rotation.x = Math.PI / 2 + i * .4;
    g.add(r);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf0a94c, transparent: true, opacity: .1,
                                  blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  // vertical column so it is findable from a distance
  const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 300, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf0a94c, transparent: true, opacity: .05,
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
    .addScaledVector(fwd, 300 + Math.random() * 90);
  checkpoint.position.y = BOAT.pos.y + (Math.random() - .5) * 52;
  checkpoint.visible = true;
}

function updateCheckpoint(dt, t){
  if (!checkpoint || !checkpoint.visible) return;
  checkpoint.children.forEach(c => { if (c.userData.spin) c.rotation.z += dt * c.userData.spin; });
  const pulse = (Math.sin(t * 2) + 1) * .5;
  checkpoint.userData.halo.scale.setScalar(1 + pulse * .2);
  checkpoint.userData.core.scale.setScalar(.85 + pulse * .3);
  if (BOAT.pos.distanceTo(checkpoint.position) < 15){
    checkpoint.visible = false;
    if (onArrive) onArrive();
  }
}
let onArrive = null;

/* ------------------------------------------------------------ init */
function init(){
  const cv = document.getElementById('env3d');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;

  const a = atmo();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(a.fog);
  scene.fog = new THREE.FogExp2(a.fog, a.den);

  camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, .1, 500);
  camera.position.set(0, 0, 0);

  hemi = new THREE.HemisphereLight(a.amb, 0x17414a, a.ambI);
  scene.add(hemi);
  ambient = new THREE.AmbientLight(a.amb, .20);
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

  // the boat itself; its lamps replace the free-floating ones
  BOAT.pos  = new THREE.Vector3(0, 0, 0);
  BOAT.quat = new THREE.Quaternion();
  boat = SUB.build(new THREE.Color(a.lamp));
  scene.add(boat);

  // rides with the chase camera so the hull reads against the dark
  chaseFill = new THREE.PointLight(0x9fd4e8, 0, 46, 2);
  scene.add(chaseFill);
  bindInput();

  spawnFauna(14);

  FULL.rocks = rocks.count; FULL.kelp = kelp.count; FULL.grass = grass.count;

  clock = new THREE.Clock();
  window.addEventListener('resize', onResize);
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
  fauna.forEach((f, i) => { f.mesh.visible = !low || i < 6; });
  if (scene) scene.fog.density *= 1;   // unchanged; fog is free
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
      if (down) BOAT.auto = false;          // any input drops autopilot
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

function forwardVec(){
  return new THREE.Vector3(
    -Math.sin(BOAT.yaw) * Math.cos(BOAT.pitch),
     Math.sin(BOAT.pitch),
    -Math.cos(BOAT.yaw) * Math.cos(BOAT.pitch));
}

function driveBoat(dt){
  const thrust = key(' ', 'Shift');
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
      chaseFill.intensity = 3.1;
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
  SUB.setBeamOpacity(mode === 'game' ? .07 : .015);
  SUB.setVisible(view === 'chase');          // never see your own hull from inside
  floor.material.color.lerp(new THREE.Color(a.floor), k);
}

/* ------------------------------------------------------------ loop */
const dummy = typeof THREE !== 'undefined' ? new THREE.Object3D() : null;

function tick(){
  if (!running) return;
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
    dummy.scale.set(o.s, o.s * .62, o.s);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;

  // plants: the sway lives in the vertex shader, we only reposition clumps
  FLORA.UTIME.value = t;
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
  boatSpeed(){ return BOAT.speed || 0; },
  heading(){ return ((-BOAT.yaw * 180 / Math.PI) % 360 + 360) % 360; },
  depth(){ return Math.round(2140 - BOAT.pos.y * 4); },
  pitch(){ return BOAT.pitch; },
  throttle(){ return BOAT.throttle; },

  /* navigation telemetry for the HUD */
  checkpointInfo(){
    if (!checkpoint || !checkpoint.visible) return null;
    const d = BOAT.pos.distanceTo(checkpoint.position);
    const to = checkpoint.position.clone().sub(BOAT.pos);
    const bearing = ((Math.atan2(-to.x, -to.z) * 180 / Math.PI) % 360 + 360) % 360;
    const rel = ((bearing - this.heading()) % 360 + 540) % 360 - 180;   // -180..180
    return { dist: Math.round(d), rel, vert: to.y };
  },
  startLeg(cb){ onArrive = cb; placeCheckpoint(); },
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
      const world = Math.atan2(-dx, -dz);            // heading that points at p
      let b = (world - BOAT.yaw) * 180 / Math.PI;
      b = ((b % 360) + 360) % 360;
      return { b, r: Math.min(.97, dist / range), dist };
    };
    for (let i = 0; i < beacons.length; i++){
      const q = rel(beacons[i].position);
      if (q.dist > range) continue;
      out.push({ b: q.b, r: q.r, s: 2,
                 kind: beaconData[i].found ? 'found' : 'clue',
                 tag: beaconData[i].found ? '\u2713' : 'CLUE' });
    }
    if (checkpoint && checkpoint.visible){
      const q = rel(checkpoint.position);
      out.push({ b: q.b, r: Math.min(.93, q.r), s: 3, kind: 'waypoint', tag: 'WPT',
                 edge: q.dist > range });
    }
    return out;
  },
  toggleQuality(){ applyQuality(quality === 'high' ? 'low' : 'high'); return quality; },
  getQuality(){ return quality; }
};

})();
