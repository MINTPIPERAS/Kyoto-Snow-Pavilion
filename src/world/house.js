import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  makeRandom,
  makeNoise2D,
  taperedTube,
  glowTexture,
  smoothstep,
  clamp,
  TAU,
} from '../utils.js';
import { attachEdges, toonMaterial } from '../materials.js';
import { Fire } from '../effects/fire.js';

const HOUSE_POS = new THREE.Vector3(-2.3, 0, -3.1);
const FLOOR_Y = 1.3;
const DECK_Y = 1.14;
const X0 = -4.4;
const X1 = 4.4;
const Z0 = -2.8;
const Z1 = 2.8;
const EAVE_Y = 4.06;
const RIDGE_Y = 6.35;
const HALF_W = 6.55;
const HALF_D = 5.0;
const RIDGE_HALF = 2.45;

/* ------------------------------------------------------------------ */
/*  Merge helpers                                                      */
/* ------------------------------------------------------------------ */

function nonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

function mergeList(list) {
  if (!list.length) return null;
  return mergeGeometries(list.map(nonIndexed), false);
}

function addBox(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) {
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
    );
  }
  g.translate(x, y, z);
  list.push(g);
  return g;
}

function addCylinder(list, rt, rb, h, seg, x, y, z, quat = null) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (quat) g.applyQuaternion(quat);
  g.translate(x, y, z);
  list.push(g);
  return g;
}

function meshFrom(list, material, { cast = true, receive = true } = {}) {
  const geo = mergeList(list);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Shoji panel                                                        */
/* ------------------------------------------------------------------ */

function buildShojiPanel(width, height, M) {
  const group = new THREE.Group();
  const woods = [];
  const frame = 0.075;
  const depth = 0.05;

  // outer frame
  addBox(woods, frame, height, depth, -width / 2 + frame / 2, height / 2, 0);
  addBox(woods, frame, height, depth, width / 2 - frame / 2, height / 2, 0);
  addBox(woods, width - frame * 2, frame * 1.3, depth, 0, height - frame * 0.65, 0);
  addBox(woods, width - frame * 2, frame * 1.5, depth, 0, frame * 0.75, 0);

  // horizontal/vertical kumiko
  const barW = 0.019;
  const innerW = width - frame * 2;
  const innerH = height - frame * 2.2;
  const cols = 7;
  const rows = 8;
  for (let i = 1; i < cols; i++) {
    const x = -innerW / 2 + (i / cols) * innerW;
    addBox(woods, barW, innerH, depth * 0.7, x, height / 2 + 0.012, 0.001);
  }
  for (let j = 1; j < rows; j++) {
    const y = frame * 1.2 + (j / rows) * innerH;
    addBox(woods, innerW, barW, depth * 0.7, 0, y, 0.001);
  }

  const frameMesh = meshFrom(woods, M.woodDark);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  attachEdges(frameMesh, { threshold: 26, opacity: 0.22, color: 0x1f1a15 });
  group.add(frameMesh);

  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(width - frame * 1.4, height - frame * 1.8),
    M.shoji
  );
  paper.position.set(0, height / 2 + 0.01, -0.018);
  paper.receiveShadow = true;
  group.add(paper);

  // small brass pull
  const pull = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12),
    M.brassSoft
  );
  pull.rotation.x = Math.PI / 2;
  pull.position.set(width / 2 - frame * 1.7, height * 0.44, 0.04);
  group.add(pull);

  group.userData.panelMeshes = [frameMesh, paper, pull];
  return group;
}

function buildShojiSet(config, M) {
  const group = new THREE.Group();
  group.position.copy(config.position);
  group.rotation.y = config.rotationY || 0;
  const panels = [];
  for (let i = 0; i < config.count; i++) {
    const panel = buildShojiPanel(config.panelWidth, config.panelHeight, M);
    panel.position.set(config.closed[i], 0, config.tracks[i]);
    panel.userData.closed = config.closed[i];
    panel.userData.open = config.open[i];
    panel.userData.track = config.tracks[i];
    group.add(panel);
    panels.push(panel);
  }
  const state = {
    group,
    panels,
    open: config.defaultOpen,
    target: config.defaultOpen,
    axis: 'x',
  };
  function apply(t) {
    for (const p of panels) {
      const base = p.userData.closed + (p.userData.open - p.userData.closed) * t;
      p.position.x = base;
    }
  }
  apply(state.open);
  state.setOpen = (v, immediate = false) => {
    state.target = clamp(v, 0, 1);
    if (immediate) {
      state.open = state.target;
      apply(state.open);
    }
  };
  state.toggle = () => {
    state.target = state.target > 0.5 ? 0 : 1;
  };
  state.update = (dt) => {
    state.open += (state.target - state.open) * (1 - Math.exp(-6.5 * dt));
    apply(state.open);
  };
  for (const p of panels) {
    for (const m of p.userData.panelMeshes) {
      m.userData.shoji = state;
    }
  }
  return state;
}

/* ------------------------------------------------------------------ */
/*  Roof                                                               */
/* ------------------------------------------------------------------ */

