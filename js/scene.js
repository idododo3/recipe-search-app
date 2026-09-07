/* ============================================================
   scene.js — במת המשחק: נהר, שקיעה, גלים, מצלמה נעה וחלקיקים
   ============================================================ */

const Scene = (() => {
  'use strict';

  const W = 1280, H = 720;          // מידות עולם קבועות
  const HORIZON = 292;
  const WATER_TOP = 404;
  const BANK_Y = 566;               // הקו שעליו הדמויות עומדות
  const DOCK = { west: 492, east: 788 };
  const BOAT_Y = 584;
  const ACTOR_SCALE = 1.2;

  const SLOT = {
    west: { wolf: 80, sheep: 200, cabbage: 320 },
    east: { wolf: 1200, sheep: 1080, cabbage: 960 }
  };
  const SEAT = { farmer: -40, cargo: 38 };
  const SEAT_Y = { farmer: -6, cargo: -4 };
  const BOAT_SCALE = 1.12;
  const IN_BOAT_SCALE = 0.95;

  let cv, ctx, dpr = 1;
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let time = 0;

  const cam = { x: W / 2, y: H / 2, zoom: 1, roll: 0, shake: 0 };

  const boat = { x: DOCK.west, y: BOAT_Y, face: 1, rowing: false, tilt: 0, bob: 0 };

  const actors = {
    farmer: { x: DOCK.west - 40, y: BANK_Y, tx: 0, ty: 0, face: 1, walking: false, hidden: false, scale: 1, alpha: 1 },
    wolf: { x: SLOT.west.wolf, y: BANK_Y, tx: 0, ty: 0, face: 1, walking: false, hidden: false, scale: 1, alpha: 1 },
    sheep: { x: SLOT.west.sheep, y: BANK_Y, tx: 0, ty: 0, face: 1, walking: false, hidden: false, scale: 1, alpha: 1 },
    cabbage: { x: SLOT.west.cabbage, y: BANK_Y, tx: 0, ty: 0, face: 1, walking: false, hidden: false, scale: 1, alpha: 1 }
  };

  let mood = { hungryWolf: false, worriedCabbage: false };
  let sailing = null;               // אנימציית ההפלגה הפעילה
  let hoverId = null;
  let selectedId = null;

  const particles = [];
  const ripples = [];
  const clouds = [];
  const birds = [];
  const sparkles = [];
  const gulls = { next: 6 };

  /* ================= אתחול ================= */

  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d', { alpha: false });

    for (let i = 0; i < 9; i++) {
      clouds.push({
        x: Math.random() * (W + 500) - 250,
        y: 40 + Math.random() * 190,
        s: 0.5 + Math.random() * 1.1,
        v: 3 + Math.random() * 9,
        a: 0.25 + Math.random() * 0.4
      });
    }
    for (let i = 0; i < 5; i++) {
      birds.push({
        x: Math.random() * W,
        y: 90 + Math.random() * 130,
        v: 16 + Math.random() * 22,
        p: Math.random() * 6,
        s: 0.6 + Math.random() * 0.7
      });
    }
    for (let i = 0; i < 90; i++) {
      sparkles.push({
        x: Math.random() * W,
        y: WATER_TOP + Math.random() * (H - WATER_TOP),
        r: 0.6 + Math.random() * 2.2,
        p: Math.random() * 6.28,
        sp: 0.6 + Math.random() * 2.4
      });
    }

    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = cv.clientWidth || window.innerWidth;
    const ch = cv.clientHeight || window.innerHeight;
    cv.width = Math.floor(cw * dpr);
    cv.height = Math.floor(ch * dpr);
    const scale = Math.min(cw / W, ch / H);
    view = { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, w: cw, h: ch };
  }

  /* ================= המרות קואורדינטות ================= */

  function toWorld(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    // ביטול התאמת המסך
    const vx = (sx - view.ox) / view.scale;
    const vy = (sy - view.oy) / view.scale;
    // ביטול המצלמה
    return {
      x: (vx - W / 2) / cam.zoom + cam.x,
      y: (vy - H / 2) / cam.zoom + cam.y
    };
  }

  const HIT = {
    wolf: { w: 62 * ACTOR_SCALE, h: 78 * ACTOR_SCALE },
    sheep: { w: 56 * ACTOR_SCALE, h: 72 * ACTOR_SCALE },
    cabbage: { w: 52 * ACTOR_SCALE, h: 62 * ACTOR_SCALE },
    farmer: { w: 46 * ACTOR_SCALE, h: 80 * ACTOR_SCALE }
  };

  function hitTest(clientX, clientY) {
    const p = toWorld(clientX, clientY);
    let found = null;
    ['cabbage', 'sheep', 'wolf'].forEach(id => {
      const a = actors[id];
      if (a.hidden) return;
      const box = HIT[id];
      if (Math.abs(p.x - a.x) < box.w / 2 && p.y > a.y - box.h && p.y < a.y + 14) found = id;
    });
    return found;
  }

  /* ================= סנכרון עם מצב המשחק ================= */

  function targetFor(id, state) {
    const inBoat = state.boat.indexOf(id) >= 0;
    if (id === 'farmer') {
      return { x: boat.x + SEAT.farmer * boat.face, y: boat.y + SEAT_Y.farmer, boat: true, seat: 'farmer' };
    }
    if (inBoat) return { x: boat.x + SEAT.cargo * boat.face, y: boat.y + SEAT_Y.cargo, boat: true, seat: 'cargo' };
    const side = state.pos[id];
    return { x: SLOT[side][id], y: BANK_Y, boat: false };
  }

  function sync(state, instant) {
    boat.face = state.side === 'west' ? 1 : -1;
    if (!sailing) boat.x = DOCK[state.side];
    Object.keys(actors).forEach(id => {
      const a = actors[id];
      const t = targetFor(id, state);
      a.tx = t.x; a.ty = t.y; a.onBoat = t.boat; a.seat = t.seat || null;
      if (instant) { a.x = t.x; a.y = t.y; }
    });
    mood.hungryWolf = state.pos.wolf === state.pos.sheep && state.pos.wolf !== state.side;
    mood.worriedCabbage = state.pos.sheep === state.pos.cabbage && state.pos.sheep !== state.side;
  }

  function setHover(id) { hoverId = id; }
  function setSelected(id) { selectedId = id; }

  /* ================= אנימציות ================= */

  function sail(from, to, onDone) {
    const dist = Math.abs(DOCK[to] - DOCK[from]);
    sailing = {
      t: 0,
      dur: 3.1,
      from: DOCK[from],
      to: DOCK[to],
      dir: DOCK[to] > DOCK[from] ? 1 : -1,
      dist,
      done: onDone,
      fired: false
    };
    boat.rowing = true;
  }

  const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

  function updateSail(dt) {
    if (!sailing) return;
    const s = sailing;
    s.t += dt;
    const p = Math.min(1, s.t / s.dur);
    const e = easeInOut(p);

    boat.x = s.from + (s.to - s.from) * e;
    // קשת אל מול הצופה — הסירה מתקרבת במרכז הנהר
    const arc = Math.sin(p * Math.PI);
    boat.y = BOAT_Y + arc * 20;
    boat.face = s.dir;
    boat.tilt = Math.sin(time * 3.4) * 0.035 * (0.35 + arc);

    // "שוחים עם הספינה": המצלמה נצמדת, מתקרבת ומתנדנדת
    const follow = 0.35 + arc * 0.65;
    cam.x = W / 2 + (boat.x - W / 2) * follow;
    cam.y = H / 2 + arc * 72;
    cam.zoom = 1 + arc * 0.32;
    cam.roll = Math.sin(time * 2.2) * 0.008 * arc;

    // רסס מהחרטום
    if (Math.random() < 0.85) {
      const bow = boat.x + 58 * s.dir;
      particles.push({
        x: bow, y: boat.y + 6,
        vx: s.dir * (40 + Math.random() * 130), vy: -60 - Math.random() * 120,
        g: 260, life: 0.5 + Math.random() * 0.6, t: 0,
        r: 1.6 + Math.random() * 3.4, c: 'rgba(226,246,255,'
      });
    }
    if (Math.random() < 0.35) {
      ripples.push({ x: boat.x - 40 * s.dir, y: boat.y + 12, r: 6, max: 70 + Math.random() * 50, t: 0, life: 1.5 });
    }

    if (p >= 1 && !s.fired) {
      s.fired = true;
      boat.rowing = false;
      splash(boat.x, boat.y + 10, 16);
      sailing = null;
      cam.roll = 0;
      if (s.done) s.done();
    }
  }

  function relaxCamera(dt) {
    if (sailing) return;
    const k = Math.min(1, dt * 3);
    cam.x += (W / 2 - cam.x) * k;
    cam.y += (H / 2 - cam.y) * k;
    cam.zoom += (1 - cam.zoom) * k;
    cam.roll += (0 - cam.roll) * k;
  }

  function splash(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 70 + Math.random() * 190;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: 320, life: 0.6 + Math.random() * 0.5, t: 0,
        r: 1.8 + Math.random() * 3.6, c: 'rgba(226,246,255,'
      });
    }
    ripples.push({ x, y, r: 8, max: 110, t: 0, life: 1.7 });
  }

  function confetti() {
    const cols = ['255,207,92', '92,230,164', '232,98,79', '140,200,255', '255,255,255'];
    for (let i = 0; i < 130; i++) {
      particles.push({
        x: 300 + Math.random() * 680, y: 120 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 260, vy: -60 - Math.random() * 190,
        g: 300, life: 2.2 + Math.random() * 1.4, t: 0,
        r: 2.4 + Math.random() * 4.2, c: 'rgba(' + cols[i % cols.length] + ',',
        spin: (Math.random() - 0.5) * 12, flat: true, a: Math.random() * 6
      });
    }
  }

  function shake(amount) { cam.shake = amount; }

  function poof(x, y, color) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      particles.push({
        x, y: y - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        g: 120, life: 0.7 + Math.random() * 0.6, t: 0,
        r: 3 + Math.random() * 6, c: color
      });
    }
  }

  /* ================= עדכון ================= */

  function update(dt) {
    time += dt;

    updateSail(dt);
    relaxCamera(dt);

    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 26);

    boat.bob = Math.sin(time * 1.9) * 3;

    // תנועת הדמויות אל היעד
    Object.keys(actors).forEach(id => {
      const a = actors[id];
      if (a.onBoat && a.seat) {
        // נוסעי הסירה נגררים איתה בכל פריים
        a.tx = boat.x + SEAT[a.seat] * boat.face;
        a.ty = boat.y + boat.bob + SEAT_Y[a.seat];
        a.face = boat.face;
      }
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const d = Math.hypot(dx, dy);
      a.walking = d > 3 && !a.onBoat;
      if (d > 0.4) {
        const k = Math.min(1, dt * (a.onBoat ? 9 : 5.5));
        a.x += dx * k;
        a.y += dy * k;
        if (Math.abs(dx) > 2) a.face = dx > 0 ? 1 : -1;
      } else { a.x = a.tx; a.y = a.ty; }
      if (a.onBoat) { a.x = a.tx; a.y = a.ty; }
    });

    // עננים
    clouds.forEach(c => {
      c.x += c.v * dt * 0.5;
      if (c.x > W + 300) c.x = -300;
    });
    birds.forEach(b => {
      b.x += b.v * dt;
      b.p += dt * 7;
      if (b.x > W + 60) { b.x = -60; b.y = 80 + Math.random() * 140; }
    });

    gulls.next -= dt;
    if (gulls.next <= 0) { gulls.next = 9 + Math.random() * 14; if (window.Sound) Sound.sfx.gull(); }

    // חלקיקים
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.a += p.spin * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += dt;
      if (r.t >= r.life) { ripples.splice(i, 1); continue; }
      r.r = 8 + (r.max - 8) * (r.t / r.life);
    }

    // אדוות אקראיות בנהר
    if (Math.random() < dt * 2.2) {
      ripples.push({
        x: 380 + Math.random() * 520,
        y: WATER_TOP + 60 + Math.random() * (H - WATER_TOP - 90),
        r: 4, max: 40 + Math.random() * 50, t: 0, life: 2.2
      });
    }
  }

  /* ================= שכבות רקע מוכנות מראש ================= */

  // אזור העולם שנצרב לתמונה (רחב מהמסך כדי לכסות זום ותזוזת מצלמה)
  const BAKE = { x: -280, y: -180, w: 1840, h: 1120, q: 1.4 };
  let layerSky = null, layerBank = null;

  function makeLayer(draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(BAKE.w * BAKE.q);
    c.height = Math.ceil(BAKE.h * BAKE.q);
    const g = c.getContext('2d');
    g.setTransform(BAKE.q, 0, 0, BAKE.q, -BAKE.x * BAKE.q, -BAKE.y * BAKE.q);
    const prev = ctx;
    ctx = g;
    draw();
    ctx = prev;
    return c;
  }

  function bake() {
    layerSky = makeLayer(() => { drawSkyStatic(); drawFarShore(); drawWaterBase(); });
    layerBank = makeLayer(() => {
      drawBank('west'); drawBank('east');
      drawBankDeco('west'); drawBankDeco('east');
    });
  }

  /* ================= ציור הרקע ================= */

  function drawSkyStatic() {
    const g = ctx.createLinearGradient(0, -120, 0, HORIZON + 60);
    g.addColorStop(0, '#132a52');
    g.addColorStop(0.35, '#3a5f8f');
    g.addColorStop(0.68, '#c97b6a');
    g.addColorStop(0.86, '#f2a463');
    g.addColorStop(1, '#ffd79a');
    ctx.fillStyle = g;
    ctx.fillRect(BAKE.x, BAKE.y, BAKE.w, HORIZON + 60 - BAKE.y);

    const sx = 690, sy = HORIZON - 34;
    const glow = ctx.createRadialGradient(sx, sy, 6, sx, sy, 250);
    glow.addColorStop(0, 'rgba(255,236,180,.95)');
    glow.addColorStop(0.25, 'rgba(255,190,110,.45)');
    glow.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c8';
    ctx.beginPath();
    ctx.arc(sx, sy, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSkyDynamic() {
    clouds.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.a;
      ctx.translate(c.x, c.y);
      ctx.scale(c.s, c.s * 0.72);
      const cg = ctx.createLinearGradient(0, -30, 0, 26);
      cg.addColorStop(0, 'rgba(255,238,220,.95)');
      cg.addColorStop(1, 'rgba(196,140,150,.65)');
      ctx.fillStyle = cg;
      Art.blob(ctx, 0, 0, 42, 0.18, c.x * 0.01, time * 0.15);
      ctx.fill();
      Art.blob(ctx, -44, 8, 26, 0.2, c.y * 0.02, time * 0.15);
      ctx.fill();
      Art.blob(ctx, 46, 10, 30, 0.2, c.s * 3, time * 0.15);
      ctx.fill();
      ctx.restore();
    });

    ctx.strokeStyle = 'rgba(30,40,60,.55)';
    ctx.lineWidth = 2;
    birds.forEach(b => {
      const f = Math.sin(b.p) * 5;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.s, b.s);
      ctx.beginPath();
      ctx.moveTo(-9, f);
      ctx.quadraticCurveTo(-4, -4, 0, 0);
      ctx.quadraticCurveTo(4, -4, 9, f);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawFarShore() {
    const layers = [
      { y: HORIZON + 8, h: 92, c: 'rgba(70,86,120,.75)', n: 5, o: 0 },
      { y: HORIZON + 26, h: 62, c: 'rgba(52,70,102,.85)', n: 7, o: 2.3 }
    ];
    layers.forEach(L => {
      ctx.fillStyle = L.c;
      ctx.beginPath();
      ctx.moveTo(-300, L.y + L.h);
      for (let i = 0; i <= L.n; i++) {
        const x = -300 + (i / L.n) * (W + 600);
        const peak = L.y - Math.abs(Math.sin(i * 1.7 + L.o)) * L.h;
        ctx.lineTo(x, peak);
      }
      ctx.lineTo(W + 300, L.y + L.h);
      ctx.closePath();
      ctx.fill();
    });

    ctx.fillStyle = '#1f3a3a';
    ctx.beginPath();
    ctx.moveTo(-300, WATER_TOP);
    for (let x = -300; x <= W + 300; x += 26) {
      const h = 26 + Math.sin(x * 0.037) * 10 + Math.sin(x * 0.11) * 6;
      ctx.lineTo(x, WATER_TOP - h);
      ctx.lineTo(x + 13, WATER_TOP - h * 0.55);
    }
    ctx.lineTo(W + 300, WATER_TOP);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,180,120,.16)';
    ctx.fillRect(-300, WATER_TOP - 34, W + 600, 34);
  }

  function drawWaterBase() {
    const g = ctx.createLinearGradient(0, WATER_TOP, 0, H + 120);
    g.addColorStop(0, '#2f6c93');
    g.addColorStop(0.28, '#1c5580');
    g.addColorStop(0.7, '#123c62');
    g.addColorStop(1, '#08223c');
    ctx.fillStyle = g;
    ctx.fillRect(BAKE.x, WATER_TOP, BAKE.w, BAKE.y + BAKE.h - WATER_TOP);
  }

  function drawWaterAnim() {
    // עמוד אור השמש
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) {
      const p = i / 22;
      const y = WATER_TOP + p * (H - WATER_TOP + 60);
      const w = 26 + p * 300;
      const wob = Math.sin(time * 2.4 + i * 0.7) * (6 + p * 26);
      ctx.fillStyle = `rgba(255,196,120,${0.19 * (1 - p * 0.75)})`;
      ctx.beginPath();
      ctx.ellipse(690 + wob, y, w, 4.2 + p * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // גלים
    for (let i = 0; i < 16; i++) {
      const p = i / 16;
      const y = WATER_TOP + 6 + p * p * (H - WATER_TOP + 40);
      const amp = 1.6 + p * 7;
      ctx.strokeStyle = `rgba(190,232,255,${0.06 + p * 0.17})`;
      ctx.lineWidth = 1 + p * 2.6;
      ctx.beginPath();
      for (let x = -300; x <= W + 300; x += 44) {
        const yy = y + Math.sin((x * 0.014) + time * (1.1 + p) + i) * amp
                     + Math.sin((x * 0.05) - time * 1.7) * amp * 0.35;
        if (x === -300) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // ניצוצות
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    sparkles.forEach(s => {
      const a = Math.max(0, Math.sin(time * s.sp + s.p));
      if (a <= 0.15) return;
      ctx.fillStyle = `rgba(255,240,205,${a * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * (1.4 + a), s.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawRipples() {
    ctx.strokeStyle = 'rgba(214,242,255,.4)';
    ripples.forEach(r => {
      const p = r.t / r.life;
      ctx.globalAlpha = (1 - p) * 0.55;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- גדות ---------- */

  function bankPath(side, keepPath) {
    if (!keepPath) ctx.beginPath();
    if (side === 'west') {
      ctx.moveTo(-320, H + 220);
      ctx.lineTo(-320, 452);
      ctx.quadraticCurveTo(120, 436, 330, 494);
      ctx.quadraticCurveTo(408, 528, 430, 600);
      ctx.quadraticCurveTo(444, 690, 400, H + 220);
      ctx.closePath();
    } else {
      ctx.moveTo(W + 320, H + 220);
      ctx.lineTo(W + 320, 452);
      ctx.quadraticCurveTo(W - 120, 436, W - 330, 494);
      ctx.quadraticCurveTo(W - 408, 528, W - 430, 600);
      ctx.quadraticCurveTo(W - 444, 690, W - 400, H + 220);
      ctx.closePath();
    }
  }

  // אזור המים בלבד — הרצועה שבין שתי הגדות
  function clipWater(fromY) {
    ctx.beginPath();
    ctx.rect(-320, Math.max(WATER_TOP, fromY), W + 640, H + 320);
    bankPath('west', true);
    bankPath('east', true);
    ctx.clip('evenodd');
  }

  function drawBank(side) {
    ctx.save();
    bankPath(side);
    const g = ctx.createLinearGradient(0, 440, 0, H);
    g.addColorStop(0, '#6ea84f');
    g.addColorStop(0.28, '#4f8a3f');
    g.addColorStop(0.62, '#37642f');
    g.addColorStop(1, '#22421f');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.clip();
    ctx.strokeStyle = 'rgba(140,200,110,.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 90; i++) {
      const bx = side === 'west' ? -300 + (i * 37) % 700 : W + 300 - (i * 37) % 700;
      const by = 468 + (i * 53) % 250;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + ((i % 3) - 1) * 2, by - 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  // קו הקצף שנפגש עם המים — מצויר בכל פריים
  // קו החוף כעקומה ריבועית — משמש גם לקצף
  const SHORE = [
    [[-320, 452], [120, 436], [330, 494]],
    [[330, 494], [408, 528], [430, 600]],
    [[430, 600], [444, 690], [400, 830]]
  ];

  function drawFoam(side) {
    const m = side === 'west' ? 1 : -1;
    const X = v => side === 'west' ? v : W - v;
    ctx.save();
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(228,250,255,.55)';
    ctx.beginPath();
    let first = true;
    SHORE.forEach(seg => {
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, u = 1 - t;
        const x = u * u * seg[0][0] + 2 * u * t * seg[1][0] + t * t * seg[2][0];
        const y = u * u * seg[0][1] + 2 * u * t * seg[1][1] + t * t * seg[2][1];
        const wob = Math.sin(time * 3 + y * 0.05) * 3;
        if (first) { ctx.moveTo(X(x + wob), y); first = false; }
        else ctx.lineTo(X(x + wob * m), y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawBankDeco(side) {
    const m = side === 'west' ? 1 : -1;
    const X = v => side === 'west' ? v : W - v;
    Art.tree(ctx, X(-70), 478, 1.3, 0, '#8ed06f');
    Art.tree(ctx, X(125), 470, 0.78, 1.4, '#7fc46a');
    Art.tree(ctx, X(258), 490, 0.6, 2.7, '#96d97a');

    // מזח
    ctx.save();
    ctx.translate(X(344), 522);
    ctx.scale(m, 1);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-10, 0, 116, 12);
    ctx.fillStyle = '#8f6238';
    for (let i = 0; i < 6; i++) ctx.fillRect(-10 + i * 20, 0, 16, 12);
    ctx.fillStyle = '#5d3d21';
    ctx.fillRect(24, 12, 9, 54);
    ctx.fillRect(84, 12, 9, 48);
    ctx.restore();

    ctx.fillStyle = '#5d6b62';
    [[120, 660, 14], [230, 692, 10], [40, 620, 8]].forEach(([sx, sy, r]) => {
      ctx.beginPath();
      ctx.ellipse(X(sx), sy, r, r * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawReeds() {
    Art.reed(ctx, 392, 606, 1.2, time);
    Art.reed(ctx, 424, 668, 1.45, time + 1.4);
    Art.reed(ctx, 30, 640, 1.5, time + 0.6);
    Art.reed(ctx, W - 392, 606, 1.2, time + 0.9);
    Art.reed(ctx, W - 424, 668, 1.45, time + 2.2);
    Art.reed(ctx, W - 30, 640, 1.5, time + 1.7);
  }

  /* ---------- השתקפויות ---------- */

  function reflect(drawFn, x, groundY) {
    if (groundY < WATER_TOP - 10) return;
    ctx.save();
    clipWater(groundY - 4);
    ctx.globalAlpha = 0.2;
    const shear = Math.sin(time * 1.7 + x * 0.01) * 0.09;
    ctx.transform(1, 0, shear, -0.55, x - shear * groundY, groundY * 1.55);
    drawFn();
    ctx.restore();
  }

  /* ---------- דמויות ---------- */

  function drawActor(id, a) {
    if (a.hidden) return;
    const opts = { face: a.face, walking: a.walking };
    if (id === 'wolf') opts.hungry = mood.hungryWolf;
    if (id === 'cabbage') opts.worried = mood.worriedCabbage;
    if (a.onBoat) opts.inBoat = true;
    if (id === 'farmer') { opts.inBoat = true; opts.rowing = boat.rowing; }

    const fn = () => {
      ctx.save();
      const k = a.scale * (a.onBoat ? IN_BOAT_SCALE : ACTOR_SCALE);
      ctx.scale(k, k);
      if (id === 'wolf') Art.wolf(ctx, time, opts);
      else if (id === 'sheep') Art.sheep(ctx, time, opts);
      else if (id === 'cabbage') Art.cabbage(ctx, time, opts);
      else Art.farmer(ctx, time, opts);
      ctx.restore();
    };

    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.translate(a.x, a.y);
    if (a.onBoat) ctx.rotate(boat.tilt);

    if (!a.onBoat && (hoverId === id || selectedId === id)) {
      const pulse = 0.5 + Math.sin(time * 5) * 0.2;
      ctx.save();
      ctx.globalAlpha = selectedId === id ? 0.85 : 0.5;
      ctx.strokeStyle = selectedId === id ? '#ffd66b' : '#bfe6ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -time * 26;
      ctx.beginPath();
      ctx.ellipse(0, -4, 40 + pulse * 4, 14 + pulse * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    fn();
    ctx.restore();
  }

  function drawBoat() {
    const bob = boat.bob;
    reflect(() => {
      ctx.scale(BOAT_SCALE, BOAT_SCALE);
      Art.boat(ctx, time, { face: boat.face, rowing: boat.rowing });
    }, boat.x, boat.y + bob);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(220,246,255,.7)';
    ctx.beginPath();
    ctx.ellipse(boat.x, boat.y + 12 + bob, 78 + Math.sin(time * 4) * 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // שובל מתרחב מאחורי הסירה בזמן הפלגה
    if (sailing) {
      const back = -boat.face;
      ctx.save();
      ctx.fillStyle = 'rgba(226,248,255,1)';
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.3 * (1 - i / 7);
        const d = 46 + i * 30;
        ctx.beginPath();
        ctx.ellipse(boat.x + back * d, boat.y + 14 + bob + i * 1.5,
                    24 + i * 9, 4.5 + i * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(boat.x, boat.y + bob);
    ctx.rotate(boat.tilt);
    ctx.scale(BOAT_SCALE, BOAT_SCALE);
    Art.boat(ctx, time, { face: boat.face, rowing: boat.rowing });
    ctx.restore();
  }

  function drawParticles() {
    particles.forEach(p => {
      const a = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.c + '1)';
      if (p.flat) {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a || 0);
        ctx.fillRect(-p.r, -p.r * 0.55, p.r * 2, p.r * 1.1);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawForeground() {
    Art.reed(ctx, 120, H + 30, 2.6, time);
    Art.reed(ctx, W - 100, H + 40, 2.9, time + 2.1);
  }

  // ויניטה במרחב המסך — כדי שלא ייווצר תפר בקצה הבמה
  function drawVignette(cw, ch) {
    const r = Math.max(cw, ch);
    const v = ctx.createRadialGradient(cw / 2, ch / 2, r * 0.34, cw / 2, ch / 2, r * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(2,10,20,.62)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
  }

  /* ================= לולאת הציור ================= */

  function render() {
    const cw = view.w, ch = view.h;
    if (!layerSky) bake();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // הרחבת השמיים והמים אל מחוץ ליחס 16:9, כדי שלא ייווצרו פסים שחורים
    const seam = view.oy + WATER_TOP * view.scale;
    ctx.fillStyle = '#132a52';
    ctx.fillRect(0, 0, cw, Math.max(0, seam));
    ctx.fillStyle = '#08223c';
    ctx.fillRect(0, Math.max(0, seam), cw, ch - Math.max(0, seam));

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);

    const sh = cam.shake;
    ctx.translate(W / 2 + (Math.random() - 0.5) * sh, H / 2 + (Math.random() - 0.5) * sh);
    ctx.rotate(cam.roll);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    ctx.drawImage(layerSky, BAKE.x, BAKE.y, BAKE.w, BAKE.h);
    drawSkyDynamic();
    drawWaterAnim();
    drawRipples();

    ctx.drawImage(layerBank, BAKE.x, BAKE.y, BAKE.w, BAKE.h);
    drawFoam('west');
    drawFoam('east');
    drawReeds();

    const order = Object.keys(actors)
      .filter(id => !actors[id].onBoat)
      .map(id => ({ id, y: actors[id].y }))
      .sort((a, b) => a.y - b.y);
    order.forEach(o => drawActor(o.id, actors[o.id]));

    drawBoat();
    Object.keys(actors).forEach(id => { if (actors[id].onBoat) drawActor(id, actors[id]); });

    drawParticles();
    drawForeground();

    ctx.restore();
    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette(cw, ch);
  }

  /* ================= API ================= */

  let lastTs = 0, rafId = 0, frameHook = null;

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (frameHook) frameHook(dt);
    update(dt);
    render();
  }

  function start(hook) {
    frameHook = hook || null;
    if (!rafId) { lastTs = performance.now(); rafId = requestAnimationFrame(loop); }
  }

  function vanish(id, cb) {
    const a = actors[id];
    const color = id === 'sheep' ? 'rgba(245,248,255,' : 'rgba(150,215,110,';
    poof(a.x, a.y, color);
    shake(14);
    let t = 0;
    const step = () => {
      t += 0.05;
      a.scale = Math.max(0.01, 1 - t * 1.6);
      a.alpha = Math.max(0, 1 - t * 1.6);
      if (t < 0.7) requestAnimationFrame(step);
      else { a.hidden = true; a.scale = 1; a.alpha = 1; if (cb) cb(); }
    };
    step();
  }

  function revealAll() {
    Object.keys(actors).forEach(id => {
      actors[id].hidden = false;
      actors[id].scale = 1;
      actors[id].alpha = 1;
    });
  }

  return {
    init, start, sync, hitTest, setHover, setSelected, sail,
    splash, confetti, shake, vanish, revealAll,
    get isSailing() { return !!sailing; },
    consts: { W, H, DOCK, BANK_Y }
  };
})();
