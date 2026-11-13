import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildTextures } from './textures.js';
import { buildMaterials } from './materials.js';
import { buildBase } from './world/base.js';
import { buildTrees } from './world/trees.js';
import { buildHouse } from './world/house.js';
import { buildOnsen } from './world/onsen.js';
import { buildBackdrop } from './world/backdrop.js';
import { buildSnowfall } from './effects/snowfall.js';
import { SnowBurstSystem } from './effects/snowburst.js';
import { FootprintSystem } from './effects/footprints.js';
import { Interactions } from './interactions.js';
import { TimeCycle } from './time.js';
import { clamp } from './utils.js';

/* ------------------------------------------------------------------ */
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2d374b);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.5,
  100
);
const HOME_POS = new THREE.Vector3(17.6, 13.0, 26.4);
const HOME_TARGET = new THREE.Vector3(0, 2.6, 0.7);
camera.position.copy(HOME_POS);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.6;
controls.panSpeed = 0.55;
controls.zoomSpeed = 0.75;
controls.minDistance = 19;
controls.maxDistance = 37;
controls.minPolarAngle = 0.8;
controls.maxPolarAngle = 1.3;
controls.minAzimuthAngle = -1.35;
controls.maxAzimuthAngle = 1.7;

/* ------------------------------------------------------------------ */
/*  Lights                                                             */
/* ------------------------------------------------------------------ */

const hemi = new THREE.HemisphereLight(0xaaa2c8, 0x6a4a3e, 0.62);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xf2a259, 3.1);
key.position.set(-14, 5.6, 9);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -18;
key.shadow.camera.right = 18;
key.shadow.camera.top = 18;
key.shadow.camera.bottom = -18;
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.045;
scene.add(key);
scene.add(key.target);
key.target.position.set(0, 1.2, 0);

const fill = new THREE.DirectionalLight(0x6973b5, 0.82);
fill.position.set(13, 7.5, 16);
scene.add(fill);

/* ------------------------------------------------------------------ */
/*  World                                                              */
/* ------------------------------------------------------------------ */

const tex = buildTextures();
const M = buildMaterials(tex);

const world = buildBase(M, tex);
scene.add(world.group);

const forest = buildTrees(world, M);
scene.add(forest.group);

const house = buildHouse(M, tex);
scene.add(house.group);

const onsen = buildOnsen(M, tex, world);
scene.add(onsen.group);

const backdrop = buildBackdrop(M, tex);
scene.add(backdrop.group);

const snow = buildSnowfall(tex, renderer.getPixelRatio());
scene.add(snow.group);

const snowBurst = new SnowBurstSystem(tex, { pixelRatio: renderer.getPixelRatio() });
scene.add(snowBurst.points);
const footprints = new FootprintSystem(tex);
scene.add(footprints.group);
const snowTint = new THREE.Color();
const snowWarm = new THREE.Color(0xffeed7);
const snowCool = new THREE.Color(0xd3e0f4);
const snowBase = new THREE.Color(0xf4f8fc);

/* ------------------------------------------------------------------ */
/*  Time of day                                                        */
/* ------------------------------------------------------------------ */

const timeCycle = new TimeCycle({
  renderer,
  scene,
  key,
  fill,
  hemi,
  M,
  house,
  onsen,
  backdrop,
});

const slider = document.querySelector('#timeSlider');
const clockValue = document.querySelector('#clockValue');
const phaseName = document.querySelector('#phaseName');
const presets = [...document.querySelectorAll('.presets button')];

let shownPhase = '';
let shownTheme = '';
let lastClockText = '';

function syncUIToTime(current, target) {
  const h = Math.floor(current);
  const m = Math.floor((current - h) * 60);
  const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (text !== lastClockText) {
    lastClockText = text;
    clockValue.textContent = text;
  }
  const phase = timeCycle.getPhaseName(current);
  if (phase !== shownPhase) {
    shownPhase = phase;
    phaseName.textContent = phase;
  }
  presets.forEach((p) => {
    p.classList.toggle('active', Math.abs(Number(p.dataset.time) - target) < 0.2);
  });
}

timeCycle.onChange = (t, ui) => {
  if (ui === shownTheme) return;
  shownTheme = ui;
  document.body.classList.remove('ui-dawn', 'ui-dusk', 'ui-night');
  document.body.classList.add(ui);
};