function buildPatchGeometry(side, { snow = false, resU = 26, resV = 11 } = {}) {
  const noise = makeNoise2D(8123);
  const positions = [];
  const uvs = [];
  const indices = [];
  const t0 = snow ? 0.15 : 0;
  const yOffset = snow ? 0.2 : 0;
  const inset = snow ? 0.04 : 0;

  for (let j = 0; j <= resV; j++) {
    const t = t0 + (1 - t0) * (j / resV);
    for (let i = 0; i <= resU; i++) {
      const s = i / resU;
      let x;
      let z;
      let y;
      if (side === 'front' || side === 'back') {
        const eaveX = -HALF_W + inset + 2 * (HALF_W - inset) * s;
        const ridgeX = -RIDGE_HALF + 2 * RIDGE_HALF * s;
        x = THREE.MathUtils.lerp(eaveX, ridgeX, t);
        const sign = side === 'front' ? 1 : -1;
        z = sign * (HALF_D - inset) * (1 - t);
        y =
          THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) -
          Math.sin(Math.PI * t) * 0.11 +
          Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.15 * (1 - t) * 0.7;
      } else {
        const sign = side === 'right' ? 1 : -1;
        const eaveZ = (s - 0.5) * 2 * (HALF_D - inset);
        x = sign * THREE.MathUtils.lerp(HALF_W - inset, RIDGE_HALF, t);
        z = eaveZ * (1 - t);
        y =
          THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) -
          Math.sin(Math.PI * t) * 0.09 +
          Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.12 * (1 - t) * 0.7;
      }
      if (snow) {
        const n = noise.fbm(x * 0.6 + 2.3, z * 0.6 - 1.2, 3);
        const drift = Math.sin(x * 0.85 + 1.4) * 0.028 + Math.cos(z * 0.7 - 0.6) * 0.022;
        y += yOffset + n * 0.075 + drift + 0.012;
      }
      positions.push(x, y, z);
      uvs.push(s, t);
    }
  }

  for (let j = 0; j < resV; j++) {
    for (let i = 0; i < resU; i++) {
      const a = j * (resU + 1) + i;
      const b = a + resU + 1;
      if (side === 'back' || side === 'right') {
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      } else {
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRoof(M, group, snowDetailGeos) {
  const tileGeos = [];
  const snowGeos = [];
  for (const side of ['front', 'back', 'left', 'right']) {
    tileGeos.push(buildPatchGeometry(side, { snow: false, resU: side === 'front' || side === 'back' ? 30 : 20 }));
    snowGeos.push(buildPatchGeometry(side, { snow: true, resU: side === 'front' || side === 'back' ? 30 : 20 }));
  }

  const tileMat = M.roofTile.clone();
  tileMat.side = THREE.DoubleSide;
  const tileMesh = new THREE.Mesh(mergeGeometries(tileGeos, false), tileMat);
  tileMesh.castShadow = true;
  tileMesh.receiveShadow = true;
  group.add(tileMesh);

  const snowMat = M.snow.clone();
  snowMat.side = THREE.DoubleSide;
  snowMat.color.set(0xeef5fd);
  const snowMesh = new THREE.Mesh(mergeGeometries(snowGeos, false), snowMat);
  snowMesh.castShadow = true;
  snowMesh.receiveShadow = true;
  group.add(snowMesh);

  // eave tile ends
  const tileEnds = [];
  const capQuatZ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const capQuatX = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const capGeo = new THREE.CylinderGeometry(0.072, 0.072, 0.09, 8);
  const steps = 27;
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) / steps;
    const x = -HALF_W + 0.1 + (HALF_W * 2 - 0.2) * s;
    const lift = Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.15 * 0.7;
    for (const sign of [1, -1]) {
      const g = capGeo.clone();
      g.applyQuaternion(capQuatZ);
      g.translate(x, EAVE_Y + lift + 0.015, sign * (HALF_D + 0.035));
      tileEnds.push(g);
    }
  }
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) / steps;
    const z = -HALF_D + 0.1 + (HALF_D * 2 - 0.2) * s;
    const lift = Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.12 * 0.7;
    for (const sign of [1, -1]) {
      const g = capGeo.clone();
      g.applyQuaternion(capQuatX);
      g.translate(sign * (HALF_W + 0.035), EAVE_Y + lift + 0.015, z);
      tileEnds.push(g);
    }
  }
  const caps = new THREE.Mesh(mergeGeometries(tileEnds, false), M.roofTileDark);
  caps.castShadow = true;
  group.add(caps);

  // fascia boards under the eaves
  const fascia = [];
  for (const sign of [1, -1]) {
    addBox(fascia, HALF_W * 2 + 0.1, 0.15, 0.12, 0, EAVE_Y - 0.08, sign * (HALF_D + 0.01));
    addBox(fascia, 0.12, 0.15, HALF_D * 2 + 0.1, sign * (HALF_W + 0.01), EAVE_Y - 0.08, 0);
  }
  const fasciaMesh = meshFrom(fascia, M.woodDeep);
  group.add(fasciaMesh);

  // soffit slab under the roof
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.1, 0.075, HALF_D * 2 + 0.1), M.woodDeep);
  soffit.position.y = EAVE_Y - 0.17;
  soffit.castShadow = true;
  soffit.receiveShadow = true;
  group.add(soffit);

  // rafters under the front and right eaves
  const rafters = [];
  for (let i = 0; i < 18; i++) {
    const x = -HALF_W + 0.32 + (i / 17) * (HALF_W * 2 - 0.64);
    addBox(rafters, 0.065, 0.085, 2.25, x, EAVE_Y - 0.26, HALF_D - 1.2, -0.035, 0, 0);
  }
  for (let i = 0; i < 13; i++) {
    const z = -HALF_D + 0.32 + (i / 12) * (HALF_D * 2 - 0.64);
    addBox(rafters, 2.25, 0.085, 0.065, HALF_W - 1.2, EAVE_Y - 0.26, z, 0, 0, -0.035);
  }
  const rafterMesh = meshFrom(rafters, M.woodDeep);
  group.add(rafterMesh);

  // main ridge beam + hip ridges
  const ridgeGeos = [];
  const ridgeCyl = new THREE.CylinderGeometry(0.095, 0.095, RIDGE_HALF * 2 + 0.15, 8);
  ridgeCyl.rotateZ(Math.PI / 2);
  ridgeCyl.translate(0, RIDGE_Y + 0.02, 0);
  ridgeGeos.push(ridgeCyl);
  const hipLines = [
    [new THREE.Vector3(RIDGE_HALF, RIDGE_Y, 0), new THREE.Vector3(HALF_W, EAVE_Y + 0.06, HALF_D)],
    [new THREE.Vector3(RIDGE_HALF, RIDGE_Y, 0), new THREE.Vector3(HALF_W, EAVE_Y + 0.06, -HALF_D)],
    [new THREE.Vector3(-RIDGE_HALF, RIDGE_Y, 0), new THREE.Vector3(-HALF_W, EAVE_Y + 0.06, HALF_D)],
    [new THREE.Vector3(-RIDGE_HALF, RIDGE_Y, 0), new THREE.Vector3(-HALF_W, EAVE_Y + 0.06, -HALF_D)],
  ];
  for (const [a, b] of hipLines) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const g = new THREE.CylinderGeometry(0.075, 0.075, len, 6);
    g.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    ridgeGeos.push(g);
  }
  const ridgeMesh = new THREE.Mesh(mergeGeometries(ridgeGeos, false), M.roofTileDark);
  ridgeMesh.castShadow = true;
  group.add(ridgeMesh);

  /* --- thick snow on the roof --- */
  const rand = makeRandom(611);

  function snowLump(x, y, z, sx, sy, sz, rotY = 0, rotZ = 0) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const noise = makeNoise2D(13);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + noise(v.x * 2.2, v.z * 2.2) * 0.09);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.scale(sx, sy, sz);
    if (rotZ) g.rotateZ(rotZ);
    g.rotateY(rotY);
    g.translate(x, y, z);
    snowDetailGeos.push(g);
  }

  // thick snow lip at the edge of the blanket, leaving the tile band exposed
  const SNOW_EDGE_T = 0.15;
  const snowEdgeYFront =
    EAVE_Y + (RIDGE_Y - EAVE_Y) * SNOW_EDGE_T - Math.sin(Math.PI * SNOW_EDGE_T) * 0.11 + 0.21;
  for (const sign of [1, -1]) {
    for (let i = 0; i < 18; i++) {
      const s = (i + 0.5) / 18;
      const x = -HALF_W + s * HALF_W * 2 + rand.range(-0.1, 0.1);
      const lift = Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.15 * (1 - SNOW_EDGE_T) * 0.7;
      snowLump(
        x,
        snowEdgeYFront + lift + rand.range(-0.02, 0.04),
        sign * (HALF_D * (1 - SNOW_EDGE_T) + 0.05 + rand.range(-0.06, 0.08)),
        rand.range(0.5, 0.82),
        rand.range(0.13, 0.21),
        rand.range(0.26, 0.4),
        rand.range(-0.1, 0.1)
      );
    }
    // side edges
    for (let i = 0; i < 14; i++) {
      const s = (i + 0.5) / 14;
      const z = -HALF_D + s * HALF_D * 2 + rand.range(-0.1, 0.1);
      const lift = Math.pow(Math.abs(s * 2 - 1), 3.4) * 0.12 * (1 - SNOW_EDGE_T) * 0.7;
      snowLump(
        sign * (HALF_W * (1 - SNOW_EDGE_T) + 0.04 + rand.range(-0.06, 0.08)),
        snowEdgeYFront + lift + rand.range(-0.02, 0.04),
        z,
        rand.range(0.25, 0.4),
        rand.range(0.12, 0.2),
        rand.range(0.5, 0.82),
        rand.range(-0.1, 0.1)
      );
    }
  }

  // occasional snow drips from the lip, kept above the visible tile band
  for (let i = 0; i < 9; i++) {
    const sign = rand.chance(0.5) ? 1 : -1;
    if (rand.chance(0.72)) {
      const x = rand.range(-HALF_W + 0.8, HALF_W - 0.8);
      snowLump(
        x,
        snowEdgeYFront - 0.12,
        sign * (HALF_D * (1 - SNOW_EDGE_T) + 0.03),
        rand.range(0.08, 0.13),
        rand.range(0.14, 0.28),
        rand.range(0.07, 0.11),
        0
      );
    } else {
      const z = rand.range(-HALF_D + 0.8, HALF_D - 0.8);
      snowLump(
        sign * (HALF_W * (1 - SNOW_EDGE_T) + 0.03),
        snowEdgeYFront - 0.12,
        z,
        rand.range(0.07, 0.11),
        rand.range(0.14, 0.26),
        rand.range(0.08, 0.13),
        0
      );
    }
  }

  // soft drift ripples across the blanket
  for (let i = 0; i < 14; i++) {
    const side = rand.pick(['front', 'back', 'left', 'right']);
    const t = rand.range(0.28, 0.82);
    if (side === 'front' || side === 'back') {
      const s = rand.range(0.12, 0.88);
      const eaveX = -HALF_W + 2 * HALF_W * s;
      const ridgeX = -RIDGE_HALF + 2 * RIDGE_HALF * s;
      const x = THREE.MathUtils.lerp(eaveX, ridgeX, t);
      const z = (side === 'front' ? 1 : -1) * HALF_D * (1 - t);
      const y = THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) - Math.sin(Math.PI * t) * 0.11 + 0.24;
      snowLump(x, y, z, rand.range(0.45, 0.85), rand.range(0.035, 0.075), rand.range(0.13, 0.25), rand.range(-0.15, 0.15));
    } else {
      const s = rand.range(0.12, 0.88);
      const z = (s - 0.5) * 2 * HALF_D * (1 - t);
      const x = (side === 'right' ? 1 : -1) * HALF_W * (1 - t);
      const y = THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) - Math.sin(Math.PI * t) * 0.09 + 0.24;
      snowLump(x, y, z, rand.range(0.13, 0.25), rand.range(0.035, 0.075), rand.range(0.45, 0.85), rand.range(-0.15, 0.15));
    }
  }

  // ridge snow
  for (let i = 0; i < 13; i++) {
    const x = -RIDGE_HALF + (i / 12) * RIDGE_HALF * 2 + rand.range(-0.08, 0.08);
    snowLump(
      x,
      RIDGE_Y + 0.19 + rand.range(-0.02, 0.03),
      rand.range(-0.05, 0.05),
      rand.range(0.38, 0.62),
      rand.range(0.12, 0.19),
      rand.range(0.26, 0.36),
      rand.range(-0.1, 0.1)
    );
  }
  // hip ridge snow
  for (const [a, b] of hipLines) {
    for (let i = 0; i < 15; i++) {
      const t = (i + 0.5) / 15;
      const p = a.clone().lerp(b, t);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rotY = Math.atan2(-dz, dx);
      snowLump(
        p.x + rand.range(-0.04, 0.04),
        p.y + 0.16 + rand.range(-0.02, 0.025),
        p.z + rand.range(-0.04, 0.04),
        rand.range(0.26, 0.42),
        rand.range(0.1, 0.16),
        rand.range(0.18, 0.3),
        rotY + rand.range(-0.08, 0.08)
      );
    }
  }
  // errant lumps on the slopes
  for (let i = 0; i < 18; i++) {
    const side = rand.pick(['front', 'back', 'left', 'right']);
    if (side === 'front' || side === 'back') {
      const x = rand.range(-HALF_W + 1.2, HALF_W - 1.2);
      const t = rand.range(0.25, 0.8);
      const z = (side === 'front' ? 1 : -1) * HALF_D * (1 - t);
      const y = THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) - Math.sin(Math.PI * t) * 0.11 + 0.24;
      snowLump(x, y, z, rand.range(0.25, 0.5), rand.range(0.06, 0.12), rand.range(0.2, 0.4), rand.range(0, TAU));
    } else {
      const z = rand.range(-HALF_D + 1.2, HALF_D - 1.2);
      const t = rand.range(0.25, 0.8);
      const x = (side === 'right' ? 1 : -1) * HALF_W * (1 - t);
      const y = THREE.MathUtils.lerp(EAVE_Y, RIDGE_Y, t) - Math.sin(Math.PI * t) * 0.09 + 0.24;
      snowLump(x, y, z, rand.range(0.2, 0.4), rand.range(0.06, 0.12), rand.range(0.25, 0.5), rand.range(0, TAU));
    }
  }

  return { tileMesh, snowMesh };
}

