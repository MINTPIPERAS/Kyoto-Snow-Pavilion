import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeNoise2D, makeRandom, smoothstep, clamp, TAU } from '../utils.js';
import { attachEdges, softShadowMaterial } from '../materials.js';

const BASE_SIZE = 24;
const SNOW_EXTENT = 11.2;

export function buildBase(M, tex) {
  const group = new THREE.Group();
  group.name = 'base';

  /* ---------------- wooden plinth ---------------- */

  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(BASE_SIZE, 1.02, BASE_SIZE, 3, 0.075),
    M.woodBase
  );
  plinth.position.y = -0.51;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // recessed dark foot, creating a quiet shadow gap under the plinth
  const foot = new THREE.Mesh(
    new RoundedBoxGeometry(BASE_SIZE - 0.62, 0.2, BASE_SIZE - 0.62, 2, 0.05),
    M.woodDeep
  );
  foot.position.y = -1.1;
  foot.castShadow = true;
  foot.receiveShadow = true;
  group.add(foot);

  // thin inlaid line around the sides
  const grooveMat = M.woodDeep;
  const grooveY = -0.3;
  const grooveH = 0.028;
  const half = BASE_SIZE / 2 + 0.002;
  const grooveGeos = [];
  const longBar = new THREE.BoxGeometry(BASE_SIZE + 0.004, grooveH, 0.03);
  const sideBar = new THREE.BoxGeometry(0.03, grooveH, BASE_SIZE + 0.004);
  for (const [geo, x, z] of [
    [longBar, 0, half],
    [longBar, 0, -half],
    [sideBar, half, 0],
    [sideBar, -half, 0],
  ]) {
    const g = geo.clone();
    g.translate(x, grooveY, z);
    grooveGeos.push(g.index ? g.toNonIndexed() : g);
  }
  const groove = new THREE.Mesh(mergeGeometries(grooveGeos), grooveMat);
  groove.castShadow = false;
  group.add(groove);

  // edge lines on the plinth
  attachEdges(plinth, { threshold: 32, opacity: 0.16, color: 0x2f261d });

  // brass nameplate on the front face
  const plaqueGroup = new THREE.Group();
  const plaqueW = 4.5;
  const plaqueH = 0.62;
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(plaqueW, plaqueH, 0.035),
    M.brass
  );
  plaque.castShadow = true;
  plaqueGroup.add(plaque);
  const plaqueFace = new THREE.Mesh(
    new THREE.PlaneGeometry(plaqueW - 0.05, plaqueH - 0.05),
    new THREE.MeshStandardMaterial({
      map: tex.nameplate,
      roughness: 0.45,
      metalness: 0.35,
    })
  );
  plaqueFace.position.z = 0.019;
  plaqueGroup.add(plaqueFace);
  // tiny screws
  const screwGeo = new THREE.SphereGeometry(0.022, 8, 6);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const screw = new THREE.Mesh(screwGeo, M.brassSoft);
      screw.position.set(sx * (plaqueW / 2 - 0.09), sy * (plaqueH / 2 - 0.09), 0.022);
      screw.scale.z = 0.4;
      plaqueGroup.add(screw);
    }
  }
  plaqueGroup.position.set(0, -0.53, BASE_SIZE / 2 + 0.008);
  group.add(plaqueGroup);

  /* ---------------- terrain height field ---------------- */

  const noiseA = makeNoise2D(1301);
  const noiseB = makeNoise2D(2207);
  const noiseC = makeNoise2D(3301);

  const poolCenter = new THREE.Vector2(6.2, 5.5);
  const houseCenter = new THREE.Vector2(-2.3, -3.2);

  function edgeMask(x, z) {
    // wavy rounded-square boundary
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const m = Math.max(ax, az);
    const wobble = noiseB(x * 0.42, z * 0.42) * 0.23 + noiseC(x * 1.2, z * 1.2) * 0.05;
    return smoothstep(SNOW_EXTENT, SNOW_EXTENT - 0.9, m + wobble);
  }

  function terrainHeight(x, z) {
    const em = edgeMask(x, z);
    let h = 0.27;
    h += noiseA.fbm(x * 0.29 + 3.1, z * 0.29 - 1.7, 4) * 0.07;
    h += noiseB(x * 0.85, z * 0.85) * 0.026;
    h += noiseB(x * 2.2, z * 2.2) * 0.011;
    h += noiseC(x * 4.6, z * 4.6) * 0.0035;

    // wind drifts along the back and left edge
    h += Math.max(0, noiseA(x * 0.16 - 4, z * 0.2 + 8)) * 0.1;
    const driftBack = Math.exp(-Math.pow((z + 9.6) / 2.1, 2)) * 0.12;
    h += driftBack * smoothstep(4, 9, Math.abs(x));

    // bank around the spring
    const pr = Math.hypot(x - poolCenter.x, z - poolCenter.y);
    h += smoothstep(2.9, 3.8, pr) * (1 - smoothstep(3.8, 4.8, pr)) * 0.3;
    h += (1 - smoothstep(2.8, 3.9, pr)) * -0.045;

    // courtyard path is slightly trodden
    const path = pathDistance(x, z);
    h -= smoothstep(0.42, 0.1, path) * 0.032;

    // gentler area under the pavilion
    const hd = Math.hypot(x - houseCenter.x, z - houseCenter.y);
    h = THREE.MathUtils.lerp(h, 0.29, 1 - smoothstep(3.8, 7.2, hd));

    // edge slump, tucked under the lip
    h = THREE.MathUtils.lerp(0.035, h, em);
    return h;
  }

  // stepping-stone path curve (also used by onsen module)
  const pathCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.5, 0, 2.3),
      new THREE.Vector3(1.25, 0, 2.8),
      new THREE.Vector3(2.05, 0, 3.2),
      new THREE.Vector3(2.8, 0, 3.55),
      new THREE.Vector3(3.35, 0, 3.85),
    ],
    false,
    'catmullrom',
    0.2
  );

  function pathDistance(x, z) {
    let best = 99;
    let bestY = 0;
    for (let i = 0; i <= 30; i++) {
      const p = pathCurve.getPoint(i / 30);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < best) {
        best = d;
        bestY = p.y;
      }
    }
    return best;
  }

  /* ---------------- snow field ---------------- */

  const RES = 190;
  const snowGeo = new THREE.PlaneGeometry(SNOW_EXTENT * 2, SNOW_EXTENT * 2, RES, RES);
  snowGeo.rotateX(-Math.PI / 2);
  const pos = snowGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const randColor = makeRandom(77);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // soft blue in hollows, a breath of warm on crests
    const hollow = clamp((0.34 - h) / 0.12, 0, 1);
    const crest = clamp((h - 0.36) / 0.14, 0, 1);
    const n = noiseC(x * 0.8, z * 0.8) * 0.012;
    c.setRGB(
      (0.972 - hollow * 0.035 + crest * 0.012 + n) * (1 + randColor.range(-0.008, 0.008)),
      (0.982 - hollow * 0.026 + crest * 0.008 + n) * (1 + randColor.range(-0.008, 0.008)),
      (0.998 - hollow * 0.012 + crest * 0.004 + n) * (1 + randColor.range(-0.006, 0.006))
    );
    colors[i * 3] = clamp(c.r, 0, 1);
    colors[i * 3 + 1] = clamp(c.g, 0, 1);
    colors[i * 3 + 2] = clamp(c.b, 0, 1);
  }
  pos.needsUpdate = true;
  snowGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  snowGeo.computeVertexNormals();

  const snow = new THREE.Mesh(snowGeo, M.snowTerrain);
  snow.receiveShadow = true;
  snow.castShadow = false;
  snow.name = 'snowField';
  group.add(snow);

  /* ---------------- soft snow lip around the rim ---------------- */

  const lipRand = makeRandom(419);
  const lipGeos = [];
  const lipGeoBase = new THREE.IcosahedronGeometry(1, 2);
  for (let side = 0; side < 4; side++) {
    let along = -SNOW_EXTENT + 0.3;
    while (along < SNOW_EXTENT - 0.3) {
      const pieceLen = lipRand.range(1.7, 3.4);
      along += pieceLen * 0.55;
      const offset = SNOW_EXTENT - lipRand.range(0.06, 0.55);
      let x;
      let z;
      let yaw;
      if (side === 0) {
        x = along;
        z = offset;
        yaw = 0;
      } else if (side === 1) {
        x = along;
        z = -offset;
        yaw = 0;
      } else if (side === 2) {
        x = offset;
        z = along;
        yaw = Math.PI / 2;
      } else {
        x = -offset;
        z = along;
        yaw = Math.PI / 2;
      }
      // skip some corner pieces so they do not stack into balls
      if (Math.abs(x) > SNOW_EXTENT - 1.0 && Math.abs(z) > SNOW_EXTENT - 1.0 && lipRand.chance(0.55)) {
        along += 0.5;
        continue;
      }
      const g = lipGeoBase.clone();
      const sx = pieceLen * lipRand.range(0.5, 0.75);
      const sy = lipRand.range(0.07, 0.16);
      const sz = lipRand.range(0.28, 0.55);
      g.scale(sx, sy, sz);
      g.rotateY(yaw + lipRand.range(-0.18, 0.18));
      g.translate(
        x + lipRand.range(-0.2, 0.2),
        terrainHeight(x, z) + lipRand.range(-0.1, -0.015),
        z + lipRand.range(-0.2, 0.2)
      );
      lipGeos.push(g);
      along += pieceLen * 0.3;
    }
  }
  // four soft corner mounds
  for (const sxCorner of [-1, 1]) {
    for (const szCorner of [-1, 1]) {
      const cx = sxCorner * (SNOW_EXTENT - lipRand.range(0.3, 0.75));
      const cz = szCorner * (SNOW_EXTENT - lipRand.range(0.3, 0.75));
      const g = lipGeoBase.clone();
      g.scale(lipRand.range(0.9, 1.4), lipRand.range(0.08, 0.16), lipRand.range(0.8, 1.2));
      g.rotateY(lipRand.range(0, TAU));
      g.translate(cx, terrainHeight(cx, cz) - 0.055, cz);
      lipGeos.push(g);
    }
  }
  const lip = new THREE.Mesh(mergeGeometries(lipGeos), M.snowSoft);
  lip.castShadow = true;
  lip.receiveShadow = true;
  group.add(lip);

  // low broad drifts tucked against the boundary and back corner
  const driftRand = makeRandom(551);
  const driftGeos = [];
  const driftSpots = [
    [-9.9, 9.7, 1.5],
    [9.6, -9.2, 1.3],
    [-10.3, -8.9, 1.2],
    [-10.1, 1.9, 0.8],
  ];
  for (const [x, z, s] of driftSpots) {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const dx = x + driftRand.range(-s * 0.9, s * 0.9);
      const dz = z + driftRand.range(-s * 0.8, s * 0.8);
      const sc = driftRand.range(0.4, 0.75) * s;
      g.scale(sc * 1.5, driftRand.range(0.055, 0.12) * s, sc);
      g.rotateY(driftRand.range(0, TAU));
      g.translate(dx, terrainHeight(dx, dz) - 0.055, dz);
      driftGeos.push(g);
    }
  }
  const drifts = new THREE.Mesh(mergeGeometries(driftGeos), M.snowSoft);
  drifts.castShadow = true;
  drifts.receiveShadow = true;
  group.add(drifts);

  /* ---------------- dry grass tufts ---------------- */

  const grassRand = makeRandom(881);
  const bladeGeos = [];
  const blade = new THREE.CylinderGeometry(0.004, 0.012, 0.36, 3, 1, false);
  blade.translate(0, 0.18, 0);
  const tuftSpots = [];
  for (let i = 0; i < 14; i++) {
    const a = grassRand.range(0, TAU);
    const r = grassRand.range(4.25, 5.5);
    tuftSpots.push([poolCenter.x + Math.cos(a) * r, poolCenter.y + Math.sin(a) * r]);
  }
  tuftSpots.push(
    [-9.4, 7.2],
    [8.9, -7.9],
    [-7.9, 8.7],
    [9.9, 1.2],
    [-10.1, -2.2]
  );
  for (const [x, z] of tuftSpots) {
    if (Math.abs(x) > SNOW_EXTENT - 0.6 || Math.abs(z) > SNOW_EXTENT - 0.6) continue;
    const n = grassRand.int(3, 6);
    for (let i = 0; i < n; i++) {
      const g = blade.clone();
      const a = grassRand.range(0, TAU);
      const tilt = grassRand.range(0.12, 0.5);
      g.scale(1, grassRand.range(0.55, 1.25), 1);
      g.rotateZ(Math.cos(a) * tilt);
      g.rotateX(Math.sin(a) * tilt);
      g.rotateY(grassRand.range(0, TAU));
      g.translate(
        x + grassRand.range(-0.14, 0.14),
        terrainHeight(x, z) - 0.03,
        z + grassRand.range(-0.14, 0.14)
      );
      bladeGeos.push(g.index ? g.toNonIndexed() : g);
    }
  }
  if (bladeGeos.length) {
    const tufts = new THREE.Mesh(mergeGeometries(bladeGeos), M.grass);
    tufts.castShadow = true;
    group.add(tufts);
  }

  /* ---------------- small border stones ---------------- */

  const stoneRand = makeRandom(902);
  const stoneGeos = [];
  const snowCapGeos = [];
  const borderStoneSpots = [
    [-9.5, -10.0, 0.55],
    [10.1, -8.2, 0.42],
    [-10.2, 5.9, 0.4],
    [8.9, 10.1, 0.5],
  ];
  for (const [sx, sz, sc] of borderStoneSpots) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const r = 1 + noiseC(v.x * 2.4 + sx, v.z * 2.4 + sz) * 0.2 + stoneRand.range(-0.07, 0.07);
      v.multiplyScalar(r);
      v.y *= 0.62;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.scale(sc * 1.3, sc, sc);
    g.translate(sx, terrainHeight(sx, sz) + sc * 0.18, sz);
    const cnt = g.attributes.position.count;
    const col = new Float32Array(cnt * 3);
    const baseCol = new THREE.Color(0x6b6e6e);
    for (let i = 0; i < cnt; i++) {
      col[i * 3] = baseCol.r;
      col[i * 3 + 1] = baseCol.g;
      col[i * 3 + 2] = baseCol.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    stoneGeos.push(g);

    const cap = new THREE.IcosahedronGeometry(1, 1);
    cap.scale(sc * 1.35, sc * 0.28, sc * 1.05);
    cap.translate(sx, terrainHeight(sx, sz) + sc * 0.58, sz);
    snowCapGeos.push(cap);
  }
  const borderStones = new THREE.Mesh(mergeGeometries(stoneGeos), M.stone);
  borderStones.castShadow = true;
  borderStones.receiveShadow = true;
  group.add(borderStones);
  const caps = new THREE.Mesh(mergeGeometries(snowCapGeos), M.snowSoft);
  caps.castShadow = true;
  group.add(caps);

  /* ---------------- grounding shadow ---------------- */

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), softShadowMaterial(0.34, 0x1d212a));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.215;
  shadow.renderOrder = -2;
  group.add(shadow);

  return {
    group,
    snow,
    plinth,
    terrainHeight,
    pathCurve,
    poolCenter,
    houseCenter,
    snowExtent: SNOW_EXTENT,
    baseSize: BASE_SIZE,
  };
}
