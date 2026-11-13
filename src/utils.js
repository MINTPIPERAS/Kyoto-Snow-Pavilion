import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandom(seed) {
  const r = mulberry32(seed);
  const api = {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
    around: (v = 0, spread = 1) => v + (r() * 2 - 1) * spread,
    gaussian: () => {
      const u = Math.max(1e-6, r());
      const v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    },
  };
  return api;
}

/* ---------------- noise ---------------- */

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hash3(ix, iy, iz, seed) {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 2147483647) ^
    Math.imul(seed, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function makeNoise2D(seed = 1) {
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0, seed);
    const b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed);
    const d = hash2(x0 + 1, y0 + 1, seed);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
  };
  noise.fbm = (x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
  return noise;
}

export function makeNoise3D(seed = 1) {
  return (x, y, z) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);
    const n000 = hash3(x0, y0, z0, seed);
    const n100 = hash3(x0 + 1, y0, z0, seed);
    const n010 = hash3(x0, y0 + 1, z0, seed);
    const n110 = hash3(x0 + 1, y0 + 1, z0, seed);
    const n001 = hash3(x0, y0, z0 + 1, seed);
    const n101 = hash3(x0 + 1, y0, z0 + 1, seed);
    const n011 = hash3(x0, y0 + 1, z0 + 1, seed);
    const n111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);
    const nx00 = lerp(n000, n100, ux);
    const nx10 = lerp(n010, n110, ux);
    const nx01 = lerp(n001, n101, ux);
    const nx11 = lerp(n011, n111, ux);
    return lerp(lerp(nx00, nx10, uy), lerp(nx01, nx11, uy), uz) * 2 - 1;
  };
}

/* ---------------- canvas / textures ---------------- */

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

export function canvasTexture(canvas, { srgb = true, repeat = null, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

export function dataTexture(values, size = 16) {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const v = Math.round(clamp(values[i] ?? 1, 0, 1) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function radialTexture(size = 128, stops = null, { core = 0.1 } = {}) {
  const { canvas, ctx } = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * core, size / 2, size / 2, size / 2);
  const s = stops || [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.65)'],
    [0.7, 'rgba(255,255,255,0.16)'],
    [1, 'rgba(255,255,255,0)'],
  ];
  for (const [p, c] of s) g.addColorStop(p, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

export function softPuffTexture(size = 256, seed = 7) {
  const { canvas, ctx } = createCanvas(size, size);
  const rand = makeRandom(seed);
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 20; i++) {
    const r = size * rand.range(0.12, 0.32);
    const x = size * rand.range(0.3, 0.7);
    const y = size * rand.range(0.32, 0.68);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = rand.range(0.03, 0.09);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // A few thin wisps
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${rand.range(0.015, 0.04)})`;
    ctx.lineWidth = rand.range(2, 8);
    ctx.beginPath();
    const y = size * rand.range(0.3, 0.7);
    ctx.moveTo(size * 0.25, y);
    ctx.bezierCurveTo(size * 0.4, y - 20, size * 0.6, y + 24, size * 0.78, y - 8);
    ctx.stroke();
  }
  return canvasTexture(canvas);
}

export function glowTexture(size = 256, color = [255, 226, 178]) {
  const { canvas, ctx } = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},0.95)`);
  g.addColorStop(0.18, `rgba(${color[0]},${color[1]},${color[2]},0.5)`);
  g.addColorStop(0.5, `rgba(${color[0]},${color[1]},${color[2]},0.14)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(canvas);
}

/* ---------------- geometry ---------------- */

export function pushVertexColor(geometry, color, variation = 0, rand = null) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    tmp.copy(c);
    if (variation > 0) {
      const v = 1 + (rand ? rand.range(-variation, variation) : 0);
      tmp.multiplyScalar(v);
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function colorizeByHeight(geometry, low, high, yMin, yMax) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(low);
  const cHigh = new THREE.Color(high);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = smoothstep(yMin, yMax, pos.getY(i));
    c.copy(cLow).lerp(cHigh, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function displaceGeometry(geometry, fn) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v, i);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function makeCurvePoints(points, divisions = 24) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
  return curve.getPoints(divisions);
}

export function taperedTube(points, radiusStart, radiusEnd, radialSegments = 6) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
  const segments = Math.max(4, Math.round(points.length * 2));
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const r = lerp(radiusStart, radiusEnd, Math.pow(t, 0.8));
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const a = (j / radialSegments) * TAU;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      positions.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
      uvs.push(j / radialSegments, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function ringPoints(radius, count, rand, wobble = 0, y = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const r = radius + (wobble ? (rand() * 2 - 1) * wobble : 0);
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return pts;
}

export function makeRoundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function triangleRandomPoint(rand, a, b, c) {
  let u = rand();
  let v = rand();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  return new THREE.Vector3()
    .copy(a)
    .addScaledVector(new THREE.Vector3().subVectors(b, a), u)
    .addScaledVector(new THREE.Vector3().subVectors(c, a), v);
}

export function textTexture(text, opts = {}) {
  const {
    width = 1024,
    height = 256,
    bg = 'rgba(0,0,0,0)',
    color = '#2b241b',
    font = '64px serif',
    sub = null,
    subFont = '26px serif',
    subColor = 'rgba(43,36,27,.6)',
    letter = 0,
  } = opts;
  const { canvas, ctx } = createCanvas(width, height);
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (letter !== 0) {
    // draw letter-spaced text centered
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width + letter);
    const total = widths.reduce((a, b) => a + b, 0) - letter;
    let x = width / 2 - total / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x + widths[i] / 2 - letter / 2, height * (sub ? 0.4 : 0.5));
      x += widths[i];
    }
  } else {
    ctx.fillText(text, width / 2, height * (sub ? 0.4 : 0.5));
  }
  if (sub) {
    ctx.fillStyle = subColor;
    ctx.font = subFont;
    ctx.fillText(sub, width / 2, height * 0.74);
  }
  return canvasTexture(canvas);
}

export function randomPointOnBoxSurface(rand, w, h, d) {
  const face = rand.int(0, 5);
  const p = new THREE.Vector3();
  if (face === 0 || face === 1) {
    p.set(rand.range(-w / 2, w / 2), face === 0 ? h / 2 : -h / 2, rand.range(-d / 2, d / 2));
  } else if (face === 2 || face === 3) {
    p.set(face === 2 ? w / 2 : -w / 2, rand.range(-h / 2, h / 2), rand.range(-d / 2, d / 2));
  } else {
    p.set(rand.range(-w / 2, w / 2), rand.range(-h / 2, h / 2), face === 4 ? d / 2 : -d / 2);
  }
  return p;
}
