import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeRandom,
  makeNoise3D,
  taperedTube,
  TAU,
  clamp,
} from '../utils.js';
import { toonMaterial } from '../materials.js';

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

const TALL_TREES = [
  { x: -9.9, z: -8.55, h: 10.2, seed: 1101 },
  { x: -5.6, z: -10.15, h: 11.0, seed: 1102 },
  { x: 0.4, z: -10.35, h: 10.0, seed: 1103 },
  { x: -2.4, z: -9.9, h: 10.6, seed: 1104 },
  { x: 10.8, z: -7.6, h: 9.8, seed: 1105 },
  { x: -10.5, z: -3.7, h: 10.6, seed: 1106 },
  { x: -10.4, z: 2.4, h: 9.6, seed: 1107 },
  { x: 10.8, z: -4.2, h: 11.4, seed: 1108 },
  { x: 11.3, z: -10.5, h: 9.2, seed: 1109 },
  { x: -9.3, z: 8.0, h: 9.7, seed: 1110 },
  { x: 3.1, z: -10.8, h: 10.9, seed: 1111 },
];

const PINES = [
  { x: -7.8, z: 8.9, h: 2.05, seed: 2201 },
  { x: 10.95, z: 9.9, h: 1.8, seed: 2202 },
  { x: -9.7, z: 2.1, h: 1.7, seed: 2203 },
  { x: 10.9, z: 1.15, h: 1.75, seed: 2204 },
];

/* ------------------------------------------------------------------ */
/*  Shared snow geometry                                               */
/* ------------------------------------------------------------------ */

function nonIndexed(geo) {
  return geo.index ? geo.toNonIndexed() : geo;
}

function mergeAll(list) {
  return mergeGeometries(list.map(nonIndexed), false);
}

