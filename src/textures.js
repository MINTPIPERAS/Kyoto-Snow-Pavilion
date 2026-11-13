import * as THREE from 'three';
import {
  createCanvas,
  canvasTexture,
  makeRandom,
  TAU,
  clamp,
} from './utils.js';

/* ------------------------------------------------------------------ */
/*  Wood grain (tintable, near-white base)                             */
/* ------------------------------------------------------------------ */

function makeWoodTexture(seed = 11) {
  const { canvas, ctx } = createCanvas(1024, 1024);
  const rand = makeRandom(seed);
  ctx.fillStyle = '#f1e9dc';
  ctx.fillRect(0, 0, 1024, 1024);

  // broad tonal bands
  for (let i = 0; i < 22; i++) {
    const y = rand.range(-40, 1064);
    const h = rand.range(12, 90);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    const a = rand.range(0.025, 0.07);
    g.addColorStop(0, `rgba(112,84,58,0)`);
    g.addColorStop(0.5, `rgba(112,84,58,${a})`);
    g.addColorStop(1, `rgba(112,84,58,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 1024, h);
  }

  // long flowing grain lines
  for (let i = 0; i < 260; i++) {
    const y = rand.range(0, 1024);
    const amp = rand.range(1, 7);
    const freq = rand.range(0.002, 0.009);
    const phase = rand.range(0, TAU);
    const alpha = rand.range(0.025, 0.11);
    const width = rand.range(0.5, 2.1);
    ctx.strokeStyle = `rgba(86,61,41,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 16) {
      const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.35;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // fine short fibers
  for (let i = 0; i < 900; i++) {
    const x = rand.range(0, 1024);
    const y = rand.range(0, 1024);
    const len = rand.range(8, 46);
    ctx.strokeStyle = `rgba(92,66,45,${rand.range(0.02, 0.07)})`;
    ctx.lineWidth = rand.range(0.4, 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + len * 0.4, y + rand.range(-2, 2), x + len * 0.7, y + rand.range(-2, 2), x + len, y);
    ctx.stroke();
  }

  // a couple of knots
  for (let i = 0; i < 5; i++) {
    const cx = rand.range(80, 944);
    const cy = rand.range(80, 944);
    for (let r = 4; r < rand.range(22, 44); r += rand.range(3, 6)) {
      ctx.strokeStyle = `rgba(95,66,43,${rand.range(0.04, 0.1)})`;
      ctx.lineWidth = rand.range(0.7, 1.5);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * rand.range(1.4, 2.1), r, rand.range(-0.1, 0.1), 0, TAU);
      ctx.stroke();
    }
  }

  // pale highlights
  for (let i = 0; i < 120; i++) {
    const y = rand.range(0, 1024);
    ctx.strokeStyle = `rgba(255,252,244,${rand.range(0.04, 0.14)})`;
    ctx.lineWidth = rand.range(1, 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(300, y + rand.range(-6, 6), 700, y + rand.range(-8, 8), 1024, y + rand.range(-4, 4));
    ctx.stroke();
  }

  return canvasTexture(canvas, { repeat: [1, 1] });
}

function makeDeckTexture(seed = 3) {
  const { canvas, ctx } = createCanvas(1024, 1024);
  const rand = makeRandom(seed);
  ctx.fillStyle = '#eadfcd';
  ctx.fillRect(0, 0, 1024, 1024);
  const plankH = 128;
  for (let row = 0; row < 8; row++) {
    const y = row * plankH;
    // per-plank tone
    ctx.fillStyle = `rgba(120,88,58,${rand.range(0.015, 0.07)})`;
    ctx.fillRect(0, y, 1024, plankH);
    // grain
    for (let i = 0; i < 26; i++) {
      const yy = y + rand.range(8, plankH - 8);
      ctx.strokeStyle = `rgba(96,68,45,${rand.range(0.03, 0.1)})`;
      ctx.lineWidth = rand.range(0.5, 1.6);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(320, yy + rand.range(-5, 5), 680, yy + rand.range(-6, 6), 1024, yy + rand.range(-3, 3));
      ctx.stroke();
    }
    // seams
    ctx.strokeStyle = 'rgba(66,46,30,0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 1);
    ctx.lineTo(1024, y + 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,249,238,0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(1024, y + 3);
    ctx.stroke();
    // staggered butt joints
    const joints = row % 2 === 0 ? [160, 660] : [410, 900];
    for (const jx of joints) {
      ctx.strokeStyle = 'rgba(60,42,28,0.3)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(jx, y + 2);
      ctx.lineTo(jx, y + plankH - 2);
      ctx.stroke();
    }
  }
  // scattered wear
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(90,64,42,${rand.range(0.01, 0.045)})`;
    ctx.beginPath();
    ctx.ellipse(rand.range(0, 1024), rand.range(0, 1024), rand.range(2, 14), rand.range(1, 3), 0, 0, TAU);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

/* ------------------------------------------------------------------ */
/*  Washi paper                                                        */
/* ------------------------------------------------------------------ */

function makeWashiTexture(seed = 21, fibers = 1400) {
  const { canvas, ctx } = createCanvas(1024, 1024);
  const rand = makeRandom(seed);
  ctx.fillStyle = '#f4ecdf';
  ctx.fillRect(0, 0, 1024, 1024);

  // soft cloudy dye mottling
  for (let i = 0; i < 34; i++) {
    const x = rand.range(0, 1024);
    const y = rand.range(0, 1024);
    const r = rand.range(70, 280);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand.chance(0.55);
    const c = warm ? '176,150,116' : '128,138,148';
    g.addColorStop(0, `rgba(${c},${rand.range(0.018, 0.05)})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // fibers
  for (let i = 0; i < fibers; i++) {
    const x = rand.range(0, 1024);
    const y = rand.range(0, 1024);
    const len = rand.range(6, 60);
    const a = rand.range(-0.22, 0.22);
    ctx.strokeStyle = `rgba(120,104,84,${rand.range(0.02, 0.075)})`;
    ctx.lineWidth = rand.range(0.4, 1.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + rand.range(-2, 2),
      y + Math.sin(a) * len * 0.5 + rand.range(-2, 2),
      x + Math.cos(a) * len,
      y + Math.sin(a) * len
    );
    ctx.stroke();
  }

  // pale long fibers
  for (let i = 0; i < 90; i++) {
    const y = rand.range(0, 1024);
    ctx.strokeStyle = `rgba(255,252,244,${rand.range(0.05, 0.16)})`;
    ctx.lineWidth = rand.range(0.6, 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(300, y + rand.range(-10, 10), 740, y + rand.range(-12, 12), 1024, y + rand.range(-6, 6));
    ctx.stroke();
  }

  // speckles
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(95,82,66,${rand.range(0.015, 0.05)})`;
    ctx.fillRect(rand.range(0, 1024), rand.range(0, 1024), rand.range(0.6, 1.8), rand.range(0.6, 1.8));
  }

  return canvasTexture(canvas);
}

function makeShojiTexture(seed = 33) {
  const washi = makeWashiTexture(seed, 900);
  washi.wrapS = washi.wrapT = THREE.RepeatWrapping;
  washi.repeat.set(1.5, 2.2);
  return washi;
}

/* ------------------------------------------------------------------ */
/*  Tatami                                                             */
/* ------------------------------------------------------------------ */

function makeTatamiTexture(seed = 41) {
  const { canvas, ctx } = createCanvas(512, 512);
  const rand = makeRandom(seed);
  ctx.fillStyle = '#b7b07c';
  ctx.fillRect(0, 0, 512, 512);

  // broad straw tone variation
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(80,86,50,${rand.range(0.015, 0.045)})`;
    ctx.fillRect(0, rand.range(0, 512), 512, rand.range(3, 20));
  }

  // fine horizontal weave
  for (let y = 0; y < 512; y += 3) {
    const shade = 150 + Math.sin(y * 0.55) * 16 + rand.range(-8, 8);
    ctx.strokeStyle = `rgba(${shade},${shade - 6},${Math.round(shade * 0.63)},0.5)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(512, y + 0.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(238,231,186,${rand.range(0.03, 0.09)})`;
    ctx.beginPath();
    ctx.moveTo(0, y + 1.4);
    ctx.lineTo(512, y + 1.4);
    ctx.stroke();
  }

  // warp threads
  for (let x = 0; x < 512; x += 9) {
    ctx.strokeStyle = `rgba(96,96,56,${rand.range(0.03, 0.075)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rand.range(-2, 2), 512);
    ctx.stroke();
  }

  // subtle stains
  for (let i = 0; i < 14; i++) {
    const x = rand.range(0, 512);
    const y = rand.range(0, 512);
    const r = rand.range(10, 60);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(112,100,58,${rand.range(0.015, 0.04)})`);
    g.addColorStop(1, 'rgba(112,100,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return canvasTexture(canvas, { repeat: [1.6, 2.2] });
}

/* ------------------------------------------------------------------ */
/*  Roof tiles                                                         */
/* ------------------------------------------------------------------ */

function makeTileTexture(seed = 51) {
  const { canvas, ctx } = createCanvas(512, 512);
  const rand = makeRandom(seed);
  ctx.fillStyle = '#586670';
  ctx.fillRect(0, 0, 512, 512);

  // vertical pans (round tile ribs)
  for (let x = 0; x < 512; x += 64) {
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, 'rgba(24,34,42,0.55)');
    g.addColorStop(0.16, 'rgba(137,154,163,0.28)');
    g.addColorStop(0.34, 'rgba(198,211,216,0.16)');
    g.addColorStop(0.6, 'rgba(92,108,118,0.05)');
    g.addColorStop(0.86, 'rgba(28,38,46,0.4)');
    g.addColorStop(1, 'rgba(22,31,38,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 64, 512);
  }

  // courses (horizontal overlap lines)
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = 'rgba(22,31,38,0.42)';
    ctx.fillRect(0, y, 512, 7);
    ctx.fillStyle = 'rgba(205,216,220,0.13)';
    ctx.fillRect(0, y + 7, 512, 2);
    for (let x = 0; x < 512; x += 64) {
      const off = (y / 64) % 2 === 0 ? 0 : 32;
      ctx.beginPath();
      ctx.arc(x + 32 + off, y + 4, 30, Math.PI, TAU);
      ctx.strokeStyle = 'rgba(28,38,46,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // weathering
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(${rand.chance(0.5) ? '215,225,228' : '26,35,42'},${rand.range(0.01, 0.06)})`;
    ctx.fillRect(rand.range(0, 512), rand.range(0, 512), rand.range(1, 4), rand.range(1, 6));
  }

  const tex = canvasTexture(canvas, { repeat: [3.2, 2.4] });
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Indigo resist-dyed cloth                                           */
/* ------------------------------------------------------------------ */

function makeIndigoTexture(kind = 'waves', seed = 61) {
  const { canvas, ctx } = createCanvas(1024, 1024);
  const rand = makeRandom(seed);
  const base = ctx.createLinearGradient(0, 0, 1024, 1024);
  base.addColorStop(0, '#31486c');
  base.addColorStop(0.5, '#2a3f61');
  base.addColorStop(1, '#223555');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);

  // woven linen texture
  for (let i = 0; i < 3600; i++) {
    ctx.fillStyle = `rgba(${rand.chance(0.5) ? '255,255,255' : '10,20,36'},${rand.range(0.008, 0.035)})`;
    ctx.fillRect(rand.range(0, 1024), rand.range(0, 1024), rand.range(1, 3), 1);
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(232,230,214,0.62)';
  ctx.fillStyle = 'rgba(232,230,214,0.58)';

  if (kind === 'waves') {
    ctx.lineWidth = 2.2;
    const R = 46;
    for (let row = -1; row < 12; row++) {
      const y = row * R * 0.72;
      for (let col = -1; col < 13; col++) {
        const x = col * R * 1.72 + (row % 2 ? R * 0.86 : 0);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(x, y, R - k * 9, Math.PI, TAU);
          ctx.globalAlpha = 0.5 - k * 0.09;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'hemp') {
    // asanoha-like six-point star lattice
    const s = 74;
    ctx.lineWidth = 2;
    for (let row = -1; row < 10; row++) {
      for (let col = -1; col < 10; col++) {
        const x = col * s * 1.5 + (row % 2 ? s * 0.75 : 0);
        const y = row * s * 0.87;
        ctx.globalAlpha = 0.42;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a) * s * 0.45, y - Math.sin(a) * s * 0.45);
          ctx.lineTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a + Math.PI / 3) * s * 0.45, y - Math.sin(a + Math.PI / 3) * s * 0.45);
          ctx.lineTo(x + Math.cos(a + Math.PI / 3) * s * 0.45, y + Math.sin(a + Math.PI / 3) * s * 0.45);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // small snow-flower motifs
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const x = 58 + col * 116 + (row % 2 ? 58 : 0);
        const y = 58 + row * 116;
        ctx.globalAlpha = rand.range(0.4, 0.65);
        ctx.lineWidth = 1.7;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 14.5, y + Math.sin(a) * 14.5, 2.1, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // soft fabric shading
  const vg = ctx.createRadialGradient(512, 460, 80, 512, 512, 720);
  vg.addColorStop(0, 'rgba(255,255,255,0.045)');
  vg.addColorStop(1, 'rgba(4,10,22,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 1024, 1024);

  return canvasTexture(canvas);
}

function makeClothTexture(seed = 71, base = '#e9e1d2') {
  const { canvas, ctx } = createCanvas(512, 512);
  const rand = makeRandom(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = `rgba(${rand.chance(0.5) ? '255,255,255' : '92,80,64'},${rand.range(0.012, 0.045)})`;
    ctx.fillRect(rand.range(0, 512), rand.range(0, 512), rand.range(1, 4), 1);
  }
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(120,105,85,${rand.range(0.015, 0.04)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(rand.range(0, 512), 0);
    ctx.lineTo(rand.range(0, 512), 512);
    ctx.stroke();
  }
  return canvasTexture(canvas, { repeat: [2, 2] });
}

/* ------------------------------------------------------------------ */
/*  Paintings                                                          */
/* ------------------------------------------------------------------ */

function makeScrollTexture(seed = 81) {
  const { canvas, ctx } = createCanvas(512, 1024);
  const rand = makeRandom(seed);
  // aged paper
  const bg = ctx.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, '#efe5d2');
  bg.addColorStop(0.55, '#e9dec9');
  bg.addColorStop(1, '#e4d6be');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 1024);

  // paper mottling
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(130,108,80,${rand.range(0.01, 0.035)})`;
    const x = rand.range(0, 512);
    const y = rand.range(0, 1024);
    ctx.beginPath();
    ctx.ellipse(x, y, rand.range(4, 26), rand.range(1, 4), rand.range(-0.4, 0.4), 0, TAU);
    ctx.fill();
  }

  // distant mountains washed in ink
  const mountain = (baseY, height, alpha, color) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, 1024);
    ctx.lineTo(0, baseY);
    ctx.bezierCurveTo(80, baseY - height * 0.55, 130, baseY - height, 210, baseY - height * 0.7);
    ctx.bezierCurveTo(280, baseY - height * 0.5, 330, baseY - height * 1.1, 430, baseY - height * 0.5);
    ctx.bezierCurveTo(470, baseY - height * 0.3, 500, baseY - height * 0.2, 512, baseY);
    ctx.lineTo(512, 1024);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  mountain(560, 250, 0.16, '#536272');
  mountain(660, 300, 0.24, '#41515f');
  mountain(780, 220, 0.16, '#66727b');

  // snow caps / paper white
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#f6efe2';
  for (let i = 0; i < 8; i++) {
    const y = 470 + i * 34 + rand.range(-12, 12);
    ctx.beginPath();
    ctx.ellipse(rand.range(60, 450), y, rand.range(40, 120), rand.range(5, 18), rand.range(-0.12, 0.12), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // mist bands
  for (let i = 0; i < 5; i++) {
    const y = rand.range(560, 900);
    const g = ctx.createLinearGradient(0, y - 20, 0, y + 40);
    g.addColorStop(0, 'rgba(245,238,226,0)');
    g.addColorStop(0.5, `rgba(245,238,226,${rand.range(0.3, 0.55)})`);
    g.addColorStop(1, 'rgba(245,238,226,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 20, 512, 60);
  }

  // pines
  const pine = (x, y, s, alpha) => {
    ctx.strokeStyle = `rgba(38,45,48,${alpha})`;
    ctx.lineWidth = Math.max(1.4, 4 * s);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 8 * s, y - 30 * s, x + 14 * s, y - 52 * s, x + 2 * s, y - 84 * s);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const yy = y - rand.range(18, 84) * s;
      const dir = rand.chance(0.5) ? -1 : 1;
      ctx.lineWidth = Math.max(0.8, 2.1 * s);
      ctx.beginPath();
      ctx.moveTo(x + 2 * s, yy);
      ctx.quadraticCurveTo(x + dir * 26 * s, yy - 5 * s, x + dir * rand.range(20, 54) * s, yy - rand.range(2, 12) * s);
      ctx.stroke();
      // snow on branch
      ctx.strokeStyle = `rgba(246,242,232,${alpha * 0.75})`;
      ctx.lineWidth = Math.max(0.7, 2.3 * s);
      ctx.beginPath();
      ctx.moveTo(x + 3 * s, yy - 2 * s);
      ctx.quadraticCurveTo(x + dir * 25 * s, yy - 8 * s, x + dir * rand.range(18, 46) * s, yy - rand.range(4, 13) * s);
      ctx.stroke();
      ctx.strokeStyle = `rgba(38,45,48,${alpha})`;
    }
  };
  pine(120, 900, 1.05, 0.72);
  pine(340, 930, 0.85, 0.6);
  pine(430, 860, 0.55, 0.45);

  // calligraphy column and seal
  ctx.save();
  ctx.fillStyle = 'rgba(40,40,38,0.66)';
  ctx.font = '34px "Yu Mincho", "Songti SC", serif';
  ctx.textAlign = 'center';
  const chars = ['雪', '庭', '見', '私', '湯'];
  chars.forEach((ch, i) => ctx.fillText(ch, 64, 190 + i * 52));
  ctx.restore();
  ctx.fillStyle = 'rgba(156,58,42,0.82)';
  ctx.fillRect(42, 470, 42, 42);
  ctx.fillStyle = 'rgba(245,238,226,0.92)';
  ctx.font = '27px "Yu Mincho", serif';
  ctx.textAlign = 'center';
  ctx.fillText('雪', 63, 502);

  return canvasTexture(canvas);
}

function makeBackdropPaper(seed = 73) {
  const W = 2048;
  const H = 1024;
  const { canvas, ctx } = createCanvas(W, H);
  const rand = makeRandom(seed);

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#e8e3d8');
  base.addColorStop(0.42, '#f2eadc');
  base.addColorStop(0.75, '#eadfcd');
  base.addColorStop(1, '#d9cbb6');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // wide dye washes: indigo above, dusty rose and gold below
  const wash = (cx, cy, rx, ry, color, alpha) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(0.55, `rgba(${color},${alpha * 0.45})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  wash(W * 0.12, H * 0.08, W * 0.46, H * 0.42, '82,96,116', 0.22);
  wash(W * 0.88, H * 0.12, W * 0.36, H * 0.36, '94,100,126', 0.18);
  wash(W * 0.72, H * 0.55, W * 0.32, H * 0.4, '184,142,124', 0.14);
  wash(W * 0.28, H * 0.78, W * 0.45, H * 0.3, '192,164,118', 0.14);
  wash(W * 0.55, H * 0.95, W * 0.5, H * 0.3, '142,122,94', 0.12);

  // broad brush streaks of dye
  for (let i = 0; i < 16; i++) {
    const y = rand.range(0, H);
    const h = rand.range(10, 55);
    const g = ctx.createLinearGradient(0, y, W, y + h);
    g.addColorStop(0, 'rgba(93,108,128,0)');
    g.addColorStop(0.4, `rgba(93,108,128,${rand.range(0.012, 0.04)})`);
    g.addColorStop(1, 'rgba(93,108,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, h);
  }

  // paper fibers
  for (let i = 0; i < 5000; i++) {
    const x = rand.range(0, W);
    const y = rand.range(0, H);
    const len = rand.range(8, 80);
    const a = rand.range(-0.12, 0.12);
    ctx.strokeStyle = `rgba(${rand.chance(0.5) ? '114,100,82' : '255,252,244'},${rand.range(0.02, 0.07)})`;
    ctx.lineWidth = rand.range(0.5, 1.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5,
      y + Math.sin(a) * len * 0.5 + rand.range(-1.5, 1.5),
      x + Math.cos(a) * len,
      y + Math.sin(a) * len
    );
    ctx.stroke();
  }

  // faint ink mountain horizon at the lower edge
  ctx.globalAlpha = 0.11;
  ctx.fillStyle = '#5f6870';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.84);
  for (let x = 0; x <= W; x += 40) {
    const y = H * 0.86 - Math.sin(x * 0.0021) * 55 - Math.sin(x * 0.0008 + 1.2) * 32;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // light flecks
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(255,250,238,${rand.range(0.03, 0.1)})`;
    ctx.fillRect(rand.range(0, W), rand.range(0, H), rand.range(1, 3), rand.range(1, 2));
  }

  return canvasTexture(canvas);
}

function makeByobuTexture(seed = 91) {
  const W = 2560;
  const H = 800;
  const { canvas, ctx } = createCanvas(W, H);
  const rand = makeRandom(seed);
  // aged gold / pale silk
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#e6dcc7');
  bg.addColorStop(0.5, '#ded0b6');
  bg.addColorStop(1, '#cfc0a5');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // gold flake flecks
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${rand.chance(0.7) ? '210,188,146' : '120,100,72'},${rand.range(0.02, 0.09)})`;
    ctx.fillRect(rand.range(0, W), rand.range(0, H), rand.range(1, 5), rand.range(0.6, 3));
  }
  // soft ink clouds
  for (let i = 0; i < 20; i++) {
    const x = rand.range(0, W);
    const y = rand.range(0, H);
    const r = rand.range(100, 360);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(98,104,106,${rand.range(0.02, 0.05)})`);
    g.addColorStop(1, 'rgba(98,104,106,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // distant snowy ridges
  const ridge = (yBase, h, alpha, color) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, yBase);
    for (let x = 0; x <= W; x += 80) {
      const y = yBase - Math.sin(x * 0.0021 + h) * h * 0.36 - Math.sin(x * 0.0007) * h * 0.64;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  ridge(H * 0.84, 170, 0.14, '#59636a');
  ridge(H * 0.9, 120, 0.16, '#475158');

  // snow banks
  ctx.fillStyle = 'rgba(240,233,219,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.82);
  ctx.bezierCurveTo(W * 0.2, H * 0.78, W * 0.35, H * 0.87, W * 0.52, H * 0.84);
  ctx.bezierCurveTo(W * 0.7, H * 0.81, W * 0.82, H * 0.9, W, H * 0.85);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // pale pine silhouettes
  const pine = (x, y, s, a) => {
    ctx.strokeStyle = `rgba(58,66,64,${a})`;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 20 * s, y - 60 * s, x + 24 * s, y - 110 * s, x + 4 * s, y - 190 * s);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const yy = y - rand.range(40, 190) * s;
      const dir = rand.chance(0.5) ? -1 : 1;
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(x + 2 * s, yy);
      ctx.quadraticCurveTo(x + dir * 50 * s, yy - 8 * s, x + dir * rand.range(45, 110) * s, yy - rand.range(4, 26) * s);
      ctx.stroke();
      ctx.strokeStyle = `rgba(244,238,226,${a * 0.7})`;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(x + 3 * s, yy - 3 * s);
      ctx.quadraticCurveTo(x + dir * 48 * s, yy - 10 * s, x + dir * rand.range(42, 100) * s, yy - rand.range(6, 27) * s);
      ctx.stroke();
      ctx.strokeStyle = `rgba(58,66,64,${a})`;
    }
  };
  pine(470, 780, 1.5, 0.24);
  pine(1380, 800, 1.1, 0.18);
  pine(2110, 790, 1.55, 0.2);

  // mist bands
  for (let i = 0; i < 6; i++) {
    const y = rand.range(H * 0.6, H * 0.9);
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 50);
    g.addColorStop(0, 'rgba(238,232,218,0)');
    g.addColorStop(0.5, `rgba(238,232,218,${rand.range(0.2, 0.5)})`);
    g.addColorStop(1, 'rgba(238,232,218,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 30, W, 80);
  }

  // faint gold gloss
  const gloss = ctx.createLinearGradient(0, 0, W, H);
  gloss.addColorStop(0, 'rgba(255,248,228,0.08)');
  gloss.addColorStop(0.5, 'rgba(255,248,228,0)');
  gloss.addColorStop(1, 'rgba(70,58,40,0.08)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, W, H);

  const tex = canvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Round-window forest masks                                          */
/* ------------------------------------------------------------------ */

function makeForestMask(seed = 101, type = 'near') {
  const S = 1024;
  const { canvas, ctx } = createCanvas(S, S);
  const rand = makeRandom(seed);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#fff';

  const tree = (x, baseY, h, spread, alpha = 1, slim = 1) => {
    ctx.globalAlpha = alpha;
    const trunkW = Math.max(2, h * 0.02 * slim);
    // trunk
    ctx.beginPath();
    ctx.moveTo(x - trunkW, baseY);
    ctx.quadraticCurveTo(x - trunkW * 0.6, baseY - h * 0.5, x - trunkW * 0.25, baseY - h);
    ctx.lineTo(x + trunkW * 0.25, baseY - h);
    ctx.quadraticCurveTo(x + trunkW * 0.6, baseY - h * 0.5, x + trunkW, baseY);
    ctx.closePath();
    ctx.fill();
    // branches as soft irregular masses
    for (let i = 0; i < 16; i++) {
      const t = rand.range(0.25, 0.95);
      const y = baseY - h * t;
      const dir = rand.chance(0.5) ? -1 : 1;
      const len = spread * rand.range(0.25, 1) * (1 - t * 0.35);
      const thick = Math.max(2, h * rand.range(0.006, 0.018));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dir * len * 0.5, y - h * rand.range(0.02, 0.07), x + dir * len, y + h * rand.range(-0.02, 0.02));
      ctx.lineWidth = thick;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      // drooping twigs
      for (let k = 0; k < 3; k++) {
        const bx = x + dir * len * rand.range(0.4, 1);
        const by = y + h * rand.range(-0.02, 0.03);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + dir * 12, by + h * 0.03, bx + dir * rand.range(2, 20), by + h * rand.range(0.04, 0.12));
        ctx.lineWidth = Math.max(1, thick * 0.4);
        ctx.stroke();
      }
    }
  };

  if (type === 'near') {
    // forest floor / bank
    ctx.beginPath();
    ctx.moveTo(0, S);
    ctx.lineTo(0, 760);
    for (let x = 0; x <= S; x += 40) {
      ctx.lineTo(x, 780 - Math.sin(x * 0.008) * 40 - rand.range(0, 20));
    }
    ctx.lineTo(S, S);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const x = rand.range(0, S);
      tree(x, rand.range(820, 960), rand.range(280, 560), rand.range(50, 150), rand.range(0.5, 1), rand.range(0.7, 1.4));
    }
    // a few foreground trunks at edges
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? rand.range(20, 90) : rand.range(S - 90, S - 20);
      tree(x, S + 60, rand.range(600, 780), rand.range(70, 120), 0.9, 1.6);
    }
  } else {
    // far treeline
    ctx.beginPath();
    ctx.moveTo(0, S);
    ctx.lineTo(0, 700);
    for (let x = 0; x <= S; x += 30) {
      ctx.lineTo(x, 710 - Math.sin(x * 0.013 + 2) * 30 - Math.sin(x * 0.003) * 30);
    }
    ctx.lineTo(S, S);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 34; i++) {
      const x = rand.range(-30, S + 30);
      tree(x, rand.range(760, 850), rand.range(150, 330), rand.range(30, 90), rand.range(0.35, 0.75), rand.range(0.6, 1.2));
    }
  }
  ctx.globalAlpha = 1;

  const tex = canvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Small sprite / decal textures                                      */
