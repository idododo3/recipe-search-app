/* ============================================================
   art.js — ציור וקטורי של הדמויות והאביזרים
   כל דמות מצוירת סביב נקודת אפס שנמצאת במרכז כפות הרגליים.
   ============================================================ */

const Art = (() => {
  'use strict';

  /* ---------- עזרים ---------- */

  function blob(ctx, cx, cy, r, wobble, seed, t) {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 12) {
      const n = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 - seed * 2 + t) * 0.5;
      const rr = r * (1 + n * wobble);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function shadow(ctx, w, h, alpha = 0.28) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#04121e';
    ctx.beginPath();
    ctx.ellipse(0, 2, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eye(ctx, x, y, r, look = 0, color = '#0b1522') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + look * r * 0.35, y + r * 0.1, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(x + look * r * 0.35 - r * 0.2, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function leg(ctx, x, yTop, len, w, swing, color) {
    ctx.save();
    ctx.translate(x, yTop);
    ctx.rotate(swing);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- זאב ---------- */

  function wolf(ctx, t, o = {}) {
    const face = o.face || 1;                  // 1 = פונה ימינה
    const breathe = Math.sin(t * 2.1) * 1.5;
    const walk = o.walking ? Math.sin(t * 9) * 0.35 : 0;
    ctx.save();
    ctx.scale(face, 1);
    if (!o.inBoat) shadow(ctx, 30, 7);

    const fur = ctx.createLinearGradient(0, -60, 0, 0);
    fur.addColorStop(0, '#8b98a8');
    fur.addColorStop(0.55, '#5f6b7c');
    fur.addColorStop(1, '#3c4654');

    // רגליים
    leg(ctx, -14, -22, 22, 7, walk, '#454f5e');
    leg(ctx, 12, -22, 22, 7, -walk, '#454f5e');
    leg(ctx, -8, -22, 22, 7.5, -walk * 0.7, '#5a6472');
    leg(ctx, 17, -22, 22, 7.5, walk * 0.7, '#5a6472');

    // זנב
    ctx.save();
    ctx.translate(-24, -40);
    ctx.rotate(Math.sin(t * 3.4) * 0.28 - 0.4);
    ctx.fillStyle = '#4d5766';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-18, -6, -26, -22);
    ctx.quadraticCurveTo(-14, -14, -2, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9eef5';
    ctx.beginPath();
    ctx.arc(-24, -20, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // גוף
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(-2, -40 + breathe * 0.3, 24, 16 + breathe * 0.2, -0.06, 0, Math.PI * 2);
    ctx.fill();

    // חזה בהיר
    ctx.fillStyle = 'rgba(233,238,245,.45)';
    ctx.beginPath();
    ctx.ellipse(10, -34, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // ראש
    ctx.save();
    ctx.translate(18, -54 + breathe * 0.5);
    ctx.rotate(Math.sin(t * 1.6) * 0.05);

    // אוזניים
    ctx.fillStyle = '#4d5766';
    [[-7, -12], [5, -14]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + 4, ey - 13);
      ctx.lineTo(ex + 10, ey - 1);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = '#98707a';
    ctx.beginPath();
    ctx.moveTo(6, -13);
    ctx.lineTo(8, -20);
    ctx.lineTo(12, -12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(0, -2, 15, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // חוטם
    ctx.fillStyle = '#6c7789';
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.quadraticCurveTo(22, -2, 23, 4);
    ctx.quadraticCurveTo(20, 9, 6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#161d28';
    ctx.beginPath();
    ctx.ellipse(22, 3, 3.4, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // פה
    ctx.strokeStyle = '#222b38';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(19, 7);
    ctx.quadraticCurveTo(13, 10, 8, 7);
    ctx.stroke();
    if (o.hungry) {
      ctx.fillStyle = '#fff';
      [[16, 8], [12, 8.6]].forEach(([fx, fy]) => {
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 2.4, fy + 4.5);
        ctx.lineTo(fx + 4.4, fy);
        ctx.closePath();
        ctx.fill();
      });
    }

    eye(ctx, 8, -5, 3.4, face > 0 ? 0.6 : -0.2, o.hungry ? '#c0342b' : '#131b26');
    eye(ctx, -3, -6, 3.2, face > 0 ? 0.6 : -0.2, o.hungry ? '#c0342b' : '#131b26');
    // גבות
    ctx.strokeStyle = '#39424f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, -11); ctx.lineTo(12, -9);
    ctx.moveTo(-7, -11); ctx.lineTo(-1, -10);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  /* ---------- כבש ---------- */

  function sheep(ctx, t, o = {}) {
    const face = o.face || 1;
    const breathe = Math.sin(t * 2.6) * 1.2;
    const walk = o.walking ? Math.sin(t * 9) * 0.3 : 0;
    ctx.save();
    ctx.scale(face, 1);
    if (!o.inBoat) shadow(ctx, 26, 6);

    leg(ctx, -11, -20, 20, 6, walk, '#3b3f4a');
    leg(ctx, 10, -20, 20, 6, -walk, '#3b3f4a');
    leg(ctx, -5, -20, 20, 6.5, -walk * 0.7, '#4a4f5c');
    leg(ctx, 14, -20, 20, 6.5, walk * 0.7, '#4a4f5c');

    // צמר
    const wool = ctx.createRadialGradient(-4, -44, 4, -2, -38, 30);
    wool.addColorStop(0, '#ffffff');
    wool.addColorStop(0.65, '#f0f2f6');
    wool.addColorStop(1, '#cfd6e2');
    ctx.fillStyle = wool;
    blob(ctx, -2, -38 + breathe * 0.25, 21, 0.14, 1.3, t * 0.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,175,196,.55)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25 + 0.4;
      ctx.beginPath();
      ctx.arc(-2 + Math.cos(a) * 11, -38 + Math.sin(a) * 9, 5.5, a - 1.2, a + 1.6);
      ctx.stroke();
    }

    // ראש
    ctx.save();
    ctx.translate(16, -50 + breathe * 0.4);
    ctx.rotate(Math.sin(t * 1.3) * 0.06 + (o.eating ? 0.25 : 0));

    ctx.fillStyle = '#3f4450';
    [[-9, -3], [7, -5]].forEach(([ex, ey]) => {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ex < 0 ? -0.5 : 0.35);
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const head = ctx.createLinearGradient(0, -12, 0, 10);
    head.addColorStop(0, '#4c515e');
    head.addColorStop(1, '#2f333c');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(2, 0, 11, 12.5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // בלורית צמר
    ctx.fillStyle = '#fbfcff';
    blob(ctx, 0, -11, 7, 0.2, 2.2, t * 0.5);
    ctx.fill();

    eye(ctx, 7, -1, 3, 0.5);
    eye(ctx, -3, -1.5, 2.8, 0.5);

    ctx.fillStyle = '#1d212a';
    ctx.beginPath();
    ctx.ellipse(9, 7, 4.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0d1017';
    ctx.beginPath();
    ctx.arc(8, 6.6, 0.9, 0, Math.PI * 2);
    ctx.arc(10.6, 6.9, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  /* ---------- כרוב ---------- */

  function cabbage(ctx, t, o = {}) {
    const face = o.face || 1;
    const squash = 1 + Math.sin(t * 2.4) * 0.035;
    ctx.save();
    ctx.scale(face, 1);
    if (!o.inBoat) shadow(ctx, 22, 6);
    ctx.translate(0, -24);
    ctx.scale(1 / squash, squash);

    // עלים חיצוניים
    ctx.fillStyle = '#3f8a3a';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.sin(t * 1.2) * 0.06;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -20, 12, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 24);
    g.addColorStop(0, '#c9f08a');
    g.addColorStop(0.5, '#8fd05c');
    g.addColorStop(1, '#4e9440');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();

    // עורקי עלים
    ctx.strokeStyle = 'rgba(238,255,214,.55)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3 - 4);
      ctx.quadraticCurveTo(Math.cos(a) * 14, Math.sin(a) * 12, Math.cos(a) * 19, Math.sin(a) * 19 + 2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(30,70,25,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0.4, 4.2);
    ctx.stroke();

    // עלה עליון
    ctx.fillStyle = '#5fb14a';
    ctx.save();
    ctx.translate(2, -20);
    ctx.rotate(Math.sin(t * 1.8) * 0.15 - 0.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(10, -12, 2, -22);
    ctx.quadraticCurveTo(-6, -12, 0, 0);
    ctx.fill();
    ctx.restore();

    eye(ctx, 7, -2, 3.2, 0.3, '#1b3a15');
    eye(ctx, -4, -3, 3, 0.3, '#1b3a15');
    ctx.strokeStyle = '#22491b';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (o.worried) ctx.arc(1.5, 10, 4.5, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(1.5, 5, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------- חקלאי ---------- */

  function farmer(ctx, t, o = {}) {
    const face = o.face || 1;
    const bob = Math.sin(t * 2.2) * 1.6;
    const row = o.rowing ? Math.sin(t * 5.5) : 0;
    ctx.save();
    ctx.scale(face, 1);
    if (!o.inBoat) shadow(ctx, 20, 6);
    ctx.translate(0, bob * 0.4);

    // רגליים
    ctx.strokeStyle = '#3a5a7a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -28); ctx.lineTo(-6, -3);
    ctx.moveTo(5, -28); ctx.lineTo(7, -3);
    ctx.stroke();
    ctx.fillStyle = '#5b3a22';
    ctx.beginPath();
    ctx.ellipse(-7, -2, 7, 3.6, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -2, 7, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // גוף
    const shirt = ctx.createLinearGradient(0, -58, 0, -24);
    shirt.addColorStop(0, '#e8624f');
    shirt.addColorStop(1, '#b13a2c');
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(-12, -26);
    ctx.quadraticCurveTo(-14, -52, 0, -56);
    ctx.quadraticCurveTo(14, -52, 12, -26);
    ctx.closePath();
    ctx.fill();

    // סרבל
    ctx.fillStyle = '#3f6ea0';
    ctx.beginPath();
    ctx.moveTo(-11, -26);
    ctx.lineTo(11, -26);
    ctx.lineTo(9, -40);
    ctx.lineTo(-9, -40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3f6ea0';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-7, -40); ctx.lineTo(-5, -53);
    ctx.moveTo(6, -40); ctx.lineTo(4, -53);
    ctx.stroke();

    // זרועות
    ctx.strokeStyle = '#e8624f';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-9, -50);
    ctx.quadraticCurveTo(-19, -44 + row * 5, -16, -34 + row * 8);
    ctx.moveTo(9, -50);
    ctx.quadraticCurveTo(19, -44 - row * 5, 16, -34 - row * 8);
    ctx.stroke();
    ctx.fillStyle = '#f0c39a';
    ctx.beginPath();
    ctx.arc(-16, -33 + row * 8, 4, 0, Math.PI * 2);
    ctx.arc(16, -33 - row * 8, 4, 0, Math.PI * 2);
    ctx.fill();

    // ראש
    ctx.save();
    ctx.translate(0, -58 + bob * 0.5);
    ctx.rotate(Math.sin(t * 1.1) * 0.05);
    ctx.fillStyle = '#f5cba4';
    ctx.beginPath();
    ctx.ellipse(0, -6, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a5a33';
    ctx.beginPath();
    ctx.ellipse(0, -13, 11.5, 8, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    eye(ctx, 5, -7, 2.8, 0.4);
    eye(ctx, -3, -7, 2.6, 0.4);
    ctx.strokeStyle = '#8a5a33';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(1, -1, 4, 0.25, Math.PI - 0.25);
    ctx.stroke();

    // כובע קש
    const hat = ctx.createLinearGradient(0, -26, 0, -14);
    hat.addColorStop(0, '#ffd98a');
    hat.addColorStop(1, '#d9a441');
    ctx.fillStyle = hat;
    ctx.beginPath();
    ctx.ellipse(0, -16, 21, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -21, 10, 8, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b13a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, -18);
    ctx.quadraticCurveTo(0, -15, 10, -18);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  /* ---------- סירה ---------- */

  function boat(ctx, t, o = {}) {
    const face = o.face || 1;
    ctx.save();
    ctx.scale(face, 1);

    // משוט
    ctx.save();
    ctx.translate(-16, -14);
    ctx.rotate(-0.5 + (o.rowing ? Math.sin(t * 5.5) * 0.45 : Math.sin(t * 1.4) * 0.05));
    ctx.strokeStyle = '#8a5a33';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-34, 22);
    ctx.stroke();
    ctx.fillStyle = '#a9713f';
    ctx.save();
    ctx.translate(-36, 24);
    ctx.rotate(-0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // גוף הסירה
    const hull = ctx.createLinearGradient(0, -18, 0, 12);
    hull.addColorStop(0, '#c78a4e');
    hull.addColorStop(0.5, '#9a6231');
    hull.addColorStop(1, '#5f3a1c');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-62, -16);
    ctx.quadraticCurveTo(-52, 14, 0, 15);
    ctx.quadraticCurveTo(52, 14, 62, -16);
    ctx.quadraticCurveTo(30, -6, 0, -6);
    ctx.quadraticCurveTo(-30, -6, -62, -16);
    ctx.closePath();
    ctx.fill();

    // קרשים
    ctx.strokeStyle = 'rgba(60,34,14,.45)';
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-58 + i * 3, -14 + i * 4.5);
      ctx.quadraticCurveTo(0, 12 + i * 0.6, 58 - i * 3, -14 + i * 4.5);
      ctx.stroke();
    }

    // דופן פנימית
    ctx.fillStyle = '#e0b070';
    ctx.beginPath();
    ctx.moveTo(-62, -16);
    ctx.quadraticCurveTo(0, -4, 62, -16);
    ctx.quadraticCurveTo(0, -12, -62, -16);
    ctx.closePath();
    ctx.fill();

    // ספסל
    ctx.fillStyle = '#7b4a24';
    ctx.fillRect(-16, -12, 32, 4);

    // תורן ומפרש
    ctx.strokeStyle = '#6d4423';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.lineTo(-2, -86);
    ctx.stroke();

    const wave = Math.sin(t * 2.4) * 5;
    const sail = ctx.createLinearGradient(0, -86, 0, -18);
    sail.addColorStop(0, '#fffdf5');
    sail.addColorStop(1, '#dfe7f0');
    ctx.fillStyle = sail;
    ctx.beginPath();
    ctx.moveTo(0, -86);
    ctx.quadraticCurveTo(26 + wave, -68, 30 + wave, -44);
    ctx.quadraticCurveTo(14, -40, 0, -40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,180,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(2, -76);
    ctx.quadraticCurveTo(14 + wave * 0.6, -64, 16 + wave * 0.6, -47);
    ctx.stroke();

    // דגלון
    ctx.fillStyle = '#e8624f';
    ctx.beginPath();
    ctx.moveTo(-2, -86);
    ctx.lineTo(16 + wave, -80);
    ctx.lineTo(-2, -74);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /* ---------- נוף ---------- */

  function tree(ctx, x, y, s, t, tint) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sway = Math.sin(t * 1.1 + x * 0.03) * 0.045;
    ctx.strokeStyle = '#4a3220';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(3, -22, 1, -44);
    ctx.stroke();
    ctx.rotate(sway);
    const g = ctx.createRadialGradient(-8, -58, 5, 0, -52, 34);
    g.addColorStop(0, tint || '#7fc46a');
    g.addColorStop(1, '#2f6b39');
    ctx.fillStyle = g;
    blob(ctx, 0, -56, 27, 0.16, 3.1, t * 0.4 + x);
    ctx.fill();
    blob(ctx, -16, -44, 15, 0.2, 1.4, t * 0.4 + x);
    ctx.fill();
    blob(ctx, 18, -46, 14, 0.2, 5.1, t * 0.4 + x);
    ctx.fill();
    ctx.restore();
  }

  function reed(ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const sway = Math.sin(t * 1.9 + x * 0.05) * 0.14;
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.translate(i * 5, 0);
      ctx.rotate(sway + i * 0.06);
      ctx.strokeStyle = i % 2 ? '#4f8f4a' : '#68a856';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(3, -14, 1, -26);
      ctx.stroke();
      ctx.fillStyle = '#8a6b3c';
      ctx.beginPath();
      ctx.ellipse(1, -28, 2.4, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  return { wolf, sheep, cabbage, farmer, boat, tree, reed, blob, shadow };
})();
