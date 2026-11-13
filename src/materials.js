import * as THREE from 'three';
import { dataTexture, radialTexture } from './utils.js';

export const TOON_RAMP = dataTexture(
  [0.3, 0.42, 0.58, 0.72, 0.86, 0.95, 1.0],
  7
);

const RIM_PATCH = `
  vec3 rimViewDir = normalize( vViewPosition );
  float rimTerm = pow( 1.0 - saturate( dot( normal, rimViewDir ) ), uRimPower );
  outgoingLight += uRimColor * rimTerm * uRimStrength;
`;

export function toonMaterial(options = {}) {
  const {
    color = 0xffffff,
    map = null,
    gradientMap = TOON_RAMP,
    emissive = 0x000000,
    emissiveMap = null,
    emissiveIntensity = 1,
    vertexColors = false,
    flatShading = false,
    side = THREE.FrontSide,
    transparent = false,
    opacity = 1,
    depthWrite = true,
    alphaTest = 0,
    rimColor = 0xaec5e2,
    rimStrength = 0,
    rimPower = 2.6,
    toneMapped = true,
  } = options;

  const material = new THREE.MeshToonMaterial({
    color,
    map,
    gradientMap,
    emissive,
    emissiveMap,
    emissiveIntensity,
    vertexColors,
    flatShading,
    side,
    transparent,
    opacity,
    depthWrite,
    alphaTest,
    toneMapped,
  });

  material.userData.rimUniforms = null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.uniforms.uRimPower = { value: rimPower };
    material.userData.rimUniforms = shader.uniforms;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec3 uRimColor;
      uniform float uRimStrength;
      uniform float uRimPower;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
      ${RIM_PATCH}`
    );
  };
  return material;
}

export function attachEdges(
  mesh,
  { threshold = 28, color = 0x252b35, opacity = 0.28, depthTest = true } = {}
) {
  const geo = new THREE.EdgesGeometry(mesh.geometry, threshold);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.raycast = () => {};
  lines.renderOrder = 3;
  lines.scale.setScalar(1.0007);
  mesh.add(lines);
  return lines;
}

export function softShadowMaterial(opacity = 0.3, color = 0x2b3038) {
  const tex = radialTexture(128, [
    [0, 'rgba(255,255,255,0.95)'],
    [0.45, 'rgba(255,255,255,0.5)'],
    [0.78, 'rgba(255,255,255,0.12)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  return new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

export function buildMaterials(tex) {
  const cloneTex = (t, rx = 1, ry = 1) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };

  const baseWoodTex = cloneTex(tex.wood, 2.4, 1.4);
  const beamWoodTex = cloneTex(tex.wood, 1.1, 1.0);
  const deckTex = cloneTex(tex.deck, 1.7, 1.7);
  const plasterTex = cloneTex(tex.washi, 1.2, 1.2);
  const shojiTex = tex.shoji;
  const barkTex = cloneTex(tex.wood, 0.8, 3.0);

  const M = {};

  M.woodBase = toonMaterial({
    color: 0x77593e,
    map: baseWoodTex,
    rimColor: 0xe3c49a,
    rimStrength: 0.055,
    rimPower: 3.2,
  });
  M.woodBeam = toonMaterial({
    color: 0x684b32,
    map: beamWoodTex,
    rimColor: 0xe1c096,
    rimStrength: 0.06,
  });
  M.woodDark = toonMaterial({
    color: 0x3e2c1f,
    map: beamWoodTex,
    rimColor: 0xa98d68,
    rimStrength: 0.07,
  });
  M.woodDeep = toonMaterial({
    color: 0x281e16,
    map: beamWoodTex,
    rimColor: 0x8d7354,
    rimStrength: 0.05,
  });
  M.woodLight = toonMaterial({
    color: 0xab7f53,
    map: beamWoodTex,
    rimColor: 0xf0d5ab,
    rimStrength: 0.05,
  });
  M.woodPale = toonMaterial({
    color: 0xbf9c70,
    map: beamWoodTex,
    rimColor: 0xf3dfbd,
    rimStrength: 0.04,
  });
  M.deck = toonMaterial({
    color: 0x94704b,
    map: deckTex,
    rimColor: 0xedd0a6,
    rimStrength: 0.045,
  });
  M.plaster = toonMaterial({
    color: 0xe6dccb,
    map: plasterTex,
    rimColor: 0xb9cede,
    rimStrength: 0.14,
    rimPower: 2.4,
  });
  M.plasterShade = toonMaterial({
    color: 0xd3c7b3,
    map: plasterTex,
    rimColor: 0xa9bfd0,
    rimStrength: 0.1,
  });
  M.tatami = toonMaterial({
    color: 0xffffff,
    map: tex.tatami,
    rimColor: 0xd6d1a8,
    rimStrength: 0.03,
  });
  M.tatamiEdge = toonMaterial({
    color: 0x3e4a35,
    rimColor: 0x7d8863,
    rimStrength: 0.05,
  });
  M.roofTile = toonMaterial({
    color: 0xffffff,
    map: tex.tile,
    rimColor: 0x9fb3c4,
    rimStrength: 0.18,
    rimPower: 2.2,
  });
  M.roofTileDark = toonMaterial({
    color: 0x6c7b84,
    rimColor: 0x9fb3c4,
    rimStrength: 0.12,
  });
  M.snow = toonMaterial({
    color: 0xf3f6fa,
    rimColor: 0xdcecff,
    rimStrength: 0.3,
    rimPower: 2.2,
  });
  M.snowTerrain = toonMaterial({
    color: 0xffffff,
    vertexColors: true,
    rimColor: 0xa9c8e6,
    rimStrength: 0.24,
    rimPower: 2.0,
    flatShading: false,
  });
  M.snowSoft = toonMaterial({
    color: 0xf8fafc,
    rimColor: 0xeaf6ff,
    rimStrength: 0.18,
    rimPower: 2.4,
  });
  M.bark = toonMaterial({
    color: 0x7b654e,
    map: barkTex,
    rimColor: 0xd0b48b,
    rimStrength: 0.24,
    rimPower: 2.1,
  });
  M.barkDark = toonMaterial({
    color: 0x5e4c3a,
    map: barkTex,
    rimColor: 0xb69872,
    rimStrength: 0.22,
    rimPower: 2.1,
  });
  M.pine = toonMaterial({
    color: 0x3d5541,
    rimColor: 0x8ea88d,
    rimStrength: 0.18,
    rimPower: 2.4,
  });
  M.pineDark = toonMaterial({
    color: 0x2f4435,
    rimColor: 0x7d9880,
    rimStrength: 0.15,
  });
  M.shoji = toonMaterial({
    color: 0xf4e7d0,
    map: shojiTex,
    emissive: 0xffb768,
    emissiveMap: shojiTex,
    emissiveIntensity: 0.08,
    rimColor: 0xffe1b5,
    rimStrength: 0.1,
    side: THREE.DoubleSide,
  });
  M.shojiBack = toonMaterial({
    color: 0xf0e2ca,
    map: shojiTex,
    emissive: 0xffb768,
    emissiveMap: shojiTex,
    emissiveIntensity: 0.22,
    rimColor: 0xffe1b5,
    rimStrength: 0.05,
  });
  M.lanternPaper = toonMaterial({
    color: 0xf6e2be,
    map: tex.washi,
    emissive: 0xffb256,
    emissiveMap: tex.washi,
    emissiveIntensity: 1.0,
    rimColor: 0xffd79d,
    rimStrength: 0.08,
  });
  M.andonPaper = toonMaterial({
    color: 0xf5e6c8,
    map: tex.washi,
    emissive: 0xffb45e,
    emissiveMap: tex.washi,
    emissiveIntensity: 1.0,
    rimColor: 0xffd79d,
    rimStrength: 0.08,
    side: THREE.DoubleSide,
  });
  M.cloth = toonMaterial({
    color: 0xffffff,
    map: tex.cloth,
    rimColor: 0xf7eddc,
    rimStrength: 0.08,
    side: THREE.DoubleSide,
  });
  M.indigoWaves = toonMaterial({
    color: 0xffffff,
    map: tex.indigoWaves,
    rimColor: 0x8ea6c9,
    rimStrength: 0.16,
    side: THREE.DoubleSide,
  });
  M.indigoHemp = toonMaterial({
    color: 0xffffff,
    map: tex.indigoHemp,
    rimColor: 0x8ea6c9,
    rimStrength: 0.16,
    side: THREE.DoubleSide,
  });
  M.indigoFlower = toonMaterial({
    color: 0xffffff,
    map: tex.indigoFlower,
    rimColor: 0x8ea6c9,
    rimStrength: 0.16,
    side: THREE.DoubleSide,
  });
  M.towel = toonMaterial({
    color: 0xf1eadf,
    map: tex.cloth,
    rimColor: 0xffffff,
    rimStrength: 0.08,
    side: THREE.DoubleSide,
  });
  M.ceramic = toonMaterial({
    color: 0xded5c4,
    rimColor: 0xffffff,
    rimStrength: 0.25,
    rimPower: 1.8,
  });
  M.celadon = toonMaterial({
    color: 0x9fb2a0,
    rimColor: 0xe2f2e2,
    rimStrength: 0.28,
    rimPower: 1.8,
  });
  M.ceramicDark = toonMaterial({
    color: 0x6d5f52,
    rimColor: 0xcbbbaa,
    rimStrength: 0.2,
    rimPower: 1.8,
  });
  M.iron = new THREE.MeshStandardMaterial({
    color: 0x2c2c2e,
    roughness: 0.52,
    metalness: 0.55,
  });
  M.brass = new THREE.MeshStandardMaterial({
    color: 0x9a7a45,
    roughness: 0.42,
    metalness: 0.55,
  });
  M.brassSoft = toonMaterial({
    color: 0xb08b50,
    rimColor: 0xffe2a4,
    rimStrength: 0.35,
    rimPower: 1.7,
  });
  M.stone = toonMaterial({
    color: 0xe0ddd7,
    vertexColors: true,
    flatShading: false,
    rimColor: 0x9fb8c6,
    rimStrength: 0.16,
    rimPower: 2.1,
  });
  M.stoneWet = new THREE.MeshStandardMaterial({
    color: 0x9aa19c,
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.04,
  });
  M.stoneWetDark = new THREE.MeshStandardMaterial({
    color: 0x3e4345,
    roughness: 0.26,
    metalness: 0.04,
  });
  M.gravel = toonMaterial({
    color: 0x777b7c,
    rimColor: 0xb3c3cb,
    rimStrength: 0.1,
  });
  M.grass = toonMaterial({
    color: 0x8a7a55,
    rimColor: 0xd8c9a5,
    rimStrength: 0.12,
    side: THREE.DoubleSide,
  });
  M.soil = toonMaterial({
    color: 0x4a4239,
    rimColor: 0x7f7464,
    rimStrength: 0.05,
  });
  M.ash = toonMaterial({
    color: 0x8d8b83,
    rimColor: 0xc9c6bb,
    rimStrength: 0.08,
  });
  M.charcoal = toonMaterial({
    color: 0x27262a,
    rimColor: 0x6c6a70,
    rimStrength: 0.18,
    flatShading: true,
  });
  M.ember = toonMaterial({
    color: 0x2b201b,
    emissive: 0xff6a22,
    emissiveIntensity: 1.3,
    rimColor: 0xffb060,
    rimStrength: 0.2,
    flatShading: true,
  });
  M.page = toonMaterial({
    color: 0xf0e7d4,
    rimColor: 0xffffff,
    rimStrength: 0.04,
  });
  M.paperLampTop = toonMaterial({
    color: 0xfff2d8,
    emissive: 0xffc071,
    emissiveIntensity: 0.45,
    rimColor: 0xffe6b8,
    rimStrength: 0.12,
  });
  M.bamboo = toonMaterial({
    color: 0x8d9464,
    map: cloneTex(tex.wood, 0.4, 2.0),
    rimColor: 0xcfd3a2,
    rimStrength: 0.12,
  });
  M.bambooDark = toonMaterial({
    color: 0x5f6746,
    rimColor: 0xa9b087,
    rimStrength: 0.1,
  });
  M.waterStone = toonMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    rimColor: 0x9cb7c4,
    rimStrength: 0.1,
  });
  M.dango = toonMaterial({
    color: 0xf0dcc0,
    rimColor: 0xfff6e4,
    rimStrength: 0.15,
    rimPower: 1.8,
  });
  M.dangoPink = toonMaterial({
    color: 0xe8c0b4,
    rimColor: 0xfff0e8,
    rimStrength: 0.15,
    rimPower: 1.8,
  });
  M.dangoGreen = toonMaterial({
    color: 0xb9c9a0,
    rimColor: 0xf4ffe2,
    rimStrength: 0.15,
    rimPower: 1.8,
  });
  M.mikan = toonMaterial({
    color: 0xe0a045,
    rimColor: 0xffdca2,
    rimStrength: 0.22,
    rimPower: 1.8,
  });
  M.bookA = toonMaterial({ color: 0x455c7d, rimStrength: 0.08 });
  M.bookB = toonMaterial({ color: 0x8a6b4c, rimStrength: 0.08 });
  M.bookC = toonMaterial({ color: 0x9aa58d, rimStrength: 0.08 });
  M.bookD = toonMaterial({ color: 0x9c5e4c, rimStrength: 0.08 });

  M.ink = new THREE.LineBasicMaterial({
    color: 0x252b35,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  return M;
}