/* ------------------------------------------------------------------ */

function makeFootprintTexture() {
  const { canvas, ctx } = createCanvas(256, 384);
  ctx.clearRect(0, 0, 256, 384);
  ctx.save();
  ctx.translate(128, 192);

  const sole = (y, w, h, r) => {
    // compressed snow rim
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 5, y - h / 2 - 5, w + 10, h + 10, r + 4);
    ctx.fill();
    // blue shadow of the print
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, 'rgba(76,96,120,0.62)');
    g.addColorStop(1, 'rgba(92,112,134,0.38)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, y - h / 2, w, h, r);
    ctx.fill();
    // inner darker center
    ctx.fillStyle = 'rgba(58,76,98,0.3)';
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 6, y - h / 2 + 6, w - 12, h - 12, r - 2);
    ctx.fill();
  };
  // toe and heel
  sole(-60, 120, 150, 56);
  sole(92, 96, 120, 44);
  // arch gap
  ctx.fillStyle = 'rgba(240,246,252,0.2)';
  ctx.beginPath();
  ctx.ellipse(-46, 26, 16, 28, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // little kicked snow crumbs
  const rand = makeRandom(9);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand.range(0.1, 0.3)})`;
    ctx.beginPath();
    ctx.arc(rand.range(24, 232), rand.range(16, 368), rand.range(1, 4), 0, TAU);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

function makeFlameTexture(seed = 5) {
  const W = 256;
  const H = 512;
  const { canvas, ctx } = createCanvas(W, H);
  const rand = makeRandom(seed);
  ctx.clearRect(0, 0, W, H);

  const tongue = (cx, baseY, w, h, alpha) => {
    const g = ctx.createRadialGradient(cx, baseY - h * 0.32, 4, cx, baseY - h * 0.35, h * 0.68);
    g.addColorStop(0, `rgba(255,250,224,${alpha})`);
    g.addColorStop(0.24, `rgba(255,223,148,${alpha * 0.95})`);
    g.addColorStop(0.5, `rgba(255,161,74,${alpha * 0.8})`);
    g.addColorStop(0.76, `rgba(226,92,38,${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(180,50,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, baseY);
    ctx.bezierCurveTo(
      cx - w * 0.64,
      baseY - h * 0.26,
      cx - w * 0.26,
      baseY - h * 0.52,
      cx + w * rand.range(-0.04, 0.04),
      baseY - h
    );
    ctx.bezierCurveTo(
      cx + w * 0.3,
      baseY - h * 0.55,
      cx + w * 0.6,
      baseY - h * 0.24,
      cx + w * 0.5,
      baseY
    );
    ctx.closePath();
    ctx.fill();
  };

  tongue(W * 0.5, H * 0.97, W * 0.46, H * 0.86, 0.9);
  tongue(W * 0.38, H * 0.98, W * 0.24, H * 0.6, 0.7);
  tongue(W * 0.62, H * 0.98, W * 0.2, H * 0.55, 0.65);

  // bright core
  const core = ctx.createRadialGradient(W * 0.5, H * 0.85, 2, W * 0.5, H * 0.85, W * 0.3);
  core.addColorStop(0, 'rgba(255,255,240,0.9)');
  core.addColorStop(0.5, 'rgba(255,238,180,0.4)');
  core.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, W, H);

  // stray sparks baked lightly
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(255,214,140,${rand.range(0.1, 0.4)})`;
    ctx.beginPath();
    ctx.arc(rand.range(W * 0.3, W * 0.7), rand.range(H * 0.1, H * 0.55), rand.range(0.6, 2.2), 0, TAU);
    ctx.fill();
  }

  return canvasTexture(canvas);
}

function makeSnowflakeTexture() {
  const S = 128;
  const { canvas, ctx } = createCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}

function makeEmberTexture() {
  const S = 64;
  const { canvas, ctx } = createCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,245,210,1)');
  g.addColorStop(0.18, 'rgba(255,196,110,0.95)');
  g.addColorStop(0.5, 'rgba(255,120,48,0.42)');
  g.addColorStop(1, 'rgba(200,60,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}

function makeSplashTexture() {
  const S = 64;
  const { canvas, ctx } = createCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.35, 'rgba(228,244,246,0.7)');
  g.addColorStop(0.7, 'rgba(206,230,234,0.2)');
  g.addColorStop(1, 'rgba(200,228,232,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas);
}

function makeSteamTexture() {
  const S = 256;
  const { canvas, ctx } = createCanvas(S, S);
  const rand = makeRandom(17);
  ctx.clearRect(0, 0, S, S);
  // dense, soft body of vapour
  for (let i = 0; i < 18; i++) {
    const x = S * rand.range(0.32, 0.68);
    const y = S * rand.range(0.36, 0.68);
    const rx = S * rand.range(0.14, 0.3);
    const ry = S * rand.range(0.17, 0.36);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(255,255,255,${rand.range(0.68, 0.92)})`);
    g.addColorStop(0.4, `rgba(255,255,255,${rand.range(0.25, 0.42)})`);
    g.addColorStop(0.72, `rgba(255,255,255,${rand.range(0.06, 0.14)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // wisps
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${rand.range(0.1, 0.22)})`;
    ctx.lineWidth = rand.range(5, 14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const y = S * rand.range(0.3, 0.66);
    ctx.moveTo(S * 0.33, y);
    ctx.bezierCurveTo(S * 0.44, y - 34, S * 0.58, y + 38, S * 0.69, y - 14);
    ctx.stroke();
  }
  // fade the outside corners so it reads as a plume rather than a square
  const mask = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.52);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.7, 'rgba(0,0,0,0.08)');
  mask.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return canvasTexture(canvas);
}

