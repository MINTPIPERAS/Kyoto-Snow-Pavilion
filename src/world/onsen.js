import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeRandom,
  makeNoise2D,
  makeNoise3D,
  taperedTube,
  createCanvas,
  canvasTexture,
  glowTexture,
  softPuffTexture,
  TAU,
  clamp,
  smoothstep,
  lerp,
} from '../utils.js';
import { attachEdges, toonMaterial } from '../materials.js';

const CENTER = new THREE.Vector2(6.2, 5.5);
const WATER_Y = 0.62;
const WATER_RADIUS = 2.72;
const IMPACT = new THREE.Vector2(7.2, 4.15);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function nonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

function mergeAll(list) {
  return mergeGeometries(list.map(nonIndexed), false);
}

function ringTexture() {
  const S = 256;
  const { canvas, ctx } = createCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2;
  const cy = S / 2;
  const g = ctx.createRadialGradient(cx, cy, S * 0.3, cx, cy, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}

function dropletTexture() {
  const S = 64;
  const { canvas, ctx } = createCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(226,244,247,0.55)');
  g.addColorStop(0.75, 'rgba(200,230,235,0.12)');
  g.addColorStop(1, 'rgba(190,224,230,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}

/* ------------------------------------------------------------------ */
/*  Water                                                              */
/* ------------------------------------------------------------------ */

function buildWater(M) {
  const shapeNoise = makeNoise2D(1701);
  const segments = 104;
  const positions = [0, WATER_Y, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    const wobble =
      Math.sin(a * 3 + 0.8) * 0.13 +
      Math.sin(a * 7 + 2.1) * 0.06 +
      shapeNoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2) * 0.13;
    const r = WATER_RADIUS + wobble;
    positions.push(Math.cos(a) * r, WATER_Y, Math.sin(a) * r);
    uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < segments; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % segments);
    indices.push(0, b, a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.translate(CENTER.x, 0, CENTER.y);
  geo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x2d5453) },
    uShallow: { value: new THREE.Color(0x7a9d92) },
    uSky: { value: new THREE.Color(0xc4d4d6) },
    uWarm: { value: new THREE.Color(0xffbd74) },
    uFoam: { value: new THREE.Color(0xe9f2f1) },
    uCenter: { value: new THREE.Vector2(CENTER.x, CENTER.y) },
    uImpact: { value: new THREE.Vector2(IMPACT.x, IMPACT.y) },
    uLightDir: { value: new THREE.Vector3(-0.5, 0.7, 0.5).normalize() },
    uNight: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
    vertexShader: `
      varying vec3 vWorld;
      varying vec2 vUv;
      #include <common>
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uWarm;
      uniform vec3 uFoam;
      uniform vec2 uCenter;
      uniform vec2 uImpact;
      uniform vec3 uLightDir;
      uniform float uNight;
      varying vec3 vWorld;
      varying vec2 vUv;
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        float t = uTime;
        vec2 p = vWorld.xz;
        vec2 rel = p - uCenter;
        float r = length(rel);
        vec3 V = normalize(cameraPosition - vWorld);

        float d = length(p - uImpact);
        float ripple = sin(d * 12.5 - t * 5.2) * exp(-d * 1.25);
        float broad = sin(p.x * 1.35 + t * 0.55 + sin(p.y * 0.9)) * 0.5
                    + sin(p.y * 1.8 - t * 0.4 + cos(p.x * 1.2)) * 0.45;
        float fine = vnoise(p * 3.0 + vec2(t * 0.11, -t * 0.07)) - 0.5;

        vec2 grad = vec2(
          cos(p.x * 1.35 + t * 0.55) * 0.5 + cos(d * 12.5 - t * 5.2) * exp(-d * 1.25) * 0.8,
          cos(p.y * 1.8 - t * 0.4) * 0.5 + sin(d * 12.5 - t * 5.2) * exp(-d * 1.25) * 0.8
        ) * 0.055;
        grad += vec2(
          vnoise(p * 3.4 + vec2(t * 0.08, 0.0)) - 0.5,
          vnoise(p * 3.4 + vec2(0.0, -t * 0.06)) - 0.5
        ) * 0.06;
        vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
        float depthMix = smoothstep(2.6, 0.2, r);
        vec3 col = mix(uShallow, uDeep, depthMix);
        col = mix(col, uSky, fres * 0.46);

        // warm lantern / window reflection on the side facing the pavilion
        vec2 r1 = rel - vec2(-1.25, -1.1);
        vec2 r2 = rel - vec2(-0.55, -2.0);
        vec2 r3 = rel - vec2(0.4, -2.1);
        float warm1 = exp(-pow(r1.x / 1.9, 2.0) - pow(r1.y / 0.62, 2.0));
        float warm2 = exp(-pow(r2.x / 0.9, 2.0) - pow(r2.y / 0.4, 2.0));
        float warm3 = exp(-pow(r3.x / 0.55, 2.0) - pow(r3.y / 0.32, 2.0));
        float shimmer = 0.7 + 0.3 * sin(p.x * 5.0 + p.y * 3.7 + t * 1.2);
        float warm = clamp((warm1 * 1.0 + warm2 * 0.85 + warm3 * 0.55) * shimmer, 0.0, 1.0);
        col = mix(col, uWarm, warm * 0.8);
        col *= 0.86 + 0.14 * N.y;

        // fine ribbon highlights
        float ribbon = smoothstep(0.72, 0.92, vnoise(p * vec2(7.0, 2.2) + vec2(t * 0.2, 0.0)));
        col += uWarm * ribbon * 0.08;

        vec3 H = normalize(normalize(uLightDir) + V);
        float spec = pow(max(dot(N, H), 0.0), 70.0);
        col += vec3(1.0, 0.86, 0.62) * smoothstep(0.4, 0.9, spec) * 0.42;

        float sparkle = step(0.996, hash21(floor(p * 28.0) + floor(t * 1.5) * 2.3));
        col += vec3(1.0, 0.94, 0.82) * sparkle * 0.22;

        // mineral rim and impact foam
        float rim = smoothstep(2.48, 2.74, r);
        float rimNoise = vnoise(p * 4.5 + t * 0.1);
        col = mix(col, uFoam, rim * (0.1 + rimNoise * 0.22));
        float impactFoam = exp(-d * 2.6) * (0.45 + 0.3 * sin(t * 8.0 + d * 8.0));
        col = mix(col, uFoam, clamp(impactFoam, 0.0, 0.8));

        // darken deep middle a touch at night
        col *= mix(1.0, 0.86, uNight * depthMix);

        float alpha = mix(0.84, 0.94, smoothstep(0.0, 2.7, r));
        alpha = mix(alpha, 0.98, rim * 0.25);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.userData.interaction = 'onsen';
  return { mesh, uniforms };
}

/* ------------------------------------------------------------------ */
/*  Rocks                                                              */
/* ------------------------------------------------------------------ */

function makeRockGeometry(rand, seed, detail, colorA, colorB, wetness) {
  const noise = makeNoise3D(seed);
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const sx = rand.range(0.75, 1.3);
  const sy = rand.range(0.5, 0.85);
  const sz = rand.range(0.8, 1.35);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      noise(v.x * 1.5 + 4, v.y * 1.5, v.z * 1.5) * 0.23 +
      noise(v.x * 3.6, v.y * 3.6 + 2, v.z * 3.6) * 0.08;
    v.multiplyScalar(1 + n);
    v.x *= sx;
    v.y *= sy;
    v.z *= sz;
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.35;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = smoothstep(-0.25, 0.55, y);
    c.copy(cA).lerp(cB, t);
    const n = noise(pos.getX(i) * 2.1 + 9, pos.getY(i) * 2.1, pos.getZ(i) * 2.1);
    c.multiplyScalar(1 + n * 0.045);
    // damp band just above the waterline
    if (wetness > 0 && y < 0.08 && y > -0.3) {
      c.lerp(new THREE.Color(0x333b3a), 0.28);
    }
    colors[i * 3] = clamp(c.r, 0, 1);
    colors[i * 3 + 1] = clamp(c.g, 0, 1);
    colors[i * 3 + 2] = clamp(c.b, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ------------------------------------------------------------------ */
/*  Main build                                                         */
/* ------------------------------------------------------------------ */

export function buildOnsen(M, tex, world) {
  const group = new THREE.Group();
  group.name = 'onsen';
  const rand = makeRandom(9917);
  const steamSprites = [];
  const andonLights = [];
  const { mesh: water, uniforms: waterUniforms } = buildWater(M);
  group.add(water);

  /* --- basin --- */
  const basinMat = new THREE.MeshStandardMaterial({
    color: 0x2e3534,
    roughness: 0.38,
    metalness: 0.03,
    side: THREE.BackSide,
  });
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(WATER_RADIUS + 0.3, 1.9, 1.0, 48, 1, true),
    basinMat
  );
  basin.position.set(CENTER.x, WATER_Y - 0.5, CENTER.y);
  basin.receiveShadow = true;
  group.add(basin);
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(WATER_RADIUS + 0.15, 40),
    new THREE.MeshStandardMaterial({ color: 0x272d2c, roughness: 0.5 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set(CENTER.x, 0.12, CENTER.y);
  group.add(bottom);

  // submerged stones near the inner rim
  const submerged = [];
  for (let i = 0; i < 8; i++) {
    const a = rand.range(0, TAU);
    const r = rand.range(2.1, 2.5);
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(rand.range(0.25, 0.55), rand.range(0.18, 0.32), rand.range(0.3, 0.55));
    g.rotateY(rand.range(0, TAU));
    g.translate(CENTER.x + Math.cos(a) * r, rand.range(0.28, 0.48), CENTER.y + Math.sin(a) * r);
    submerged.push(g);
  }
  const subMesh = new THREE.Mesh(mergeAll(submerged), M.stoneWetDark);
  subMesh.receiveShadow = true;
  group.add(subMesh);

  /* --- rock ring --- */
  const wetGeos = [];
  const dryGeos = [];
  const snowGeos = [];
  const rockRand = makeRandom(4422);
  const rockCount = 17;
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * TAU + rockRand.range(-0.1, 0.1);
    const isEntry = i === 3 || i === 4;
    const r = 3.0 + rockRand.range(-0.12, 0.28);
    const size = rockRand.range(0.42, 0.8) * (i % 3 === 0 ? 1.12 : 1);
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.y + Math.sin(a) * r;
    const cluster = rockRand.int(1, isEntry ? 2 : 2);
    for (let k = 0; k < cluster; k++) {
      const rr = size * (k === 0 ? 1 : rockRand.range(0.38, 0.62));
      const wet = k === 0 && rockRand.chance(0.7);
      const geo = makeRockGeometry(
        rockRand,
        rockRand.int(1, 99999),
        rr > 0.7 ? 2 : 1,
        wet ? 0x46504a : 0x5c615f,
        wet ? 0x737d74 : 0x868985,
        wet ? 1 : 0
      );
      const s = rr;
      geo.scale(s, s * rockRand.range(0.72, 1.0), s);
      const ox = Math.cos(a) * rockRand.range(-0.35, 0.35) + Math.cos(a + Math.PI / 2) * rockRand.range(-0.3, 0.3);
      const oz = Math.sin(a) * rockRand.range(-0.35, 0.35) + Math.sin(a + Math.PI / 2) * rockRand.range(-0.3, 0.3);
      const y = WATER_Y - 0.12 + rr * rockRand.range(0.25, 0.55);
      geo.rotateY(rockRand.range(0, TAU));
      geo.translate(x + ox, y, z + oz);
      if (wet) wetGeos.push(geo);
      else dryGeos.push(geo);

      // a thinner crown of snow on the outer shoulder of dry stones
      if (!wet && rockRand.chance(0.5)) {
        const cap = new THREE.IcosahedronGeometry(1, 2);
        const capPos = cap.attributes.position;
        const capNoise = makeNoise3D(331 + i);
        for (let j = 0; j < capPos.count; j++) {
          const v = new THREE.Vector3().fromBufferAttribute(capPos, j);
          v.multiplyScalar(1 + capNoise(v.x * 2.0, v.y * 2.0, v.z * 2.0) * 0.09);
          if (v.y < 0) v.y *= 0.3;
          capPos.setXYZ(j, v.x, v.y, v.z);
        }
        cap.computeVertexNormals();
        const ca = rockRand.range(0, TAU);
        const outX = Math.cos(a);
        const outZ = Math.sin(a);
        cap.scale(
          rr * rockRand.range(0.48, 0.68),
          rr * rockRand.range(0.055, 0.095),
          rr * rockRand.range(0.44, 0.62)
        );
        cap.rotateY(ca);
        cap.translate(
          x + ox + outX * rr * rockRand.range(0.22, 0.4),
          y + rr * rockRand.range(0.28, 0.38),
          z + oz + outZ * rr * rockRand.range(0.22, 0.4)
        );
        snowGeos.push(cap);
      }
    }
  }

  // a few big anchor boulders
  for (const [ix, iz, sz] of [
    [3.0, 2.65, 1.05],
    [8.9, 3.55, 1.1],
    [9.2, 7.9, 0.9],
    [3.1, 8.1, 0.95],
  ]) {
    const geo = makeRockGeometry(rockRand, rockRand.int(1, 99999), 2, 0x444a48, 0x707874, 1);
    geo.scale(sz, sz * 0.68, sz * 0.92);
    geo.rotateY(rockRand.range(0, TAU));
    geo.translate(ix, WATER_Y - 0.05, iz);
    wetGeos.push(geo);
    const cap = new THREE.IcosahedronGeometry(1, 2);
    cap.scale(sz * 0.62, sz * 0.075, sz * 0.45);
    cap.rotateY(rockRand.range(0, TAU));
    cap.translate(ix + (ix > CENTER.x ? 0.18 : -0.18), WATER_Y + sz * 0.34, iz + (iz > CENTER.y ? 0.14 : -0.14));
    snowGeos.push(cap);
  }

  const wetMesh = new THREE.Mesh(mergeAll(wetGeos), M.stoneWet);
  wetMesh.castShadow = true;
  wetMesh.receiveShadow = true;
  group.add(wetMesh);
  const dryMesh = new THREE.Mesh(mergeAll(dryGeos), M.stone);
  dryMesh.castShadow = true;
  dryMesh.receiveShadow = true;
  group.add(dryMesh);
  const rockSnow = new THREE.Mesh(mergeAll(snowGeos), M.snowSoft);
  rockSnow.castShadow = true;
  rockSnow.receiveShadow = true;
  group.add(rockSnow);

  // a few slim overhanging snow edges between the stones and the garden
  const bankGeos = [];
  for (let i = 0; i < 10; i++) {
    const a = rockRand.range(0, TAU);
    const r = rockRand.range(3.55, 4.15);
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.y + Math.sin(a) * r;
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.scale(rockRand.range(0.42, 0.72), rockRand.range(0.04, 0.09), rockRand.range(0.26, 0.44));
    g.rotateY(rockRand.range(0, TAU));
    g.translate(x, world.terrainHeight(x, z) + rockRand.range(0.01, 0.05), z);
    bankGeos.push(g);
  }

  /* --- small dry grass and pebbles --- */
  const pebbleGeos = [];
  for (let i = 0; i < 18; i++) {
    const a = rockRand.range(0, TAU);
    const r = rockRand.range(3.0, 4.1);
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(rockRand.range(0.05, 0.14), rockRand.range(0.03, 0.08), rockRand.range(0.06, 0.16));
    g.rotateY(rockRand.range(0, TAU));
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.y + Math.sin(a) * r;
    g.translate(x, world.terrainHeight(x, z) + 0.03, z);
    const color = new Float32Array(g.attributes.position.count * 3).fill(0.4);
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    pebbleGeos.push(g);
  }
  const pebbles = new THREE.Mesh(mergeAll(pebbleGeos), M.stoneWet);
  group.add(pebbles);

  /* --- bamboo spout --- */
  const spoutGroup = new THREE.Group();
  const spoutX = 8.55;
  const spoutZ = 3.55;
  const woodPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 7), M.woodDark);
  woodPost.position.set(spoutX + 0.52, 0.9, spoutZ + 0.25);
  woodPost.rotation.z = 0.1;
  woodPost.castShadow = true;
  spoutGroup.add(woodPost);
  const bambooGeos = [];
  // upright pipe
  const upright = new THREE.CylinderGeometry(0.075, 0.09, 2.05, 8);
  upright.translate(spoutX, 1.42, spoutZ);
  bambooGeos.push(upright);
  // horizontal arm
  const arm = new THREE.CylinderGeometry(0.065, 0.07, 1.15, 8);
  arm.rotateZ(Math.PI / 2);
  arm.rotateY(0.18);
  arm.translate(spoutX - 0.55, 2.32, spoutZ + 0.06);
  bambooGeos.push(arm);
  // tilted pour lip
  const lip = new THREE.CylinderGeometry(0.048, 0.062, 0.46, 8);
  lip.rotateZ(0.85);
  lip.translate(spoutX - 1.08, 2.12, spoutZ + 0.1);
  bambooGeos.push(lip);
  const bambooMesh = new THREE.Mesh(mergeGeometries(bambooGeos, false), M.bamboo);
  bambooMesh.castShadow = true;
  spoutGroup.add(bambooMesh);
  // bamboo nodes
  const nodeGeos = [];
  for (const [x, y, z, ry] of [
    [spoutX, 0.5, spoutZ, 0],
    [spoutX, 1.18, spoutZ, 0],
    [spoutX, 1.78, spoutZ, 0],
    [spoutX - 0.55, 2.32, spoutZ + 0.06, Math.PI / 2],
    [spoutX - 0.9, 2.2, spoutZ + 0.1, Math.PI / 2],
  ]) {
    const ring = new THREE.TorusGeometry(0.075, 0.01, 4, 10);
    ring.rotateX(Math.PI / 2);
    ring.rotateZ(ry);
    ring.translate(x, y, z);
    nodeGeos.push(ring);
  }
  const nodes = new THREE.Mesh(mergeGeometries(nodeGeos, false), M.bambooDark);
  spoutGroup.add(nodes);
  // rope lashing
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 12), M.towel);
  rope.rotation.x = Math.PI / 2;
  rope.position.set(spoutX + 0.44, 1.5, spoutZ + 0.2);
  spoutGroup.add(rope);
  group.add(spoutGroup);

  // water stream
  const streamStart = new THREE.Vector3(7.62, 1.94, 3.66);
  const streamEnd = new THREE.Vector3(IMPACT.x, WATER_Y + 0.02, IMPACT.y);
  const streamCurve = new THREE.CatmullRomCurve3(
    [
      streamStart,
      new THREE.Vector3(
        lerp(streamStart.x, streamEnd.x, 0.5) + 0.03,
        lerp(streamStart.y, streamEnd.y, 0.5) + 0.02,
        lerp(streamStart.z, streamEnd.z, 0.5)
      ),
      streamEnd,
    ],
    false,
    'catmullrom',
    0.3
  );
  const streamPts = streamCurve.getPoints(34);
  const streamGeo = taperedTube(streamPts, 0.055, 0.034, 7);
  const streamMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xd8eef0) },
      uOpacity: { value: 0.7 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      float hash(float x) { return fract(sin(x * 91.17) * 43758.5453); }
      void main() {
        float t = uTime;
        float stripes = 0.55 + 0.45 * sin(vUv.y * 65.0 - t * 14.0 + sin(vUv.x * 12.0) * 2.0);
        float streak = 0.6 + 0.4 * sin(vUv.y * 28.0 - t * 8.0 + hash(floor(vUv.x * 6.0)) * 6.28);
        float alpha = uOpacity * (0.42 + 0.35 * stripes * streak);
        alpha *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
        vec3 col = uColor * (0.7 + 0.3 * stripes);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const stream = new THREE.Mesh(streamGeo, streamMat);
  stream.renderOrder = 2;
  group.add(stream);
  const streamCoreMat = new THREE.MeshBasicMaterial({
    color: 0xf4ffff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const streamCore = new THREE.Mesh(taperedTube(streamPts, 0.024, 0.01, 5), streamCoreMat);
  streamCore.renderOrder = 2;
  group.add(streamCore);

  // impact foam / splash
  const foamMat = new THREE.SpriteMaterial({
    map: softPuffTexture(256, 29),
    color: 0xeaf7f5,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    toneMapped: false,
  });
  const foam = new THREE.Sprite(foamMat);
  foam.renderOrder = 3;
  foam.position.set(IMPACT.x, WATER_Y + 0.06, IMPACT.y);
  foam.scale.set(0.9, 0.45, 1);
  group.add(foam);

  const dropletTex = dropletTexture();
  const splashCount = 34;
  const splashGeo = new THREE.BufferGeometry();
  const splashPositions = new Float32Array(splashCount * 3);
  const splashAlphas = new Float32Array(splashCount);
  const splashSizes = new Float32Array(splashCount);
  const splashState = [];
  for (let i = 0; i < splashCount; i++) {
    splashState.push({
      x: IMPACT.x + rand.range(-0.14, 0.14),
      y: WATER_Y + rand.range(0, 0.2),
      z: IMPACT.y + rand.range(-0.14, 0.14),
      vx: rand.range(-0.18, 0.18),
      vy: rand.range(0.3, 0.9),
      vz: rand.range(-0.18, 0.18),
      age: rand.range(0, 0.7),
      life: rand.range(0.35, 0.75),
    });
  }
  splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
  splashGeo.setAttribute('aAlpha', new THREE.BufferAttribute(splashAlphas, 1));
  splashGeo.setAttribute('aSize', new THREE.BufferAttribute(splashSizes, 1));
  const splashMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dropletTex },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      uniform float uPixelRatio;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (240.0 / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(t.rgb, t.a * vAlpha);
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const splash = new THREE.Points(splashGeo, splashMat);
  splash.renderOrder = 3;
  group.add(splash);

  /* --- ripple rings --- */
  const ringTex = ringTexture();
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: ringTex,
      color: 0xd8eeee,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_Y + 0.012;
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    rings.push({ mesh, age: 0, life: 1.6, active: false, maxScale: 1.6 });
  }
  let rippleTimer = 0;

  function spawnRipple(x, z, strength = 1) {
    const rec = rings.find((r) => !r.active) || rings[0];
    rec.active = true;
    rec.age = 0;
    rec.life = 1.35 + strength * 0.35;
    rec.maxScale = 0.7 + strength * 1.5;
    rec.mesh.position.set(x, WATER_Y + 0.014, z);
    rec.mesh.scale.setScalar(0.25);
    rec.mesh.material.opacity = 0.7;
    rec.mesh.visible = true;
  }

  /* --- steam --- */
  const steamGroup = new THREE.Group();
  const steamRand = makeRandom(322);
  for (let i = 0; i < 27; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex.steam,
      color: 0xfff2e0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    const a = steamRand.range(0, TAU);
    const r = Math.sqrt(steamRand.next()) * 2.25;
    const x = CENTER.x + Math.cos(a) * r;
    const z = CENTER.y + Math.sin(a) * r;
    const scale = steamRand.range(1.15, 2.65);
    sprite.position.set(x, WATER_Y + 0.3, z);
    sprite.scale.set(scale, scale * 1.35, 1);
    sprite.userData.steam = {
      phase: steamRand.range(0, 1),
      speed: steamRand.range(0.035, 0.075),
      baseY: WATER_Y + steamRand.range(0.15, 0.55),
      baseScale: scale,
      x,
      z,
      drift: steamRand.range(0.15, 0.5),
      sway: steamRand.range(0, TAU),
      strength: steamRand.range(0.45, 1.0),
    };
    sprite.renderOrder = 4;
    steamGroup.add(sprite);
    steamSprites.push(sprite);
  }
  group.add(steamGroup);

  /* --- warm reflections on the water --- */
  const reflectionTex = glowTexture(256, [255, 208, 152]);
  const reflections = [];
  const reflectionDefs = [
    [4.55, 4.0, 0.95, 2.9, 0.5, 0.2],
    [5.35, 3.8, 0.72, 2.2, 0.38, 1.8],
    [3.65, 4.75, 0.6, 1.9, 0.28, 3.2],
    [7.0, 3.8, 0.5, 1.7, 0.24, 4.1],
    [8.2, 6.35, 0.62, 1.9, 0.2, 5.0],
  ];
  for (const [x, z, sx, sz, op, phase] of reflectionDefs) {
    const mat = new THREE.MeshBasicMaterial({
      map: reflectionTex,
      color: 0xffc37e,
      transparent: true,
      opacity: op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, WATER_Y + 0.008, z);
    mesh.scale.set(sx, sz, 1);
    mesh.renderOrder = 2;
    group.add(mesh);
    reflections.push({ mesh, mat, base: op, phase });
  }
  // cool specular echo of the round window at night
  const coolReflMat = new THREE.MeshBasicMaterial({
    map: reflectionTex,
    color: 0xaec8ee,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const coolReflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coolReflMat);
  coolReflection.rotation.x = -Math.PI / 2;
  coolReflection.position.set(8.25, WATER_Y + 0.007, 5.4);
  coolReflection.scale.set(0.42, 1.45, 1);
  coolReflection.renderOrder = 2;
  group.add(coolReflection);

  /* --- stepping stones --- */
  const pathPts = [];
  for (let i = 0; i < 4; i++) {
    const t = 0.12 + i * 0.26;
    pathPts.push(world.pathCurve.getPoint(t));
  }
  const stoneGeos = [];
  const stoneSnowGeos = [];
  for (let i = 0; i < pathPts.length; i++) {
    const p = pathPts[i];
    const x = p.x + rand.range(-0.16, 0.16);
    const z = p.z + rand.range(-0.18, 0.18) + (i === pathPts.length - 1 ? 0.45 : 0);
    const baseY = world.terrainHeight(x, z);
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(rand.range(0.6, 0.86), rand.range(0.12, 0.18), rand.range(0.44, 0.66));
    g.rotateY(rand.range(0, TAU));
    g.translate(x, baseY + rand.range(0.24, 0.32), z);
    const stepColors = new Float32Array(g.attributes.position.count * 3);
    for (let j = 0; j < stepColors.length / 3; j++) {
      const shade = rand.range(0.42, 0.62);
      stepColors[j * 3] = shade * 0.94;
      stepColors[j * 3 + 1] = shade;
      stepColors[j * 3 + 2] = shade * 0.96;
    }
    g.setAttribute('color', new THREE.BufferAttribute(stepColors, 3));
    stoneGeos.push(g);
    const cap = new THREE.IcosahedronGeometry(1, 2);
    cap.scale(rand.range(0.1, 0.17), rand.range(0.02, 0.035), rand.range(0.08, 0.13));
    cap.rotateY(rand.range(0, TAU));
    cap.translate(
      x + rand.range(0.18, 0.32),
      baseY + rand.range(0.34, 0.4),
      z + rand.range(0.12, 0.26)
    );
    stoneSnowGeos.push(cap);
  }
  const stepStones = new THREE.Mesh(mergeAll(stoneGeos), M.stoneWet);
  stepStones.castShadow = true;
  stepStones.receiveShadow = true;
  group.add(stepStones);
  const stepSnow = new THREE.Mesh(mergeAll(stoneSnowGeos), M.snowSoft);
  stepSnow.castShadow = true;
  group.add(stepSnow);

  /* --- flat poolside stones --- */
  const flatStonePositions = [
    [8.4, 8.6, 0.66],
    [4.35, 8.75, 0.62],
    [3.15, 3.75, 0.7],
  ];
  const flatStones = [];
  for (const [x, z, s] of flatStonePositions) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.scale(s, s * 0.11, s * 0.55);
    g.rotateY(rand.range(0, TAU));
    g.translate(x, world.terrainHeight(x, z) + 0.15, z);
    const color = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      color[i * 3] = 0.44;
      color[i * 3 + 1] = 0.47;
      color[i * 3 + 2] = 0.46;
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    flatStones.push(g);
  }
  const flatMesh = new THREE.Mesh(mergeAll(flatStones), M.stoneWet);
  flatMesh.castShadow = true;
  flatMesh.receiveShadow = true;
  group.add(flatMesh);

  /* --- bamboo bucket and towels --- */
  const bucketGroup = new THREE.Group();
  bucketGroup.position.set(8.4, world.terrainHeight(8.4, 8.6) + 0.25, 8.6);
  const bucketGeos = [];
  const bucketBody = new THREE.CylinderGeometry(0.26, 0.22, 0.34, 14, 1, true);
  bucketBody.translate(0, 0.17, 0);
  bucketGeos.push(bucketBody);
  const bucketBottom = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14);
  bucketBottom.translate(0, 0.02, 0);
  bucketGeos.push(bucketBottom);
  const bucket = new THREE.Mesh(mergeGeometries(bucketGeos, false), M.woodPale);
  bucket.castShadow = true;
  bucket.receiveShadow = true;
  bucketGroup.add(bucket);
  for (const y of [0.07, 0.28]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(y === 0.07 ? 0.235 : 0.255, 0.012, 5, 20), M.iron);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    bucketGroup.add(hoop);
  }
  const waterInside = new THREE.Mesh(
    new THREE.CircleGeometry(0.23, 18),
    new THREE.MeshStandardMaterial({ color: 0x314d4c, roughness: 0.18, metalness: 0.05 })
  );
  waterInside.rotation.x = -Math.PI / 2;
  waterInside.position.y = 0.29;
  bucketGroup.add(waterInside);
  const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.42, 5, 8), M.towel);
  towel.position.set(0.17, 0.24, 0.1);
  towel.rotation.set(-0.9, 0.3, 0.15);
  bucketGroup.add(towel);
  const towelStripe = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.07), M.indigoWaves);
  towelStripe.position.set(0.17, 0.2, 0.113);
  towelStripe.rotation.copy(towel.rotation);
  bucketGroup.add(towelStripe);
  // ladle
  const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), M.bambooDark);
  ladle.rotation.z = 0.55;
  ladle.rotation.y = 0.4;
  ladle.position.set(-0.2, 0.32, 0.1);
  bucketGroup.add(ladle);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.06, 10), M.bambooDark);
  cup.position.set(-0.38, 0.44, 0.15);
  bucketGroup.add(cup);
  group.add(bucketGroup);

  // folded towels on the stone
  const folded = new THREE.Group();
  folded.position.set(8.9, world.terrainHeight(8.9, 8.2) + 0.23, 8.2);
  for (let i = 0; i < 2; i++) {
    const towelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.045, 0.32),
      i === 0 ? M.towel : M.cloth
    );
    towelMesh.position.y = 0.03 + i * 0.047;
    towelMesh.rotation.y = 0.1 + i * 0.05;
    towelMesh.castShadow = true;
    folded.add(towelMesh);
  }
  group.add(folded);

  /* --- tea tray on the front-left stone --- */
  const trayGroup = new THREE.Group();
  trayGroup.position.set(4.35, world.terrainHeight(4.35, 8.75) + 0.29, 8.75);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.045, 0.56), M.woodDeep);
  tray.castShadow = true;
  trayGroup.add(tray);
  const clothUnder = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.64), M.indigoHemp);
  clothUnder.rotation.x = -Math.PI / 2;
  clothUnder.position.y = 0.025;
  trayGroup.add(clothUnder);
  const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 9), M.ceramic);
  teapot.scale.y = 0.72;
  teapot.position.set(-0.18, 0.12, 0.02);
  teapot.castShadow = true;
  trayGroup.add(teapot);
  const teapotLid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.025, 10), M.ceramic);
  teapotLid.position.set(-0.18, 0.205, 0.02);
  trayGroup.add(teapotLid);
  const teapotHandle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 4, 10, Math.PI), M.bambooDark);
  teapotHandle.position.set(-0.18, 0.2, 0.02);
  trayGroup.add(teapotHandle);
  for (const [x, z] of [
    [0.15, -0.12],
    [0.25, 0.12],
  ]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.033, 0.06, 10, 1, true), M.ceramic);
    c.position.set(x, 0.07, z);
    trayGroup.add(c);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 12), M.woodPale);
    saucer.position.set(x, 0.03, z);
    trayGroup.add(saucer);
  }
  // dango skewers on a little plate
  const dangoPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.018, 14), M.woodPale);
  dangoPlate.position.set(-0.02, 0.1, 0.02);
  trayGroup.add(dangoPlate);
  const dangoMats = [M.dango, M.dangoPink, M.dangoGreen];
  for (let i = 0; i < 3; i++) {
    const skewer = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.3, 4), M.bambooDark);
    skewer.rotation.z = Math.PI / 2;
    skewer.rotation.y = -0.3 + i * 0.18;
    skewer.position.set(-0.04, 0.13 + i * 0.012, 0.0);
    trayGroup.add(skewer);
    for (let k = 0; k < 3; k++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), dangoMats[(i + k) % 3]);
      ball.position.set(-0.14 + k * 0.09, 0.14 + i * 0.012, -0.01 + i * 0.03);
      ball.castShadow = true;
      trayGroup.add(ball);
    }
  }
  group.add(trayGroup);

  /* --- andon lamps --- */
  function buildAndon(x, z, rot, withLight) {
    const g = new THREE.Group();
    const y = world.terrainHeight(x, z);
    g.position.set(x, y + 0.02, z);
    g.rotation.y = rot;
    const woods = [];
    addBoxLocal(woods, 0.52, 0.05, 0.52, 0, 0.03, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBoxLocal(woods, 0.045, 0.72, 0.045, sx * 0.22, 0.4, sz * 0.22);
      }
    }
    addBoxLocal(woods, 0.54, 0.04, 0.54, 0, 0.78, 0);
    const frame = new THREE.Mesh(mergeAll(woods), M.woodDark);
    frame.castShadow = true;
    attachEdges(frame, { threshold: 25, opacity: 0.22 });
    g.add(frame);
    const papers = [];
    for (const [px, pz, ry] of [
      [0, 0.235, 0],
      [0, -0.235, 0],
      [0.235, 0, Math.PI / 2],
      [-0.235, 0, Math.PI / 2],
    ]) {
      const plane = new THREE.PlaneGeometry(0.4, 0.58);
      plane.rotateY(ry);
      plane.translate(px, 0.42, pz);
      papers.push(plane);
    }
    const paper = new THREE.Mesh(mergeGeometries(papers, false), M.andonPaper);
    paper.castShadow = false;
    g.add(paper);
    // little gabled roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.2, 4), M.woodDeep);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.9;
    roof.scale.z = 0.82;
    roof.castShadow = true;
    g.add(roof);
    const snowCap = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), M.snowSoft);
    snowCap.scale.set(0.36, 0.07, 0.3);
    snowCap.position.y = 0.99;
    snowCap.rotation.y = rot;
    g.add(snowCap);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(256, [255, 195, 120]),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
    );
    glow.position.y = 0.45;
    glow.scale.setScalar(1.5);
    glow.renderOrder = 5;
    g.add(glow);
    if (withLight) {
      const light = new THREE.PointLight(0xffa862, 7, 5.5, 2);
      light.position.set(0, 0.5, 0);
      g.add(light);
      andonLights.push(light);
    }
    group.add(g);
    return g;
  }

  function addBoxLocal(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    geo.translate(x, y, z);
    list.push(geo);
  }

  buildAndon(0.0, 3.65, -0.35, true);
  buildAndon(9.4, 4.1, 0.7, false);

  /* --- lights --- */
  const poolLight = new THREE.PointLight(0xffa768, 9, 8, 2);
  poolLight.position.set(CENTER.x - 1.6, 1.9, CENTER.y - 0.7);
  group.add(poolLight);

  /* --- update --- */
  const rippleRand = makeRandom(888);
  function update(dt, elapsed) {
    waterUniforms.uTime.value = elapsed;
    streamMat.uniforms.uTime.value = elapsed;
    foamMat.opacity = 0.58 + Math.sin(elapsed * 7.0) * 0.12;
    for (const r of reflections) {
      r.mat.opacity = r.base * (0.82 + 0.18 * Math.sin(elapsed * 1.3 + r.phase));
    }

    rippleTimer += dt;
    if (rippleTimer > 1.55) {
      rippleTimer = 0;
      spawnRipple(IMPACT.x + rand.range(-0.18, 0.18), IMPACT.y + rand.range(-0.18, 0.18), 0.8);
    }
    for (const r of rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const scale = lerp(0.3, r.maxScale, t);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = 0.72 * (1 - t) * (0.6 + 0.4 * Math.sin(t * 12));
    }

    // splash droplets
    const positions = splashGeo.attributes.position.array;
    const alphas = splashGeo.attributes.aAlpha.array;
    const sizes = splashGeo.attributes.aSize.array;
    for (let i = 0; i < splashCount; i++) {
      const s = splashState[i];
      s.age += dt;
      if (s.age > s.life) {
        s.age = 0;
        s.life = rand.range(0.35, 0.75);
        s.x = IMPACT.x + rand.range(-0.14, 0.14);
        s.y = WATER_Y + 0.05;
        s.z = IMPACT.y + rand.range(-0.14, 0.14);
        s.vx = rand.range(-0.2, 0.2);
        s.vy = rand.range(0.45, 1.0);
        s.vz = rand.range(-0.2, 0.2);
      }
      s.vy -= 2.8 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const p = s.age / s.life;
      positions[i * 3] = s.x;
      positions[i * 3 + 1] = s.y;
      positions[i * 3 + 2] = s.z;
      alphas[i] = Math.max(0, (1 - p) * 0.9);
      sizes[i] = (0.018 + 0.025 * (1 - p));
    }
    splashGeo.attributes.position.needsUpdate = true;
    splashGeo.attributes.aAlpha.needsUpdate = true;
    splashGeo.attributes.aSize.needsUpdate = true;

    // steam
    for (const sprite of steamSprites) {
      const s = sprite.userData.steam;
      const p = (elapsed * s.speed + s.phase) % 1;
      sprite.position.y = s.baseY + p * 2.0;
      sprite.position.x = s.x + Math.sin(elapsed * 0.35 + s.sway + p * 2.4) * s.drift * (0.4 + p);
      sprite.position.z = s.z + Math.cos(elapsed * 0.28 + s.sway) * s.drift * 0.5;
      const fade = Math.sin(p * Math.PI);
      sprite.material.opacity = 0.72 * fade * s.strength;
      const scale = s.baseScale * (0.75 + p * 1.4);
      sprite.scale.set(scale, scale * 1.35, 1);
    }
  }

  const api = {
    group,
    water,
    waterUniforms,
    poolLight,
    andonLights,
    steamSprites,
    streamMat,
    reflections,
    coolReflMat,
    spawnRipple,
    update,
    center: CENTER.clone(),
    waterY: WATER_Y,
    radius: WATER_RADIUS,
  };

  return api;
}
