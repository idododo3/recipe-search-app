/* ============================================================
   game.js — לוגיקת החידה, ניקוד, זמן, שמירה וממשק
   ============================================================ */

(() => {
  'use strict';

  const NAMES = { wolf: 'הזאב', sheep: 'הכבש', cabbage: 'הכרוב', farmer: 'החקלאי' };
  const ICONS = { wolf: '🐺', sheep: '🐑', cabbage: '🥬' };
  const PERFECT_MOVES = 7;
  const STORE_KEY = 'wolfRiver.v1';

  /* ================= מצב ================= */

  const state = {
    pos: { wolf: 'west', sheep: 'west', cabbage: 'west' },
    side: 'west',
    boat: [],
    moves: 0,
    fails: 0,
    level: 1,
    seconds: 0,
    running: false,
    locked: true,
    player: 'אורח',
    total: 0
  };

  let elapsed = 0;
  let lastResult = null;

  /* ================= אחסון ================= */

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { lastName: '', players: {}, board: [] };
      const s = JSON.parse(raw);
      return {
        lastName: s.lastName || '',
        players: s.players || {},
        board: Array.isArray(s.board) ? s.board : []
      };
    } catch (e) {
      return { lastName: '', players: {}, board: [] };
    }
  }

  function saveStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
    catch (e) { /* אחסון חסום — המשחק ממשיך בלי שמירה */ }
  }

  let store = loadStore();

  /* ================= עזרי DOM ================= */

  const $ = sel => document.querySelector(sel);
  const el = {
    stage: $('#stage'),
    hud: $('#hud'),
    actionbar: $('#actionbar'),
    player: $('#hud-player'),
    total: $('#hud-total'),
    time: $('#hud-time'),
    moves: $('#hud-moves'),
    level: $('#hud-level'),
    hint: $('#hint'),
    sail: $('#btn-sail'),
    toast: $('#toast'),
    screenStart: $('#screen-start'),
    screenHelp: $('#screen-help'),
    screenScores: $('#screen-scores'),
    screenResult: $('#screen-result'),
    inputName: $('#input-name'),
    returning: $('#returning'),
    returningScore: $('#returning-score'),
    board: $('#board'),
    boardEmpty: $('#board-empty'),
    resultName: $('#result-name'),
    savedNote: $('#saved-note')
  };

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  let toastTimer = 0;
  function toast(msg, kind) {
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.className = 'toast'; }, 2600);
  }

  function pulse(node) {
    node.classList.remove('pulse');
    void node.offsetWidth;
    node.classList.add('pulse');
  }

  function setHint(text, warn) {
    if (el.hint.textContent === text) return;
    el.hint.textContent = text;
    el.hint.className = 'hint flash' + (warn ? ' warn' : '');
  }

  /* ================= חוקי החידה ================= */

  function otherSide(s) { return s === 'west' ? 'east' : 'west'; }

  // מי נאכל בגדה שאין בה חקלאי
  function dangerOn(side) {
    const here = id => state.pos[id] === side;
    if (here('wolf') && here('sheep')) return { victim: 'sheep', predator: 'wolf' };
    if (here('sheep') && here('cabbage')) return { victim: 'cabbage', predator: 'sheep' };
    return null;
  }

  function isWin() {
    return state.pos.wolf === 'east' && state.pos.sheep === 'east' && state.pos.cabbage === 'east';
  }

  /* ================= זרימת המשחק ================= */

  function refreshHud() {
    el.player.textContent = state.player;
    el.total.textContent = state.total.toLocaleString('he-IL');
    el.moves.textContent = state.moves;
    el.level.textContent = state.level;
    el.time.textContent = fmtTime(state.seconds);
  }

  function refreshHint() {
    if (state.locked) return;
    if (Scene.isSailing) { setHint('מפליגים…'); return; }
    if (state.boat.length) {
      setHint(`${ICONS[state.boat[0]]} ${NAMES[state.boat[0]]} בסירה — אפשר להפליג.`);
    } else {
      const risky = dangerOn(otherSide(state.side));
      if (risky) setHint('שימו לב לגדה השנייה — מישהו שם בסכנה!', true);
      else setHint('בחרו נוסע לסירה, או הפליגו לבד.');
    }
  }

  function syncScene(instant) {
    Scene.sync(state, instant);
    Scene.setSelected(state.boat[0] || null);
    refreshHud();
    refreshHint();
  }

  function startTimer() {
    if (state.running) return;
    state.running = true;
  }

  function tick(dt) {
    if (state.running && !state.locked) {
      elapsed += dt;
      const s = Math.floor(elapsed);
      if (s !== state.seconds) {
        state.seconds = s;
        el.time.textContent = fmtTime(s);
      }
    }
  }

  /* ---------- העלאה והורדה מהסירה ---------- */

  function toggleAboard(id) {
    if (state.locked || Scene.isSailing) return;

    if (state.boat[0] === id) {
      state.boat = [];
      Sound.sfx.drop();
      syncScene();
      return;
    }
    if (state.pos[id] !== state.side) {
      Sound.sfx.deny();
      toast(`${ICONS[id]} ${NAMES[id]} נמצא בגדה השנייה`, 'bad');
      return;
    }
    startTimer();
    state.boat = [id];
    Sound.sfx.pick();
    syncScene();
  }

  /* ---------- הפלגה ---------- */

  function doSail() {
    if (state.locked || Scene.isSailing) return;
    startTimer();

    const from = state.side;
    const to = otherSide(from);
    Sound.sfx.splash();
    Sound.sfx.row();
    Scene.splash(Scene.consts.DOCK[from] + (to === 'east' ? 40 : -40), 606, 10);
    el.sail.disabled = true;
    el.sail.classList.remove('ready');
    setHint('מפליגים…');

    Scene.sail(from, to, () => {
      state.side = to;
      state.moves++;
      if (state.boat.length) state.pos[state.boat[0]] = to;
      state.boat = [];
      Sound.sfx.land();
      pulse(el.moves.parentElement.parentElement);
      syncScene();
      el.sail.disabled = false;

      const risk = dangerOn(from);
      if (risk) { setTimeout(() => eaten(risk), 420); return; }
      if (isWin()) { setTimeout(win, 500); return; }
      el.sail.classList.add('ready');
    });
  }

  /* ---------- כישלון בסיבוב ---------- */

  function eaten(risk) {
    state.locked = true;
    state.fails++;
    Sound.sfx.lose();
    toast(`${ICONS[risk.predator]} ${NAMES[risk.predator]} אכל את ${NAMES[risk.victim]}! מתחילים את הסידור מחדש.`, 'bad');
    setHint('אופס… מסדרים מחדש את הגדה.', true);

    Scene.vanish(risk.victim, () => {
      setTimeout(() => {
        state.pos = { wolf: 'west', sheep: 'west', cabbage: 'west' };
        state.side = 'west';
        state.boat = [];
        Scene.revealAll();
        Scene.sync(state, true);
        state.locked = false;
        syncScene(true);
        toast('כולם חזרו לגדה המערבית. נסו שוב!', '');
      }, 700);
    });
  }

  /* ---------- ניצחון וניקוד ---------- */

  function computeScore() {
    const moves = state.moves;
    const secs = Math.floor(elapsed);
    const extra = Math.max(0, moves - PERFECT_MOVES);
    const movesScore = Math.max(0, 400 - extra * 70);
    const timeScore = Math.max(0, 300 - Math.max(0, secs - 25) * 8);
    const perfect = extra === 0 ? 200 : 0;
    const streak = (state.level - 1) * 25;
    const failPenalty = state.fails * 80;
    const bonus = perfect + streak;
    const points = Math.max(100, 600 + movesScore + timeScore + bonus - failPenalty);
    return { points, bonus, movesScore, timeScore, perfect, secs, moves, failPenalty };
  }

  function win() {
    state.locked = true;
    state.running = false;
    Sound.sfx.win();
    Scene.confetti();
    Scene.shake(8);

    const r = computeScore();
    state.total += r.points;
    lastResult = r;
    persistPlayer();

    $('#result-time').textContent = fmtTime(r.secs);
    $('#result-moves').textContent = r.moves;
    $('#result-bonus').textContent = (r.bonus ? '+' : '') + r.bonus;
    $('#result-level').textContent = state.level;
    $('#result-points').textContent = r.points.toLocaleString('he-IL');
    $('#result-total').textContent = state.total.toLocaleString('he-IL');
    $('#result-title').textContent = r.perfect ? 'פתרון מושלם!' : 'כל הכבוד!';
    $('#result-subtitle').textContent = r.perfect
      ? `סיימתם ב-${PERFECT_MOVES} הפלגות בדיוק — הפתרון האופטימלי.`
      : 'כולם חצו את הנהר בשלום.';
    $('#result-badge').textContent = r.perfect ? '🏆' : '🏅';
    el.resultName.value = state.player === 'אורח' ? '' : state.player;
    el.savedNote.hidden = true;
    savedThisRound = false;
    $('#btn-save-score').disabled = false;

    refreshHud();
    setTimeout(() => show(el.screenResult), 1100);
  }

  function persistPlayer() {
    const key = state.player.trim() || 'אורח';
    const p = store.players[key] || { total: 0, rounds: 0, best: 0 };
    p.total = state.total;
    p.rounds = (p.rounds || 0) + 1;
    if (lastResult) p.best = Math.max(p.best || 0, lastResult.points);
    store.players[key] = p;
    store.lastName = key;
    saveStore(store);
  }

  let savedThisRound = false;

  function saveScore() {
    if (!lastResult || savedThisRound) return;
    const name = (el.resultName.value || '').trim().slice(0, 14) || 'אורח';
    state.player = name;
    store.board.push({
      name,
      points: lastResult.points,
      total: state.total,
      moves: lastResult.moves,
      time: lastResult.secs,
      level: state.level,
      date: Date.now()
    });
    store.board.sort((a, b) => b.points - a.points);
    store.board = store.board.slice(0, 20);
    persistPlayer();
    savedThisRound = true;
    $('#btn-save-score').disabled = true;
    Sound.sfx.score();
    el.savedNote.hidden = false;
    refreshHud();
    toast('התוצאה נשמרה בלוח השיאים 🏆', 'good');
  }

  function renderBoard(freshIdx) {
    el.board.innerHTML = '';
    const rows = store.board.slice(0, 12);
    el.boardEmpty.hidden = rows.length > 0;
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (i === freshIdx) li.className = 'fresh';
      li.style.animationDelay = (i * 0.04) + 's';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = r.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${fmtTime(r.time)} · ${r.moves} הפלגות`;
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = r.points.toLocaleString('he-IL');
      li.append(rank, who, meta, pts);
      el.board.appendChild(li);
    });
  }

  /* ---------- סיבוב חדש ---------- */

  function resetRound(nextLevel) {
    state.pos = { wolf: 'west', sheep: 'west', cabbage: 'west' };
    state.side = 'west';
    state.boat = [];
    state.moves = 0;
    state.fails = 0;
    state.seconds = 0;
    state.running = false;
    elapsed = 0;
    if (nextLevel) state.level++;
    state.locked = false;
    el.sail.disabled = false;
    el.sail.classList.remove('ready');
    Scene.revealAll();
    syncScene(true);
  }

  /* ================= מסכים ================= */

  function show(node) {
    [el.screenStart, el.screenHelp, el.screenScores, el.screenResult]
      .forEach(s => { if (s !== node) s.hidden = true; });
    node.hidden = false;
  }

  function hideScreens() {
    [el.screenStart, el.screenHelp, el.screenScores, el.screenResult]
      .forEach(s => { s.hidden = true; });
  }

  /* ================= אירועים ================= */

  function bindPointer() {
    let downId = null;

    el.stage.addEventListener('pointermove', e => {
      if (state.locked || Scene.isSailing) { Scene.setHover(null); el.stage.style.cursor = 'default'; return; }
      const id = Scene.hitTest(e.clientX, e.clientY);
      Scene.setHover(id);
      el.stage.style.cursor = id ? 'pointer' : 'default';
    });

    el.stage.addEventListener('pointerleave', () => Scene.setHover(null));

    el.stage.addEventListener('pointerdown', e => {
      Sound.resume();
      downId = Scene.hitTest(e.clientX, e.clientY);
    });

    el.stage.addEventListener('pointerup', e => {
      const id = Scene.hitTest(e.clientX, e.clientY);
      if (id && id === downId) toggleAboard(id);
      downId = null;
    });
  }

  function bindButtons() {
    el.sail.addEventListener('click', () => { Sound.resume(); doSail(); });

    $('#btn-music').addEventListener('click', e => {
      const on = !Sound.isMusicOn;
      Sound.setMusic(on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? '🎵' : '🎶';
      toast(on ? 'מוזיקה פועלת' : 'מוזיקה מושתקת');
    });

    $('#btn-sfx').addEventListener('click', e => {
      const on = !Sound.isSfxOn;
      Sound.setSfx(on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = on ? '🔊' : '🔇';
    });

    $('#btn-help').addEventListener('click', () => { Sound.sfx.ui(); show(el.screenHelp); });
    $('#btn-scores').addEventListener('click', () => { Sound.sfx.ui(); renderBoard(-1); show(el.screenScores); });

    $('#btn-restart').addEventListener('click', () => {
      Sound.sfx.ui();
      resetRound(false);
      toast('הסיבוב התחיל מחדש');
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => { Sound.sfx.ui(); hideScreens(); });
    });

    $('#btn-clear-scores').addEventListener('click', () => {
      store.board = [];
      saveStore(store);
      renderBoard(-1);
      toast('לוח השיאים נמחק');
    });

    $('#btn-save-score').addEventListener('click', () => {
      saveScore();
      renderBoard(store.board.findIndex(r => r.date === Math.max(...store.board.map(x => x.date))));
    });

    $('#btn-next').addEventListener('click', () => {
      Sound.sfx.ui();
      hideScreens();
      resetRound(true);
      toast(`שלב ${state.level} — קדימה!`, 'good');
    });

    $('#btn-start').addEventListener('click', beginGame);
    el.inputName.addEventListener('keydown', e => { if (e.key === 'Enter') beginGame(); });
    el.inputName.addEventListener('input', () => {
      const n = el.inputName.value.trim();
      const p = store.players[n];
      el.returning.hidden = !p;
      if (p) el.returningScore.textContent = (p.total || 0).toLocaleString('he-IL');
    });
  }

  function bindKeys() {
    const map = { '1': 'wolf', '2': 'sheep', '3': 'cabbage' };
    window.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const anyScreen = !el.screenStart.hidden || !el.screenHelp.hidden ||
                        !el.screenScores.hidden || !el.screenResult.hidden;
      if (e.key === 'Escape' && anyScreen && el.screenStart.hidden) { hideScreens(); return; }
      if (anyScreen) return;

      if (map[e.key]) { e.preventDefault(); toggleAboard(map[e.key]); }
      else if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); doSail(); }
      else if (e.key === 'm' || e.key === 'M') $('#btn-music').click();
      else if (e.key === 's' || e.key === 'S') $('#btn-sfx').click();
      else if (e.key === 'h' || e.key === 'H') $('#btn-help').click();
      else if (e.key === 'l' || e.key === 'L') $('#btn-scores').click();
      else if (e.key === 'r' || e.key === 'R') $('#btn-restart').click();
    });
  }

  /* ================= התחלה ================= */

  function beginGame() {
    const name = (el.inputName.value || '').trim().slice(0, 14) || 'אורח';
    state.player = name;
    const p = store.players[name];
    state.total = p ? (p.total || 0) : 0;
    store.lastName = name;
    saveStore(store);

    Sound.init();
    Sound.resume();
    Sound.startMusic();

    hideScreens();
    el.hud.hidden = false;
    el.actionbar.hidden = false;
    resetRound(false);
    toast(`ברוכים הבאים, ${name}!`, 'good');
  }

  function boot() {
    Scene.init(el.stage);
    Scene.sync(state, true);
    Scene.start(tick);

    bindPointer();
    bindButtons();
    bindKeys();

    if (store.lastName) {
      el.inputName.value = store.lastName;
      const p = store.players[store.lastName];
      if (p) {
        el.returning.hidden = false;
        el.returningScore.textContent = (p.total || 0).toLocaleString('he-IL');
      }
    }
    renderBoard(-1);
    setTimeout(() => el.inputName.focus(), 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
