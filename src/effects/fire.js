import * as THREE from 'three';
import { makeRandom, glowTexture } from '../utils.js';

const EMBER_COUNT = 40;

export class Fire {
  constructor({ tex, position, scale = 1, base = 1 }) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.scale = scale;
    this.base = base;
    this.ambient = 1;
    this.flash = 0;
    this.time = 0;
    this.rand = makeRandom(991);

    const geom = new THREE.PlaneGeometry(1.05, 1.85, 1, 6);
    geom.translate(0, 0.925, 0);
    // gentle taper of the flame quads
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, y / 1.85);
      pos.setX(i, pos.getX(i) * (1 - t * 0.32));
    }
    geom.computeVertexNormals();

    this.planes = [];
    this.materials = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: i === 0 ? tex.flameSoft : tex.flame,
        transparent: true,
        opacity: i === 0 ? 0.55 : 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.y = (i / 4) * Math.PI + 0.2;
      mesh.position.y = 0.02;
      mesh.scale.setScalar(i === 0 ? 1.12 : 1 - i * 0.06);
      this.group.add(mesh);
      this.planes.push(mesh);
      this.materials.push(mat);
    }

    // hot core
    const coreMat = new THREE.MeshBasicMaterial({
      map: tex.flame,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.9), coreMat);
    this.core.geometry.translate(0, 0.45, 0);
    this.core.position.y = 0.02;
    this.coreMat = coreMat;
    this.group.add(this.core);

    // glow halo
    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture(256, [255, 170, 90]),
      color: 0xffffff,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(2.0 * scale);
    this.halo.position.y = 0.7 * scale;
    this.group.add(this.halo);

    // embers
    const emberGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(EMBER_COUNT * 3);
    const alphas = new Float32Array(EMBER_COUNT);
    const sizes = new Float32Array(EMBER_COUNT);
    this.emberState = [];
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberState.push(this.newEmber(true));
      alphas[i] = 0;
      sizes[i] = 0.05;
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    emberGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    emberGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.emberGeo = emberGeo;

    this.emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex.ember },
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
          gl_PointSize = aSize * uPixelRatio * (260.0 / max(0.1, -mv.z));
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
    this.embers = new THREE.Points(emberGeo, this.emberMat);
    this.group.add(this.embers);

    this.light = new THREE.PointLight(0xff9848, 7 * scale * scale, 7 * scale + 3, 2);
    this.light.position.set(0, 0.75 * scale, 0);
    this.group.add(this.light);

    // soft warm pool on the hearth floor
    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.65 * scale, 24),
      new THREE.MeshBasicMaterial({
        map: glowTexture(128, [255, 166, 90]),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.005;
    this.floorGlow = floorGlow;
    this.group.add(floorGlow);

    this.group.scale.setScalar(scale);
  }

  newEmber(initial = false) {
    const r = this.rand;
    return {
      x: (r.next() - 0.5) * 0.45,
      y: initial ? r.next() * 1.6 : r.range(0, 0.25),
      z: (r.next() - 0.5) * 0.45,
      vx: (r.next() - 0.5) * 0.12,
      vy: r.range(0.3, 0.8),
      vz: (r.next() - 0.5) * 0.12,
      life: r.range(0.6, 1.6),
      age: initial ? r.range(0, 1) : 0,
      phase: r.range(0, Math.PI * 2),
    };
  }

  burst() {
    this.flash = Math.min(1.5, this.flash + 0.9);
    for (let i = 0; i < 14; i++) {
      const idx = Math.floor(this.rand.next() * EMBER_COUNT);
      this.emberState[idx].age = 0;
      this.emberState[idx].life = this.rand.range(0.6, 1.8);
      this.emberState[idx].vy = this.rand.range(0.6, 1.4);
    }
  }

  update(dt, elapsed) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 1.25);
    const active = Math.max(0.04, (this.base * this.ambient + this.flash) * 1);
    const t = elapsed;
    const flicker =
      0.86 +
      Math.sin(t * 8.7) * 0.055 +
      Math.sin(t * 15.3 + 1.7) * 0.035 +
      Math.sin(t * 3.1 + 0.4) * 0.04;

    for (let i = 0; i < this.planes.length; i++) {
      const p = this.planes[i];
      const phase = i * 1.7;
      p.scale.y = this.scale * (0.72 + 0.28 * active) * (0.92 + 0.1 * Math.sin(t * 9 + phase));
      p.scale.x = this.scale * (0.85 + 0.1 * Math.sin(t * 7.2 + phase * 2));
      p.rotation.z = Math.sin(t * 2.4 + phase) * 0.035;
      this.materials[i].opacity =
        (i === 0 ? 0.28 : 0.55) * (0.55 + active * 0.55) * flicker;
    }
    this.core.scale.y = this.scale * (0.65 + 0.4 * active);
    this.core.scale.x = this.scale * (0.85 + 0.1 * Math.sin(t * 10.5));
    this.coreMat.opacity = 0.25 + active * 0.5 * flicker;
    this.halo.material.opacity = (0.12 + active * 0.28) * flicker;
    this.halo.scale.setScalar((1.6 + active * 0.6) * this.scale);
    this.floorGlow.material.opacity = 0.12 + active * 0.22;
    this.light.intensity = (3.5 + active * 7.5) * this.scale * this.scale * flicker;

    // embers
    const positions = this.emberGeo.attributes.position.array;
    const alphas = this.emberGeo.attributes.aAlpha.array;
    const sizes = this.emberGeo.attributes.aSize.array;
    const emberActive = Math.min(1.4, 0.35 + active);
    for (let i = 0; i < EMBER_COUNT; i++) {
      const e = this.emberState[i];
      e.age += dt;
      if (e.age > e.life) {
        Object.assign(e, this.newEmber(false));
      }
      e.x += (e.vx + Math.sin(t * 1.7 + e.phase) * 0.06) * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
      const fade = 1 - e.age / e.life;
      positions[i * 3] = e.x;
      positions[i * 3 + 1] = e.y;
      positions[i * 3 + 2] = e.z;
      alphas[i] = Math.max(0, fade * fade * emberActive);
      sizes[i] = (0.025 + fade * 0.035) * this.scale;
    }
    this.emberGeo.attributes.position.needsUpdate = true;
    this.emberGeo.attributes.aAlpha.needsUpdate = true;
    this.emberGeo.attributes.aSize.needsUpdate = true;
  }

  setPixelRatio(ratio) {
    this.emberMat.uniforms.uPixelRatio.value = ratio;
  }
}
