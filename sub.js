/* ============================================================
   TRUSTLINE: ABYSS — THE BOAT
   A procedural submarine: hull, sail, fins, screw, running
   lights and two forward lamps. Built as a THREE.Group so the
   camera can sit inside it (cockpit) or behind it (chase).
   No model files.
   ============================================================ */

const SUB = (() => {

let group, screw, lampL, lampR, beamL, beamR, portGlow = [];

function build(lampColor){
  group = new THREE.Group();

  /* The hull is modelled nose-toward +Z, but the boat's forward vector is -Z
     (Three.js convention, and what forwardVec() returns). Without this the
     submarine travels screw-first. The rig carries the geometry at 180 deg;
     the outer group is what receives pitch and yaw. */
  const rig = new THREE.Group();
  rig.rotation.y = Math.PI;
  group.add(rig);

  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4852, roughness: .58, metalness: .52,
                                                emissive: 0x070f14, emissiveIntensity: 1 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: .85, metalness: .3,
                                                emissive: 0x050a0e, emissiveIntensity: 1 });
  const rust  = new THREE.MeshStandardMaterial({ color: 0x4a2d19, roughness: .95, metalness: .1 });

  /* ---- pressure hull: cylinder capped by a nose cone and a taper ---- */
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7.2, 24), steel);
  body.rotation.x = Math.PI / 2;
  rig.add(body);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), steel);
  nose.position.z = 3.6; nose.scale.z = 1.5;
  rig.add(nose);

  const taper = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.2, 24), steel);
  taper.rotation.x = -Math.PI / 2; taper.position.z = -5.7;
  rig.add(taper);

  /* ---- hull banding ---- */
  [2.2, 0, -2.2].forEach(z => {
    const b = new THREE.Mesh(new THREE.TorusGeometry(1.52, .09, 8, 28), rust);
    b.rotation.y = 0; b.position.z = z; b.rotation.x = 0;
    b.rotation.set(0, 0, 0);
    rig.add(b);
  });

  /* ---- sail / conning tower ---- */
  const sail = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.9, 2.9), steel);
  sail.position.set(0, 1.75, .6);
  rig.add(sail);
  const sailNose = new THREE.Mesh(new THREE.CylinderGeometry(.575, .575, 1.9, 12, 1, false, 0, Math.PI), steel);
  sailNose.position.set(0, 1.75, 2.05); sailNose.rotation.y = Math.PI / 2;
  rig.add(sailNose);

  // periscope + mast
  const per = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 1.5, 8), dark);
  per.position.set(-.25, 3.3, .2); rig.add(per);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.0, 6), dark);
  mast.position.set(.3, 3.05, -.1); rig.add(mast);

  /* ---- control surfaces ---- */
  const finGeo = new THREE.BoxGeometry(.14, 2.6, 1.4);
  [[0, 0], [Math.PI / 2, 0]].forEach(([rot]) => {
    const f = new THREE.Mesh(finGeo, dark);
    f.position.z = -6.4; f.rotation.z = rot;
    rig.add(f);
  });
  // bow planes
  const planeGeo = new THREE.BoxGeometry(3.6, .12, .95);
  const planes = new THREE.Mesh(planeGeo, dark);
  planes.position.set(0, .1, 1.9);
  rig.add(planes);

  /* ---- screw ---- */
  screw = new THREE.Group();
  const hubM = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .45, 10), dark);
  hubM.rotation.x = Math.PI / 2; screw.add(hubM);
  for (let i = 0; i < 5; i++){
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.15, .42), dark);
    blade.position.y = .58;
    blade.rotation.z = .5;
    const arm = new THREE.Group();
    arm.add(blade); arm.rotation.z = (i / 5) * Math.PI * 2;
    screw.add(arm);
  }
  screw.position.z = -8.0;
  rig.add(screw);

  /* ---- portholes + running lights ---- */
  const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xffca70 });
  portGlow = [];
  [-1.6, -.4, .8].forEach(z => {
    [-1, 1].forEach(side => {
      const p = new THREE.Mesh(new THREE.CircleGeometry(.20, 12), glowMat());
      p.position.set(side * 1.46, .35, z);
      p.rotation.y = side * Math.PI / 2;
      rig.add(p); portGlow.push(p);
    });
  });
  const red = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 8),
                             new THREE.MeshBasicMaterial({ color: 0xff5566 }));
  red.position.set(0, 2.78, -.6); rig.add(red);
  portGlow.push(red);

  /* ---- forward lamps ---- */
  const mk = (x) => {
    const l = new THREE.SpotLight(lampColor, 3.4, 150, Math.PI / 4.6, .55, 2.0);
    l.position.set(x, -.3, 3.4);
    // target sits beyond the bow in rig space (+Z); the rig's 180deg flip
    // then aims it along the boat's -Z direction of travel
    l.target.position.set(x * 1.6, -14, 60);
    rig.add(l, l.target);

    const hous = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, .4, 10), dark);
    hous.rotation.x = Math.PI / 2; hous.position.set(x, -.3, 3.5);
    rig.add(hous);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(.27, 12),
                                new THREE.MeshBasicMaterial({ color: 0xfff0cc }));
    lens.position.set(x, -.3, 3.72); rig.add(lens);

    /* Visible beam cone.
       A plain additive cone shell draws as a hard-edged wedge: the shell is
       two constant layers everywhere and goes tangent at the silhouette, so
       the one place it should disappear is the one place it is brightest.
       This shader does the opposite — fades out at grazing angles and dims
       along the cone — which is what reads as light in water rather than a
       triangle stuck to the bow. */
    const bg = new THREE.ConeGeometry(11, 66, 22, 1, true);
    bg.translate(0, -33, 0); bg.rotateX(-Math.PI / 2);   // apex at z=0, mouth at z=66
    const bm = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(lampColor) },
        uOpacity: { value: .06 }
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vView; varying float vT;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = -mv.xyz;
          vT = clamp(position.z / 66.0, 0.0, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity;
        varying vec3 vN; varying vec3 vView; varying float vT;
        void main(){
          float facing = abs(dot(normalize(vN), normalize(vView)));
          float soft   = smoothstep(0.0, 0.62, facing);
          float fade   = pow(1.0 - vT, 1.6);
          float core   = 0.45 + 0.55 * pow(1.0 - vT, 0.4);
          gl_FragColor = vec4(uColor, uOpacity * soft * fade * core);
        }`,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(bg, bm);
    beam.position.set(x, -.3, 3.6);
    beam.rotation.x = .238;             // match the spotlight's downward aim
    beam.userData.keepLit = true;       // visible from inside the sail too
    rig.add(beam);
    return { light: l, beam };
  };
  const L = mk(-1.15), R = mk(1.15);
  lampL = L.light; lampR = R.light; beamL = L.beam; beamR = R.beam;

  return group;
}

return {
  build,
  get object(){ return group; },
  get lamps(){ return [lampL, lampR]; },
  get beams(){ return [beamL, beamR]; },

  /* spin the screw with throttle, pulse the portholes */
  update(dt, throttle, t){
    if (!group) return;
    if (screw) screw.rotation.z += dt * (3 + Math.abs(throttle) * 22);
    const blink = (Math.sin(t * 2.2) + 1) * .5;
    if (portGlow.length){
      const last = portGlow[portGlow.length - 1];
      last.material.color.setRGB(1, .33 * blink, .4 * blink);
    }
  },

  setLampColor(c){
    if (lampL){ lampL.color.copy(c); lampR.color.copy(c); }
    if (beamL){ beamL.material.uniforms.uColor.value.copy(c);
                beamR.material.uniforms.uColor.value.copy(c); }
  },
  setLampIntensity(i){ if (lampL){ lampL.intensity = lampR.intensity = i; } },
  setBeamOpacity(o){
    if (!beamL) return;
    beamL.material.uniforms.uOpacity.value = o;
    beamR.material.uniforms.uOpacity.value = o;
  },
  /* Hide the hull in first person WITHOUT killing the lamps. The
     spotlights are children of this group, and Three's traversal skips
     lights under an invisible parent — so the old group.visible=false
     turned the headlights off entirely. It went unnoticed while the
     ambient light was bright enough to carry the scene on its own. */
  setVisible(v){
    if (!group) return;
    group.visible = true;
    group.traverse(o => {
      if (o === group || o.isLight || o.userData.keepLit) return;
      if (o.isMesh || o.isPoints || o.isLine) o.visible = v;
    });
  }
};

})();
