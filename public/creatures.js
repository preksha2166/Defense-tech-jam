/* ============================================================
   TRUSTLINE: ABYSS — SEA LIFE
   Procedural creatures, no model files. Each builder returns a
   THREE.Group carrying userData.anim(t) for its own motion, so
   adding a species never touches the world loop.

   These are ambience, not hazards — nothing here can hurt the
   boat. The game is about the decision, not about dodging.
   ============================================================ */

const CREATURES = (() => {

const mat = (color, opts) => new THREE.MeshStandardMaterial(
  Object.assign({ color, roughness: .72, metalness: .05, flatShading: true }, opts || {}));

/* ---- manta ray: slow wing beats, the showpiece ---- */
function makeRay(){
  const g = new THREE.Group();
  const skin = mat(0x3d5a70, { flatShading: false, roughness: .55 });
  const belly = mat(0xd8e8ec, { flatShading: false, roughness: .6 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), skin);
  body.scale.set(1, .38, 2.1); g.add(body);
  const under = new THREE.Mesh(new THREE.SphereGeometry(1.42, 14, 10), belly);
  under.scale.set(.94, .3, 2); under.position.y = -.16; g.add(under);

  const wings = [];
  for (const side of [-1, 1]){
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
    w.scale.set(4.6, .22, 2.0);
    w.position.x = side * 4.2;
    pivot.add(w);
    g.add(pivot);
    wings.push({ pivot, side });
  }
  // tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.22, 6, 6), skin);
  tail.rotation.x = Math.PI / 2; tail.position.z = -4.2; g.add(tail);
  // cephalic fins
  for (const side of [-1, 1]){
    const f = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.5, 6), skin);
    f.rotation.x = -Math.PI / 2.4; f.position.set(side * .8, 0, 2.7); g.add(f);
  }

  g.userData.anim = (t, seed) => {
    const beat = Math.sin(t * 1.1 + seed);
    wings.forEach(({ pivot, side }) => { pivot.rotation.z = -side * beat * .42; });
    g.rotation.z = beat * .06;
  };
  g.userData.scale = 1.6;
  return g;
}

/* ---- jellyfish: translucent bell, pulsing, trailing tentacles ---- */
function makeJelly(){
  const g = new THREE.Group();
  const tint = [0x9fe8ff, 0xffc4e8, 0xc4b0ff, 0xa8ffd8][(Math.random() * 4) | 0];
  const bellMat = new THREE.MeshStandardMaterial({
    color: tint, transparent: true, opacity: .42, roughness: .25,
    emissive: tint, emissiveIntensity: .55, side: THREE.DoubleSide });

  const bell = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12, 0, 6.28, 0, Math.PI / 1.85), bellMat);
  g.add(bell);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: .6 }));
  core.position.y = -.3; g.add(core);

  const arms = [];
  for (let i = 0; i < 9; i++){
    const a = (i / 9) * 6.28;
    const len = 3 + Math.random() * 3.6;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.045, .012, len, 5),
      new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: .38 }));
    arm.position.set(Math.cos(a) * 1.05, -len / 2 - .2, Math.sin(a) * 1.05);
    g.add(arm); arms.push({ arm, a });
  }

  g.userData.anim = (t, seed) => {
    const p = Math.sin(t * 1.5 + seed);
    bell.scale.set(1 + p * .16, 1 - p * .2, 1 + p * .16);
    arms.forEach(({ arm, a }, i) => {
      arm.rotation.x = Math.sin(t * 1.4 + seed + i) * .18;
      arm.rotation.z = Math.cos(t * 1.2 + seed + a) * .18;
    });
  };
  g.userData.scale = 1.1;
  g.userData.glow = tint;
  return g;
}

/* ---- sea turtle: unhurried flipper strokes ---- */
function makeTurtle(){
  const g = new THREE.Group();
  const shellMat = mat(0x4a6b3c, { flatShading: false, roughness: .8 });
  const skinMat  = mat(0x86a06a, { flatShading: false });

  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), shellMat);
  shell.scale.set(1.15, .55, 1.5); g.add(shell);
  const plast = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), mat(0xcfd8a8, { flatShading: false }));
  plast.scale.set(1.02, .3, 1.35); plast.position.y = -.3; g.add(plast);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 10), skinMat);
  head.position.set(0, .05, 2.1); head.scale.z = 1.3; g.add(head);

  const flips = [];
  for (const side of [-1, 1]){
    for (const fz of [1.0, -1.0]){
      const p = new THREE.Group();
      const f = new THREE.Mesh(new THREE.SphereGeometry(.8, 10, 8), skinMat);
      f.scale.set(2.0, .14, .62);
      f.position.x = side * 1.7;
      p.add(f); p.position.set(0, -.05, fz); g.add(p);
      flips.push({ p, side, front: fz > 0 });
    }
  }

  g.userData.anim = (t, seed) => {
    flips.forEach(({ p, side, front }) => {
      const beat = Math.sin(t * 1.6 + seed + (front ? 0 : .8));
      p.rotation.z = -side * beat * .55;
      p.rotation.x = beat * .18;
    });
  };
  g.userData.scale = 1.3;
  return g;
}