function createClumpGeometry(segments = 8, rings = 6) {
  const geo = new THREE.SphereGeometry(1, segments, rings);
  const noise = makeNoise3D(58);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise(v.x * 1.7 + 2, v.y * 1.7, v.z * 1.7);
    v.multiplyScalar(1 + n * 0.13);
    if (v.y < 0) v.y *= 0.44;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const SNOW_CLUMP = createClumpGeometry(8, 5);
const SNOW_CLUMP_SMALL = createClumpGeometry(6, 4);

function tagGeometryColor(geo, shade, rand, vertical = false) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const s = shade + (rand ? rand.range(-0.017, 0.012) : 0);
  for (let i = 0; i < count; i++) {
    if (vertical) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.smoothstep(y, -0.85, 0.7);
      colors[i * 3] = clamp(s * (0.58 + 0.415 * t), 0, 1);
      colors[i * 3 + 1] = clamp(s * (0.68 + 0.31 * t), 0, 1);
      colors[i * 3 + 2] = clamp(s * (0.88 + 0.115 * t), 0, 1);
    } else {
      colors[i * 3] = clamp(s * 0.984, 0, 1);
      colors[i * 3 + 1] = clamp(s * 0.993, 0, 1);
      colors[i * 3 + 2] = clamp(s, 0, 1);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function addSnowClump(geos, position, quaternion, size, rand, shade = 0.97) {
  const geo = SNOW_CLUMP.clone();
  tagGeometryColor(geo, shade, rand, true);
  const m = new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
    .multiply(
      new THREE.Matrix4().makeScale(size.x * 0.5, size.y * 0.5, size.z * 0.5)
    );
  geo.applyMatrix4(m);
  geos.push(geo);
}

function addSnowSmall(geos, position, quaternion, size, rand, shade = 0.975) {
  const geo = SNOW_CLUMP_SMALL.clone();
  tagGeometryColor(geo, shade, rand, true);
  const m = new THREE.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
    .multiply(
      new THREE.Matrix4().makeScale(size.x * 0.5, size.y * 0.5, size.z * 0.5)
    );
  geo.applyMatrix4(m);
  geos.push(geo);
}

function addSnowWire(geos, points, radius, rand) {
  if (points.length < 2) return;
  const geo = taperedTube(points, radius, 0.004, 3);
  tagGeometryColor(geo, 0.99, rand);
  geos.push(geo);
}

/* ------------------------------------------------------------------ */
/*  Tall snow-laden tree                                               */
/* ------------------------------------------------------------------ */

function buildTallTree(spec, M, snowMat, terrainHeight) {
  const rand = makeRandom(spec.seed);
  const H = spec.h;
  const scale = H / 11.5;
  const barkGeos = [];
  const snowGeos = [];

  /* --- trunk --- */
  const leanX = rand.range(-0.65, 0.65);
  const leanZ = rand.range(-0.55, 0.55);
  const phase = rand.range(0, TAU);
  const trunkRadius = (0.43 + rand.range(-0.035, 0.07)) * scale;
  const trunkPoints = [];
  const TRUNK_SEGS = 8;
  for (let i = 0; i <= TRUNK_SEGS; i++) {
    const t = i / TRUNK_SEGS;
    trunkPoints.push(
      new THREE.Vector3(
        leanX * t * t + Math.sin(t * 2.6 + phase) * 0.12 * t,
        t * H,
        leanZ * t * t + Math.cos(t * 2.0 + phase * 1.7) * 0.1 * t
      )
    );
  }
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints, false, 'catmullrom', 0.25);
  barkGeos.push(taperedTube(trunkPoints, trunkRadius, 0.055 * scale, 9));

  const flare = new THREE.CylinderGeometry(
    trunkRadius * 0.95,
    trunkRadius * 1.95,
    0.62 * scale,
    9,
    1,
    false
  );
  flare.translate(trunkPoints[0].x, 0.25 * scale, trunkPoints[0].z);
  barkGeos.push(flare);

  const getTrunkPoint = (t) => trunkCurve.getPointAt(clamp(t, 0, 1));

  /* --- branch growth --- */
  function grow(start, dir, length, radius, depth, parentAngle) {
    const horizontal = new THREE.Vector3(dir.x, 0, dir.z);
    if (horizontal.lengthSq() < 1e-5) horizontal.set(1, 0, 0);
    horizontal.normalize();
    const side = new THREE.Vector3(-horizontal.z, 0, horizontal.x);

    const isMain = depth === 0;
    const bowBase = isMain ? rand.range(0.14, 0.26) : rand.range(0.04, 0.13);
    const droopBase = isMain
      ? rand.range(0.1, 0.2)
      : depth === 1
        ? rand.range(0.2, 0.34)
        : rand.range(0.3, 0.5);
    const lateral = isMain ? rand.range(-0.18, 0.18) : rand.range(-0.25, 0.25);

    const p0 = start.clone();
    const p1 = start
      .clone()
      .addScaledVector(horizontal, length * 0.34)
      .addScaledVector(UP, length * bowBase)
      .addScaledVector(side, lateral * length * 0.35);
    const p2 = start
      .clone()
      .addScaledVector(horizontal, length * 0.7)
      .addScaledVector(UP, length * bowBase * 0.55)
      .addScaledVector(side, lateral * length * 0.8);
    const p3 = start
      .clone()
      .addScaledVector(horizontal, length)
      .addScaledVector(UP, -length * droopBase)
      .addScaledVector(side, lateral * length);

    const pts = [p0, p1, p2, p3];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    const radial = isMain ? 7 : depth === 1 ? 5 : 4;
    barkGeos.push(taperedTube(pts, radius, Math.max(0.007, radius * 0.16), radial));

    const segLen = curve.getLength();

    /* --- snow resting on the branch --- */
    if (depth <= 2) {
      let count;
      if (depth === 0) count = clamp(Math.round(segLen / 0.62) + 1, 4, 7);
      else if (depth === 1) count = clamp(Math.round(segLen / 0.6), 2, 3);
      else count = rand.chance(0.55) ? 1 : 0;
      const thickBase = (depth === 0 ? 0.3 : depth === 1 ? 0.17 : 0.1) * scale;
      const widthBase = (depth === 0 ? 0.52 : depth === 1 ? 0.31 : 0.185) * scale;
      for (let i = 0; i < count; i++) {
        const t = clamp((i + 0.35) / count + rand.range(-0.04, 0.04), 0.05, 0.97);
        const p = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const tangentFlat = tangent.clone().setY(tangent.y * 0.45).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(X_AXIS, tangentFlat);
        const roll = new THREE.Quaternion().setFromAxisAngle(
          tangentFlat,
          rand.range(-0.12, 0.12)
        );
        quat.premultiply(roll);
        const thickness = thickBase * rand.range(0.82, 1.22) * (1 - t * 0.18);
        const width = widthBase * rand.range(0.8, 1.2);
        const len = (segLen / count) * rand.range(1.45, 1.95);
        const center = p
          .clone()
          .addScaledVector(UP, radius * 0.5 + thickness * 0.3)
          .addScaledVector(UP, rand.range(-0.015, 0.015));
        addSnowClump(
          snowGeos,
          center,
          quat,
          { x: len, y: thickness, z: width },
          rand,
          0.965
        );
        // uneven snow lip, especially on big limbs
        if (depth <= 1 && rand.chance(0.42)) {
          const bumpSide = rand.chance(0.5) ? 1 : -1;
          addSnowClump(
            snowGeos,
            center
              .clone()
              .addScaledVector(side, bumpSide * width * rand.range(0.25, 0.42))
              .addScaledVector(UP, -thickness * 0.24),
            quat,
            { x: len * rand.range(0.5, 0.8), y: thickness * 0.72, z: width * 0.5 },
            rand,
            0.958
          );
        }
      }

      // drooping snow at the end of finer branches
      if (depth >= 1) {
        const tip = curve.getPointAt(1);
        const tangent = curve.getTangentAt(1).normalize();
        const qTip = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(tangent.z * 0.3, 0, -tangent.x * 0.3)
        );
        addSnowSmall(
          snowGeos,
          tip.clone().addScaledVector(UP, -0.015),
          qTip,
          { x: 0.16 * scale, y: 0.44 * scale, z: 0.15 * scale },
          rand,
          0.972
        );
        if (rand.chance(0.55)) {
          addSnowSmall(
            snowGeos,
            tip.clone().add(
              new THREE.Vector3(
                rand.range(-0.06, 0.06) * scale,
                -0.3 * scale,
                rand.range(-0.06, 0.06) * scale
              )
            ),
            qTip,
            { x: 0.1 * scale, y: 0.38 * scale, z: 0.1 * scale },
            rand,
            0.965
          );
        }
      }
    }

    /* --- children --- */
    if (depth === 0) {
      const n = rand.int(2, 3);
      for (let i = 0; i < n; i++) {
        const t = 0.3 + (i / n) * 0.6 + rand.range(-0.05, 0.05);
        const p = curve.getPointAt(clamp(t, 0.15, 0.95));
        const angle = parentAngle + rand.range(0.38, 0.82) * (i % 2 === 0 ? 1 : -1);
        const childDir = new THREE.Vector3(
          Math.cos(angle),
          -rand.range(0.02, 0.16),
          Math.sin(angle)
        );
        const childLen = length * rand.range(0.4, 0.54);
        grow(p, childDir, childLen, radius * rand.range(0.4, 0.52), 1, angle);
      }
    } else if (depth === 1) {
      const n = rand.int(1, 2);
      for (let i = 0; i < n; i++) {
        const t = 0.36 + (i / n) * 0.55 + rand.range(-0.05, 0.05);
        const p = curve.getPointAt(clamp(t, 0.2, 0.96));
        const angle = parentAngle + rand.range(0.5, 1.05) * (i % 2 === 0 ? 1 : -1);
        const childDir = new THREE.Vector3(
          Math.cos(angle),
          -rand.range(0.12, 0.38),
          Math.sin(angle)
        );
        const childLen = length * rand.range(0.34, 0.5);
        grow(p, childDir, childLen, radius * rand.range(0.42, 0.56), 2, angle);
      }
    } else if (depth === 2) {
      // thin drooping twigs: dark line plus a white thread of snow
      const n = 1;
      for (let i = 0; i < n; i++) {
        const t = rand.range(0.45, 0.95);
        const p = curve.getPointAt(t);
        const twigAngle = parentAngle + rand.range(-0.9, 0.9);
        const twigDir = new THREE.Vector3(
          Math.cos(twigAngle),
          -rand.range(0.3, 0.7),
          Math.sin(twigAngle)
        ).normalize();
        const twigLen = length * rand.range(0.3, 0.55);
        const end = p.clone().addScaledVector(twigDir, twigLen);
        const mid = p
          .clone()
          .lerp(end, 0.55)
          .addScaledVector(UP, rand.range(-0.015, 0.02));
        barkGeos.push(taperedTube([p, mid, end], 0.013 * scale, 0.005, 3));
        // snow coating on the upper half of the drooping twig
        if (rand.chance(0.85)) {
          const wireStart = p.clone().lerp(end, 0.2).addScaledVector(UP, 0.02);
          const wireMid = p.clone().lerp(end, 0.65).addScaledVector(UP, 0.025);
          addSnowWire(
            snowGeos,
            [wireStart, wireMid, end.clone().addScaledVector(UP, 0.01)],
            rand.range(0.022, 0.038) * scale,
            rand
          );
        }
        addSnowSmall(
          snowGeos,
          end.clone().addScaledVector(UP, -0.05 * scale),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rand.range(-0.2, 0.2), rand.range(0, TAU), rand.range(-0.2, 0.2))
          ),
          { x: 0.13 * scale, y: rand.range(0.3, 0.46) * scale, z: 0.12 * scale },
          rand,
          0.968
        );
      }
    }
  }

  /* --- main scaffold limbs, fanned wide --- */
  const mainCount = 6;
  const baseAngle = rand.range(0, TAU);
  for (let i = 0; i < mainCount; i++) {
    const t = 0.34 + (i / (mainCount - 1)) * 0.58 + rand.range(-0.035, 0.035);
    const start = getTrunkPoint(clamp(t, 0.3, 0.95));
    const angle = baseAngle + i * GOLDEN * 1.45 + rand.range(-0.28, 0.28);
    const dir = new THREE.Vector3(Math.cos(angle), rand.range(0.02, 0.14), Math.sin(angle));
    const length = (4.05 - i * 0.19 + rand.range(-0.4, 0.5)) * scale;
    const radius = (0.215 - i * 0.008 + rand.range(-0.012, 0.018)) * scale;
    grow(start, dir, Math.max(2.2, length), Math.max(0.075, radius), 0, angle);
  }

  /* --- crown leaders --- */
  const crownBase = getTrunkPoint(rand.range(0.83, 0.96));
  for (let i = 0; i < 3; i++) {
    const angle = baseAngle + i * 2.1 + rand.range(-0.4, 0.4);
    const dir = new THREE.Vector3(
      Math.cos(angle) * rand.range(0.45, 0.8),
      rand.range(0.55, 0.95),
      Math.sin(angle) * rand.range(0.45, 0.8)
    ).normalize();
    grow(
      crownBase.clone().add(new THREE.Vector3(0, i * 0.08, 0)),
      dir,
      rand.range(1.5, 2.6) * scale,
      0.08 * scale,
      1,
      angle
    );
  }

  /* --- two lower, mostly bare twigs for an irregular silhouette --- */
  for (let i = 0; i < 2; i++) {
    const start = getTrunkPoint(rand.range(0.18, 0.32));
    const angle = rand.range(0, TAU);
    grow(
      start,
      new THREE.Vector3(Math.cos(angle), rand.range(-0.25, 0.05), Math.sin(angle)),
      rand.range(1.2, 1.9) * scale,
      0.05 * scale,
      2,
      angle
    );
  }

  /* --- snow gathering at the root --- */
  for (let i = 0; i < 5; i++) {
    const a = rand.range(0, TAU);
    const r = rand.range(0.15, 0.6) * scale;
    addSnowClump(
      snowGeos,
      new THREE.Vector3(Math.cos(a) * r, 0.04, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand.range(0, TAU), 0)),
      {
        x: rand.range(0.7, 1.4) * scale,
        y: rand.range(0.12, 0.22) * scale,
        z: rand.range(0.6, 1.2) * scale,
      },
      rand,
      0.97
    );
  }

  const bark = mergeAll(barkGeos);
  const snow = mergeAll(snowGeos);
  const barkMesh = new THREE.Mesh(bark, rand.chance(0.45) ? M.barkDark : M.bark);
  barkMesh.castShadow = true;
  barkMesh.receiveShadow = true;
  const snowMesh = new THREE.Mesh(snow, snowMat);
  snowMesh.castShadow = true;
  snowMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(barkMesh, snowMesh);
  group.position.set(spec.x, terrainHeight(spec.x, spec.z) - 0.14, spec.z);
  group.rotation.y = rand.range(0, TAU);
  group.userData.tree = {
    type: 'tall',
    hitMeshes: [barkMesh, snowMesh],
    shake: 0,
    shakeVelocity: 0,
    swayPhase: rand.range(0, TAU),
    baseRotationZ: 0,
    height: H,
  };
  for (const m of group.children) m.userData.treeRoot = group;
  return group;
}

