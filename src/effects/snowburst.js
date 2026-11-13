import * as THREE from 'three';
import { makeRandom, clamp } from '../utils.js';

/**
 * Pooled powder-snow particles used when a branch is tapped
 * or when a footstep presses into the snow.
 */
export class SnowBurstSystem {
  constructor(tex, { pixelRatio = 1, max = 720 } = {}) {
    this.max = max;
    this.cursor = 0;
    this.rand = makeRandom(6581);
    this.pixelRatio = pixelRatio;
    this.particles = [];

    const positions = new Float32Array(max * 3);
    const alphas = new Float32Array(max);
    const sizes = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        size: 0,
        sway: 0,
        phase: 0,
      });
      sizes[i] = 0;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex.snowflake },
        uColor: { value: new THREE.Color(0xf1f7fd) },
        uPixelRatio: { value: pixelRatio },
      },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uPixelRatio * (330.0 / max(1.0, -mv.z)), 46.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * vAlpha;
          if (a < 0.008) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  spawn(origin, options = {}) {
    const {
      count = 90,
      radius = 0.7,
      upward = 0.5,
      spread = 1.2,
      sizeMin = 0.12,
      sizeMax = 0.42,
      lifeMin = 1.2,
      lifeMax = 3.2,
      power = 1,
    } = options;
    const r = this.rand;
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.particles[idx];
      p.active = true;
      p.x = origin.x + (r.next() - 0.5) * radius * 2;
      p.y = origin.y + (r.next() - 0.5) * radius * 1.2;
      p.z = origin.z + (r.next() - 0.5) * radius * 2;
      p.vx = (r.next() - 0.5) * spread * power;
      p.vy = r.range(-0.1, upward);
      p.vz = (r.next() - 0.5) * spread * power;
      p.age = 0;
      p.life = r.range(lifeMin, lifeMax);
      p.size = r.range(sizeMin, sizeMax);
      p.sway = r.range(0.01, 0.05);
      p.phase = r.range(0, Math.PI * 2);
    }
  }

  puff(origin, count = 22) {
    this.spawn(origin, {
      count,
      radius: 0.28,
      upward: 0.45,
      spread: 0.55,
      sizeMin: 0.06,
      sizeMax: 0.18,
      lifeMin: 0.5,
      lifeMax: 1.2,
    });
  }

  update(dt) {
    const positions = this.geo.attributes.position.array;
    const alphas = this.geo.attributes.aAlpha.array;
    const sizes = this.geo.attributes.aSize.array;
    const gravity = -1.4;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.active) {
        alphas[i] = 0;
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      // airy drag, gentle side sway
      p.vx *= 1 - dt * 0.7;
      p.vz *= 1 - dt * 0.7;
      p.vy += gravity * dt;
      p.x += (p.vx + Math.sin(p.age * 2.1 + p.phase) * p.sway * 3) * dt;
      p.y += p.vy * dt;
      p.z += (p.vz + Math.cos(p.age * 1.7 + p.phase) * p.sway * 2) * dt;
      const t = p.age / p.life;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      alphas[i] = clamp(Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t * 0.4), 0, 1) * 0.95;
      sizes[i] = p.size * (0.8 + t * 0.6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  setPixelRatio(ratio) {
    this.pixelRatio = ratio;
    this.material.uniforms.uPixelRatio.value = ratio;
  }
}