/* ---- squid: mantle plus a fan of arms ---- */
function makeSquid(){
  const g = new THREE.Group();
  const body = mat(0xc4627a, { flatShading: false, roughness: .45,
                               emissive: 0x3a1020, emissiveIntensity: .35 });

  const mantle = new THREE.Mesh(new THREE.ConeGeometry(1.0, 4.4, 14), body);
  mantle.rotation.x = -Math.PI / 2; mantle.position.z = -1.4; g.add(mantle);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.95, 14, 10), body);
  head.position.z = .8; g.add(head);
  for (const side of [-1, 1]){
    const fin = new THREE.Mesh(new THREE.SphereGeometry(.9, 10, 8), body);
    fin.scale.set(.16, .8, 1.3); fin.position.set(side * .8, 0, -3.0); g.add(fin);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.24, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    eye.position.set(side * .72, .2, 1.3); g.add(eye);
  }
  const arms = [];
  for (let i = 0; i < 8; i++){
    const a = (i / 8) * 6.28;
    const len = 2.6 + Math.random() * 1.6;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.13, .04, len, 6), body);
    const pivot = new THREE.Group();
    arm.position.y = -len / 2; pivot.add(arm);
    pivot.position.set(Math.cos(a) * .5, 0, 1.55);
    pivot.rotation.x = -Math.PI / 2.1;
    pivot.rotation.z = a;
    g.add(pivot); arms.push({ pivot, a });
  }
  g.userData.anim = (t, seed) => {
    arms.forEach(({ pivot, a }, i) => {
      pivot.rotation.x = -Math.PI / 2.1 + Math.sin(t * 2.1 + seed + i * .5) * .26;
    });
    g.rotation.z = Math.sin(t * .8 + seed) * .12;
  };
  g.userData.scale = 1.25;
  return g;
}

/* ---- whale: distant, huge, slow ---- */
function makeWhale(){
  const g = new THREE.Group();
  const skin = mat(0x46607a, { flatShading: false, roughness: .85 });
  const pale = mat(0xc8d8de, { flatShading: false, roughness: .8 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(3, 18, 14), skin);
  body.scale.set(1, 1.05, 3.6); g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(2.8, 16, 12), pale);
  belly.scale.set(.9, .6, 3.3); belly.position.y = -1.1; g.add(belly);

  const tailPivot = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 12), skin);
  stalk.rotation.x = Math.PI / 2; stalk.position.z = -3; tailPivot.add(stalk);
  const fluke = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
  fluke.scale.set(4.4, .28, 1.2); fluke.position.z = -6; tailPivot.add(fluke);
  tailPivot.position.z = -8; g.add(tailPivot);

  for (const side of [-1, 1]){
    const p = new THREE.Group();
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    f.scale.set(2.6, .2, .9); f.position.x = side * 2.4;
    p.add(f); p.position.set(0, -.6, 3); g.add(p);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 12), skin);
  head.position.z = 8.4; head.scale.set(.95, .8, 1.5); g.add(head);

  g.userData.anim = (t, seed) => {
    tailPivot.rotation.x = Math.sin(t * .55 + seed) * .22;
    g.rotation.z = Math.sin(t * .35 + seed) * .05;
  };
  g.userData.scale = 2.2;
  return g;
}

const BUILDERS = { ray: makeRay, jelly: makeJelly, turtle: makeTurtle,
                   squid: makeSquid, whale: makeWhale };

return {
  types: Object.keys(BUILDERS),
  make(type){
    const g = (BUILDERS[type] || makeRay)();
    g.userData.type = type;
    return g;
  },
  /* weighted roster — jellies are common, whales rare */
  pick(){
    const r = Math.random();
    if (r < .34) return 'jelly';
    if (r < .60) return 'ray';
    if (r < .78) return 'turtle';
    if (r < .93) return 'squid';
    return 'whale';
  }
};

})();