function makeNameplateTexture() {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = createCanvas(W, H);
  const rand = makeRandom(4);
  // brushed brass
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#b99a63');
  bg.addColorStop(0.18, '#a88850');
  bg.addColorStop(0.6, '#9c7c47');
  bg.addColorStop(1, '#7f6438');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = `rgba(${rand.chance(0.5) ? '247,229,189' : '72,53,25'},${rand.range(0.01, 0.05)})`;
    ctx.fillRect(rand.range(0, W), rand.range(0, H), rand.range(6, 40), 0.8);
  }
  // patina at edges
  const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(255,245,215,0.05)');
  vg.addColorStop(0.7, 'rgba(40,30,10,0)');
  vg.addColorStop(1, 'rgba(40,30,10,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // inset border
  ctx.strokeStyle = 'rgba(52,37,16,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.strokeStyle = 'rgba(255,240,200,0.24)';
  ctx.lineWidth = 2;
  ctx.strokeRect(27, 27, W - 54, H - 54);

  // engraved text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(46,32,14,0.86)';
  ctx.font = '500 54px "Yu Mincho", "Songti SC", serif';
  ctx.fillText('京 都 雪 庭 ・ 雪 見 私 湯', W / 2, 102);
  ctx.fillStyle = 'rgba(52,38,18,0.6)';
  ctx.font = '20px "Avenir Next", "Gill Sans", sans-serif';
  ctx.fillText('K Y O T O   S N O W   G A R D E N', W / 2, 158);
  ctx.fillStyle = 'rgba(150,52,36,0.9)';
  ctx.fillRect(W / 2 + 292, 80, 30, 30);
  ctx.fillStyle = 'rgba(245,231,205,0.9)';
  ctx.font = '18px "Yu Mincho", serif';
  ctx.fillText('雪', W / 2 + 307, 97);
  return canvasTexture(canvas);
}

