import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRandom, glowTexture, TAU } from '../utils.js';
import { toonMaterial } from '../materials.js';

/*
  The diorama is staged like a painted theatre set:
  dyed washi wall -> huge round snow window -> low folding screen -> sheer side curtains
*/

const WALL_Z = -19.5;
const WINDOW_POS = new THREE.Vector3(7.0, 6.95, -18.8);
const WINDOW_RADIUS = 5.05;

function buildRoundWindow(tex) {
  const uniforms = {
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color(0xaebfcd) },
    uSkyBottom: { value: new THREE.Color(0xeee3d1) },
    uForestFarColor: { value: new THREE.Color(0x7d8e99) },
    uForestNearColor: { value: new THREE.Color(0x586975) },
    uMist: { value: new THREE.Color(0xe9e6db) },
    uOrbColor: { value: new THREE.Color(0xffe4b8) },
    uOrbAmount: { value: 0.2 },
    uOrbPos: { value: new THREE.Vector2(0.7, 0.63) },
    uNight: { value: 0 },
    uForestFar: { value: tex.forestFar },
    uForestNear: { value: tex.forestNear },
    uWashi: { value: tex.washi },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyBottom;
      uniform vec3 uForestFarColor;
      uniform vec3 uForestNearColor;
      uniform vec3 uMist;
      uniform vec3 uOrbColor;
      uniform float uOrbAmount;
      uniform vec2 uOrbPos;
      uniform float uNight;
      uniform sampler2D uForestFar;
      uniform sampler2D uForestNear;
      uniform sampler2D uWashi;
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
        vec2 uv = vUv;
        float t = uTime;

        // pale winter sky in the round window
        vec3 col = mix(uSkyBottom, uSkyTop, smoothstep(0.12, 0.95, uv.y));

        // soft sun / moon glow
        float od = distance(uv, uOrbPos);
        float orb = exp(-od * 18.0) * 0.6 + exp(-od * 4.5) * 0.14;
        col += uOrbColor * orb * uOrbAmount;
        float disc = smoothstep(0.047, 0.038, od);
        col = mix(col, uOrbColor, disc * min(1.0, uOrbAmount * 1.5));

        // layered snowy forest silhouettes
        vec2 farUv = vec2(uv.x * 1.05 + 0.01, uv.y * 0.92 + 0.02);
        vec2 nearUv = vec2(uv.x * 1.02, uv.y * 0.86 - 0.01);
        float farA = texture2D(uForestFar, farUv).a;
        float nearA = texture2D(uForestNear, nearUv).a;
        // soften and tint the silhouettes
        col = mix(col, uForestFarColor, farA * 0.61);
        col = mix(col, uForestNearColor, nearA * 0.84);

        // drifting bands of mist
        float mistWave = vnoise(vec2(uv.x * 3.0 + t * 0.018, uv.y * 7.0)) * 0.5
                       + vnoise(vec2(uv.x * 7.0 - t * 0.012, uv.y * 13.0)) * 0.25;
        float mistBand = smoothstep(0.72, 1.0, mistWave) * smoothstep(0.0, 0.38, uv.y);
        col = mix(col, uMist, mistBand * 0.22);

        // drifting snow inside the window
        vec2 sp = uv * vec2(34.0, 20.0);
        sp.y -= t * 0.9;
        vec2 cell = floor(sp);
        vec2 f = fract(sp) - 0.5;
        float rnd = hash21(cell);
        vec2 offset = vec2(hash21(cell + 7.1) - 0.5, hash21(cell + 3.7) - 0.5) * 0.5;
        float flake = smoothstep(0.06, 0.0, length(f - offset));
        float snow = flake * step(0.72, rnd) * smoothstep(0.08, 0.3, uv.y);
        col = mix(col, vec3(0.94, 0.96, 0.98), snow * 0.5);

        // inner shadow and paper grain
        float rr = length(uv - 0.5) * 2.0;
        col *= mix(1.0, 0.72, smoothstep(0.82, 1.08, rr));
        float washi = texture2D(uWashi, uv * vec2(2.0, 2.0)).r;
        col *= 0.97 + washi * 0.06;

        // a breath of indigo in the corners at night
        col = mix(col, uForestNearColor * 0.7, uNight * smoothstep(0.45, 1.0, rr) * 0.16);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.CircleGeometry(WINDOW_RADIUS, 96), mat);
  mesh.position.copy(WINDOW_POS);
  return { mesh, mat, uniforms };
}