/* ------------------------------------------------------------------ */
/*  Small furniture                                                    */
/* ------------------------------------------------------------------ */

function buildTatami(M) {
  const group = new THREE.Group();
  const mats = [];
  const borders = [];
  const matsX = 4;
  const matsZ = 2;
  const mw = (X1 - X0) / matsX;
  const md = (Z1 - Z0) / matsZ;
  for (let ix = 0; ix < matsX; ix++) {
    for (let iz = 0; iz < matsZ; iz++) {
      const cx = X0 + mw * (ix + 0.5);
      const cz = Z0 + md * (iz + 0.5);
      const g = new THREE.PlaneGeometry(mw - 0.035, md - 0.035);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, FLOOR_Y + 0.012, cz);
      mats.push(g);
      const bw = 0.045;
      addBox(borders, mw - 0.03, 0.018, bw, cx, FLOOR_Y + 0.016, cz - md / 2 + bw / 2);
      addBox(borders, mw - 0.03, 0.018, bw, cx, FLOOR_Y + 0.016, cz + md / 2 - bw / 2);
      addBox(borders, bw, 0.018, md - 0.03, cx - mw / 2 + bw / 2, FLOOR_Y + 0.016, cz);
      addBox(borders, bw, 0.018, md - 0.03, cx + mw / 2 - bw / 2, FLOOR_Y + 0.016, cz);
    }
  }
  const matMesh = new THREE.Mesh(mergeGeometries(mats, false), M.tatami);
  matMesh.receiveShadow = true;
  group.add(matMesh);
  const borderMesh = new THREE.Mesh(mergeList(borders), M.tatamiEdge);
  borderMesh.receiveShadow = true;
  group.add(borderMesh);
  return group;
}

