/* ============================================================
   TRUSTLINE: ABYSS — POST-PROCESSING

   A hand-rolled composite chain. Three's EffectComposer lives in
   examples/jsm, which we do not vendor, so this is the same idea
   in ~200 lines with no extra files to ship:

     scene -> RT      (multisampled when WebGL2 is available)
     bright pass      -> quarter-res
     blur H, blur V   -> quarter-res ping-pong
     composite        -> screen

   The composite does the work that sells deep water: bloom on the
   lamps and beacons, a vignette, chromatic aberration that grows
   toward the edges, a slow refraction wobble, sensor grain, and a
   blue-shifted grade that pushes the shadows abyssal without
   crushing the highlights the lamps depend on.

   Everything here is optional. POST.init() returns false on any
   failure and env3d falls straight back to renderer.render().
   ============================================================ */

const POST = (() => {

let renderer, quad, quadScene, quadCam;
let rtScene, rtA, rtB;
let matBright, matBlur, matComp;
let w = 0, h = 0, ok = false, on = true;
let strength = 1;              // 0..1, scaled down on low quality

const VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* ---- bright pass: keep only what should glow ---- */
const BRIGHT = `
uniform sampler2D tDiffuse;
uniform float uThreshold, uSoft;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold + uSoft, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

/* ---- separable gaussian, 9 taps ---- */
const BLUR = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;           // (1/w, 0) or (0, 1/h)
varying vec2 vUv;
void main(){
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  s += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

/* ---- composite ---- */
const COMP = `
uniform sampler2D tDiffuse, tBloom;
uniform vec2  uRes;
uniform float uTime, uBloom, uVignette, uGrain, uAberr, uWobble;
uniform float uContrast, uLift, uGrade, uFlash;
uniform vec3  uTint;
varying vec2 vUv;

void main(){
  vec2 uv = vUv;

  /* slow refraction wobble — the water between you and the world */
  float wob = sin(uv.y * 17.0 + uTime * 1.15) * 0.00085
            + sin(uv.x * 11.0 - uTime * 0.83) * 0.00065;
  uv += vec2(wob, wob * 0.55) * uWobble;

  /* Chromatic aberration, zero at centre and growing to the edge.
     Scale matters more than it looks: the final offset is d*ca, and |d|
     reaches ~0.7, so uAberr is roughly 140x the edge displacement in UV.
     A believable lens is a few thousandths of a frame — anything larger
     and bright specks split into separate red and blue dots. */
  vec2  d  = uv - 0.5;
  float ca = uAberr * dot(d, d);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + d * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - d * ca).b;

  /* bloom — sampled unwobbled so the glow stays anchored */
  col += texture2D(tBloom, vUv).rgb * uBloom;

  /* depth grade: shadows go blue, highlights keep their warmth */
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = col * mix(uTint, vec3(1.0), smoothstep(0.15, 0.75, l));
  col = mix(col, graded, uGrade);

  col = (col - 0.5) * uContrast + 0.5 + uLift;

  /* hull-impact flash */
  col += vec3(0.55, 0.12, 0.10) * uFlash;

  /* vignette */
  float vig = smoothstep(1.05, 0.30, length(d) * 1.414);
  col *= mix(1.0, vig, uVignette);

  /* sensor grain */
  float g = fract(sin(dot(vUv * uRes + uTime * 71.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

function pass(frag, uniforms){
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: frag,
    depthTest: false, depthWrite: false
  });
}

function makeTarget(width, height, multisample){
  const opts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false
  };
  // MSAA is lost the moment we render to a texture, and this scene is all
  // thin kelp blades and rock silhouettes — exactly what aliases worst.
  // WebGL2 gives it back; WebGL1 eats the jaggies.
  const rt = (multisample && THREE.WebGLMultisampleRenderTarget)
    ? new THREE.WebGLMultisampleRenderTarget(width, height, opts)
    : new THREE.WebGLRenderTarget(width, height, opts);
  if (rt.samples !== undefined && multisample) rt.samples = 4;
  // The scene pass tone-maps and sRGB-encodes into this target, so the
  // composite shader works in display space and writes straight out.
  rt.texture.encoding = THREE.sRGBEncoding;
  return rt;
}

function size(){
  const v = new THREE.Vector2();
  renderer.getDrawingBufferSize(v);
  return v;
}

function resize(){
  const v = size();
  if (v.x === w && v.y === h) return;
  w = Math.max(2, v.x); h = Math.max(2, v.y);
  const bw = Math.max(2, Math.floor(w / 4)), bh = Math.max(2, Math.floor(h / 4));
  rtScene.setSize(w, h);
  rtA.setSize(bw, bh);
  rtB.setSize(bw, bh);
  matComp.uniforms.uRes.value.set(w, h);
}

function init(r){
  try {
    if (typeof THREE === 'undefined') return false;
    renderer = r;
    const multisample = renderer.capabilities.isWebGL2 === true;

    const v = size();
    w = Math.max(2, v.x); h = Math.max(2, v.y);
    const bw = Math.max(2, Math.floor(w / 4)), bh = Math.max(2, Math.floor(h / 4));

    rtScene = makeTarget(w, h, multisample);
    rtA = makeTarget(bw, bh, false);
    rtB = makeTarget(bw, bh, false);
    rtA.depthBuffer = rtB.depthBuffer = false;

    matBright = pass(BRIGHT, {
      tDiffuse:   { value: null },
      uThreshold: { value: 0.80 },
      uSoft:      { value: 0.22 }
    });
    matBlur = pass(BLUR, {
      tDiffuse: { value: null },
      uDir:     { value: new THREE.Vector2() }
    });
    matComp = pass(COMP, {
      tDiffuse:  { value: null },
      tBloom:    { value: null },
      uRes:      { value: new THREE.Vector2(w, h) },
      uTime:     { value: 0 },
      uBloom:    { value: 0.55 },
      uVignette: { value: 0.55 },
      uGrain:    { value: 0.022 },
      uAberr:    { value: 0.012 },
      uWobble:   { value: 1.0 },
      uContrast: { value: 1.10 },
      uLift:     { value: -0.012 },
      uGrade:    { value: 0.85 },
      uFlash:    { value: 0 },
      uTint:     { value: new THREE.Color(0.55, 0.80, 1.18) }
    });

    quadScene = new THREE.Scene();
    quadCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    quad      = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matComp);
    quad.frustumCulled = false;
    quadScene.add(quad);

    ok = true;
    return true;
  } catch (e){
    ok = false;
    return false;
  }
}

function blit(material, target){
  quad.material = material;
  renderer.setRenderTarget(target || null);
  renderer.render(quadScene, quadCam);
}

function render(scene, camera, t){
  if (!ok || !on) return false;
  try {
    resize();

    // 1. scene -> full-res target (tone mapped + sRGB encoded)
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);

    // 2. bright pass -> quarter res
    matBright.uniforms.tDiffuse.value = rtScene.texture;
    blit(matBright, rtA);

    // 3. separable blur, twice for a wider skirt
    const bw = rtA.width, bh = rtA.height;
    for (let i = 0; i < 2; i++){
      matBlur.uniforms.tDiffuse.value = rtA.texture;
      matBlur.uniforms.uDir.value.set(1 / bw, 0);
      blit(matBlur, rtB);
      matBlur.uniforms.tDiffuse.value = rtB.texture;
      matBlur.uniforms.uDir.value.set(0, 1 / bh);
      blit(matBlur, rtA);
    }

    // 4. composite -> screen
    matComp.uniforms.tDiffuse.value = rtScene.texture;
    matComp.uniforms.tBloom.value   = rtA.texture;
    matComp.uniforms.uTime.value    = t;
    blit(matComp, null);
    return true;
  } catch (e){
    ok = false;                       // never let a shader fault kill the demo
    renderer.setRenderTarget(null);
    return false;
  }
}

return {
  init, render,
  available(){ return ok; },
  setEnabled(v){ on = !!v; },
  enabled(){ return ok && on; },
  /* Dial the whole chain back on weak machines rather than switching it off —
     the grade is most of the look, and the grade is nearly free. */
  setStrength(s){
    strength = s;
    if (!ok) return;
    const u = matComp.uniforms;
    u.uBloom.value  = 0.55 * s;
    u.uGrain.value  = 0.022 * s;
    u.uAberr.value  = 0.012 * s;
    u.uWobble.value = 1.0 * s;
  },
  /* red wash when the hull takes a hit; env3d decays it */
  setFlash(v){ if (ok) matComp.uniforms.uFlash.value = v; },
  set(name, v){ if (ok && matComp.uniforms[name]) matComp.uniforms[name].value = v; }
};

})();