const initialSample = timeCycle.sample(18);
const initialUI = initialSample.f < 0.5 ? initialSample.a.ui : initialSample.b.ui;
shownTheme = initialUI;
document.body.classList.add(initialUI);

slider.addEventListener('input', () => {
  timeCycle.setTarget(Number(slider.value));
});

presets.forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = Number(btn.dataset.time);
    timeCycle.setTarget(t);
    slider.value = String(t);
  });
});

document.querySelector('#resetView').addEventListener('click', () => {
  camera.position.copy(HOME_POS);
  controls.target.copy(HOME_TARGET);
  controls.update();
});

syncUIToTime(18, 18);

/* ------------------------------------------------------------------ */
/*  Resize / loop                                                      */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  snow.setPixelRatio(renderer.getPixelRatio());
  snowBurst.setPixelRatio(renderer.getPixelRatio());
});

const toastEl = document.querySelector('#toast');
const onsenLabelEl = document.querySelector('#onsenLabel');
const leaveButtonEl = document.querySelector('#leaveOnsen');

const interactions = new Interactions({
  renderer,
  camera,
  controls,
  scene,
  world,
  forest,
  house,
  onsen,
  snowBurst,
  footprints,
  toastEl,
  onsenLabel: onsenLabelEl,
  leaveButton: leaveButtonEl,
  M,
});

const clock = new THREE.Clock();
let elapsed = 0;
let frame = 0;
let lastShadowTime = 18;

function refreshSnowTint() {
  snowTint
    .copy(snowBase)
    .lerp(snowWarm, timeCycle.duskFactor * 0.65)
    .lerp(snowCool, timeCycle.nightFactor * 0.55);
  snow.setTint(snowTint, 0.9 + timeCycle.nightFactor * 0.1);
}

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  if (controls.enabled) {
    controls.update();
    controls.target.x = clamp(controls.target.x, -2.5, 2.5);
    controls.target.z = clamp(controls.target.z, -2.5, 2.5);
    controls.target.y = clamp(controls.target.y, 1.2, 4.4);
  }
  timeCycle.tick(dt);
  house.update(dt, elapsed);
  onsen.update(dt, elapsed);
  backdrop.update(dt, elapsed);
  snow.update(dt, elapsed);
  interactions.update(dt);
  refreshSnowTint();
  syncUIToTime(timeCycle.current, timeCycle.target);

  if (
    Math.abs(timeCycle.current - lastShadowTime) > 0.004 ||
    interactions.shadowDirty
  ) {
    renderer.shadowMap.needsUpdate = true;
    lastShadowTime = timeCycle.current;
    interactions.shadowDirty = false;
  }

  renderer.render(scene, camera);
  frame++;
}

renderer.setAnimationLoop(tick);

setTimeout(() => document.body.classList.remove('is-loading'), 360);
requestAnimationFrame(() => document.body.classList.remove('is-loading'));

// A deterministic frame helper used for art checks and camera handoff.
function setTheme(ui) {
  document.body.classList.remove('ui-dawn', 'ui-dusk', 'ui-night');
  if (ui) document.body.classList.add(ui);
}

function freezeFrame(time = 18, pos = null, target = null, fov = 38) {
  renderer.setAnimationLoop(null);
  if (pos) {
    if (Array.isArray(pos)) camera.position.set(pos[0], pos[1], pos[2]);
    else camera.position.copy(pos);
  }
  if (target) {
    if (Array.isArray(target)) controls.target.set(target[0], target[1], target[2]);
    else controls.target.copy(target);
  }
  camera.fov = fov;
  camera.updateProjectionMatrix();
  controls.update();
  timeCycle.current = time;
  timeCycle.target = time;
  timeCycle.apply(time);
  const sample = timeCycle.sample(time);
  setTheme(sample.f < 0.5 ? sample.a.ui : sample.b.ui);
  syncUIToTime(time, time);
  refreshSnowTint();
  house.update(0.016, 9);
  onsen.update(0.016, 9);
  backdrop.update(0.016, 9);
  snow.update(0.016, 9);
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

window.__app = {
  scene,
  camera,
  renderer,
  controls,
  M,
  tex,
  world,
  forest,
  house,
  onsen,
  backdrop,
  snow,
  snowBurst,
  footprints,
  interactions,
  timeCycle,
  freezeFrame,
  resume() {
    clock.getDelta();
    renderer.setAnimationLoop(tick);
  },
};
