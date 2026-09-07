/* ============================================================
   audio.js — פסקול ואפקטים מסונתזים ב-Web Audio API
   כל הצלילים נוצרים בזמן אמת, בלי קבצים חיצוניים.
   ============================================================ */

const Sound = (() => {
  'use strict';

  let ctx = null;
  let master, musicBus, sfxBus, reverb, reverbSend;
  let started = false;

  let musicOn = true;
  let sfxOn = true;

  // --- מתזמן ---
  let timerId = null;
  let nextNoteTime = 0;
  let step = 0;
  const BPM = 92;
  const STEP = 60 / BPM / 2;      // שמינית
  const LOOKAHEAD = 0.12;

  // רה מינור: Dm – Bb – F – C
  const PROG = [
    { root: 62, chord: [62, 65, 69, 74] },
    { root: 58, chord: [58, 62, 65, 70] },
    { root: 53, chord: [57, 60, 65, 69] },
    { root: 60, chord: [60, 64, 67, 72] }
  ];
  // מוטיב ליד (אינדקסים לתוך האקורד, null = שתיקה)
  const LEAD = [0, null, 2, 3, null, 2, 1, null, 3, null, 2, null, 1, 2, null, null];

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- תשתית ---------- */

  function buildImpulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(2.6, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    reverb.connect(wet).connect(master);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(reverb);

    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? 0.5 : 0.0001;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxOn ? 0.85 : 0.0001;
    sfxBus.connect(master);

    return true;
  }

  function resume() {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /* ---------- קולות המוזיקה ---------- */

  function pad(time, notes) {
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.linearRampToValueAtTime(1150, time + 1.2);
    filter.Q.value = 3;

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.09, time + 0.9);
    g.gain.setTargetAtTime(0.0001, time + 1.9, 0.5);

    filter.connect(g);
    g.connect(musicBus);
    g.connect(reverbSend);

    notes.forEach((n, i) => {
      [-6, 6].forEach(detune => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = detune;
        o.connect(filter);
        o.start(time);
        o.stop(time + 3.4);
      });
    });
  }

  function bass(time, note) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    o.type = 'triangle';
    o.frequency.value = mtof(note - 24);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.24, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
    o.connect(f).connect(g).connect(musicBus);
    o.start(time);
    o.stop(time + 0.6);
  }

  function pluck(time, note, vel = 1) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = mtof(note) * 1.8;
    f.Q.value = 1.4;
    o.type = 'triangle';
    o.frequency.value = mtof(note);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.14 * vel, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    o.connect(f).connect(g);
    g.connect(musicBus);
    g.connect(reverbSend);
    o.start(time);
    o.stop(time + 1);
  }

  function noiseBurst(time, dur, type, freq, gain, target) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(target || sfxBus);
    src.start(time);
    return g;
  }

  function kick(time) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(0.34, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(g).connect(musicBus);
    o.start(time);
    o.stop(time + 0.32);
  }

  function shaker(time, vel) {
    noiseBurst(time, 0.05, 'highpass', 6500, 0.05 * vel, musicBus);
  }

  /* ---------- לולאת המוזיקה ---------- */

  function scheduleStep(s, time) {
    const barStep = s % 16;
    const bar = Math.floor(s / 16) % 4;
    const slot = PROG[bar];

    if (barStep === 0) {
      pad(time, slot.chord);
      bass(time, slot.root);
    }
    if (barStep === 8) bass(time, slot.root + 7);
    if (barStep % 4 === 0) kick(time);
    if (barStep % 2 === 1) shaker(time, barStep % 4 === 3 ? 1 : 0.55);

    const lead = LEAD[barStep];
    if (lead !== null && lead !== undefined) {
      pluck(time, slot.chord[lead] + 12, barStep % 4 === 0 ? 1 : 0.72);
    }
  }

  function scheduler() {
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += STEP;
      step++;
    }
  }

  function startMusic() {
    if (!init() || started) return;
    resume();
    started = true;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.15;
    timerId = setInterval(scheduler, 25);
  }

  function setMusic(on) {
    musicOn = on;
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(on ? 0.5 : 0.0001, ctx.currentTime, 0.25);
  }

  function setSfx(on) {
    sfxOn = on;
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(on ? 0.85 : 0.0001, ctx.currentTime, 0.05);
  }

  /* ---------- אפקטים ---------- */

  function blip(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!ctx || !sfxOn) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxBus);
    g.connect(reverbSend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const sfx = {
    hover() { blip(880, 0.06, 'sine', 0.05); },
    pick() { blip(523, 0.16, 'triangle', 0.18, 880); },
    drop() { blip(660, 0.16, 'triangle', 0.15, 392); },
    deny() {
      if (!ctx || !sfxOn) return;
      blip(196, 0.18, 'square', 0.11, 130);
    },
    splash() {
      if (!ctx || !sfxOn) return;
      const t = ctx.currentTime;
      const g = noiseBurst(t, 0.55, 'bandpass', 1300, 0.22);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      g.connect(reverbSend);
    },
    row() {
      if (!ctx || !sfxOn) return;
      const t = ctx.currentTime;
      const g = noiseBurst(t, 0.28, 'lowpass', 900, 0.1);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    },
    land() { blip(330, 0.2, 'sine', 0.16, 494); },
    gull() {
      if (!ctx || !sfxOn) return;
      blip(1500, 0.12, 'sawtooth', 0.035, 900);
      setTimeout(() => blip(1750, 0.1, 'sawtooth', 0.03, 1100), 150);
    },
    lose() {
      if (!ctx || !sfxOn) return;
      [392, 349, 294, 233].forEach((f, i) => setTimeout(() => blip(f, 0.4, 'sawtooth', 0.14), i * 130));
    },
    win() {
      if (!ctx || !sfxOn) return;
      [587, 698, 880, 1047, 1175].forEach((f, i) =>
        setTimeout(() => { blip(f, 0.5, 'triangle', 0.2); blip(f * 2, 0.4, 'sine', 0.07); }, i * 110));
    },
    score() { blip(1318, 0.12, 'sine', 0.12, 1760); },
    ui() { blip(700, 0.07, 'sine', 0.1); }
  };

  return {
    init, resume, startMusic, setMusic, setSfx, sfx,
    get isMusicOn() { return musicOn; },
    get isSfxOn() { return sfxOn; }
  };
})();