export function buildBackdrop(M, tex) {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const rand = makeRandom(6041);

  /* ---------------- washi wall ---------------- */
  const wallTex = tex.backdropWashi.clone();
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(8, 3);
  wallTex.needsUpdate = true;
  const wallMat = new THREE.MeshBasicMaterial({
    map: wallTex,
    color: 0xd9cdb9,
    toneMapped: false,
    side: THREE.BackSide,
  });
  // A full circular washi stage: the garden is enclosed on every side.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(42, 42, 84, 120, 1, true),
    wallMat
  );
  wall.position.set(0, 12, 0);
  group.add(wall);

  // soft darkening near the floor line, grounding the set
  const shadeCanvas = document.createElement('canvas');
  shadeCanvas.width = 16;
  shadeCanvas.height = 256;
  const sctx = shadeCanvas.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(20,24,30,0)');
  grad.addColorStop(0.55, 'rgba(20,24,30,0.03)');
  grad.addColorStop(0.82, 'rgba(20,24,30,0.22)');
  grad.addColorStop(1, 'rgba(20,24,30,0.38)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 16, 256);
  const shadeTex = new THREE.CanvasTexture(shadeCanvas);
  shadeTex.colorSpace = THREE.SRGBColorSpace;
  const shadePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 76),
    new THREE.MeshBasicMaterial({
      map: shadeTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.65,
    })
  );
  shadePlane.position.set(0, 14, WALL_Z + 0.2);
  group.add(shadePlane);

  // pale ink forest silhouettes painted across the washi
  const forestMat = new THREE.MeshBasicMaterial({
    map: tex.forestFar,
    color: 0x6d7a84,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    toneMapped: false,
  });
  const forestPlane = new THREE.Mesh(new THREE.PlaneGeometry(92, 30), forestMat);
  forestPlane.position.set(0, 7.6, WALL_Z + 0.45);
  forestPlane.renderOrder = 0;
  group.add(forestPlane);
  const forestMatNear = new THREE.MeshBasicMaterial({
    map: tex.forestNear,
    color: 0x5e6c75,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
  });
  const forestPlaneNear = new THREE.Mesh(new THREE.PlaneGeometry(58, 19), forestMatNear);
  forestPlaneNear.position.set(2.5, 5.2, WALL_Z + 0.5);
  group.add(forestPlaneNear);

  // the same pale treeline continues all the way around the stage
  const forestWrapTex = tex.forestFar.clone();
  forestWrapTex.wrapS = THREE.RepeatWrapping;
  forestWrapTex.wrapT = THREE.ClampToEdgeWrapping;
  forestWrapTex.repeat.set(7, 1);
  forestWrapTex.needsUpdate = true;
  const forestWrapMat = new THREE.MeshBasicMaterial({
    map: forestWrapTex,
    color: 0x7a8791,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    toneMapped: false,
    side: THREE.BackSide,
  });
  const forestWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(41.4, 41.4, 30, 120, 1, true),
    forestWrapMat
  );
  forestWrap.position.set(0, 8, 0);
  group.add(forestWrap);

  // atmospheric wash: indigo at the top, warm dust near the horizon
  const washCanvas = document.createElement('canvas');
  washCanvas.width = 32;
  washCanvas.height = 512;
  const wctx = washCanvas.getContext('2d');
  const wg = wctx.createLinearGradient(0, 0, 0, 512);
  wg.addColorStop(0, 'rgba(46,56,78,0.32)');
  wg.addColorStop(0.28, 'rgba(78,78,98,0.14)');
  wg.addColorStop(0.52, 'rgba(120,108,104,0.04)');
  wg.addColorStop(0.74, 'rgba(214,176,132,0.06)');
  wg.addColorStop(0.92, 'rgba(92,68,52,0.16)');
  wg.addColorStop(1, 'rgba(56,42,34,0.28)');
  wctx.fillStyle = wg;
  wctx.fillRect(0, 0, 32, 512);
  const washTex = new THREE.CanvasTexture(washCanvas);
  washTex.colorSpace = THREE.SRGBColorSpace;
  const washPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 76),
    new THREE.MeshBasicMaterial({
      map: washTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.9,
    })
  );
  washPlane.position.set(0, 14, WALL_Z + 0.35);
  group.add(washPlane);

  /* ---------------- round window ---------------- */
  const round = buildRoundWindow(tex);
  group.add(round.mesh);

  const frameRing = new THREE.Mesh(
    new THREE.TorusGeometry(WINDOW_RADIUS + 0.03, 0.17, 12, 96),
    M.woodDeep
  );
  frameRing.position.copy(WINDOW_POS).add(new THREE.Vector3(0, 0, 0.06));
  frameRing.castShadow = false;
  group.add(frameRing);
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(WINDOW_RADIUS - 0.18, 0.028, 6, 96),
    M.brassSoft
  );
  innerRing.position.copy(WINDOW_POS).add(new THREE.Vector3(0, 0, 0.14));
  group.add(innerRing);

  // soft light spill around the window
  const spillMat = new THREE.SpriteMaterial({
    map: glowTexture(512, [255, 240, 218]),
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const spill = new THREE.Sprite(spillMat);
  spill.position.copy(WINDOW_POS).add(new THREE.Vector3(0, -0.1, -0.15));
  spill.scale.setScalar(29);
  group.add(spill);

  /* ---------------- folding screen ---------------- */
  const screen = new THREE.Group();
  const panelCount = 5;
  const panelW = 2.65;
  const panelH = 6.9;
  const totalW = panelCount * panelW;
  const screenX = -15.0;
  const screenZ = -12.9;
  screen.position.set(screenX, -2.65, screenZ);
  screen.rotation.y = 0.055;

  const panelGeos = [];
  const frameGeos = [];
  for (let i = 0; i < panelCount; i++) {
    const g = new THREE.PlaneGeometry(panelW - 0.055, panelH - 0.11);
    // crop the wide byobu painting across the six panels
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) {
      uv.setX(j, uv.getX(j) / panelCount + i / panelCount);
    }
    const angle = (i % 2 === 0 ? 1 : -1) * 0.055;
    const x = -totalW / 2 + panelW * (i + 0.5);
    const z = (i % 2 === 0 ? -0.1 : 0.1);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(angle));
    g.translate(x, panelH / 2, z);
    panelGeos.push(g);

    const fw = panelW;
    const ft = 0.08;
    const fdepth = 0.1;
    // top, bottom, left, right frame pieces
    const boxes = [
      [fw, ft, fdepth, x, panelH, z + 0.02],
      [fw, ft, fdepth, x, 0.02, z + 0.02],
      [ft, panelH, fdepth, x - panelW / 2 + ft / 2, panelH / 2, z + 0.02],
      [ft, panelH, fdepth, x + panelW / 2 - ft / 2, panelH / 2, z + 0.02],
    ];
    for (const [bw, bh, bd, bx, by, bz] of boxes) {
      const box = new THREE.BoxGeometry(bw, bh, bd);
      box.applyMatrix4(new THREE.Matrix4().makeRotationY(angle));
      box.translate(bx, by, bz);
      frameGeos.push(box);
    }
    // little hinge pin
    if (i < panelCount - 1) {
      const pin = new THREE.BoxGeometry(0.09, 0.18, 0.13);
      pin.translate(x + panelW / 2, panelH - 0.08, z + 0.06);
      frameGeos.push(pin);
    }
  }
  const panelMesh = new THREE.Mesh(
    mergeGeometries(panelGeos, false),
    new THREE.MeshBasicMaterial({
      map: tex.byobu,
      color: 0xf3e4c6,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  );
  screen.add(panelMesh);
  const frameMesh = new THREE.Mesh(mergeGeometries(frameGeos, false), M.woodDeep);
  screen.add(frameMesh);

  // backing to keep the screen reading as a solid object
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(totalW, panelH),
    new THREE.MeshBasicMaterial({ color: 0x4d4539, toneMapped: false })
  );
  backing.position.set(0, panelH / 2, -0.12);
  screen.add(backing);
  group.add(screen);

  /* ---------------- sheer side curtains ---------------- */
  const curtainMats = [];
  const curtains = [];
  function makeCurtain(x, z, width, height, phase, opacity, tilt) {
    const geo = new THREE.PlaneGeometry(width, height, 48, 10);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const fold =
        Math.sin(u * 16.0 + phase) * 0.16 +
        Math.sin(u * 7.0 + phase * 1.7) * 0.1 +
        Math.sin(u * 31.0 + phase * 0.6) * 0.025;
      pos.setZ(i, fold * (1.0 - v * 0.25));
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xe9dfcf) },
        uShadow: { value: new THREE.Color(0x8d8ca1) },
        uOpacity: { value: opacity },
        uPhase: { value: phase },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        varying float vFold;
        void main() {
          vUv = uv;
          vec3 p = position;
          float sway = sin(uTime * 0.22 + uPhase + uv.y * 1.3) * 0.06 * (1.0 - uv.y * 0.4);
          p.x += sway;
          float fold = sin(uv.x * 18.0 + uPhase) * 0.5 + 0.5;
          vFold = fold;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uShadow;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vFold;
        void main() {
          float topFade = smoothstep(0.0, 0.06, vUv.y);
          float bottomFade = 1.0 - smoothstep(0.82, 1.0, vUv.y);
          float foldShade = 0.72 + vFold * 0.38;
          vec3 col = mix(uShadow, uColor, clamp(foldShade, 0.0, 1.0));
          float alpha = uOpacity * topFade * bottomFade * (0.55 + vFold * 0.5);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 8.1, z);
    mesh.rotation.y = tilt;
    group.add(mesh);
    curtainMats.push(mat);
    curtains.push(mesh);
    return mesh;
  }

  makeCurtain(-13.4, -10.4, 5.2, 17.6, 0.4, 0.5, 0.08);
  makeCurtain(-15.4, -11.2, 4.0, 16.8, 1.8, 0.22, 0.15);
  makeCurtain(13.5, -10.6, 5.4, 17.8, 2.2, 0.5, -0.1);
  makeCurtain(15.5, -11.4, 4.0, 16.8, 0.7, 0.22, -0.17);

  /* ---------------- drifting ground haze ---------------- */
  const hazeMats = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex.steam,
      color: 0xe9e2d4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(-11 + i * 11, 1.2 + i * 0.4, -15.5 + i * 0.9);
    sprite.scale.set(16 + i * 4, 3.4 + i * 0.6, 1);
    group.add(sprite);
    hazeMats.push(mat);
  }

  const api = {
    group,
    wallMat,
    round,
    spillMat,
    spill,
    screen,
    panelMesh,
    forestMat,
    forestMatNear,
    forestWrapMat,
    curtains,
    curtainMats,
    hazeMats,
    update(dt, elapsed) {
      round.uniforms.uTime.value = elapsed;
      for (let i = 0; i < curtainMats.length; i++) {
        curtainMats[i].uniforms.uTime.value = elapsed;
      }
      for (let i = 0; i < hazeMats.length; i++) {
        hazeMats[i].opacity = 0.08 + Math.sin(elapsed * 0.14 + i * 1.7) * 0.03;
      }
    },
  };
  return api;
}