function buildKotatsu(M, tex) {
  const g = new THREE.Group();
  g.position.set(-1.35, FLOOR_Y, 0.35);

  const quilt = new THREE.Mesh(
    new RoundedBoxGeometry(2.65, 0.54, 2.15, 3, 0.055),
    M.indigoWaves
  );
  quilt.position.y = 0.27;
  quilt.castShadow = true;
  quilt.receiveShadow = true;
  g.add(quilt);

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.075, 1.98), M.woodLight);
  top.position.y = 0.575;
  top.castShadow = true;
  top.receiveShadow = true;
  attachEdges(top, { threshold: 25, opacity: 0.2 });
  g.add(top);

  // tray and tea
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.035, 0.72), M.woodDeep);
  tray.position.set(0.15, 0.63, 0.08);
  tray.castShadow = true;
  g.add(tray);

  const pot = new THREE.Group();
  pot.position.set(-0.12, 0.665, 0.1);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 10),
    M.ceramicDark
  );
  body.scale.y = 0.78;
  body.position.y = 0.1;
  body.castShadow = true;
  pot.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.035, 12), M.ceramicDark);
  lid.position.y = 0.225;
  pot.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.woodDeep);
  knob.position.y = 0.25;
  pot.add(knob);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 8, 1, true), M.ceramicDark);
  spout.rotation.z = -1.0;
  spout.position.set(0.17, 0.12, 0);
  pot.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 5, 12, Math.PI), M.bambooDark);
  handle.rotation.z = 0;
  handle.position.y = 0.26;
  pot.add(handle);
  g.add(pot);

  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Group();
    cup.position.set(0.34 + i * 0.19, 0.65, -0.14 + (i % 2) * 0.15);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.075, 12, 1, true), M.ceramic);
    c.position.y = 0.04;
    c.castShadow = true;
    cup.add(c);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), M.ceramic);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.004;
    cup.add(bottom);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16), M.woodPale);
    saucer.position.y = -0.008;
    cup.add(saucer);
    g.add(cup);
  }

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.022, 16), M.woodPale);
  plate.position.set(-0.55, 0.635, -0.4);
  g.add(plate);
  for (let i = 0; i < 2; i++) {
    const mikan = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), M.mikan);
    mikan.scale.y = 0.88;
    mikan.position.set(-0.55 + i * 0.16 - 0.04, 0.71, -0.4 + (i ? 0.08 : -0.03));
    mikan.castShadow = true;
    g.add(mikan);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 3), M.pine);
    leaf.rotation.z = Math.PI / 2.2;
    leaf.position.set(mikan.position.x + 0.06, mikan.position.y + 0.07, mikan.position.z);
    g.add(leaf);
  }

  // two floor cushions
  for (const [cx, cz, rot] of [
    [1.65, 0.2, 0.1],
    [-0.35, 1.55, -0.15],
  ]) {
    const cushion = new THREE.Mesh(
      new RoundedBoxGeometry(0.82, 0.16, 0.78, 3, 0.05),
      M.indigoHemp
    );
    cushion.position.set(cx, 0.08, cz);
    cushion.rotation.y = rot;
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    g.add(cushion);
    const trim = new THREE.Mesh(
      new RoundedBoxGeometry(0.86, 0.045, 0.82, 2, 0.02),
      M.cloth
    );
    trim.position.set(cx, 0.025, cz);
    trim.rotation.y = rot;
    g.add(trim);
  }

  return g;
}

function buildIrori(M, tex, houseGroup) {
  const g = new THREE.Group();
  g.position.set(2.3, FLOOR_Y + 0.022, -0.95);

  const rimGeos = [];
  const rimMat = M.woodDeep;
  const inner = 1.45;
  const rimW = 0.16;
  addBox(rimGeos, inner + rimW * 2, 0.12, rimW, 0, 0.06, inner / 2 + rimW / 2);
  addBox(rimGeos, inner + rimW * 2, 0.12, rimW, 0, 0.06, -inner / 2 - rimW / 2);
  addBox(rimGeos, rimW, 0.12, inner, -inner / 2 - rimW / 2, 0.06, 0);
  addBox(rimGeos, rimW, 0.12, inner, inner / 2 + rimW / 2, 0.06, 0);
  const rim = new THREE.Mesh(mergeList(rimGeos), rimMat);
  rim.castShadow = true;
  rim.receiveShadow = true;
  attachEdges(rim, { threshold: 20, opacity: 0.22 });
  g.add(rim);

  // shallow raised hearth pan over the tatami
  const hearthBase = new THREE.Mesh(new THREE.BoxGeometry(inner + 0.06, 0.05, inner + 0.06), M.woodDeep);
  hearthBase.position.y = 0.005;
  hearthBase.receiveShadow = true;
  g.add(hearthBase);
  const ash = new THREE.Mesh(new THREE.BoxGeometry(inner - 0.08, 0.045, inner - 0.08), M.ash);
  ash.position.y = 0.045;
  ash.receiveShadow = true;
  g.add(ash);

  // stones at the rim corners
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), M.stoneWetDark);
    stone.scale.set(1.1, 0.45, 0.8);
    stone.position.set(Math.cos(a) * 0.84, 0.055, Math.sin(a) * 0.84);
    stone.rotation.y = a;
    g.add(stone);
  }

  // burning charcoal
  const rand = makeRandom(4711);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.55, 6), M.charcoal);
    log.rotation.z = Math.PI / 2 + rand.range(-0.35, 0.35);
    log.rotation.y = rand.range(-0.6, 0.6);
    log.position.set(rand.range(-0.22, 0.22), 0.11 + i * 0.035, rand.range(-0.25, 0.25));
    log.castShadow = true;
    g.add(log);
  }
  for (let i = 0; i < 6; i++) {
    const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(rand.range(0.035, 0.06), 1), M.ember);
    ember.position.set(rand.range(-0.32, 0.32), 0.11 + rand.range(0, 0.08), rand.range(-0.3, 0.3));
    g.add(ember);
  }

  const fire = new Fire({
    tex,
    position: new THREE.Vector3(2.3, FLOOR_Y + 0.1, -0.95),
    scale: 0.66,
    base: 0.9,
  });
  houseGroup.add(fire.group);

  // hanging kettle from a ceiling beam
  const kettle = new THREE.Group();
  kettle.position.set(2.3, 2.55, -0.95);
  const potBody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12), M.iron);
  potBody.scale.y = 0.8;
  potBody.position.y = -0.06;
  potBody.castShadow = true;
  kettle.add(potBody);
  const potBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.07, 16), M.iron);
  potBottom.position.y = -0.27;
  kettle.add(potBottom);
  const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 16), M.iron);
  potLid.position.y = 0.19;
  kettle.add(potLid);
  const potKnob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.brassSoft);
  potKnob.position.y = 0.225;
  kettle.add(potKnob);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.3, 8), M.iron);
  spout.rotation.z = 0.85;
  spout.position.set(0.29, 0.06, 0);
  kettle.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.024, 6, 18, Math.PI), M.iron);
  handle.position.y = 0.28;
  kettle.add(handle);
  // chain up to the ceiling
  const chainGeos = [];
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.TorusGeometry(0.028, 0.008, 4, 8);
    ring.rotateY(i % 2 === 0 ? 0 : Math.PI / 2);
    ring.translate(2.3, 2.9 + i * 0.11, -0.95);
    chainGeos.push(ring);
  }
  const chain = new THREE.Mesh(mergeGeometries(chainGeos, false), M.iron);
  houseGroup.add(chain);
  const ceilingBeam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 5.7), M.woodDeep);
  ceilingBeam.position.set(2.3, 3.78, 0);
  houseGroup.add(ceilingBeam);
  houseGroup.add(kettle);

  // invisible-ish hit box for fire interaction
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 1.8, 2.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
  );
  hit.position.set(2.3, FLOOR_Y + 0.9, -0.95);
  houseGroup.add(hit);

  return { group: g, fire, hit };
}