/* ------------------------------------------------------------------ */
/*  Low garden pine                                                    */
/* ------------------------------------------------------------------ */

function buildPine(spec, M, snowMat, terrainHeight) {
  const rand = makeRandom(spec.seed);
  const H = spec.h;
  const barkGeos = [];
  const needleGeos = [];
  const snowGeos = [];

  const trunkPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(rand.range(-0.16, 0.16), H * 0.34, rand.range(-0.14, 0.14)),
    new THREE.Vector3(rand.range(-0.34, 0.34), H * 0.66, rand.range(-0.26, 0.26)),
    new THREE.Vector3(rand.range(-0.46, 0.46), H, rand.range(-0.34, 0.34)),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts, false, 'catmullrom', 0.3);
  barkGeos.push(taperedTube(trunkPts, 0.15 + H * 0.02, 0.03, 7));

  const pineNeedleMat = toonMaterial({
    color: 0xffffff,
    vertexColors: true,
    rimColor: 0x9db697,
    rimStrength: 0.2,
    rimPower: 2.3,
  });

  const padCount = rand.int(3, 5);
  for (let i = 0; i < padCount; i++) {
    const t = 0.34 + (i / padCount) * 0.62;
    const base = trunkCurve.getPointAt(Math.min(0.96, t));
    const angle = rand.range(0, TAU);
    const reach = rand.range(0.6, 1.25) * (1.06 - t * 0.28);
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const end = base
      .clone()
      .addScaledVector(dir, reach)
      .add(new THREE.Vector3(0, rand.range(-0.06, 0.18), 0));
    const pts = [base, base.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.12, 0)), end];
    barkGeos.push(taperedTube(pts, 0.038 + H * 0.008, 0.014, 5));

    const padCenter = end.clone().add(new THREE.Vector3(0, 0.035, 0));
    const padScale = rand.range(0.38, 0.66);
    const blobs = rand.int(7, 10);
    for (let k = 0; k < blobs; k++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      g.scale(
        rand.range(0.35, 0.68) * padScale * 1.8,
        rand.range(0.2, 0.3) * padScale * 1.4,
        rand.range(0.3, 0.6) * padScale * 1.8
      );
      g.rotateY(rand.range(0, TAU));
      g.translate(
        padCenter.x + rand.range(-0.34, 0.34) * padScale,
        padCenter.y + rand.range(-0.05, 0.035) * padScale,
        padCenter.z + rand.range(-0.34, 0.34) * padScale
      );
      tagGeometryColor(g, 0.94, rand);
      const colors = g.attributes.color;
      const shade = rand.range(0.82, 1.02);
      for (let j = 0; j < colors.count; j++) {
        colors.setXYZ(j, 0.1 * shade, 0.21 * shade, 0.13 * shade);
      }
      needleGeos.push(g);

      const sc = new THREE.IcosahedronGeometry(1, 1);
      sc.scale(
        rand.range(0.18, 0.34) * padScale * 1.8,
        rand.range(0.035, 0.06) * padScale * 1.2,
        rand.range(0.15, 0.3) * padScale * 1.8
      );
      sc.rotateY(rand.range(0, TAU));
      sc.translate(
        padCenter.x + rand.range(-0.32, 0.32) * padScale,
        padCenter.y + rand.range(0.1, 0.16) * padScale,
        padCenter.z + rand.range(-0.32, 0.32) * padScale
      );
      tagGeometryColor(sc, 0.98, rand);
      snowGeos.push(sc);
    }

    // a fuller dark-green core beneath the snow
    const core = new THREE.IcosahedronGeometry(1, 1);
    core.scale(padScale * 0.55, padScale * 0.26, padScale * 0.5);
    core.translate(padCenter.x, padCenter.y + padScale * 0.04, padCenter.z);
    const coreColors = new Float32Array(core.attributes.position.count * 3);
    for (let j = 0; j < coreColors.length / 3; j++) {
      coreColors[j * 3] = 0.085;
      coreColors[j * 3 + 1] = 0.18;
      coreColors[j * 3 + 2] = 0.11;
    }
    core.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));
    needleGeos.push(core);

    // a few dark needle fringes at the rim
    for (let k = 0; k < 12; k++) {
      const a = rand.range(0, TAU);
      const rr = rand.range(0.28, 0.52) * padScale;
      const g = new THREE.ConeGeometry(0.035 * padScale, rand.range(0.24, 0.44) * padScale, 4);
      g.rotateZ(rand.range(-0.45, 0.45));
      g.rotateX(rand.range(-0.3, 0.3));
      g.translate(
        padCenter.x + Math.cos(a) * rr,
        padCenter.y - rand.range(0.04, 0.1),
        padCenter.z + Math.sin(a) * rr
      );
      const count = g.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) {
        colors[j * 3] = 0.07;
        colors[j * 3 + 1] = 0.16;
        colors[j * 3 + 2] = 0.1;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      needleGeos.push(g);
    }
  }

  const bark = mergeAll(barkGeos);
  const needles = mergeAll(needleGeos);
  const snow = mergeAll(snowGeos);
  const barkMesh = new THREE.Mesh(bark, M.barkDark);
  const needleMesh = new THREE.Mesh(needles, pineNeedleMat);
  const snowMesh = new THREE.Mesh(snow, snowMat);
  for (const m of [barkMesh, needleMesh, snowMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  const group = new THREE.Group();
  group.add(barkMesh, needleMesh, snowMesh);
  group.position.set(spec.x, terrainHeight(spec.x, spec.z) - 0.08, spec.z);
  group.rotation.y = rand.range(0, TAU);
  group.userData.tree = {
    type: 'pine',
    hitMeshes: [barkMesh, needleMesh, snowMesh],
    shake: 0,
    shakeVelocity: 0,
    swayPhase: rand.range(0, TAU),
    baseRotationZ: 0,
    height: H,
  };
  for (const m of group.children) m.userData.treeRoot = group;
  return group;
}

/* ------------------------------------------------------------------ */

export function buildTrees(world, M) {
  const snowMat = toonMaterial({
    color: 0xffffff,
    vertexColors: true,
    rimColor: 0xd6e8ff,
    rimStrength: 0.32,
    rimPower: 2.1,
  });

  const group = new THREE.Group();
  group.name = 'trees';
  const trees = [];
  for (const spec of TALL_TREES) {
    const t = buildTallTree(spec, M, snowMat, world.terrainHeight);
    group.add(t);
    trees.push(t);
  }
  const pines = [];
  for (const spec of PINES) {
    const p = buildPine(spec, M, snowMat, world.terrainHeight);
    group.add(p);
    pines.push(p);
  }
  return { group, trees, pines, snowMat };
}
