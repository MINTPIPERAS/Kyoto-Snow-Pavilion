import * as THREE from 'three';
import { makeRandom } from '../utils.js';

const VOLUME_X = 54;
const VOLUME_Z = 50;
const TOP = 25;
const HEIGHT = 28;

function makeLayer({ count, tex, sizeMin, sizeMax, speedMin, speedMax, alpha, pixelRatio }) {
  const rand = makeRandom(1700 + count);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const alphas = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand.range(-VOLUME_X / 2, VOLUME_X / 2);
    positions[i * 3 + 1] = rand.range(0, HEIGHT);
    positions[i * 3 + 2] = rand.range(-VOLUME_Z / 2, VOLUME_Z / 2);
    sizes[i] = rand.range(sizeMin, sizeMax);
    speeds[i] = rand.range(speedMin, speedMax);
    phases[i] = rand.range(0, Math.PI * 2);
    alphas[i] = alpha * rand.range(0.65, 1.0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
      uColor: { value: new THREE.Color(0xf2f6fb) },
      uPixelRatio: { value: pixelRatio },
      uHeight: { value: HEIGHT },
      uTop: { value: TOP },
      uWind: { value: 0.55 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aSpeed;
      attribute float aPhase;
      attribute float aAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uHeight;
      uniform float uTop;
      uniform float uWind;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float fall = mod(p.y - uTime * aSpeed, uHeight);
        float y = uTop - fall;
        float sway = sin(uTime * 0.42 + aPhase) * 0.9 + sin(uTime * 0.13 + aPhase * 2.1) * 0.5;
        p.x += sway + fall * uWind * 0.09;
        p.z += cos(uTime * 0.31 + aPhase * 1.4) * 0.5;
        p.y = y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = min(aSize * uPixelRatio * (330.0 / max(1.0, -mv.z)), 82.0 * uPixelRatio);
        gl_Position = projectionMatrix * mv;
        float edgeFade = smoothstep(-1.0, 2.0, y) * smoothstep(uTop + 2.0, uTop - 7.0, y);
        vAlpha = aAlpha * edgeFade;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        float a = t.a * vAlpha * uOpacity;
        if (a < 0.005) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, mat, uniforms: mat.uniforms };
}

export function buildSnowfall(tex, pixelRatio = 1) {
  const group = new THREE.Group();
  group.name = 'snowfall';

  const far = makeLayer({
    count: 2400,
    tex: tex.snowflake,
    sizeMin: 0.16,
    sizeMax: 0.33,
    speedMin: 0.6,
    speedMax: 1.2,
    alpha: 0.58,
    pixelRatio,
  });
  const mid = makeLayer({
    count: 1200,
    tex: tex.snowflake,
    sizeMin: 0.32,
    sizeMax: 0.7,
    speedMin: 0.9,
    speedMax: 1.8,
    alpha: 0.5,
    pixelRatio,
  });
  const near = makeLayer({
    count: 170,
    tex: tex.snowflake,
    sizeMin: 1.3,
    sizeMax: 2.6,
    speedMin: 1.3,
    speedMax: 2.4,
    alpha: 0.26,
    pixelRatio,
  });
  group.add(far.points, mid.points, near.points);

  const layers = [far, mid, near];
  const api = {
    group,
    layers,
    setPixelRatio(ratio) {
      layers.forEach((l) => (l.uniforms.uPixelRatio.value = ratio));
    },
    setTint(color, opacity = 1) {
      layers.forEach((l) => {
        l.uniforms.uColor.value.copy(color);
        l.uniforms.uOpacity.value = opacity;
      });
    },
    update(dt, elapsed) {
      layers.forEach((l) => {
        l.uniforms.uTime.value = elapsed;
      });
    },
  };
  return api;
}