function buildBookshelf(M) {
  const g = new THREE.Group();
  g.position.set(-4.08, FLOOR_Y, -0.55);
  g.rotation.y = Math.PI / 2;

  const woods = [];
  const W = 2.45;
  const H = 2.05;
  const D = 0.42;
  addBox(woods, W, 0.055, D, 0, 0.03, 0);
  addBox(woods, W, 0.055, D, 0, H, 0);
  addBox(woods, 0.055, H, D, -W / 2, H / 2, 0);
  addBox(woods, 0.055, H, D, W / 2, H / 2, 0);
  addBox(woods, W, H, 0.035, 0, H / 2, -D / 2);
  for (let i = 1; i <= 3; i++) {
    addBox(woods, W - 0.08, 0.04, D - 0.04, 0, (H / 4) * i + 0.01, 0);
  }
  const shelf = meshFrom(woods, M.woodDark);
  attachEdges(shelf, { threshold: 25, opacity: 0.22 });
  g.add(shelf);

  // books
  const rand = makeRandom(830);
  const bookMats = [M.bookA, M.bookB, M.bookC, M.bookD, M.page];
  const shelves = [0.08, H / 4 + 0.04, H / 2 + 0.04, (H / 4) * 3 + 0.04];
  for (let s = 0; s < 4; s++) {
    let x = -W / 2 + 0.12;
    const maxX = W / 2 - 0.15;
    const count = rand.int(5, 8);
    for (let i = 0; i < count && x < maxX; i++) {
      const bw = rand.range(0.07, 0.15);
      const bh = rand.range(0.24, 0.44);
      const bd = rand.range(0.25, 0.33);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), rand.pick(bookMats));
      mesh.position.set(x + bw / 2, shelves[s] + bh / 2, rand.range(-0.02, 0.03));
      mesh.rotation.z = rand.chance(0.22) ? rand.range(-0.12, 0.12) : 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      x += bw + rand.range(0.008, 0.03);
    }
    // horizontal stack
    if (rand.chance(0.7)) {
      let hy = shelves[s];
      const sw = rand.range(0.3, 0.45);
      for (let k = 0; k < rand.int(2, 4); k++) {
        const th = rand.range(0.04, 0.075);
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(sw, th, rand.range(0.24, 0.32)),
          rand.pick(bookMats)
        );
        mesh.position.set(maxX - sw / 2, hy + th / 2, rand.range(-0.03, 0.05));
        mesh.rotation.y = rand.range(-0.08, 0.08);
        mesh.castShadow = true;
        g.add(mesh);
        hy += th;
      }
    }
  }

  // pottery on top
  for (const [x, type] of [
    [-0.72, 'celadon'],
    [0.1, 'ceramic'],
    [0.78, 'dark'],
  ]) {
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.12, 0),
      new THREE.Vector2(0.15, 0.06),
      new THREE.Vector2(0.13, 0.2),
      new THREE.Vector2(0.08, 0.26),
      new THREE.Vector2(0.09, 0.3),
      new THREE.Vector2(0.06, 0.31),
    ];
    const vase = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 14),
      type === 'celadon' ? M.celadon : type === 'dark' ? M.ceramicDark : M.ceramic
    );
    vase.scale.setScalar(rand.range(0.85, 1.15));
    vase.position.set(x, H + 0.055, rand.range(-0.02, 0.05));
    vase.castShadow = true;
    g.add(vase);
  }
  return g;
}

function buildYukataRack(M) {
  const g = new THREE.Group();
  g.position.set(-2.9, FLOOR_Y, -1.82);

  const woods = [];
  addBox(woods, 0.065, 2.05, 0.065, -0.72, 1.02, 0);
  addBox(woods, 0.065, 2.05, 0.065, 0.72, 1.02, 0);
  addBox(woods, 1.7, 0.055, 0.055, 0, 1.92, 0);
  addBox(woods, 0.65, 0.05, 0.28, -0.72, 0.025, 0.08);
  addBox(woods, 0.65, 0.05, 0.28, 0.72, 0.025, 0.08);
  const rack = meshFrom(woods, M.woodDark);
  rack.castShadow = true;
  attachEdges(rack, { threshold: 25, opacity: 0.24 });
  g.add(rack);

  // folded cloth hanging over the bar (yukata body)
  const rand = makeRandom(932);
  function clothPanel(w, h, segW, segH, mat, x, y, z, rot = 0) {
    const geo = new THREE.PlaneGeometry(w, h, segW, segH);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      pos.setZ(i, Math.sin(px * 8 + py * 2.2) * 0.018 + Math.sin(py * 7 + rand.range(-0.02, 0.02)) * 0.012);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const bodyY = 1.92 - 0.8;
  const body = clothPanel(0.95, 1.55, 10, 16, M.indigoFlower, 0, bodyY, 0.035);
  g.add(body);
  // shoulders follow the bar
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.96, 8, 1, true), M.indigoFlower);
  shoulder.rotation.z = Math.PI / 2;
  shoulder.position.set(0, 1.9, 0.035);
  g.add(shoulder);

  // sleeves
  for (const side of [-1, 1]) {
    const sleeve = clothPanel(0.5, 0.92, 6, 10, M.indigoFlower, side * 0.72, 1.43, 0.03, side * 0.12);
    sleeve.rotation.y = side * 0.16;
    g.add(sleeve);
  }
  // collar (cream)
  const collarGeos = [];
  addBox(collarGeos, 0.07, 1.0, 0.03, -0.16, 1.63, 0.06, 0, 0, 0.18);
  addBox(collarGeos, 0.07, 1.0, 0.03, 0.16, 1.63, 0.06, 0, 0, -0.18);
  const collar = new THREE.Mesh(mergeList(collarGeos), M.cloth);
  g.add(collar);
  // obi sash
  const obi = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.19, 0.055), M.cloth);
  obi.position.set(0, 1.12, 0.055);
  obi.castShadow = true;
  g.add(obi);
  const obiKnot = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.15, 0.08, 2, 0.02), M.cloth);
  obiKnot.position.set(0.3, 1.12, 0.1);
  obiKnot.rotation.z = 0.15;
  g.add(obiKnot);
  return g;
}

