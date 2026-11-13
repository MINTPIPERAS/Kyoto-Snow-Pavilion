import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './utils.js';

/*
  A hand-tuned day: grey-blue dawn, golden dusk with violet snow shadows,
  and ink-blue night warmed by paper lanterns.
*/

const K = [
  {
    t: 0,
    key: { c: 0x8fa9dc, i: 0.7, p: [9, 16, -5] },
    fill: { c: 0x44587d, i: 0.55, p: [13, 9, 12] },
    hemi: { sky: 0x39496c, ground: 0x24212b, i: 0.5 },
    exposure: 0.98,
    wall: 0x2b3346,
    window: {
      top: 0x1e2c46, bottom: 0x4b5b73, far: 0x5c6c7d, near: 0x354555,
      mist: 0x5a6779, orb: 0xe6efff, orbAmt: 0.9, orbPos: [0.72, 0.66],
    },
    spill: 0.2,
    curtain: { light: 0x8a8fa4, shadow: 0x4d556b, opacity: 0.3 },
    byobu: 0x5e5b55,
    water: {
      deep: 0x0f2531, shallow: 0x2a4a54, sky: 0x5c7694, warm: 0xffb266,
      foam: 0xc6d6dd, light: [0.45, 0.75, -0.5],
    },
    steam: 0xffe3c0,
    lantern: 3.4,
    shoji: 0.95,
    interior: 30,
    fireAmbient: 1.3,
    pool: 14,
    andon: 8,
    night: 1,
    dusk: 0,
    dawn: 0,
    ui: 'ui-night',
    phase: '雪夜',
  },
  {
    t: 4.8,
    key: { c: 0x849bc9, i: 0.65, p: [10, 15, 2] },
    fill: { c: 0x4b5c80, i: 0.55, p: [14, 9, 14] },
    hemi: { sky: 0x465772, ground: 0x2e2b33, i: 0.5 },
    exposure: 0.99,
    wall: 0x3c465a,
    window: {
      top: 0x33415b, bottom: 0x7b7f88, far: 0x697888, near: 0x445262,
      mist: 0x6d7480, orb: 0xffe7c4, orbAmt: 0.4, orbPos: [0.7, 0.61],
    },
    spill: 0.18,
    curtain: { light: 0x9a9aa9, shadow: 0x555b6f, opacity: 0.32 },
    byobu: 0x6b655d,
    water: {
      deep: 0x142e38, shallow: 0x3f5a60, sky: 0x6e8098, warm: 0xf2b573,
      foam: 0xd2dde0, light: [0.45, 0.75, -0.3],
    },
    steam: 0xffe8cb,
    lantern: 2.1,
    shoji: 0.6,
    interior: 22,
    fireAmbient: 1.1,
    pool: 10,
    andon: 5,
    night: 0.8,
    dusk: 0,
    dawn: 0.2,
    ui: 'ui-night',
    phase: '雪夜',
  },
  {
    t: 7,
    key: { c: 0xcfe2ec, i: 2.3, p: [12, 12, 11] },
    fill: { c: 0x839bbd, i: 0.7, p: [12, 8, 16] },
    hemi: { sky: 0xcfdae3, ground: 0x6f6258, i: 0.72 },
    exposure: 0.95,
    wall: 0xc9cec7,
    window: {
      top: 0xaebfc9, bottom: 0xf0e6d4, far: 0x8fa1a7, near: 0x667a82,
      mist: 0xe4e4da, orb: 0xfff3d8, orbAmt: 0.35, orbPos: [0.7, 0.58],
    },
    spill: 0.14,
    curtain: { light: 0xeee6d8, shadow: 0xb7b3b1, opacity: 0.26 },
    byobu: 0xcfc4ae,
    water: {
      deep: 0x2c5052, shallow: 0x789a93, sky: 0xc8d7d8, warm: 0xeec68c,
      foam: 0xe8f0f0, light: [-0.35, 0.8, 0.4],
    },
    steam: 0xf2f4ee,
    lantern: 0.55,
    shoji: 0.12,
    interior: 12,
    fireAmbient: 0.55,
    pool: 4,
    andon: 1.6,
    night: 0,
    dusk: 0,
    dawn: 1,
    ui: 'ui-dawn',
    phase: '朝雪',
  },
  {
    t: 11,
    key: { c: 0xf0ede2, i: 2.35, p: [-2, 19, 9] },
    fill: { c: 0xa7bbce, i: 0.85, p: [12, 9, 15] },
    hemi: { sky: 0xdde6e9, ground: 0x8e7963, i: 1.0 },
    exposure: 1.02,
    wall: 0xe2ddd1,
    window: {
      top: 0xb7c9d2, bottom: 0xf4ead6, far: 0x97a7aa, near: 0x6f8085,
      mist: 0xeae6da, orb: 0xfff7e6, orbAmt: 0.25, orbPos: [0.66, 0.62],
    },
    spill: 0.11,
    curtain: { light: 0xf1e8d8, shadow: 0xbdb8b2, opacity: 0.24 },
    byobu: 0xd8cdb7,
    water: {
      deep: 0x2f5453, shallow: 0x7ba099, sky: 0xd0dcdb, warm: 0xf3d19c,
      foam: 0xecf3f2, light: [-0.2, 0.9, 0.3],
    },
    steam: 0xf5f5ec,
    lantern: 0.2,
    shoji: 0.06,
    interior: 9,
    fireAmbient: 0.38,
    pool: 3,
    andon: 0.8,
    night: 0,
    dusk: 0,
    dawn: 0.5,
    ui: 'ui-dawn',
    phase: '晴雪',
  },
  {
    t: 16,
    key: { c: 0xf2c185, i: 3.2, p: [-11, 10, 9] },
    fill: { c: 0x6a73b0, i: 0.5, p: [13, 8, 15] },
    hemi: { sky: 0xa59fc6, ground: 0x66473f, i: 0.45 },
    exposure: 0.92,
    wall: 0xd2b79b,
    window: {
      top: 0x9d93ac, bottom: 0xf2cf9a, far: 0x8b818b, near: 0x646273,
      mist: 0xead0b5, orb: 0xffd292, orbAmt: 0.7, orbPos: [0.68, 0.6],
    },
    spill: 0.17,
    curtain: { light: 0xf0ddc6, shadow: 0xa79aa2, opacity: 0.28 },
    byobu: 0xd2bda0,
    water: {
      deep: 0x183a3d, shallow: 0x52746b, sky: 0xbfb09c, warm: 0xffb968,
      foam: 0xf0e6d5, light: [-0.7, 0.5, 0.4],
    },
    steam: 0xffeacd,
    lantern: 1.35,
    shoji: 0.34,
    interior: 20,
    fireAmbient: 0.8,
    pool: 8,
    andon: 3.6,
    night: 0.08,
    dusk: 0.55,
    dawn: 0,
    ui: 'ui-dusk',
    phase: '暮色',
  },
  {
    t: 18,
    key: { c: 0xffab5f, i: 4.2, p: [-14, 5.6, 9] },
    fill: { c: 0x5567a8, i: 0.36, p: [13, 7.5, 16] },
    hemi: { sky: 0x8d9bc7, ground: 0x52383e, i: 0.29 },
    exposure: 0.87,
    wall: 0xb9a188,
    window: {
      top: 0x837694, bottom: 0xf6c98b, far: 0x7d737f, near: 0x56556a,
      mist: 0xf0cfae, orb: 0xffcb90, orbAmt: 0.95, orbPos: [0.68, 0.58],
    },
    spill: 0.4,
    curtain: { light: 0xdfd4d0, shadow: 0x6f6b83, opacity: 0.55 },
    byobu: 0xac8f65,
    water: {
      deep: 0x0f3034, shallow: 0x3f625c, sky: 0x9fada6, warm: 0xffad58,
      foam: 0xeadfcc, light: [-0.8, 0.42, 0.4],
    },
    steam: 0xffe0ba,
    lantern: 2.8,
    shoji: 0.72,
    interior: 30,
    fireAmbient: 1.1,
    pool: 15,
    andon: 7,
    night: 0.22,
    dusk: 1,
    dawn: 0,
    ui: 'ui-dusk',
    phase: '暮色',
  },
  {
    t: 20,
    key: { c: 0xb297bb, i: 1.4, p: [-7, 9.5, 6] },
    fill: { c: 0x4e5982, i: 0.5, p: [12, 8, 14] },
    hemi: { sky: 0x5c5578, ground: 0x3a2c34, i: 0.4 },
    exposure: 0.9,
    wall: 0x5f5568,
    window: {
      top: 0x4b4b68, bottom: 0x9d7f76, far: 0x6e6a77, near: 0x4f4d60,
      mist: 0xa58d84, orb: 0xffd8a7, orbAmt: 0.5, orbPos: [0.7, 0.6],
    },
    spill: 0.2,
    curtain: { light: 0xb7a5a5, shadow: 0x6c6478, opacity: 0.32 },
    byobu: 0x8d7d6d,
    water: {
      deep: 0x1c343c, shallow: 0x4d686b, sky: 0x8d7d8d, warm: 0xf9b06b,
      foam: 0xdcd6cf, light: [-0.5, 0.6, 0.2],
    },
    steam: 0xf6d9bc,
    lantern: 3.2,
    shoji: 0.88,
    interior: 30,
    fireAmbient: 1.2,
    pool: 16,
    andon: 8,
    night: 0.7,
    dusk: 0.55,
    dawn: 0,
    ui: 'ui-night',
    phase: '雪夜',
  },
  {
    t: 22,
    key: { c: 0x93addf, i: 0.88, p: [9, 16, -7] },
    fill: { c: 0x435684, i: 0.38, p: [12, 9, 13] },
    hemi: { sky: 0x2c3e63, ground: 0x1c1922, i: 0.35 },
    exposure: 0.9,
    wall: 0x1f2738,
    window: {
      top: 0x18263f, bottom: 0x4b5d76, far: 0x56687a, near: 0x2c3b4b,
      mist: 0x4f5e73, orb: 0xe8f1ff, orbAmt: 0.98, orbPos: [0.72, 0.67],
    },
    spill: 0.24,
    curtain: { light: 0x8d93aa, shadow: 0x4b546a, opacity: 0.3 },
    byobu: 0x5f5c58,
    water: {
      deep: 0x0f2632, shallow: 0x294b55, sky: 0x5c7696, warm: 0xffb266,
      foam: 0xcbdbe1, light: [0.5, 0.75, -0.3],
    },
    steam: 0xffe4c2,
    lantern: 3.6,
    shoji: 1.0,
    interior: 38,
    fireAmbient: 1.5,
    pool: 18,
    andon: 10,
    night: 1,
    dusk: 0,
    dawn: 0,
    ui: 'ui-night',
    phase: '雪夜',
  },
  {
    t: 24,
    key: { c: 0x8fa9dc, i: 0.7, p: [9, 16, -5] },
    fill: { c: 0x44587d, i: 0.55, p: [13, 9, 12] },
    hemi: { sky: 0x39496c, ground: 0x24212b, i: 0.5 },
    exposure: 0.98,
    wall: 0x2b3346,
    window: {
      top: 0x1e2c46, bottom: 0x4b5b73, far: 0x5c6c7d, near: 0x354555,
      mist: 0x5a6779, orb: 0xe6efff, orbAmt: 0.9, orbPos: [0.72, 0.66],
    },
    spill: 0.2,
    curtain: { light: 0x8a8fa4, shadow: 0x4d556b, opacity: 0.3 },
    byobu: 0x5e5b55,
    water: {
      deep: 0x0f2531, shallow: 0x2a4a54, sky: 0x5c7694, warm: 0xffb266,
      foam: 0xc6d6dd, light: [0.45, 0.75, -0.5],
    },
    steam: 0xffe3c0,
    lantern: 3.4,
    shoji: 0.95,
    interior: 30,
    fireAmbient: 1.3,
    pool: 14,
    andon: 8,
    night: 1,
    dusk: 0,
    dawn: 0,
    ui: 'ui-night',
    phase: '雪夜',
  },
];

