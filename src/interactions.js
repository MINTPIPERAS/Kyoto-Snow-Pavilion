import * as THREE from 'three';
import { easeInOutCubic, clamp } from './utils.js';

const ON_ONSEN_POS = new THREE.Vector3(5.15, 1.33, 7.45);
const ON_ONSEN_TARGET = new THREE.Vector3(-1.1, 2.42, -2.0);
const ON_ONSEN_FOV = 56;

/**
 * Everything the visitor can touch: branches, snow, spring, hearth, shoji.
 * Also owns the low, warm onsen camera and its return tween.
 */
export class Interactions {
  constructor({
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
    onsenLabel,
    leaveButton,
    M,
  }) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.camera = camera;
    this.controls = controls;
    this.scene = scene;
    this.world = world;
    this.forest = forest;
    this.house = house;
    this.onsen = onsen;
    this.snowBurst = snowBurst;
    this.footprints = footprints;
    this.toastEl = toastEl;
    this.onsenLabel = onsenLabel;
    this.leaveButton = leaveButton;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.time = 0;
    this.isOnsen = false;
    this.inTransition = false;
    this.cameraTween = null;
    this.savedView = null;
    this.onsenBasePos = new THREE.Vector3();
    this.toastTimer = 0;
    this.hoverTimer = 0;
    this.fireCooldown = 0;
    this.shadowDirty = true;
    this.toss = null;
    this.landedLogs = [];

    this.trees = [...forest.trees, ...forest.pines];
    this.interactive = [];
    for (const tree of this.trees) {
      const d = tree.userData.tree;
      d.shakeActive = false;
      d.shakeTime = 0;
      d.shakeAmp = d.type === 'pine' ? 0.035 : 0.015;
      for (const m of d.hitMeshes) this.interactive.push(m);
    }
    this.interactive.push(world.snow);
    this.interactive.push(onsen.water);
    this.interactive.push(house.irori.hit);
    for (const side of [house.shojiFront, house.shojiRight]) {
      for (const panel of side.panels) {
        for (const m of panel.userData.panelMeshes) this.interactive.push(m);
      }
    }

    this.down = null;
    this.moved = false;
    this.bindEvents();

