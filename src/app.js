(function () {
  'use strict';
  const Core = globalThis.NumberForestCore;
  const main = document.getElementById('main');
  const KEY = 'number-forest-progress-v1';
  const SESSION_KEY = 'number-forest-session-v1';
  const RESET_KEY = 'number-forest-reset-v1';
  const ROUND_COUNT = 10;
  const badges = { bonds: '松果小屋', arithmetic: '丰收果篮', groups: '阳光花园', sharing: '分享之星', clock: '滴答时光' };
  function badgeName(id) { return badges[id] || '森林发现'; }
  function chapterPicture(id) { return 'assets/playful/' + (badges[id] ? id : 'hero') + '.svg'; }
  function badgeImage(id) { return globalThis.NumberForestBadgeArt?.sources[id] || (badges[id] || id === 'reverse' ? 'assets/badges/' + id + '.svg' : 'assets/acorn.svg'); }
  const state = { screen: 'home', chapter: null, round: 0, task: null, selected: null, hints: false, attempts: 0, solved: false, completed: 0, independent: 0, manip: 0, bowls: [], changed: false, feedback: '', feedbackSelected: null, sound: false };
  let storageAvailable = true;
  let records = readRecords();
  let timerStarted = null;
  let elapsedMs = 0;
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    bonds: '<circle cx="11" cy="12" r="5"/><circle cx="23" cy="12" r="5"/><path d="M11 19v5h12v-5M17 24v5"/>',
    arithmetic: '<path d="M9 7v12M3 13h12M21 13h10M7 27h18"/>',
    groups: '<rect x="3" y="5" width="10" height="10" rx="3"/><rect x="21" y="5" width="10" height="10" rx="3"/><rect x="3" y="23" width="10" height="10" rx="3"/><rect x="21" y="23" width="10" height="10" rx="3"/>',
    sharing: '<circle cx="8" cy="9" r="5"/><circle cx="26" cy="9" r="5"/><path d="M2 27c0-10 12-10 12 0M20 27c0-10 12-10 12 0M17 17v13"/>',
    clock: '<circle cx="17" cy="17" r="14"/><path d="M17 7v10l7 4"/>'
  };
  function icon(id) { return '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[id] || icons.bonds) + '</svg>'; }
  function playIcon(action) {
    const drawings = {
      add: '<path d="M6 17h17M14.5 8.5v17"/><path d="M26 26l3 3 5-6"/>',
      take: '<path d="M7 18h22"/>',
      join: '<path d="M3 11l7 7-7 7M33 11l-7 7 7 7M12 25h12l-2 6h-8z"/><path d="M14 18h8"/>',
      basket: '<path d="M5 17h26l-4 15H9zM10 17l4-9M26 17l-4-9M15 22v5M21 22v5"/><path d="M27 5h8M31 1v8"/>',
      jump: '<path d="M3 29h30M6 23Q18 0 30 22M23 20l7 2-1-7"/><circle cx="6" cy="23" r="2"/>',
      pack: '<path d="M13 13l-4-8h18l-4 8M13 13C1 27 6 32 18 32s17-5 5-19zM12 14h12"/>'
    };
    return '<svg class="play-icon" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (drawings[action] || drawings.add) + '</svg>';
  }
  function readRecords() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const clean = {};
      for (const chapter of Core.chapters) {
        const row = raw[chapter.id];
        if (!row || typeof row !== 'object') continue;
        clean[chapter.id] = Object.fromEntries(['completed', 'independent', 'assisted', 'retries', 'sessions'].map(k => [k, Number.isSafeInteger(row[k]) && row[k] >= 0 ? row[k] : 0]));
        for (const k of ['bestMs', 'lastMs', 'legacyBestMs', 'legacyLastMs']) clean[chapter.id][k] = Number.isFinite(row[k]) && row[k] > 0 ? row[k] : null;
        if (row.timingRounds !== ROUND_COUNT) { clean[chapter.id].legacyBestMs = clean[chapter.id].bestMs; clean[chapter.id].legacyLastMs = clean[chapter.id].lastMs; clean[chapter.id].bestMs = null; clean[chapter.id].lastMs = null; }
        clean[chapter.id].timingRounds = ROUND_COUNT;
      }
      return clean;
    } catch (_) { storageAvailable = false; return {}; }
  }
  function saveRecords() {
    try { localStorage.setItem(KEY, JSON.stringify(records)); } catch (_) { storageAvailable = false; }
  }
  function announce(message) { document.getElementById('announcer').textContent = message; }
  const voiceHints = {
    bonds: '数一数空位，再放入松果，把篮子补满。',
    add: '把两篮松果合起来，数一数一共有多少。',
    subtract: '把送给朋友的松果拿走，数一数还剩多少。',
    'missing-addend': '想一想，还要添上多少，才能和右边一样多。',
    numberline: '看看跳动的方向，再数一数跳了几格。',
    compare: '一颗对一颗，看看哪一边更多。也要留意题目问的是多的还是少的。',
    sequence: '先找两个挨着、没有空位的数字，看看每次变多还是变少，再找空位里的数。',
    groups: '每篮的数量不变，多添一篮，就多了这么一篮的松果。',
    'group-total': '先数每篮有几颗，再数一共有几篮。',
    'group-count': '先看看每篮的数量，再数一数一共有几篮。',
    sharing: '每个小伙伴轮流分一颗，分得一样多，才是平均分哦。',
    pack: '每袋装同样多的松果，数一数能装几袋。',
    clock: '先看短短的时针，再看长长的分针。',
    'clock-forward': '让分针往前走，再看看时针走到了哪里。'
  };
  function hintSpeech() { return voiceHints[state.task.kind === 'bonds' && state.task.model.equation ? 'missing-addend' : state.task.kind] || '一起看看提示，动手摆一摆吧。'; }
  function speak(text) {
    if (!state.sound) return;
    globalThis.NumberForestSpeech?.speak(text);
  }
  function speakFeedback() { speak(state.solved ? '答对啦！你发现了数的秘密。' : hintSpeech()); }
  function focusMain() { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function stopVoice() { globalThis.NumberForestSpeech?.stop(); }
  function formatTime(ms) { const sec = Math.max(1, Math.round(ms / 1000)); return Math.floor(sec / 60) + ' 分 ' + String(sec % 60).padStart(2, '0') + ' 秒'; }
  function tickTime() { if (timerStarted !== null) { const now = performance.now(); elapsedMs += Math.max(0, now - timerStarted); timerStarted = now; } }
  function pauseTime() { tickTime(); timerStarted = null; }
  function resumeTime() { if (timerStarted === null && state.screen === 'game' && !state.solved && !document.hidden) timerStarted = performance.now(); }
  function seeded(seed) { let x = seed >>> 0; return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function persistSession() {
    if (state.screen !== 'game') return;
    tickTime();
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 2, chapterId: state.chapter.id, round: state.round, seed: state.seed, selected: state.selected, hints: state.hints, attempts: state.attempts, solved: state.solved, completed: state.completed, independent: state.independent, manip: state.manip, bowls: state.bowls, changed: state.changed, feedbackSelected: state.feedbackSelected, elapsedMs }));
    } catch (_) { storageAvailable = false; }
  }
  function readSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!s || s.version !== 2 || !Core.getChapter(s.chapterId) || !Number.isInteger(s.round) || s.round < 0 || s.round >= ROUND_COUNT || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 4294967295 || !Number.isFinite(s.elapsedMs) || s.elapsedMs < 0) return null;
      const task = Core.createTask(s.chapterId, { round: s.round, random: seeded(s.seed) });
      if (s.selected !== null && (!Number.isInteger(s.selected) || s.selected < 0 || s.selected > task.maxAnswer)) return null;
      if (![s.attempts, s.completed, s.independent, s.manip].every(n => Number.isInteger(n) && n >= 0) || s.completed > ROUND_COUNT || s.independent > s.completed) return null;
      if (!Array.isArray(s.bowls) || !s.bowls.every(n => Number.isInteger(n) && n >= 0 && n <= (task.kind === 'sharing' ? task.model.total : 20))) return null;
      if (task.kind === 'sharing' && (s.bowls.length !== task.model.groups || s.bowls.reduce((a, b) => a + b, 0) > task.model.total)) return null;
      if (s.solved && !Core.checkAnswer(task, s.selected)) return null;
      if (s.feedbackSelected != null && (!Number.isInteger(s.feedbackSelected) || s.feedbackSelected < 0 || s.feedbackSelected > task.maxAnswer)) return null;
      return { ...s, task };
    } catch (_) { return null; }
  }
  function resumeSession() {
    stopVoice();
    const s = readSession(); if (!s) { home(); return; }
    pauseTime(); elapsedMs = s.elapsedMs;
    Object.assign(state, s, { screen: 'game', chapter: Core.getChapter(s.chapterId), custom: {}, feedback: s.solved ? s.task.success : '' });
    if (!s.solved && s.feedbackSelected != null) state.feedback = globalThis.NumberForestFeedback.describe(s.task, s.feedbackSelected, s).message;
    renderGame(); focusMain();
  }
  function home() { globalThis.NumberForestEffects?.clear(); stopVoice(); pauseTime(); persistSession(); state.screen = 'home'; renderHome(); focusMain(); }
  function renderHome() {
    main.dataset.screen = 'home'; main.dataset.motion = 'enter'; delete main.dataset.chapter;
    const total = Object.values(records).reduce((sum, r) => sum + r.completed, 0);
    main.innerHTML = '<section class="hero"><div class="hero-copy"><div class="eyebrow">欢迎来到 · 数感森林</div><h1>小小探险家，<br><em>出发去森林！</em></h1><p>数松果、分点心、听时钟滴答。<br>和小松鼠一起，发现数的秘密。</p><div class="hero-note"><span class="note-dot"></span>不用抢时间，每次探索 10 个小任务</div></div><div class="hero-world"><img class="hero-art" src="assets/playful/hero.svg" alt="小松鼠和兔子邀请你探索森林里的果篮、花园和时钟树屋"><span class="world-spark" aria-hidden="true">✦</span><span class="world-spark" aria-hidden="true">✧</span><span class="world-spark" aria-hidden="true">✦</span></div></section>' +
      '<section aria-labelledby="chapters-title"><div class="section-heading"><div><div class="eyebrow">选一条喜欢的小路</div><h2 id="chapters-title">今天，去哪儿探索？</h2></div><p>' + (total ? '已经完成 ' + total + ' 次小发现' : '从分与合出发，也可以自由看看') + '</p></div><div class="chapter-grid">' + Core.chapters.map((c, i) => '<button class="chapter-card" data-chapter="' + c.id + '" style="--accent:' + esc(c.accent || '#63856c') + '"><span class="chapter-number">0' + (i + 1) + '</span><img class="chapter-picture" src="' + chapterPicture(c.id) + '" alt=""><h3>' + esc(c.title) + '</h3><p>' + esc(c.subtitle) + '</p><span class="chapter-meta">' + esc(c.level || '') + '</span><span class="chapter-play" aria-hidden="true">去玩吧 <b>→</b></span>' + ((records[c.id]?.sessions || 0) ? '<span class="visited-mark">探索过 ' + records[c.id].sessions + ' 次</span>' : '') + '</button>').join('') + '</div></section>';
    main.insertAdjacentHTML('beforeend', '<section class="keepsake-shelf badge-shelf"><div class="section-heading"><div><div class="eyebrow">把发现带回家</div><h2>我的森林徽章</h2><p>完成一章，点亮一枚专属徽章</p></div><button class="text-button reset-records-button" id="reset-records" title="家长操作：重置当前浏览器的通关和练习记录"><span aria-hidden="true">↺</span> 重置通关记录</button></div><div class="keepsake-items badge-collection">' + Core.chapters.map(c => '<div class="keepsake ' + (records[c.id]?.sessions ? 'earned' : '') + '" data-badge="' + c.id + '"><img class="collection-badge" src="' + badgeImage(c.id) + '" alt="' + esc(badgeName(c.id)) + '徽章"><span class="keepsake-name">' + esc(badgeName(c.id)) + '</span><span class="keepsake-status">' + (records[c.id]?.sessions ? '已点亮 · ' + esc(c.title) : '完成' + esc(c.title) + '后点亮') + '</span></div>').join('') + '</div></section>');
    const saved = readSession();
    try { if (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.version === 1) main.querySelector('.hero-copy').insertAdjacentHTML('beforeend', '<p class="upgrade-note">小路升级为每趟 10 个任务啦。旧版已完成的记录保留，请从新的一趟出发。</p>'); } catch (_) {}
    if (saved) {
      main.querySelector('.hero-copy').insertAdjacentHTML('beforeend', '<button class="primary-button resume-button" id="resume-button">继续刚才的' + esc(Core.getChapter(saved.chapterId).title) + ' · 第 ' + (saved.round + 1) + ' 关 →</button>');
      document.getElementById('resume-button').onclick = resumeSession;
    }
    main.querySelectorAll('[data-chapter]').forEach(b => b.addEventListener('click', () => start(b.dataset.chapter)));
    document.getElementById('reset-records').onclick = resetRecords;
    globalThis.NumberForestHomeMotion?.mount(main.querySelector('.hero-art'));
  }
  function start(id) { stopVoice(); pauseTime(); elapsedMs = 0; state.chapter = Core.getChapter(id); state.round = 0; state.completed = 0; state.independent = 0; nextTask(); focusMain(); }
  function nextTask() {
    state.screen = 'game'; state.seed = Math.floor(Math.random() * 4294967296); state.task = Core.createTask(state.chapter.id, { round: state.round, random: seeded(state.seed) });
    Object.assign(state, { selected: null, hints: false, attempts: 0, solved: false, manip: 0, changed: false, feedback: '', feedbackSelected: null, custom: {} });
    state.bowls = Array(state.task.model.groups || 0).fill(0);
    renderGame(true); speak(state.task.prompt);
  }
  function acorns(n, cls = '') { return Array.from({ length: Math.max(0, n) }, (_, i) => '<span class="acorn ' + cls + '" aria-hidden="true" style="--i:' + i + '"></span>').join(''); }
  function basket(count, label, cls = '') { return '<div class="basket ' + cls + '"><div class="group-label">' + esc(label) + '</div><div class="basket-fruit" role="img" aria-label="' + count + ' 颗松果">' + (count ? acorns(count) : '<span class="zero-mark">空空的</span>') + '</div></div>'; }
  function sceneHtml() {
    const t = state.task, m = t.model;
    const custom = globalThis.NumberForestViews.get(t.kind);
    if (custom) return custom.render(viewContext());
    if (t.kind === 'bonds') {
      const n = state.solved ? t.answer : state.manip;
      return (m.equation ? '<div class="puzzle-equation">' + esc(m.equation) + '</div>' : '') + '<div class="scene bonds-scene"><div class="scene-note">这个篮子需要 ' + m.total + ' 颗松果</div><div class="slot-grid" role="img" aria-label="已有 ' + m.visible + ' 颗，新放了 ' + n + ' 颗">' + Array.from({ length: m.total }, (_, i) => '<span class="nut-slot ' + (i >= m.visible ? 'waiting' : '') + '">' + (i < m.visible + n ? acorns(1, i >= m.visible ? 'new' : '') : '<span class="slot-dot"></span>') + '</span>').join('') + '</div><div class="scene-legend"><span>已有 ' + m.visible + ' 颗</span><span>点按钮，试着补齐空位</span></div></div>' + (!state.solved ? '<div class="control-row"><button class="small-button" data-manip="-1" ' + (state.manip === 0 ? 'disabled' : '') + '>' + playIcon('take') + '取回一颗</button><button class="secondary-button" data-manip="1" ' + (state.manip >= t.answer ? 'disabled' : '') + '>' + playIcon('add') + '放入一颗</button></div>' : '');
    }
    if (t.kind === 'add') {
      const joined = state.manip > 0 || state.solved;
      return '<div class="scene"><div class="basket-grid">' + (joined ? basket(m.a + m.b, '两篮合在一起') : basket(m.a, '原来有 ' + m.a + ' 颗') + '<span class="operator-symbol">＋</span>' + basket(m.b, '又送来 ' + m.b + ' 颗')) + '</div></div>' + (!state.solved ? '<div class="control-row"><button class="secondary-button" data-toggle="join">' + playIcon('join') + (joined ? '分开看看' : '把两篮合起来') + '</button></div>' : '');
    }
    if (t.kind === 'subtract') {
      const removed = state.manip > 0 || state.solved;
      return '<div class="scene"><div class="basket"><div class="group-label">原来有 ' + m.a + ' 颗，要送走 ' + m.b + ' 颗</div><div class="basket-fruit">' + acorns(m.a - m.b) + acorns(m.b, removed ? 'removed' : '') + '</div></div>' + (removed ? '<div class="scene-note">淡色的是送走的，数数留下了多少。</div>' : '') + '</div>' + (!state.solved ? '<div class="control-row"><button class="secondary-button" data-toggle="remove">' + playIcon('take') + (removed ? '放回来看看' : '送给朋友 ' + m.b + ' 颗') + '</button></div>' : '');
    }
    if (t.kind === 'groups') {
      const expanded = state.manip > 0 || state.solved;
      const shown = expanded ? m.groups : m.previousGroups;
      return '<div class="scene"><div class="scene-note">每篮始终放 ' + m.perGroup + ' 颗</div><div class="basket-grid grouped">' + Array.from({ length: shown }, (_, i) => basket(m.perGroup, '第 ' + (i + 1) + ' 篮', i >= m.previousGroups ? 'extra-group' : '')).join('') + (!expanded ? '<div class="basket empty-basket"><span>＋</span><p>再来一篮</p></div>' : '') + '</div><div class="known-fact">已经知道：' + m.perGroup + ' × ' + m.previousGroups + ' = ' + (m.perGroup * m.previousGroups) + '<span> · 再添一篮，就多 ' + m.perGroup + ' 颗</span></div></div>' + (!state.solved ? '<div class="control-row"><button class="secondary-button" data-toggle="group">' + playIcon('basket') + (expanded ? '拿走新的一篮' : '再添一篮，看看变化') + '</button></div>' : '');
    }
    if (t.kind === 'sharing') {
      const bowls = state.solved ? Array(m.groups).fill(m.perGroup) : state.bowls;
      const remaining = m.total - bowls.reduce((a, b) => a + b, 0);
      return '<div class="scene sharing-scene"><div class="supply-row"><span>待分的松果</span><div aria-label="还剩 ' + remaining + ' 颗">' + (remaining ? acorns(remaining) : '<span class="all-shared">分完啦</span>') + '</div></div><div class="share-animals">' + bowls.map((n, i) => '<div class="animal-place"><button class="share-animal" data-bowl="' + i + '" aria-label="给第 ' + (i + 1) + ' 个小伙伴一颗，目前 ' + n + ' 颗" ' + (state.solved || !remaining ? 'disabled' : '') + '><span class="animal-avatar" aria-hidden="true">' + animalSvg(i) + '</span><span class="group-label">小伙伴 ' + (i + 1) + '</span><span class="animal-bowl">' + (n ? acorns(n) : '<span class="slot-dot"></span>') + '</span></button>' + (!state.solved ? '<button class="small-button bowl-return" data-return="' + i + '" aria-label="从第 ' + (i + 1) + ' 个小伙伴取回一颗" ' + (!n ? 'disabled' : '') + '>取回一颗</button>' : '') + '</div>').join('') + '</div><p class="scene-note">点小伙伴分松果，让每一份一样多。</p></div>';
    }
    if (t.kind === 'compare') return '<div class="scene"><div class="compare-baskets">' + [m.a, m.b].map(n => '<button class="basket compare-basket ' + (state.selected === n ? 'selected' : '') + '" data-answer="' + n + '" aria-label="选择 ' + n + ' 颗的篮子" aria-pressed="' + (state.selected === n) + '" ' + (state.solved ? 'disabled' : '') + '><span class="basket-fruit">' + acorns(n) + '</span><strong>' + n + '</strong><span>选这篮</span></button>').join('') + '</div></div>';
    if (t.kind === 'sequence') return '<div class="scene"><div class="sequence-track">' + m.values.map((n, i) => (i ? '<span class="sequence-arrow" aria-hidden="true">→</span>' : '') + '<span class="sequence-tile ' + (n === null ? 'unknown' : '') + '">' + (n === null ? (state.solved ? t.answer : '?') : n) + '</span>').join('') + '</div>' + (state.hints || state.solved ? '<div class="scene-note">每次' + (m.step > 0 ? '增加 ' : '减少 ') + Math.abs(m.step) + '</div>' : '') + '</div>';
    if (t.kind === 'numberline') return '<div class="scene numberline-scene"><div class="jump-caption"><strong>' + m.start + '</strong><span>' + (m.step > 0 ? '往前跳 ' : '往回跳 ') + Math.abs(m.step) + ' 格</span><strong>→ ' + (state.solved ? t.answer : '?') + '</strong></div>' + numberlineSvg(m.start, m.step, state.manip > 0 || state.solved, state.solved) + '</div>' + (!state.solved ? '<div class="control-row"><button class="secondary-button" data-toggle="jump">' + playIcon('jump') + (state.manip ? '回到起点' : '跳一跳，看看落在哪里') + '</button></div>' : '');
    if (t.kind === 'group-total' || t.kind === 'group-count') return '<div class="scene"><div class="scene-note">每篮 ' + m.perGroup + ' 颗</div><div class="basket-grid grouped">' + Array.from({ length: m.groups }, () => basket(m.perGroup, '')).join('') + '</div><div class="puzzle-equation">' + (t.kind === 'group-count' ? m.perGroup + ' × ' + (state.solved ? m.groups : '?') + ' = ' + m.total : Array(m.groups).fill(m.perGroup).join(' + ') + ' = ' + (state.solved ? m.total : '?')) + '</div></div>';
    if (t.kind === 'pack') return '<div class="scene"><div class="scene-note">每 ' + m.perGroup + ' 颗装成一袋</div><div class="basket-grid grouped">' + (state.manip || state.solved ? Array.from({ length: m.groups }, () => basket(m.perGroup, '一袋')).join('') : basket(m.total, '一共有 ' + m.total + ' 颗')) + '</div></div>' + (!state.solved ? '<div class="control-row"><button class="secondary-button" data-toggle="pack">' + playIcon('pack') + (state.manip ? '倒出来再看看' : '每 ' + m.perGroup + ' 颗装一袋') + '</button></div>' : '');
    if (t.kind === 'clock-forward') return '<div class="scene clock-forward-scene"><div class="clock-step"><div class="scene-note">现在</div>' + clockSvg(m.hour, m.minute, false) + '</div><div class="time-jump">＋' + (m.advance === 60 ? '1 小时' : '30 分钟') + '<span aria-hidden="true">→</span></div><div class="clock-step"><div class="scene-note">过一会儿</div>' + (state.solved ? clockSvg(m.targetHour, m.targetMinute, false) : '<div class="clock-face clock-placeholder" aria-label="需要找到过一会儿的时间">?</div>') + '</div></div>';
    if (t.kind === 'clock') return '<div class="scene clock-scene">' + clockSvg(m.hour, m.minute, state.hints) + '<div class="clock-legend"><span><i class="hand-key hour-key"></i>短的是时针</span><span><i class="hand-key minute-key"></i>长的是分针</span></div></div>';
    return '<div class="scene">请为这个章节添加操作场景。</div>';
  }
  function animalSvg(i) {
    const colors = ['#f0a054', '#81bda9', '#edc962', '#e9a1a0'];
    return '<svg viewBox="0 0 80 72" aria-hidden="true"><path d="M17 27Q4 0 28 13M53 14Q76 0 65 29" fill="' + colors[i % 4] + '" stroke="#624d3c" stroke-width="2"/><ellipse cx="40" cy="42" rx="29" ry="26" fill="' + colors[i % 4] + '"/><ellipse cx="40" cy="51" rx="17" ry="14" fill="#f7e9d6"/><circle cx="29" cy="38" r="2.8" fill="#283c32"/><circle cx="51" cy="38" r="2.8" fill="#283c32"/><path d="M36 47q4-5 8 0l-4 4z" fill="#624d3c"/><path d="M33 55q7 6 14 0" fill="none" stroke="#624d3c" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  function clockSvg(hour, minute, hint) {
    const ha = (hour % 12) * 30 + minute / 2, ma = minute * 6;
    const labels = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1, a = n * Math.PI / 6;
      return '<text x="' + (150 + Math.sin(a) * 105).toFixed(2) + '" y="' + (150 - Math.cos(a) * 105 + 8).toFixed(2) + '" text-anchor="middle">' + n + '</text>';
    }).join('');
    const ticks = Array.from({ length: 60 }, (_, i) => '<line x1="150" y1="' + (i % 5 ? 24 : 21) + '" x2="150" y2="' + (i % 5 ? 28 : 32) + '" transform="rotate(' + i * 6 + ' 150 150)" stroke="' + (i % 5 ? '#c5cbbd' : '#6d806b') + '" stroke-width="' + (i % 5 ? 1.5 : 3) + '"/>').join('');
    return '<svg class="clock-face" viewBox="0 0 300 300" role="img" aria-label="模拟钟表，观察短时针和长分针"><circle cx="150" cy="150" r="144" fill="#e9c674"/><circle cx="150" cy="150" r="134" fill="#fffdf5"/>' + ticks + '<g fill="#365346" font-size="23" font-family="system-ui,sans-serif" font-weight="700">' + labels + '</g><line class="hour-hand" x1="150" y1="154" x2="150" y2="83" transform="rotate(' + ha + ' 150 150)" stroke="#315d49" stroke-width="11" stroke-linecap="round"/><line class="minute-hand" x1="150" y1="157" x2="150" y2="48" transform="rotate(' + ma + ' 150 150)" stroke="#cb7355" stroke-width="6" stroke-linecap="round"/><circle cx="150" cy="150" r="10" fill="#315d49"/><circle cx="150" cy="150" r="4" fill="#f8edce"/>' + (hint ? '<text x="150" y="207" text-anchor="middle" font-size="13" fill="#6b7c69">先看短针，再看长针</text>' : '') + '</svg>';
  }
  function numberlineSvg(start, step, showJumps, solved, selected = null) {
    const x = n => 30 + n * 30, end = start + step, dir = Math.sign(step);
    const ticks = Array.from({ length: 21 }, (_, n) => '<line x1="' + x(n) + '" y1="86" x2="' + x(n) + '" y2="99" stroke="#597c66" stroke-width="2"/><text x="' + x(n) + '" y="122" text-anchor="middle" fill="#355741" font-size="17">' + (n === end && !solved ? '?' : n) + '</text>').join('');
    const jumps = showJumps ? Array.from({ length: Math.abs(step) }, (_, i) => { const a = x(start + i * dir), b = x(start + (i + 1) * dir); return '<path d="M' + a + ' 82 Q' + (a + b) / 2 + ' 36 ' + b + ' 82" fill="none" stroke="#ca7655" stroke-width="3" marker-end="url(#jump-arrow)"/>'; }).join('') : '';
    return '<svg class="numberline-svg" viewBox="0 0 660 145" role="img" aria-label="数轴从 ' + start + ' 开始，' + (step > 0 ? '向右' : '向左') + '跳 ' + Math.abs(step) + ' 格"><defs><marker id="jump-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ca7655"/></marker></defs><line x1="30" y1="90" x2="630" y2="90" stroke="#597c66" stroke-width="3"/>' + ticks + jumps + (selected !== null ? '<circle cx="' + x(selected) + '" cy="90" r="11" fill="none" stroke="#ca7655" stroke-width="3"/><text x="' + x(selected) + '" y="53" text-anchor="middle" fill="#a75c3e" font-size="16">你选的 ' + selected + '</text>' : '') + '<circle cx="' + x(start) + '" cy="90" r="7" fill="#315d49"/><text x="' + x(start) + '" y="24" text-anchor="middle" fill="#315d49" font-size="17">起点</text></svg>';
  }
  function timeLabel(value) { const h = Math.floor(value / 60), m = value % 60; return h + ':' + String(m).padStart(2, '0'); }
  function answerHtml() {
    if (state.solved) return '';
    const t = state.task;
    const custom = globalThis.NumberForestViews.get(t.kind);
    if (custom?.answer) return custom.answer(viewContext()) + answerActions();
    if (t.kind === 'compare') return '<div class="answer-panel"><div class="answer-label">' + esc(t.answerLabel) + '</div>' + answerActions() + '</div>';
    if (t.kind.startsWith('clock')) {
      const m = t.kind === 'clock-forward' ? { hour: t.model.targetHour, minute: t.model.targetMinute } : t.model;
      const options = [m.hour * 60, m.hour * 60 + 30, (m.hour % 12 + 1) * 60 + m.minute, ((m.hour + 10) % 12 + 1) * 60 + m.minute].sort((a, b) => a - b);
      return '<div class="answer-panel"><div class="answer-label">' + esc(t.answerLabel || '现在是几点？') + '</div><div class="choice-grid">' + options.map(v => '<button class="time-choice ' + (state.selected === v ? 'selected' : '') + '" data-answer="' + v + '" aria-pressed="' + (state.selected === v) + '">' + timeLabel(v) + '<span>' + Math.floor(v / 60) + (v % 60 ? ' 点半' : ' 点整') + '</span></button>').join('') + '</div>' + answerActions() + '</div>';
    }
    return '<div class="answer-panel"><div class="answer-label">' + (t.answerLabel || (t.kind === 'sharing' ? '每个小伙伴分到几颗？' : t.kind === 'bonds' ? '一共要补几颗？' : t.kind === 'subtract' ? '还剩几颗？' : t.kind === 'groups' ? '再添一篮后一共有几颗？' : '现在一共有几颗？')) + '</div><div class="number-pad">' + Array.from({ length: t.maxAnswer + 1 }, (_, n) => '<button data-answer="' + n + '" class="' + (state.selected === n ? 'selected' : '') + '" aria-pressed="' + (state.selected === n) + '">' + n + '</button>').join('') + '</div>' + answerActions() + '</div>';
  }
  function answerActions() { return '<div class="answer-actions"><button class="text-button" id="hint-button">' + (state.hints ? '再看看提示' : '给我一点提示') + '</button><button class="primary-button" id="check-button" ' + (state.selected === null ? 'disabled' : '') + '>试试看 <span aria-hidden="true">→</span></button></div>'; }
  function clearFeedback() { state.feedback = ''; state.feedbackSelected = null; }
  function revealFeedback() {
    const panel = main.querySelector('.answer-feedback');
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function feedbackHtml() {
    if (!state.feedback) return '';
    const t = state.task;
    const listen = globalThis.NumberForestSpeech ? '<button class="text-button listen-feedback" id="listen-feedback" aria-label="听小松鼠的鼓励和方法提示">♫ 听小松鼠</button>' : '';
    if (state.solved) {
      const displayAnswer = t.kind.startsWith('clock') ? timeLabel(t.answer) : t.answer;
      return '<section class="feedback answer-feedback success" tabindex="-1" aria-label="答对啦"><div class="celebration-scene" aria-hidden="true"><div class="celebration-rays"></div><div class="celebration-stars">' + Array.from({ length: 8 }, (_, i) => '<span style="--i:' + i + '">✦</span>').join('') + '</div><div class="celebration-mascot"><img class="buddy-celebrate" src="assets/playful/buddy-happy.svg" alt=""></div><span class="celebration-check">✓</span></div><div class="celebration-copy"><h2>答对啦！</h2><div class="answer-reveal"><strong>' + esc(displayAnswer) + '</strong><span>' + esc(t.unit ?? (t.kind.startsWith('clock') ? '' : '颗')) + '</span></div><p>' + esc(state.feedback) + '</p></div><div class="feedback-actions"><button class="primary-button" id="next-button">' + (state.round === ROUND_COUNT - 1 ? '领取通关徽章 →' : '下一个小发现 →') + '</button>' + listen + '</div></section>';
    }
    const d = globalThis.NumberForestFeedback.describe(t, state.feedbackSelected, state);
    let visual = '';
    if (d.kind === 'clock') {
      const m = d.model;
      visual = '<div class="clock-feedback-pair"><div class="clock-feedback-item"><span>你选的 ' + esc(m.selectedLabel) + '</span>' + clockSvg(m.selectedHour, m.selectedMinute, false) + '</div><span class="clock-compare-arrow" aria-hidden="true">↔</span><div class="clock-feedback-item"><span>再看这根针</span>' + clockSvg(m.targetHour, m.targetMinute, false).replace('class="clock-face"', 'class="clock-face ' + (m.hourMismatch ? 'focus-hour ' : '') + (m.minuteMismatch ? 'focus-minute' : '') + '"') + '</div></div>';
    } else if (d.kind === 'sharing' && d.direction === 'equal') {
      visual = '<div class="feedback-visual sharing-compare">' + d.model.bowls.map((n, i) => '<div class="mini-bowl ' + (n !== t.model.perGroup ? 'needs-adjustment' : '') + '"><span class="mini-animal">' + animalSvg(i) + '</span><div>' + acorns(n) + '</div><strong>' + n + '</strong><span>' + (n < t.model.perGroup ? '＋' : n > t.model.perGroup ? '−' : '✓') + '</span></div>').join('') + '</div>' + (d.model.remaining > 0 ? '<div class="remaining-hint">还没分完 ' + acorns(d.model.remaining) + '</div>' : '');
    } else if (d.kind === 'numberline') {
      visual = '<div class="feedback-visual">' + numberlineSvg(t.model.start, t.model.step, true, false, state.feedbackSelected) + '</div>';
    } else if (['quantity', 'sharing'].includes(d.kind)) {
      const chosen = state.feedbackSelected, target = t.answer, max = Math.max(chosen, target);
      const unit = d.unit ?? t.unit ?? '颗';
      const dots = (count, isChosen) => Array.from({ length: max }, (_, i) => '<i class="dot ' + (['篮', '袋'].includes(unit) ? 'container-dot ' + (unit === '袋' ? 'bag-dot ' : '') : '') + (i >= count ? 'missing' : isChosen && i >= target ? 'extra' : '') + '" aria-hidden="true"></i>').join('');
      visual = '<div class="feedback-visual quantity-compare" aria-label="刚才选了 ' + chosen + unit + '，可以数数下面这一排"><div class="compare-row"><span class="compare-label">你选的</span><div class="compare-dots">' + dots(chosen, true) + '</div><strong class="compare-number">' + chosen + '</strong></div><div class="compare-row"><span class="compare-label">' + (unit === '篮' ? '数篮子' : unit === '袋' ? '数袋子' : '数一数') + '</span><div class="compare-dots">' + dots(target, false) + '</div><strong class="compare-number">' + (target === 0 ? '0' : '?') + '</strong></div></div>';
    } else if (d.kind === 'sequence') {
      visual = '<div class="sequence-track">' + t.model.values.map((n, i) => (i ? '<span class="sequence-arrow">' + (t.model.step > 0 ? '+' : '−') + Math.abs(t.model.step) + ' →</span>' : '') + '<span class="sequence-tile ' + (n === null ? 'unknown' : '') + '">' + (n === null ? '?' : n) + '</span>').join('') + '</div>';
    } else if (d.kind === 'compare') {
      visual = '<div class="feedback-visual quantity-compare"><div class="compare-row"><span class="compare-label">左边</span><div class="compare-dots">' + acorns(t.model.a) + '</div><strong class="compare-number">' + t.model.a + '</strong></div><div class="compare-row"><span class="compare-label">右边</span><div class="compare-dots">' + acorns(t.model.b) + '</div><strong class="compare-number">' + t.model.b + '</strong></div></div>';
    }
    return '<section class="feedback answer-feedback retry" tabindex="-1" aria-label="一起看看提示"><div class="feedback-heading"><span aria-hidden="true"><img src="assets/playful/buddy-thinking.svg" alt=""></span><h2>' + esc(d.title) + '</h2></div>' + visual + '<p class="feedback-message">' + esc(d.message) + '</p><div class="feedback-actions">' + listen + '</div></section>';
  }
  function buddyState() {
    if (state.solved) return { mood: 'happy', message: '发现啦！给你一个大大的拥抱！' };
    if (state.feedback || state.hints) return { mood: 'thinking', message: '我们一起看看，秘密藏在哪里？' };
    const messages = {
      bonds: '空位在等松果呢，一起补一补！', compare: '哪一边更' + (state.task.model.ask === 'less' ? '少' : '多') + '？我也来数一数！', sequence: '数字排着队，空位里少了谁呀？',
      add: '两篮松果碰个面，会有多少呢？', subtract: '送给朋友后，还有多少留在篮里？', numberline: '准备好了吗？跟着数字跳一跳！',
      groups: '每篮一样多，再添一篮！', 'group-total': '每篮一样多，一篮一篮数！', 'group-count': '数数篮子，一共有几组呢？',
      sharing: '朋友们来野餐啦，每份要一样多哦！', pack: '松果装进小袋子，出发去野餐！',
      clock: '滴答滴答，和我一起找时针！', 'clock-forward': '过一会儿，时针会走到哪里？'
    };
    return { mood: 'idle', message: messages[state.task.kind] || '一起找找藏在森林里的小秘密！' };
  }
  function buddyHtml() {
    const buddy = buddyState();
    return '<div class="buddy-scene" data-mood="' + buddy.mood + '"><img class="buddy-character" src="assets/playful/buddy' + (buddy.mood === 'idle' ? '' : '-' + buddy.mood) + '.svg" alt=""><p class="buddy-speech">' + esc(buddy.message) + '</p></div>';
  }
  function buddyResponse(message, mood = 'idle') {
    const buddy = main.querySelector('.buddy-scene');
    if (!buddy) return;
    buddy.dataset.mood = mood;
    buddy.querySelector('.buddy-character').src = 'assets/playful/buddy' + (mood === 'idle' ? '' : '-' + mood) + '.svg';
    buddy.querySelector('.buddy-speech').textContent = message;
  }
  // Repaint quantities immediately, then animate only the changed object.
  // Focus stays on the same control so repeated keyboard/touch play is stable.
  function renderAfterPlay(controlSelector, arrivalSelector, message) {
    renderGame();
    let control = main.querySelector(controlSelector);
    if (control?.disabled) {
      control = control.closest('.animal-place, .control-row')?.querySelector('button:not(:disabled)') || main.querySelector('[data-answer]:not(:disabled)');
    }
    control?.focus({ preventScroll: true });
    main.querySelector('.scene')?.classList.add('is-playing');
    if (arrivalSelector) main.querySelector(arrivalSelector)?.classList.add('playful-arrival');
    buddyResponse(message);
    main.querySelector('.buddy-scene')?.classList.add('is-reacting');
  }
  function renderGame(entering = false) {
    globalThis.NumberForestHomeMotion?.stop();
    const tipOpen = !entering && main.querySelector('.guide-tip')?.open;
    main.dataset.screen = 'game'; main.dataset.chapter = state.chapter.id; main.dataset.motion = entering ? 'enter' : 'respond';
    globalThis.NumberForestEffects?.clear();
    const t = state.task, c = state.chapter;
    main.innerHTML = '<div class="game-topbar"><button class="back-button" id="back-button">← 森林地图</button><div class="chapter-label">' + esc(c.title) + '</div><div class="round-dots" aria-label="第 ' + (state.round + 1) + ' 个任务，共 ' + ROUND_COUNT + ' 个">' + Array.from({ length: ROUND_COUNT }, (_, i) => '<span class="' + (i < state.round || (state.solved && i === state.round) ? 'done' : i === state.round ? 'current' : '') + '"' + (i === state.round ? ' aria-current="step"' : '') + '>' + (i < state.round || (state.solved && i === state.round) ? '✓' : i + 1) + '</span>').join('') + '</div></div>' +
      '<div class="game-layout"><section class="play-panel"><div class="mission-heading"><div class="eyebrow mission-kicker">小发现 ' + String(state.round + 1).padStart(2, '0') + ' / 10 <button class="read-button" id="read-button" aria-label="朗读题目">♫ 听题目</button></div><h1>' + esc(t.prompt) + '</h1><p>' + esc(t.instruction || '可以先摆一摆，再选出你的答案。') + '</p></div>' + (state.solved ? feedbackHtml() : '') + sceneHtml() + (!state.solved ? feedbackHtml() : '') + (state.solved ? '<div class="relationship-card"><div class="eyebrow">原来它们是一家人</div><div class="equation-strip">' + t.relations.map(r => '<span class="equation">' + esc(r) + '</span>').join('') + '</div></div>' : answerHtml()) + '</section><aside class="guide-panel" aria-label="小松鼠陪你探索">' + buddyHtml() + (state.hints && !state.solved ? '<div class="hint-box"><strong>一起想一想</strong><p>' + esc(t.hint) + '</p></div>' : '') + '<details class="guide-tip"><summary class="guide-heading">给爸爸妈妈的小提示</summary><p class="tip-copy">' + chapterTip(c.id) + '</p></details><div class="guide-footnote">可以数，可以摆，<br>慢慢来，我陪你！</div></aside></div>';
    if (tipOpen) main.querySelector('.guide-tip').open = true;
    bindGame();
    resumeTime(); persistSession();
    if (state.sound) { globalThis.NumberForestSpeech?.prepare(t.prompt); globalThis.NumberForestSpeech?.prepare(hintSpeech()); }
  }
  function chapterTip(id) {
    return ({ bonds: '一个数可以分成两部分。知道全部和一部分，就能找出另一部分。', arithmetic: '加法把两部分合起来；减法看拿走后还剩多少。同一篮松果，能帮我们发现加法和减法的联系。', groups: '每一篮都一样多。再添一篮，增加的就是这一篮的数量。', sharing: '平均分，就是每个小伙伴分到的一样多。分完以后，再合起来看看。', clock: '短短的时针告诉我们几点，长长的分针告诉我们过了多少分钟。时针也会慢慢往前走。' })[id] || '试试看，你能发现什么？';
  }
  function bindGame() {
    document.getElementById('back-button').onclick = home;
    document.getElementById('read-button').onclick = () => { state.sound = true; updateSound(); speak(state.task.prompt); };
    main.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
      state.selected = Number(b.dataset.answer); clearFeedback(); main.querySelector('.answer-feedback')?.remove();
      main.querySelectorAll('[data-answer]').forEach(el => { const on = el === b; el.classList.toggle('selected', on); el.setAttribute('aria-pressed', String(on)); });
      document.getElementById('check-button').disabled = false;
      b.classList.remove('is-tapped');
      void b.offsetWidth;
      b.classList.add('is-tapped');
      buddyResponse('选好啦！点“试试看”，一起发现答案。');
      persistSession();
    });
    main.querySelectorAll('[data-manip]').forEach(b => b.onclick = () => {
      const delta = Number(b.dataset.manip);
      state.manip = Math.max(0, Math.min(state.task.answer, state.manip + delta)); state.changed = true; clearFeedback();
      const filled = state.task.model.visible + state.manip;
      renderAfterPlay('[data-manip="' + delta + '"]', delta > 0 ? '.nut-slot:nth-child(' + filled + ') .acorn' : null, delta > 0 ? '又放进一颗！空位变少啦。' : '取回来啦，再摆一摆也可以！');
    });
    main.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const action = b.dataset.toggle;
      state.manip = state.manip ? 0 : 1; state.changed = true; clearFeedback();
      const targets = { join: '.scene .basket', group: '.scene .extra-group', jump: '.numberline-svg', pack: '.scene .basket' };
      renderAfterPlay('[data-toggle="' + action + '"]', state.manip ? targets[action] : null, state.manip ? '变一变，数量有什么新发现？' : '回到刚才，再看看它们的关系！');
    });
    main.querySelectorAll('[data-bowl]').forEach(b => b.onclick = () => {
      if (state.bowls.reduce((a, v) => a + v, 0) < state.task.model.total) {
        const i = Number(b.dataset.bowl);
        state.bowls[i]++; state.changed = true; clearFeedback();
        renderAfterPlay('[data-bowl="' + i + '"]', '[data-bowl="' + i + '"] .animal-avatar', '朋友收到啦！看看每份一样多了吗？');
      }
    });
    main.querySelectorAll('[data-return]').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.return); state.bowls[i] = Math.max(0, state.bowls[i] - 1); clearFeedback();
      renderAfterPlay('[data-return="' + i + '"]', null, '拿回来再分分，让每个朋友都一样多。');
    });
    const hint = document.getElementById('hint-button');
    if (hint) hint.onclick = () => { state.hints = true; renderGame(); announce(state.task.hint); speak(hintSpeech()); const box = main.querySelector('.hint-box'); if (window.innerWidth < 800) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    const listen = document.getElementById('listen-feedback'); if (listen) listen.onclick = () => { state.sound = true; updateSound(); speakFeedback(); };
    const check = document.getElementById('check-button'); if (check) check.onclick = checkAnswer;
    const next = document.getElementById('next-button'); if (next) next.onclick = () => { state.round++; if (state.round >= ROUND_COUNT) finish(); else nextTask(); focusMain(); };
    globalThis.NumberForestViews.get(state.task.kind)?.bind?.(main, viewContext());
  }
  function viewContext() {
    return { task: state.task, solved: state.solved, hinted: state.hints, local: state.custom,
      escape: esc, acorns, update(patch) { Object.assign(state.custom, patch); renderGame(); },
      announce };
  }
  function checkAnswer() {
    if (state.selected === null || state.solved) return;
    state.attempts++;
    state.feedbackSelected = state.selected;
    const diagnosis = globalThis.NumberForestFeedback.describe(state.task, state.selected, state);
    if (!diagnosis.correct) {
      state.feedback = diagnosis.message;
      renderGame(); revealFeedback(); announce(state.feedback); speakFeedback(); return;
    }
    pauseTime(); state.solved = true; state.completed++;
    const independent = !state.hints && state.attempts === 1;
    if (independent) state.independent++;
    state.feedback = state.task.success || '你发现了这些数之间的关系！';
    const r = records[state.chapter.id] ||= { completed: 0, independent: 0, assisted: 0, retries: 0, sessions: 0 };
    r.completed++; if (independent) r.independent++; else r.assisted++;
    r.retries += state.attempts - 1;
    saveRecords();
    if (state.round === ROUND_COUNT - 1) {
      finish(); focusMain(); announce('答对啦！完成十个任务，获得' + badgeName(state.chapter.id) + '徽章。');
      speak('答对啦！这趟探索完成了。看看你的' + badgeName(state.chapter.id) + '徽章！'); return;
    }
    renderGame(); revealFeedback(); globalThis.NumberForestEffects?.celebrate(main.querySelector('.answer-feedback.success')); announce('答对啦！' + state.feedback); speakFeedback();
  }
  function finish() {
    if (state.screen === 'result') return;
    globalThis.NumberForestEffects?.clear();
    stopVoice(); pauseTime(); state.screen = 'result'; main.dataset.screen = 'result'; main.dataset.motion = 'enter';
    const r = records[state.chapter.id];
    const firstBadge = !r.sessions;
    r.sessions++; r.timingRounds = ROUND_COUNT; r.lastMs = elapsedMs; r.bestMs = r.bestMs ? Math.min(r.bestMs, elapsedMs) : elapsedMs; saveRecords();
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    const id = state.chapter.id;
    main.innerHTML = '<section class="result-panel badge-result"><section class="badge-reveal is-loading" aria-label="获得' + esc(badgeName(id)) + '徽章"><p class="eyebrow">' + (firstBadge ? '探索完成 · 点亮专属徽章' : '再次完成 · 你的徽章闪闪发光') + '</p><div class="badge-stage"><div class="badge-beams" aria-hidden="true"></div><div class="badge-orbits" aria-hidden="true"><i></i><i></i></div><div class="badge-charge" aria-hidden="true"></div><div class="badge-shockwave" aria-hidden="true"></div><div class="badge-floor" aria-hidden="true"></div><div class="badge-aura" aria-hidden="true"></div><div class="badge-stars" aria-hidden="true">' + Array.from({ length: 12 }, () => '<span>✦</span>').join('') + '</div><span class="badge-fallback" aria-hidden="true">✦</span><div class="badge-coin"><div class="badge-edge" aria-hidden="true"></div><div class="badge-face badge-front"><img src="' + badgeImage(id) + '" alt="' + esc(badgeName(id)) + '徽章"></div><div class="badge-face badge-back" aria-hidden="true"><img src="' + badgeImage('reverse') + '" alt=""></div></div></div><h1 class="badge-title">' + esc(badgeName(id)) + '</h1><p class="badge-description">' + esc(state.chapter.title) + '的 10 个任务，全部完成！<br>' + (firstBadge ? '这枚徽章已经放进你的森林收藏。' : '同一枚徽章，记住又一次新的发现。') + '</p></section><div class="result-actions"><button class="primary-button" id="result-home">看看我的徽章 →</button><button class="secondary-button" id="replay">再探索一次</button></div><div class="stat-row"><div class="stat-item"><strong>10</strong><span>次小发现</span></div><div class="stat-item"><strong>' + Object.values(records).filter(row => row.sessions > 0).length + '</strong><span>枚森林徽章</span></div><div class="stat-item"><strong class="time-stat">' + formatTime(elapsedMs) + '</strong><span>这趟探索用时</span></div></div><details class="last-discovery"><summary>再看看最后一题的发现</summary><p>' + esc(state.feedback) + '</p><div class="equation-strip">' + state.task.relations.map(rel => '<span class="equation">' + esc(rel) + '</span>').join('') + '</div></details><div class="offline-idea"><strong>离开屏幕，也能玩</strong><p>' + offlineIdea(id) + '</p></div><p class="result-note">今天也可以到这里，明天再来。</p></section>';
    document.getElementById('result-home').onclick = home;
    document.getElementById('replay').onclick = () => start(id);
    revealBadge(main.querySelector('.badge-reveal'));
  }
  function revealBadge(reveal) {
    // Start the entire reveal from one clock, after the actual DOM images decode.
    // A small gold medal is visible immediately, including a failed-image case.
    const pictures = [...reveal.querySelectorAll('.badge-face img')];
    const loaded = pictures.map(image => image.decode ? image.decode() : new Promise((resolve, reject) => {
      if (image.complete) return image.naturalWidth ? resolve() : reject();
      image.onload = resolve; image.onerror = reject;
    }));
    Promise.all(loaded).then(() => {
      if (!reveal.isConnected || state.screen !== 'result') return;
      requestAnimationFrame(() => {
        if (!reveal.isConnected || state.screen !== 'result') return;
        reveal.classList.remove('is-loading');
        reveal.dataset.artReady = 'true';
        if (document.hidden || reveal.classList.contains('is-settled') || matchMedia('(prefers-reduced-motion: reduce)').matches) {
          reveal.classList.add('is-settled');
        } else {
          reveal.classList.add('is-animating');
          globalThis.NumberForestEffects?.celebrate(reveal.querySelector('.badge-stage'), { finale: true });
        }
      });
    }).catch(() => {
      if (!reveal.isConnected) return;
      reveal.classList.add('is-fallback', 'is-settled');
      reveal.dataset.artReady = 'fallback';
    });
  }
  function offlineIdea(id) {
    return ({ bonds: '拿出 7 块积木，藏起一部分。看看外面的，猜猜里面有多少。', arithmetic: '用餐时摆好几只勺子，再拿走两只，一起想想还剩几只。', groups: '摆 3 排积木，每排 3 块。再添一排，多了几块？总共呢？', sharing: '把 6 块积木平均分给 3 个玩偶，再把它们合起来。', clock: '找一面家里的钟，看看现在的时针在两个数字之间的哪里。' })[id] || '找一些身边的物品，把今天发现的数量关系再摆一遍。';
  }
  function parent() {
    globalThis.NumberForestHomeMotion?.stop();
    globalThis.NumberForestEffects?.clear();
    stopVoice(); pauseTime(); persistSession(); state.screen = 'parent'; main.dataset.screen = 'parent'; main.dataset.motion = 'enter';
    main.innerHTML = '<section class="parent-panel"><div class="parent-head"><div><div class="eyebrow">观察，比排名更有帮助</div><h1>家长小记</h1><p>这些记录描述练习经历，不代表已经掌握。可以在生活中换个情境，再观察一次。</p></div><button class="back-button" id="parent-back">← 回到森林</button></div><div class="record-grid">' + Core.chapters.map(c => { const r = records[c.id] || { completed: 0, independent: 0, assisted: 0, retries: 0, sessions: 0 }; return '<article class="record-card"><div class="chapter-icon">' + icon(c.id) + '</div><h2>' + esc(c.title) + '</h2><p>' + esc(c.subtitle) + '</p><dl><div><dt>完成任务</dt><dd>' + r.completed + '</dd></div><div><dt>首答正确 · 未点提示</dt><dd>' + r.independent + '</dd></div><div><dt>借助提示或修正后完成</dt><dd>' + r.assisted + '</dd></div><div><dt>完整探索</dt><dd>' + r.sessions + ' 次</dd></div></dl></article>'; }).join('') + '</div><div class="parent-explainer"><strong>怎么看这些数字？</strong><p>“首答正确”也可能借助了数物体和操作场景，不等于脱离实物口算。观察他是否逐渐能接着数、借用熟悉结果，以及说明为什么。这里不把动画、阅读和操作时间算作计算速度。</p><p>所有记录只保存在当前浏览器，换设备不会同步。' + (storageAvailable ? '清除浏览器数据也会清除记录。' : '当前浏览器无法保存记录，这次浏览结束后记录可能丢失。') + '</p></div><div class="settings-row"><button class="text-button" id="reset-records">重置通关记录</button><span>不影响任何章节的使用</span></div></section>';
    document.getElementById('parent-back').onclick = home;
    main.querySelectorAll('.record-card').forEach((card, i) => {
      const r = records[Core.chapters[i].id];
      if (r?.legacyBestMs) card.querySelector('dl').insertAdjacentHTML('beforeend', '<div><dt>旧版 5 题最快记录</dt><dd>' + formatTime(r.legacyBestMs) + '</dd></div>');
      card.querySelector('dl').insertAdjacentHTML('beforeend', '<div><dt>最快一趟 · 10 个任务</dt><dd>' + (r?.bestMs ? formatTime(r.bestMs) : '还没完成一趟') + '</dd></div><div><dt>最近一趟用时</dt><dd>' + (r?.lastMs ? formatTime(r.lastMs) : '—') + '</dd></div>');
    });
    main.querySelector('.parent-explainer').insertAdjacentHTML('beforeend', '<p>“一趟用时”累计每道题作答前的前台时间，包含读题、思考、摆放和提示；答对后的讲解、返回地图、后台时间不计。随机题目难度不同，最快记录只供自己参考，不是标准化测评。</p>');
    document.getElementById('reset-records').onclick = resetRecords;
    focusMain();
  }
  function clearRecordState(screen) {
    pauseTime(); stopVoice(); globalThis.NumberForestEffects?.clear();
    records = {}; elapsedMs = 0;
    // Leave the game before any render or lifecycle callback can save again.
    Object.assign(state, { screen, chapter: null, task: null, round: 0, completed: 0, independent: 0, solved: false, selected: null, feedback: '', feedbackSelected: null });
    let saved = true;
    for (const key of [KEY, SESSION_KEY]) {
      try { localStorage.removeItem(key); } catch (_) { saved = false; storageAvailable = false; }
    }
    return saved;
  }
  function showResetNotice(message) {
    main.querySelector('.badge-shelf, .settings-row').insertAdjacentHTML('afterend', '<p class="reset-notice" role="status">' + esc(message) + '</p>');
    announce(message);
  }
  function resetRecords() {
    if (!window.confirm('确定重置当前浏览器的所有通关记录吗？\n\n徽章、通关次数、最快用时和练习统计都会清空，未完成的探索也会清除。\n此操作不能撤销，所有章节仍可重新探索。')) return;
    const screen = state.screen === 'parent' ? 'parent' : 'home';
    const saved = clearRecordState(screen);
    // Notify other open game tabs so their periodic saves cannot restore old progress.
    try { localStorage.setItem(RESET_KEY, Date.now() + ':' + Math.random()); } catch (_) { storageAvailable = false; }
    if (screen === 'parent') parent(); else renderHome();
    document.getElementById('reset-records').focus({ preventScroll: true });
    showResetNotice(saved ? '记录已重置，所有徽章可以重新收集啦。' : '当前页面的记录已重置，但浏览器未允许清除保存的数据；刷新后可能仍有旧记录。');
  }
  window.addEventListener('storage', event => {
    if (event.key !== RESET_KEY || !event.newValue || event.storageArea !== localStorage) return;
    const saved = clearRecordState('home');
    renderHome(); focusMain();
    showResetNotice(saved ? '另一页已重置记录，回到森林重新探索吧。' : '另一页已重置记录，但这个页面未能清除保存的数据。');
  });
  function updateSound() { const b = document.getElementById('sound-button'); b.textContent = state.sound ? '朗读：开' : '朗读：关'; b.setAttribute('aria-pressed', String(state.sound)); }
  function updateMusic() { const b = document.getElementById('music-button'), enabled = globalThis.NumberForestAudio.isEnabled(); b.textContent = enabled ? '音乐：开' : '音乐：关'; b.setAttribute('aria-pressed', String(enabled)); }
  window.addEventListener('numberforest:music', updateMusic);
  window.addEventListener('numberforest:speech', event => {
    const value = event.detail.status;
    const read = document.getElementById('read-button');
    if (read) {
      read.textContent = value === 'loading' ? '♫ 准备声音…' : value === 'playing' ? '♫ 正在朗读' : value === 'unavailable' ? '♫ 再听一次' : '♫ 听题目';
      read.setAttribute('aria-busy', String(value === 'loading'));
    }
    if (value === 'unavailable') announce('这段语音暂时无法播放，可以再点一次，或者请家长一起读题。');
  });
  document.getElementById('home-button').onclick = home;
  document.getElementById('parent-button').onclick = parent;
  document.getElementById('sound-button').onclick = () => {
    if (!globalThis.NumberForestSpeech) { announce('这个浏览器不支持朗读，仍然可以正常探索。'); return; }
    state.sound = !state.sound; updateSound(); if (state.sound) speak('欢迎来到数感森林。慢慢来，一起发现数的秘密。'); else stopVoice();
  };
  document.getElementById('music-button').onclick = async () => {
    const b = document.getElementById('music-button');
    b.disabled = true;
    try {
      const enabled = await globalThis.NumberForestAudio.setEnabled(!globalThis.NumberForestAudio.isEnabled());
      updateMusic();
      if (!enabled) announce('背景音乐已关闭。');
    } catch (_) { announce('暂时无法播放音乐，仍然可以正常探索。'); }
    finally { b.disabled = false; }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseTime(); persistSession(); stopVoice(); main.querySelector('.badge-reveal')?.classList.add('is-settled'); } else resumeTime(); });
  window.addEventListener('pagehide', () => { pauseTime(); persistSession(); });
  window.addEventListener('pageshow', resumeTime);
  setInterval(persistSession, 15000);
  document.addEventListener('keydown', e => {
    if (state.screen !== 'game' || e.altKey || e.ctrlKey || e.metaKey || ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Enter') { e.preventDefault(); if (state.solved) document.getElementById('next-button')?.click(); else checkAnswer(); }
  });
  renderHome();
})();
