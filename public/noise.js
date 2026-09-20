/* ============================================================
   TRUSTLINE: ABYSS — PROCEDURAL TEXTURE FORGE
   Tileable value-noise fBm, and the diffuse + normal map pairs
   built from it. No image files; everything is generated at
   load into offscreen canvases.
   ============================================================ */

const FORGE = (() => {

/* ---- tileable value noise ---- */
function hash(x, y, P){
  x = ((x % P) + P) % P; y = ((y % P) + P) % P;      // wrap => seamless tiling
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, y, P){
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, P),     b = hash(xi + 1, yi, P);
  const c = hash(xi, yi + 1, P), d = hash(xi + 1, yi + 1, P);
  return a * (1-u) * (1-v) + b * u * (1-v) + c * (1-u) * v + d * u * v;
}
function fbm(x, y, oct, P){
  let sum = 0, amp = .5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++){
    sum += amp * vnoise(x * f, y * f, P * f);
    norm += amp; f *= 2; amp *= .5;
  }
  return sum / norm;
}
/* ridged variant — gives rock its creases */
function ridged(x, y, oct, P){
  let sum = 0, amp = .5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++){
    const n = 1 - Math.abs(vnoise(x * f, y * f, P * f) * 2 - 1);
    sum += amp * n * n; norm += amp; f *= 2; amp *= .5;
  }
  return sum / norm;
}

/* ---- build a height field, then derive diffuse + normal ---- */
function build(size, period, heightFn, colorFn, normalStrength){
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      h[y * size + x] = heightFn(x / size * period, y / size * period);

  // diffuse
  const dc = document.createElement('canvas'); dc.width = dc.height = size;
  const dg = dc.getContext('2d'), dimg = dg.createImageData(size, size);
  // normal
  const nc = document.createElement('canvas'); nc.width = nc.height = size;
  const ng = nc.getContext('2d'), nimg = ng.createImageData(size, size);

  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const i = (y * size + x) * 4, hv = h[y * size + x];

      const [r, g, b] = colorFn(hv, x / size, y / size);
      dimg.data[i] = r; dimg.data[i+1] = g; dimg.data[i+2] = b; dimg.data[i+3] = 255;

      // sobel gradient -> tangent-space normal
      const dx = (at(x+1, y) - at(x-1, y)) * normalStrength;
      const dy = (at(x, y+1) - at(x, y-1)) * normalStrength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      nimg.data[i]   = (nx * .5 + .5) * 255;
      nimg.data[i+1] = (ny * .5 + .5) * 255;
      nimg.data[i+2] = (nz * .5 + .5) * 255;
      nimg.data[i+3] = 255;
    }
  }
  dg.putImageData(dimg, 0, 0);
  ng.putImageData(nimg, 0, 0);

  const mk = c => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(dc), normalMap: mk(nc) };
}

const lerp = (a, b, t) => a + (b - a) * t;

return {
  fbm, ridged, vnoise,

  /* seabed: fine sediment with drifting ripples */
  sediment(size){
    return build(size, 8,
      (x, y) => {
        const ripple = Math.sin(y * 5.2 + fbm(x, y, 3, 8) * 5) * .16;
        return fbm(x * 3, y * 3, 6, 24) * .8 + ripple + fbm(x * 14, y * 14, 3, 112) * .22;
      },
      (h) => {
        const t = Math.min(1, Math.max(0, h));
        return [ lerp(72, 150, t), lerp(84, 158, t), lerp(70, 134, t) ];
      }, 26);
  },

  /* rock: creased, mottled, darker in the crevices */
  rock(size){
    return build(size, 6,
      (x, y) => ridged(x, y, 6, 6) * .75 + fbm(x * 5, y * 5, 4, 30) * .25,
      (h) => {
        const t = Math.min(1, Math.max(0, h));
        const m = .84 + fbm(h * 40, t * 40, 2, 64) * .32;
        return [ lerp(44, 118, t) * m, lerp(56, 130, t) * m, lerp(56, 126, t) * m ];
      }, 34);
  },

  /* kelp: fibrous lengthwise striation */
  kelp(size){
    return build(size, 5,
      (x, y) => fbm(x * 9, y * .9, 4, 45) * .7 + fbm(x * 30, y * 2, 2, 150) * .3,
      (h) => {
        const t = Math.min(1, Math.max(0, h));
        return [ lerp(40, 104, t), lerp(96, 186, t), lerp(74, 140, t) ];
      }, 18);
  }
};

})();