const palette = K.map((k) => ({
  ...k,
  _keyColor: new THREE.Color(k.key.c),
  _fillColor: new THREE.Color(k.fill.c),
  _hemiSky: new THREE.Color(k.hemi.sky),
  _hemiGround: new THREE.Color(k.hemi.ground),
  _wall: new THREE.Color(k.wall),
  _winTop: new THREE.Color(k.window.top),
  _winBottom: new THREE.Color(k.window.bottom),
  _winFar: new THREE.Color(k.window.far),
  _winNear: new THREE.Color(k.window.near),
  _winMist: new THREE.Color(k.window.mist),
  _winOrb: new THREE.Color(k.window.orb),
  _curtainLight: new THREE.Color(k.curtain.light),
  _curtainShadow: new THREE.Color(k.curtain.shadow),
  _byobu: new THREE.Color(k.byobu),
  _waterDeep: new THREE.Color(k.water.deep),
  _waterShallow: new THREE.Color(k.water.shallow),
  _waterSky: new THREE.Color(k.water.sky),
  _waterWarm: new THREE.Color(k.water.warm),
  _waterFoam: new THREE.Color(k.water.foam),
  _waterLight: new THREE.Vector3(...k.water.light).normalize(),
  _steam: new THREE.Color(k.steam),
}));

