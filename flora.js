/* ============================================================
   TRUSTLINE: ABYSS — FLORA
   Underwater plants as flat ribbon blades, not tubes.

   The realism here is in the motion: a sine wave TRAVELS up
   each blade in the vertex shader (phase offset by height),
   with the base held planted and amplitude rising as y².
   Rigid rotation from the base is the thing that reads as fake.

   Blades grow in clumps from a shared holdfast, the way real
   kelp and seagrass do, rather than scattered evenly.
   ============================================================ */

const FLORA = (() => {

const UTIME = { value: 0 };          // shared clock for every plant shader

/* ---- a tapered ribbon blade, base at y=0, tip at y=1 ---- */
function bladeGeo(segments, baseW, profile, curve){
  const g = new THREE.PlaneGeometry(1, 1, 1, segments);
  g.translate(0, .5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++){
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * baseW * profile(y));
    pos.setZ(i, pos.getZ(i) + y * y * curve);      // natural arc
  }
  g.computeVertexNormals();
  return g;
}

/* ---- inject the travelling wave into a standard material ---- */
function animate(mat, opts){
  const A = opts.amp, F = opts.freq, W = opts.waves, D = opts.drag;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = UTIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        attribute float aPhase;
        attribute float aStiff;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float bh = clamp(transformed.y, 0.0, 1.0);
        // amplitude grows toward the tip; the holdfast never moves
        float amp = bh * bh * ${A.toFixed(3)} * aStiff;
        // phase shifted BY HEIGHT => the wave travels up the blade
        float w1 = sin(uTime * ${F.toFixed(3)} + aPhase + bh * ${W.toFixed(2)});
        float w2 = sin(uTime * ${(F*0.53).toFixed(3)} + aPhase * 1.7 + bh * ${(W*0.55).toFixed(2)});
        transformed.x += (w1 * 0.72 + w2 * 0.38) * amp;
        transformed.z += cos(uTime * ${(F*0.81).toFixed(3)} + aPhase + bh * ${(W*0.8).toFixed(2)}) * amp * 0.55;
        // blades shorten slightly as they bend, like real drag
        transformed.y -= abs(w1) * amp * ${D.toFixed(3)};
      `);
  };
  mat.customProgramCacheKey = () => 'flora' + A + F + W;
  return mat;
}

/* ---- build an instanced clump-planted plant ---- */
function plant(geo, mat, opts){
  const { clumps, perClump, spread, radius, area, depth,
          minScale, maxScale, stiffMin, stiffMax } = opts;
  const N = clumps * perClump;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const phase = new Float32Array(N), stiff = new Float32Array(N);
  const data = [];
  const d = new THREE.Object3D();

  let i = 0;
  for (let c = 0; c < clumps; c++){
    const cx = (Math.random() - .5) * area;
    const cz = -Math.random() * depth;
    const cPhase = Math.random() * 6.28;
    for (let b = 0; b < perClump; b++){
      const ang = Math.random() * 6.28, rad = Math.sqrt(Math.random()) * radius;
      const o = {
        x: cx + Math.cos(ang) * rad,
        z: cz + Math.sin(ang) * rad,
        cx, cz,
        s: minScale + Math.random() * (maxScale - minScale),
        yaw: Math.random() * 6.28,
        lean: (Math.random() - .5) * spread
      };
      data.push(o);
      phase[i] = cPhase + Math.random() * 1.8;          // clumps move together-ish
      stiff[i] = stiffMin + Math.random() * (stiffMax - stiffMin);
      d.position.set(o.x, -11.5, o.z);
      d.rotation.set(o.lean, o.yaw, o.lean * .6);
      d.scale.setScalar(o.s);                            // uniform: sway scales with size
      d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      i++;
    }
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aStiff', new THREE.InstancedBufferAttribute(stiff, 1));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.data = data;
  mesh.userData.area = area;
  mesh.userData.depth = depth;
  return mesh;
}

return {
  UTIME,

  /* ---- giant kelp: long ribbon blades in dense holdfast clumps ---- */
  kelp(tex){
    const geo = bladeGeo(22, .055,
      y => .38 + .62 * Math.sin(Math.pow(y, .5) * Math.PI * .92),   // widest ~35% up
      .18);
    const mat = animate(new THREE.MeshStandardMaterial({
      color: 0x4a7a55, roughness: .82, metalness: 0,
      side: THREE.DoubleSide, transparent: true, opacity: .94,
      map: tex ? tex.map : null, normalMap: tex ? tex.normalMap : null,
      normalScale: new THREE.Vector2(.6, .6),
      emissive: 0x0c2418, emissiveIntensity: .35        // fakes a little backlit glow
    }), { amp: .40, freq: .85, waves: 4.2, drag: .16 });

    return plant(geo, mat, {
      clumps: 52, perClump: 9, radius: 1.8, spread: .34, area: 116, depth: 200,
      minScale: 4.5, maxScale: 13, stiffMin: .7, stiffMax: 1.3
    });
  },

  /* ---- seagrass: short stiff blades carpeting patches ---- */
  grass(tex){
    const geo = bladeGeo(10, .09,
      y => 1 - y * .82,                                  // tapers straight to a point
      .07);
    const mat = animate(new THREE.MeshStandardMaterial({
      color: 0x3d6b4a, roughness: .92, metalness: 0,
      side: THREE.DoubleSide,
      map: tex ? tex.map : null,
      emissive: 0x08170f, emissiveIntensity: .25
    }), { amp: .26, freq: 1.35, waves: 2.4, drag: .10 });

    return plant(geo, mat, {
      clumps: 46, perClump: 26, radius: 3.2, spread: .5, area: 120, depth: 200,
      minScale: .9, maxScale: 2.6, stiffMin: .5, stiffMax: 1.0
    });
  },

  /* ---- recycle clumps once they fall behind the boat, along its heading ---- */
  advance(mesh, forward, boatPos, recycleZ, depth){
    const dummy = new THREE.Object3D();
    const data = mesh.userData.data;
    const area = mesh.userData.area;
    for (let i = 0; i < data.length; i++){
      const o = data[i];
      const dx = o.cx - boatPos.x, dz = o.cz - boatPos.z;
      const along = dx * forward.x + dz * forward.z;
      if (along < -recycleZ){                       // move the whole clump forward
        const ahead = depth + along;
        const ox = forward.x * ahead + (Math.random() - .5) * area;
        const oz = forward.z * ahead + (Math.random() - .5) * area;
        o.cx += ox; o.cz += oz; o.x += ox; o.z += oz;
      }
      dummy.position.set(o.x, -11.5, o.z);
      dummy.rotation.set(o.lean, o.yaw, o.lean * .6);
      dummy.scale.setScalar(o.s);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
};

})();