function buildScroll(M, tex) {
  const g = new THREE.Group();
  g.position.set(1.05, FLOOR_Y, -2.74);

  const border = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.86), M.indigoWaves);
  border.position.set(0, 1.6, -0.002);
  g.add(border);
  const paperMat = toonMaterial({
    color: 0xffffff,
    map: tex.scroll,
    rimStrength: 0,
    emissive: 0x241a10,
    emissiveMap: tex.scroll,
    emissiveIntensity: 0.32,
  });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.66), paperMat);
  paper.position.set(0, 1.62, 0.008);
  g.add(paper);

  const rollers = [];
  const rollerGeo = new THREE.CylinderGeometry(0.042, 0.042, 1.28, 10);
  rollerGeo.rotateZ(Math.PI / 2);
  for (const y of [0.72, 2.5]) {
    const r = rollerGeo.clone();
    r.translate(0, y, 0.02);
    rollers.push(r);
    for (const sx of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(0.052, 0.052, 0.055, 10);
      cap.rotateZ(Math.PI / 2);
      cap.translate(sx * 0.67, y, 0.02);
      rollers.push(cap);
    }
  }
  const rollerMesh = new THREE.Mesh(mergeGeometries(rollers, false), M.woodDeep);
  rollerMesh.castShadow = true;
  g.add(rollerMesh);

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.07, 4), M.woodDark);
  cord.position.set(0, 2.54, 0.01);
  g.add(cord);

  // low wooden console in front of the scroll
  const consoleGroup = new THREE.Group();
  const woods = [];
  addBox(woods, 2.0, 0.055, 0.48, 0, 0.54, 0.16);
  for (const x of [-0.82, 0.82]) {
    for (const z of [0.0, 0.29]) {
      addBox(woods, 0.06, 0.53, 0.06, x, 0.265, z);
    }
  }
  addBox(woods, 1.84, 0.032, 0.36, 0, 0.25, 0.16);
  const consoleMesh = meshFrom(woods, M.woodDark);
  consoleMesh.castShadow = true;
  consoleMesh.receiveShadow = true;
  attachEdges(consoleMesh, { threshold: 25, opacity: 0.2 });
  consoleGroup.add(consoleMesh);
  consoleGroup.position.z = 0.12;
  g.add(consoleGroup);

  // celadon vase with a snowy branch
  const vaseProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.085, 0),
    new THREE.Vector2(0.12, 0.07),
    new THREE.Vector2(0.1, 0.23),
    new THREE.Vector2(0.052, 0.31),
    new THREE.Vector2(0.062, 0.35),
    new THREE.Vector2(0.04, 0.36),
  ];
  const vase = new THREE.Mesh(new THREE.LatheGeometry(vaseProfile, 16), M.celadon);
  vase.position.set(0.6, 0.58, 0.14);
  vase.castShadow = true;
  g.add(vase);
  const branch = new THREE.Mesh(
    taperedTube(
      [
        new THREE.Vector3(0.6, 0.9, 0.14),
        new THREE.Vector3(0.73, 1.14, 0.16),
        new THREE.Vector3(0.86, 1.34, 0.12),
      ],
      0.015,
      0.003,
      3
    ),
    M.barkDark
  );
  g.add(branch);
  const snowBud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.snowSoft);
  snowBud.scale.set(0.8, 0.4, 0.55);
  snowBud.position.set(0.84, 1.32, 0.12);
  g.add(snowBud);

  // small incense burner
  const censer = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), M.ceramicDark);
  censer.scale.y = 0.5;
  censer.position.set(-0.58, 0.585, 0.16);
  censer.castShadow = true;
  g.add(censer);
  return g;
}

function buildChair(M) {
  const g = new THREE.Group();
  g.position.set(3.15, FLOOR_Y, 1.4);
  g.rotation.y = 0.32;

  const wood = [];
  addBox(wood, 0.95, 0.1, 0.85, 0, 0.47, 0);
  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.32, 0.32]) {
      addBox(wood, 0.075, 0.46, 0.075, x, 0.23, z);
    }
  }
  addBox(wood, 0.95, 0.8, 0.09, 0, 0.87, -0.39, -0.12, 0, 0);
  for (const x of [-0.44, 0.44]) {
    addBox(wood, 0.08, 0.09, 0.8, x, 0.7, 0.02);
    addBox(wood, 0.08, 0.26, 0.08, x, 0.57, 0.36);
  }
  addBox(wood, 0.95, 0.06, 0.08, 0, 0.39, 0.38);
  const frame = meshFrom(wood, M.woodDark);
  frame.castShadow = true;
  attachEdges(frame, { threshold: 22, opacity: 0.24 });
  g.add(frame);

  const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.13, 0.68, 3, 0.04), M.cloth);
  cushion.position.set(0, 0.58, 0.03);
  cushion.castShadow = true;
  g.add(cushion);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.48, 0.11, 3, 0.04), M.cloth);
  back.position.set(0, 0.9, -0.28);
  back.rotation.x = -0.12;
  back.castShadow = true;
  g.add(back);
  return g;
}

function buildChairSideTable(M) {
  const g = new THREE.Group();
  g.position.set(3.86, FLOOR_Y, 0.55);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.055, 18), M.woodLight);
  top.position.y = 0.67;
  top.castShadow = true;
  attachEdges(top, { threshold: 30, opacity: 0.2 });
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.65, 6), M.woodDark);
    leg.position.set(Math.cos(a) * 0.24, 0.33, Math.sin(a) * 0.24);
    leg.rotation.z = Math.cos(a) * 0.08;
    leg.rotation.x = Math.sin(a) * 0.08;
    leg.castShadow = true;
    g.add(leg);
  }
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.24), M.bookD);
  book.position.set(-0.04, 0.72, 0.02);
  book.rotation.y = 0.28;
  book.castShadow = true;
  g.add(book);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.08, 12, 1, true), M.ceramic);
  cup.position.set(0.15, 0.73, 0.13);
  g.add(cup);
  return g;
}