export class TimeCycle {
  constructor(refs) {
    this.refs = refs;
    this.target = 18;
    this.current = 18;
    this.nightFactor = 0;
    this.duskFactor = 1;
    this.ui = null;
    this.tmpColor = new THREE.Color();
    this.tmpColor2 = new THREE.Color();
    this.tmpColor3 = new THREE.Color();
    this.lightDir = new THREE.Vector3();
    this.onChange = null;
    this.apply(18);
  }

  setTarget(t, instant = false) {
    this.target = ((t % 24) + 24) % 24;
    if (instant) {
      this.current = this.target;
      this.apply(this.current);
    }
  }

  tick(dt) {
    // shortest direction around the clock
    let delta = this.target - this.current;
    if (delta > 12) delta -= 24;
    if (delta < -12) delta += 24;
    if (Math.abs(delta) < 0.005) {
      this.current = this.target;
    } else {
      this.current += delta * (1 - Math.exp(-3.2 * dt));
    }
    this.current = ((this.current % 24) + 24) % 24;
    this.apply(this.current);
  }

  sample(t) {
    const n = palette.length;
    let i = n - 1;
    for (let j = 0; j < n - 1; j++) {
      if (t >= palette[j].t && t <= palette[j + 1].t) {
        i = j;
        break;
      }
    }
    const a = palette[i];
    const b = palette[i + 1] || palette[n - 1];
    const span = Math.max(0.0001, b.t - a.t);
    let f = clamp((t - a.t) / span, 0, 1);
    f = f * f * (3 - 2 * f);
    return { a, b, f };
  }

