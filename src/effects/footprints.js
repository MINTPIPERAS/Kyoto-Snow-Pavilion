import * as THREE from 'three';
import { makeRandom } from '../utils.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Persistent-ish geta/boot marks pressed into the snow.
 * Decals are pooled; oldest marks are recycled once the pool wraps.
 */
export class FootprintSystem {
  constructor(tex, { max = 120 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'footprints';
    this.max = max;
    this.cursor = 0;
    this.rand = makeRandom(9124);

    const geo = new THREE.PlaneGeometry(0.32, 0.46, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.geo = geo;

    this.material = new THREE.MeshBasicMaterial({
      map: tex.footprint,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
      color: 0xe7eef6,
      toneMapped: true,
    });

    this.marks = [];
    for (let i = 0; i < max; i++) {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.raycast = () => {};
      this.group.add(mesh);
      this.marks.push(mesh);
    }
  }

  addPair(point, normal) {
    const r = this.rand;
    const n = normal.clone().normalize();
    if (n.y < 0.2) return;
    const yaw = r.range(0, Math.PI * 2);
    const qAlign = new THREE.Quaternion().setFromUnitVectors(UP, n);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const quat = qAlign.clone().multiply(qYaw);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const base = point.clone().addScaledVector(n, 0.025);

    const specs = [
      { ahead: 0.1, across: 0.1, mirror: -1, scale: r.range(0.9, 1.05) },
      { ahead: -0.13, across: -0.1, mirror: 1, scale: r.range(0.9, 1.05) },
    ];
    for (const spec of specs) {
      const mesh = this.marks[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      mesh.position
        .copy(base)
        .addScaledVector(forward, spec.ahead)
        .addScaledVector(side, spec.across);
      mesh.quaternion.copy(quat);
      mesh.scale.set(spec.mirror * 0.95 * spec.scale, 1, spec.scale);
      mesh.visible = true;
    }
  }

  clear() {
    for (const m of this.marks) m.visible = false;
  }
}