function buildLantern(M, tex, localPos, glowSprites, lightRefs) {
  const g = new THREE.Group();
  g.position.copy(localPos);
  const profile = [];
  const H = 0.82;
  const R = 0.3;
  const pts = [
    [0.0, 0.0],
    [0.17, 0.0],
    [0.24, 0.08],
    [0.3, 0.26],
    [0.3, 0.5],
    [0.25, 0.68],
    [0.17, 0.79],
    [0.16, H],
  ];
  for (const [r, y] of pts) profile.push(new THREE.Vector2(r, y));
  const paper = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), M.lanternPaper);
  paper.castShadow = false;
  paper.receiveShadow = true;
  g.add(paper);

  // ribs
  const ribs = [];
  for (const [r, y] of [
    [0.24, 0.08],
    [0.285, 0.24],
    [0.3, 0.4],
    [0.285, 0.56],
    [0.245, 0.68],
  ]) {
    const rib = new THREE.TorusGeometry(r, 0.007, 4, 22);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, y, 0);
    ribs.push(rib);
  }
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs, false), M.woodDark);
  g.add(ribMesh);
  // caps
  for (const y of [0.0, H]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.045, 14), M.woodDeep);
    cap.position.y = y;
    g.add(cap);
  }
  // tassel
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 4), M.cloth);
  cord.position.y = -0.07;
  g.add(cord);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 8), M.cloth);
  tassel.position.y = -0.18;
  g.add(tassel);
  // hanging wire
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 4), M.iron);
  wire.position.y = H + 0.18;
  g.add(wire);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture(256, [255, 190, 120]),
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.renderOrder = 5;
  glow.position.y = H * 0.48;
  glow.scale.setScalar(2.1);
  g.add(glow);
  glowSprites.push(glow);

  const point = new THREE.PointLight(0xffa75c, 10, 7, 2);
  point.position.copy(localPos).add(new THREE.Vector3(0, 0.3, 0));
  lightRefs.push(point);

  return g;
}

/* ------------------------------------------------------------------ */
/*  Main house                                                         */
/* ------------------------------------------------------------------ */