  apply(t) {
    const refs = this.refs;
    const { a, b, f } = this.sample(t);
    const col = this.tmpColor;
    const col2 = this.tmpColor2;
    const lerpC = (ca, cb, out) => out.copy(ca).lerp(cb, f);
    const num = (x, y) => lerp(x, y, f);

    // main lights
    refs.key.color.copy(lerpC(a._keyColor, b._keyColor, col));
    refs.key.intensity = num(a.key.i, b.key.i);
    refs.key.position.set(
      num(a.key.p[0], b.key.p[0]),
      num(a.key.p[1], b.key.p[1]),
      num(a.key.p[2], b.key.p[2])
    );
    refs.fill.color.copy(lerpC(a._fillColor, b._fillColor, col));
    refs.fill.intensity = num(a.fill.i, b.fill.i);
    refs.fill.position.set(
      num(a.fill.p[0], b.fill.p[0]),
      num(a.fill.p[1], b.fill.p[1]),
      num(a.fill.p[2], b.fill.p[2])
    );
    refs.hemi.color.copy(lerpC(a._hemiSky, b._hemiSky, col));
    refs.hemi.groundColor.copy(lerpC(a._hemiGround, b._hemiGround, col));
    refs.hemi.intensity = num(a.hemi.i, b.hemi.i);
    refs.renderer.toneMappingExposure = num(a.exposure, b.exposure);
    refs.scene.background.copy(lerpC(a._wall, b._wall, col)).multiplyScalar(0.55);

    // washi wall, screen, curtains
    refs.backdrop.wallMat.color.copy(lerpC(a._wall, b._wall, col));
    refs.backdrop.panelMesh.material.color.copy(lerpC(a._byobu, b._byobu, col));
    const curtainLight = lerpC(a._curtainLight, b._curtainLight, col2);
    const curtainShadow = lerpC(
      a._curtainShadow,
      b._curtainShadow,
      this.tmpColor3
    );
    const curtainOpacity = num(a.curtain.opacity, b.curtain.opacity);
    for (const mat of refs.backdrop.curtainMats) {
      mat.uniforms.uColor.value.copy(curtainLight);
      mat.uniforms.uShadow.value.copy(curtainShadow);
      mat.uniforms.uOpacity.value = curtainOpacity;
    }
    for (let i = 0; i < refs.backdrop.hazeMats.length; i++) {
      refs.backdrop.hazeMats[i].color
        .copy(this.tmpColor.copy(a._winMist).lerp(b._winMist, f))
        .multiplyScalar(0.9);
    }
    refs.backdrop.spillMat.opacity = num(a.spill, b.spill);
    refs.backdrop.spillMat.color.copy(lerpC(a._winOrb, b._winOrb, col));
    refs.backdrop.forestMat.color.copy(lerpC(a._winFar, b._winFar, this.tmpColor3)).multiplyScalar(0.92);
    refs.backdrop.forestMat.opacity = 0.45 + num(a.spill, b.spill) * 1.0;
    refs.backdrop.forestMatNear.color.copy(lerpC(a._winNear, b._winNear, this.tmpColor3)).multiplyScalar(0.9);
    refs.backdrop.forestMatNear.opacity = 0.22 + num(a.spill, b.spill) * 0.4;
    refs.backdrop.forestWrapMat.color.copy(lerpC(a._winFar, b._winFar, this.tmpColor3)).multiplyScalar(0.82);
    refs.backdrop.forestWrapMat.opacity = 0.08 + num(a.spill, b.spill) * 0.2;

    // round window
    const wu = refs.backdrop.round.uniforms;
    wu.uSkyTop.value.copy(lerpC(a._winTop, b._winTop, col));
    wu.uSkyBottom.value.copy(lerpC(a._winBottom, b._winBottom, col));
    wu.uForestFarColor.value.copy(lerpC(a._winFar, b._winFar, col));
    wu.uForestNearColor.value.copy(lerpC(a._winNear, b._winNear, col));
    wu.uMist.value.copy(lerpC(a._winMist, b._winMist, col));
    wu.uOrbColor.value.copy(lerpC(a._winOrb, b._winOrb, col));
    wu.uOrbAmount.value = num(a.window.orbAmt, b.window.orbAmt);
    wu.uOrbPos.value.set(
      num(a.window.orbPos[0], b.window.orbPos[0]),
      num(a.window.orbPos[1], b.window.orbPos[1])
    );
    const night = num(a.night, b.night);
    wu.uNight.value = night;

    // water
    const w = refs.onsen.waterUniforms;
    w.uDeep.value.copy(lerpC(a._waterDeep, b._waterDeep, col));
    w.uShallow.value.copy(lerpC(a._waterShallow, b._waterShallow, col));
    w.uSky.value.copy(lerpC(a._waterSky, b._waterSky, col));
    w.uWarm.value.copy(lerpC(a._waterWarm, b._waterWarm, col));
    w.uFoam.value.copy(lerpC(a._waterFoam, b._waterFoam, col));
    w.uNight.value = night;
    this.lightDir.copy(a._waterLight).lerp(b._waterLight, f).normalize();
    w.uLightDir.value.copy(this.lightDir);

    // lamp & interior glow
    const lantern = num(a.lantern, b.lantern);
    refs.house.lanternLight.intensity = 4 + lantern * 3.0;
    for (const l of refs.house.lanternLights) l.intensity = lantern * 4.2;
    for (const g of refs.house.lanternGlows) g.material.opacity = 0.15 + lantern * 0.17;
    refs.house.interiorLight.intensity = num(a.interior, b.interior);
    refs.M.lanternPaper.emissiveIntensity = 0.2 + lantern * 0.3;
    refs.M.andonPaper.emissiveIntensity = 0.18 + lantern * 0.32;
    refs.M.paperLampTop.emissiveIntensity = 0.2 + lantern * 0.3;
    refs.M.shoji.emissiveIntensity = num(a.shoji, b.shoji);
    refs.M.shojiBack.emissiveIntensity = 0.18 + num(a.shoji, b.shoji) * 0.55;
    refs.house.fire.ambient = num(a.fireAmbient, b.fireAmbient);

    for (const l of refs.onsen.andonLights) l.intensity = num(a.andon, b.andon) * 0.75;
    refs.onsen.poolLight.intensity = num(a.pool, b.pool);
    for (const sprite of refs.onsen.steamSprites) {
      sprite.material.color.copy(lerpC(a._steam, b._steam, col));
    }

    this.nightFactor = night;
    this.duskFactor = num(a.dusk, b.dusk);
    this.dawnFactor = num(a.dawn, b.dawn);

    if (this.ui !== null) {
      const ui = f < 0.5 ? a.ui : b.ui;
      if (ui !== this.ui) {
        this.ui = ui;
        if (this.onChange) this.onChange(t, ui);
      }
    }
    return { a, b, f };
  }

  getPhaseName(t) {
    const { a, b, f } = this.sample(t);
    return f < 0.5 ? a.phase : b.phase;
  }
}