    this.logGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.55, 7);
    this.charcoalMat = M.charcoal;
    this.flyLog = new THREE.Mesh(this.logGeo, this.charcoalMat);
    this.flyLog.visible = false;
    this.flyLog.castShadow = true;
    this.flyLog.receiveShadow = true;
    this.scene.add(this.flyLog);
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.down = { x: e.clientX, y: e.clientY, time: performance.now() };
      this.moved = false;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.down) {
        const dx = e.clientX - this.down.x;
        const dy = e.clientY - this.down.y;
        if (dx * dx + dy * dy > 36) this.moved = true;
      }
      if (e.pointerType === 'touch') return;
      const now = performance.now();
      if (now - this.hoverTimer < 70 || this.down) return;
      this.hoverTimer = now;
      const action = this.pick(e.clientX, e.clientY);
      this.canvas.classList.toggle('is-hovering', !!action);
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.canvas.classList.remove('is-hovering');
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.down) return;
      const dt = performance.now() - this.down.time;
      const wasMoved = this.moved;
      this.down = null;
      if (wasMoved || dt > 650) return;
      const action = this.pick(e.clientX, e.clientY);
      if (action) this.performAction(action);
    });

    this.leaveButton.addEventListener('click', () => this.leaveOnsen());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOnsen) this.leaveOnsen();
    });
  }

  setView(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  pick(clientX, clientY) {
    this.setView(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.interactive, false);
    for (const hit of hits) {
      const obj = hit.object;
      if (!obj.visible) continue;
      if (obj.userData.treeRoot) {
        return { type: 'tree', tree: obj.userData.treeRoot, point: hit.point, hit };
      }
      if (obj === this.onsen.water) {
        return { type: 'water', point: hit.point, hit };
      }
      if (obj === this.world.snow) {
        return { type: 'snow', point: hit.point, normal: hit.face?.normal, hit };
      }
      if (obj.userData.hearth) {
        return { type: 'fire', point: hit.point, hit };
      }
      if (obj.userData.houseShoji) {
        return { type: 'shoji', state: obj.userData.houseShoji, point: hit.point, hit };
      }
    }
    return null;
  }

  performAction(action) {
    if (this.isOnsen && action.type !== 'water') return;
    switch (action.type) {
      case 'tree':
        this.shakeTree(action.tree, action.point);
        break;
      case 'snow':
        this.addFootprint(action.point, action.normal);
        break;
      case 'water':
        if (this.isOnsen) {
          this.onsen.spawnRipple(action.point.x, action.point.z, 1.2);
        } else {
          this.enterOnsen();
        }
        break;
      case 'fire':
        this.tossFirewood();
        break;
      case 'shoji':
        action.state.toggle();
        this.showToast(
          action.state.target > 0.5 ? '障子门轻轻推开，暖意流出' : '障子门缓缓合上，只余纸后灯影'
        );
        break;
      default:
        break;
    }
  }

  shakeTree(tree, point) {
    const d = tree.userData.tree;
    d.shakeActive = true;
    d.shakeTime = 0;
    this.shadowDirty = true;
    const r = this.snowBurst.rand;
    this.snowBurst.spawn(point, {
      count: 110,
      radius: 0.95,
      upward: 0.45,
      spread: 1.4,
      sizeMin: 0.12,
      sizeMax: 0.5,
      lifeMin: 1.4,
      lifeMax: 3.6,
    });
    this.snowBurst.spawn(
      point.clone().add(new THREE.Vector3(r.range(-1.4, 1.4), r.range(0.3, 1.6), r.range(-1.2, 1.2))),
      { count: 28, radius: 1.2, upward: 0.3, spread: 0.8, lifeMin: 1.5, lifeMax: 3.2 }
    );
    this.showToast('枝上积雪簌簌落下');
  }

  addFootprint(point, normal) {
    if (!point) return;
    const n = normal
      ? normal.clone().transformDirection(this.world.snow.matrixWorld)
      : new THREE.Vector3(0, 1, 0);
    this.footprints.addPair(point, n);
    this.snowBurst.puff(point, 26);
    this.showToast('新雪上留下浅浅足印');
  }

  enterOnsen() {
    if (this.isOnsen || this.inTransition) return;
    this.savedView = {
      pos: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
    };
    this.controls.enabled = false;
    this.isOnsen = true;
    this.inTransition = true;
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.cameraTween = {
      t: 0,
      duration: 1.75,
      fromPos,
      toPos: ON_ONSEN_POS.clone(),
      fromTarget,
      toTarget: ON_ONSEN_TARGET.clone(),
      fromFov: this.camera.fov,
      toFov: ON_ONSEN_FOV,
      mode: 'enter',
    };
    document.body.classList.add('onsen-mode');
    this.onsenLabel.hidden = false;
    this.leaveButton.hidden = false;
    this.showToast('汤烟渐起，且入池中');
  }

  leaveOnsen() {
    if (!this.isOnsen || this.inTransition) return;
    if (!this.savedView) return;
    this.inTransition = true;
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    this.cameraTween = {
      t: 0,
      duration: 1.5,
      fromPos,
      toPos: this.savedView.pos.clone(),
      fromTarget,
      toTarget: this.savedView.target.clone(),
      fromFov: this.camera.fov,
      toFov: this.savedView.fov,
      mode: 'leave',
    };
    this.showToast('离池，回到雪庭');
  }

  tossFirewood() {
    if (this.fireCooldown > 0 || this.toss) return;
    if (!this.charcoalMat) return;
    const start = this.house.group.localToWorld(new THREE.Vector3(3.9, 2.15, 1.55));
    const end = this.house.group.localToWorld(new THREE.Vector3(2.3, 1.45, -0.95));
    const control = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.05, 0));
    this.flyLog.position.copy(start);
    this.flyLog.visible = true;
    this.toss = { t: 0, duration: 0.82, start, control, end };
    this.fireCooldown = 0.9;
    this.snowBurst.puff(start, 12);
  }

  finishToss() {
    const end = this.toss.end;
    this.flyLog.visible = false;
    this.toss = null;
    const log = new THREE.Mesh(this.logGeo, this.charcoalMat);
    log.castShadow = true;
    log.receiveShadow = true;
    log.position.set(
      (this.snowBurst.rand.next() - 0.5) * 0.34 + 2.3,
      1.43 + this.snowBurst.rand.range(0, 0.08),
      (this.snowBurst.rand.next() - 0.5) * 0.3 - 0.95
    );
    log.rotation.set(
      Math.PI / 2 + this.snowBurst.rand.range(-0.4, 0.4),
      this.snowBurst.rand.range(0, Math.PI),
      this.snowBurst.rand.range(-0.4, 0.4)
    );
    this.house.group.add(log);
    this.landedLogs.push(log);
    if (this.landedLogs.length > 7) {
      const old = this.landedLogs.shift();
      this.house.group.remove(old);
    }
    this.house.fire.burst();
    this.house.fire.base = Math.min(1.5, this.house.fire.base + 0.05);
    this.showToast('添一根柴，火舌腾起');
    this.shadowDirty = true;
  }

  showToast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2300);
  }

  update(dt) {
    this.time += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.snowBurst.update(dt);

    for (const tree of this.trees) {
      const d = tree.userData.tree;
      if (!d.shakeActive) continue;
      d.shakeTime += dt;
      if (d.shakeTime > 1.35) {
        d.shakeActive = false;
        tree.rotation.z = 0;
        tree.rotation.x = 0;
        continue;
      }
      const decay = Math.exp(-d.shakeTime * 3.2);
      tree.rotation.z = Math.sin(d.shakeTime * 16) * d.shakeAmp * decay;
      tree.rotation.x = Math.sin(d.shakeTime * 12.7 + 1.2) * d.shakeAmp * 0.55 * decay;
      this.shadowDirty = true;
    }

    if (this.toss) {
      this.toss.t += dt / this.toss.duration;
      const t = clamp(this.toss.t, 0, 1);
      const a = this.toss.start;
      const b = this.toss.control;
      const c = this.toss.end;
      const one = 1 - t;
      this.flyLog.position.set(
        one * one * a.x + 2 * one * t * b.x + t * t * c.x,
        one * one * a.y + 2 * one * t * b.y + t * t * c.y,
        one * one * a.z + 2 * one * t * b.z + t * t * c.z
      );
      this.flyLog.rotation.x += dt * 9;
      this.flyLog.rotation.z += dt * 6;
      if (t >= 1) this.finishToss();
    }

    if (this.cameraTween) {
      const tw = this.cameraTween;
      tw.t += dt / tw.duration;
      const e = easeInOutCubic(clamp(tw.t, 0, 1));
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      this.camera.fov = THREE.MathUtils.lerp(tw.fromFov, tw.toFov, e);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.controls.target);
      if (tw.t >= 1) {
        const mode = tw.mode;
        this.cameraTween = null;
        this.inTransition = false;
        if (mode === 'enter') {
          this.onsenBasePos.copy(this.camera.position);
        } else {
          this.isOnsen = false;
          this.controls.enabled = true;
          this.controls.target.copy(this.savedView.target);
          this.camera.position.copy(this.savedView.pos);
          this.camera.fov = this.savedView.fov;
          this.camera.updateProjectionMatrix();
          this.camera.lookAt(this.controls.target);
          document.body.classList.remove('onsen-mode');
          this.onsenLabel.hidden = true;
          this.leaveButton.hidden = true;
          this.savedView = null;
        }
      }
    } else if (this.isOnsen) {
      this.camera.position.y = this.onsenBasePos.y + Math.sin(this.time * 0.55) * 0.025;
      this.camera.lookAt(this.controls.target);
    }
  }
}