function makeWaterNormalTexture(seed = 111) {
  // Tileable wave height image for subtle water detail
  const S = 256;
  const { canvas, ctx } = createCanvas(S, S);
  const img = ctx.createImageData(S, S);
  const rand = makeRandom(seed);
  const waves = [];
  for (let i = 0; i < 7; i++) {
    waves.push({
      a: rand.range(0.4, 1.4),
      fx: rand.int(1, 3),
      fy: rand.int(1, 3),
      px: rand.range(0, TAU),
      py: rand.range(0, TAU),
    });
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0.5;
      for (const w of waves) {
        v += Math.sin((x / S) * TAU * w.fx + w.px) * Math.sin((y / S) * TAU * w.fy + w.py) * 0.09 * w.a;
      }
      const c = clamp(v, 0, 1) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(canvas, { srgb: false });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ------------------------------------------------------------------ */

export function buildTextures() {
  const wood = makeWoodTexture(11);
  const deck = makeDeckTexture(3);
  const washi = makeWashiTexture(21, 1500);
  const backdropWashi = makeBackdropPaper(73);
  const shoji = makeShojiTexture(33);
  const tatami = makeTatamiTexture(41);
  const tile = makeTileTexture(51);
  const indigoWaves = makeIndigoTexture('waves', 61);
  const indigoHemp = makeIndigoTexture('hemp', 62);
  const indigoFlower = makeIndigoTexture('flower', 63);
  const cloth = makeClothTexture(71);
  const scroll = makeScrollTexture(81);
  const byobu = makeByobuTexture(91);
  const forestNear = makeForestMask(101, 'near');
  const forestFar = makeForestMask(112, 'far');
  const footprint = makeFootprintTexture();
  const flame = makeFlameTexture(5);
  const flameSoft = makeFlameTexture(14);
  const snowflake = makeSnowflakeTexture();
  const ember = makeEmberTexture();
  const splash = makeSplashTexture();
  const steam = makeSteamTexture();
  const nameplate = makeNameplateTexture();
  const waterNormal = makeWaterNormalTexture(111);

  return {
    wood,
    deck,
    washi,
    backdropWashi,
    shoji,
    tatami,
    tile,
    indigoWaves,
    indigoHemp,
    indigoFlower,
    cloth,
    scroll,
    byobu,
    forestNear,
    forestFar,
    footprint,
    flame,
    flameSoft,
    snowflake,
    ember,
    splash,
    steam,
    nameplate,
    waterNormal,
  };
}