export function buildHouse(M, tex) {
  const group = new THREE.Group();
  group.name = 'house';
  group.position.copy(HOUSE_POS);
  const rand = makeRandom(7240);

  const frameDark = [];
  const frameWarm = [];
  const plasterGeos = [];
  const snowDetail = [];
  const lanternGlows = [];
  const lanternLights = [];

  /* --- decks / floor --- */
  const deckMat = M.deck;
  const interiorBase = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.2, 5.6), M.woodDeep);
  interiorBase.position.set(0, FLOOR_Y - 0.1, 0);
  interiorBase.receiveShadow = true;
  group.add(interiorBase);

  const frontDeck = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.13, 1.5), deckMat);
  frontDeck.position.set(0.25, DECK_Y - 0.065, 3.45);
  frontDeck.castShadow = true;
  frontDeck.receiveShadow = true;
  attachEdges(frontDeck, { threshold: 28, opacity: 0.2 });
  group.add(frontDeck);

  const rightDeck = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.13, 7.0), deckMat);
  rightDeck.position.set(5.05, DECK_Y - 0.065, 0.7);
  rightDeck.castShadow = true;
  rightDeck.receiveShadow = true;
  group.add(rightDeck);

  // deck edge beams
  addBox(frameDark, 10.9, 0.16, 0.14, 0.25, DECK_Y - 0.16, 4.2);
  addBox(frameDark, 0.14, 0.16, 7.0, 5.7, DECK_Y - 0.16, 0.7);
  addBox(frameDark, 1.5, 0.16, 0.14, 5.0, DECK_Y - 0.16, -2.8);

  // foundation posts and stones
  const foundationSpots = [
    [-4.4, -2.8],
    [0, -2.8],
    [4.4, -2.8],
    [-4.4, 2.6],
    [4.4, 2.6],
    [-4.7, 4.4],
    [5.7, 4.4],
    [5.7, -2.8],
    [-4.7, 0.2],
  ];
  for (const [x, z] of foundationSpots) {
    addBox(frameDark, 0.16, 1.1, 0.16, x, 0.55, z);
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.16, 7),
      M.stoneWetDark
    );
    stone.position.set(x, 0.16, z);
    stone.scale.z = 0.85;
    stone.rotation.y = rand.range(0, TAU);
    stone.castShadow = true;
    group.add(stone);
  }
  // dark underfloor panel
  const underfloor = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.85, 5.7), M.woodDeep);
  underfloor.position.set(0, 0.62, 0.0);
  underfloor.receiveShadow = true;
  group.add(underfloor);

  // frost-line snow drift against the veranda
  for (let i = 0; i < 8; i++) {
    const x = -4.8 + i * 1.35 + rand.range(-0.2, 0.2);
    const z = 4.55 + rand.range(-0.15, 0.15);
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.scale(rand.range(0.5, 0.9), rand.range(0.07, 0.13), rand.range(0.3, 0.5));
    g.rotateY(rand.range(0, TAU));
    g.translate(x, 0.16, z);
    snowDetail.push(g);
  }

  /* --- posts & beams --- */
  const postPositions = [
    [X0, Z0],
    [0, Z0],
    [X1, Z0],
    [X0, Z1],
    [X1, Z1],
    [X0, 0],
    [X1, 0],
    [-5.2, 4.15],
    [5.7, 4.15],
    [5.7, -2.8],
  ];
  for (const [x, z] of postPositions) {
    const top = 3.95;
    const bottom = z > 2.8 || x > X1 ? DECK_Y : FLOOR_Y;
    const h = top - bottom;
    addBox(frameDark, 0.17, h, 0.17, x, bottom + h / 2, z);
    addBox(frameWarm, 0.19, 0.07, 0.19, x, bottom + 0.035, z);
  }
  // head beams
  addBox(frameDark, 9.0, 0.14, 0.16, 0, 3.91, -2.78);
  addBox(frameDark, 0.16, 0.14, 5.7, -4.42, 3.91, 0);
  addBox(frameDark, 9.0, 0.14, 0.16, 0, 3.91, 2.8);
  addBox(frameDark, 0.16, 0.14, 5.7, 4.42, 3.91, 0);

  /* --- walls --- */
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.62, 0.09), M.plaster);
  backWall.position.set(0, FLOOR_Y + 1.31, -2.84);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.62, 5.6), M.plaster);
  leftWall.position.set(-4.44, FLOOR_Y + 1.31, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  // interior wall posts and rails
  for (const x of [-2.2, 0, 2.2]) {
    addBox(frameDark, 0.11, 2.55, 0.1, x, FLOOR_Y + 1.28, -2.77);
  }
  for (const z of [-1.4, 0, 1.4]) {
    addBox(frameDark, 0.1, 2.55, 0.11, -4.37, FLOOR_Y + 1.28, z);
  }
  for (const y of [1.52, 2.5, 3.5]) {
    addBox(frameWarm, 8.55, 0.06, 0.075, 0, y, -2.77);
    addBox(frameWarm, 0.075, 0.06, 5.35, -4.37, y, 0);
  }
  addBox(frameDark, 8.6, 0.15, 0.09, 0, FLOOR_Y + 0.08, -2.77);
  addBox(frameDark, 0.09, 0.15, 5.4, -4.37, FLOOR_Y + 0.08, 0);

  /* --- ceiling --- */
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.09, 5.7), M.woodDark);
  ceiling.position.set(0, 3.84, 0);
  ceiling.receiveShadow = true;
  group.add(ceiling);
  for (let i = 0; i < 5; i++) {
    addBox(frameDark, 0.13, 0.17, 5.6, -3.8 + i * 1.9, 3.74, 0);
  }
  for (let i = 0; i < 4; i++) {
    addBox(frameDark, 8.8, 0.1, 0.12, 0, 3.78, -2.1 + i * 1.4);
  }

  /* --- header / ranma --- */
  for (const y of [3.5, 3.86]) {
    addBox(frameDark, 8.95, y === 3.5 ? 0.11 : 0.08, 0.14, 0, y, 2.76);
    addBox(frameDark, 0.14, y === 3.5 ? 0.11 : 0.08, 5.7, 4.46, y, 0);
  }
  addBox(frameWarm, 8.7, 0.055, 0.055, 0, 1.35, 2.76);
  addBox(frameWarm, 0.055, 0.055, 5.4, 4.46, 1.35, 0);
  // ranma slats
  for (let i = 0; i < 40; i++) {
    const x = -4.25 + i * 0.218;
    addBox(frameDark, 0.035, 0.28, 0.04, x, 3.68, 2.77);
  }
  for (let i = 0; i < 26; i++) {
    const z = -2.65 + i * 0.212;
    addBox(frameDark, 0.04, 0.28, 0.035, 4.47, 3.68, z);
  }

  /* --- exterior eave posts --- */
  // deck outer posts already in frame; add stone bases
  for (const [x, z] of [
    [-5.2, 4.15],
    [5.7, 4.15],
    [5.7, -2.8],
  ]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.28), M.stoneWetDark);
    block.position.set(x, DECK_Y + 0.02, z);
    block.castShadow = true;
    group.add(block);
  }

  /* --- shoji --- */
  const shojiFront = buildShojiSet(
    {
      position: new THREE.Vector3(0, FLOOR_Y + 0.02, 2.74),
      count: 4,
      panelWidth: 2.2,
      panelHeight: 2.12,
      closed: [-3.3, -1.1, 1.1, 3.3],
      open: [-3.32, -3.25, 3.25, 3.32],
      tracks: [0, 0.045, 0.045, 0],
      defaultOpen: 1,
      rotationY: 0,
    },
    M
  );
  group.add(shojiFront.group);

  const shojiRight = buildShojiSet(
    {
      position: new THREE.Vector3(4.47, FLOOR_Y + 0.02, 0),
      count: 3,
      panelWidth: 1.86,
      panelHeight: 2.12,
      closed: [1.86, 0, -1.86],
      open: [1.9, 1.93, 1.96],
      tracks: [0, 0.045, 0.09],
      defaultOpen: 1,
      rotationY: Math.PI / 2,
    },
    M
  );
  group.add(shojiRight.group);

  /* --- roof --- */
  buildRoof(M, group, snowDetail);
  const snowDetailMesh = new THREE.Mesh(mergeList(snowDetail), M.snowSoft);
  snowDetailMesh.castShadow = true;
  snowDetailMesh.receiveShadow = true;
  group.add(snowDetailMesh);

  /* --- interior --- */
  group.add(buildTatami(M));
  group.add(buildKotatsu(M, tex));
  group.add(buildBookshelf(M));
  group.add(buildYukataRack(M));
  group.add(buildScroll(M, tex));
  group.add(buildChair(M));
  group.add(buildChairSideTable(M));

  const irori = buildIrori(M, tex, group);
  group.add(irori.group);

  // pendant lamp above the tea table
  const pendant = new THREE.Group();
  pendant.position.set(-1.35, 3.55, 0.35);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), M.iron);
  cord.position.y = 0.22;
  pendant.add(cord);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.34, 14, 1, true), M.lanternPaper);
  shade.position.y = 0;
  pendant.add(shade);
  const shadeTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), M.woodDeep);
  shadeTop.position.y = 0.18;
  pendant.add(shadeTop);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.paperLampTop);
  bulb.position.y = -0.03;
  pendant.add(bulb);
  group.add(pendant);

  // interior light
  const interiorLight = new THREE.PointLight(0xffb26c, 22, 9.5, 2);
  interiorLight.position.set(-0.7, 3.0, 0.2);
  group.add(interiorLight);

  /* --- hanging paper lanterns --- */
  const lanternPositions = [
    new THREE.Vector3(-2.6, 2.72, 3.98),
    new THREE.Vector3(1.85, 2.72, 3.98),
  ];
  for (const p of lanternPositions) {
    group.add(buildLantern(M, tex, p, lanternGlows, lanternLights));
  }
  for (const l of lanternLights) group.add(l);
  const lanternLight = new THREE.PointLight(0xff9d52, 8, 8.5, 2);
  lanternLight.position.set(-0.4, 3.1, 3.5);
  group.add(lanternLight);

  /* --- final merged framing --- */
  const darkMesh = meshFrom(frameDark, M.woodDark);
  darkMesh.castShadow = true;
  darkMesh.receiveShadow = true;
  attachEdges(darkMesh, { threshold: 30, opacity: 0.25, color: 0x201a15 });
  group.add(darkMesh);

  const warmMesh = meshFrom(frameWarm, M.woodBeam);
  warmMesh.castShadow = true;
  warmMesh.receiveShadow = true;
  attachEdges(warmMesh, { threshold: 30, opacity: 0.18, color: 0x201a15 });
  group.add(warmMesh);

  /* --- entrance step & stone --- */
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.62), M.deck);
  step.position.set(2.75, DECK_Y - 0.32, 4.6);
  step.castShadow = true;
  step.receiveShadow = true;
  group.add(step);
  const stepStone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.2, 9), M.stoneWetDark);
  stepStone.position.set(2.75, 0.25, 5.35);
  stepStone.scale.set(1.45, 1, 0.85);
  stepStone.rotation.y = 0.2;
  stepStone.castShadow = true;
  stepStone.receiveShadow = true;
  group.add(stepStone);

  // snow on the step
  const stepSnow = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), M.snowSoft);
  stepSnow.scale.set(0.55, 0.06, 0.16);
  stepSnow.position.set(2.75, DECK_Y - 0.25, 4.4);
  group.add(stepSnow);

  /* --- ambient update --- */
  const state = {
    group,
    shojiFront,
    shojiRight,
    fire: irori.fire,
    irori,
    interiorLight,
    lanternLight,
    lanternLights,
    lanternGlows,
    update(dt, elapsed) {
      shojiFront.update(dt);
      shojiRight.update(dt);
      irori.fire.update(dt, elapsed);
    },
    toggleShoji() {
      shojiFront.toggle();
      shojiRight.toggle();
    },
  };

  // make all shoji hit meshes point at the house state
  for (const side of [shojiFront, shojiRight]) {
    for (const p of side.panels) {
      for (const m of p.userData.panelMeshes) m.userData.houseShoji = side;
    }
  }
  // add hit data for the hearth
  irori.hit.userData.hearth = state;

  return state;
}
