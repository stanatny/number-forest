'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../src/core.js');
require('../src/views.js');
require('../src/chapters/decimal.js');
const Views = globalThis.NumberForestViews;

const schedule = ['decimal-tenths', 'decimal-tenths', 'decimal-tenths', 'decimal-tenths', 'decimal-tenths', 'decimal-compare', 'decimal-add', 'decimal-compare', 'decimal-whole', 'decimal-add'];
const format = n => { const digits = String(n).padStart(2, '0'); return digits.slice(0, -1) + '.' + digits.slice(-1); };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function rng(seed) { let state = seed >>> 0; return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function render(task, options = {}) { return Views.get(task.kind).render({ task, escape, solved: false, hinted: false, local: {}, ...options }); }

test('decimal registers independently in Node and in ordinary browser scripts with or without views', () => {
  const metadata = Core.getChapter('decimal');
  assert.equal(metadata.title, '小数花圃');
  assert.ok(Core.getChapter('bonds'));
  assert.equal(metadata.generator, undefined);
  for (const kind of new Set(schedule)) assert.equal(typeof Views.get(kind).render, 'function');
  const coreSource = fs.readFileSync(require.resolve('../src/core.js'), 'utf8');
  const chapterSource = fs.readFileSync(require.resolve('../src/chapters/decimal.js'), 'utf8');
  for (const withViews of [false, true]) {
    const context = {};
    vm.runInNewContext(coreSource, context);
    if (withViews) vm.runInNewContext(fs.readFileSync(require.resolve('../src/views.js'), 'utf8'), context);
    vm.runInNewContext(chapterSource, context);
    assert.equal(context.NumberForestCore.createTask('decimal').answer, 1);
    if (withViews) assert.equal(typeof context.NumberForestViews.get('decimal-add').render, 'function');
  }
  assert.throws(() => vm.runInNewContext(chapterSource, {}), /Load NumberForestCore/);
});

test('ten-task progression introduces tenths, zero, a whole, comparisons and crossing one', () => {
  const tasks = Array.from({ length: 10 }, (_, round) => Core.createTask('decimal', { round, random: rng(22) }));
  assert.deepEqual(tasks.map(t => t.kind), schedule);
  assert.equal(tasks[0].answer, 1);
  assert.ok(tasks[1].answer >= 2 && tasks[1].answer <= 5);
  assert.ok(tasks[2].answer >= 6 && tasks[2].answer <= 9);
  assert.equal(tasks[3].answer, 0);
  assert.equal(tasks[4].answer, 10);
  assert.equal(tasks[5].model.ask, 'more');
  assert.equal(tasks[7].model.ask, 'less');
  assert.ok(tasks[6].answer <= 10);
  assert.ok(tasks[8].answer >= 11 && tasks[8].answer <= 15);
  assert.ok(tasks[9].answer >= 11 && tasks[9].answer <= 15);
});

test('generated decimal tasks use integer tenths and complete unique human-readable choices', () => {
  const seen = new Set();
  for (const random of [() => 0, () => 1 - Number.EPSILON, rng(57198)]) {
    for (let round = 0; round < 2000; round++) {
      const t = Core.createTask('decimal', { round, random });
      const m = t.model;
      seen.add(t.kind);
      assert.equal(t.kind, schedule[round % 10]);
      assert.equal(t.chapterId, 'decimal');
      assert.equal(m.parts, 10);
      assert.ok(Number.isSafeInteger(t.answer) && t.answer >= 0 && t.answer <= t.maxAnswer);
      assert.ok([10, 20].includes(t.maxAnswer));
      assert.equal(t.unit, '');
      assert.equal(Core.checkAnswer(t, t.answer), true);
      assert.equal(Core.checkAnswer(t, t.answer + 1), false);
      assert.equal(Core.checkAnswer(t, format(t.answer)), false);
      assert.equal(t.choices.length, t.kind === 'decimal-compare' ? 2 : 4);
      assert.equal(new Set(t.choices.map(c => c.value)).size, t.choices.length);
      assert.equal(t.choices.filter(c => c.value === t.answer).length, 1);
      for (const choice of t.choices) {
        assert.ok(Number.isSafeInteger(choice.value) && choice.value >= 0 && choice.value <= t.maxAnswer);
        assert.match(choice.label, /^[012]\.\d$/);
        assert.equal(Number(choice.label.replace('.', '')), choice.value);
      }
      for (const key of ['prompt', 'instruction', 'answerLabel', 'hint', 'success']) assert.ok(t[key], key);
      assert.equal(t.practice.explanation, t.success);
      assert.ok(t.practice.title && t.practice.explanation.length > 25);
      assert.ok(t.relations.length >= 2);
      assert.equal(t.practice.tokens.filter(token => token.target).length, 1);
      for (const token of t.practice.tokens) {
        assert.ok(['a', 'b', 'neutral', 'operator', 'result'].includes(token.role));
        if (token.target) assert.equal(token.text, undefined, 'the app fills targets after selection/validation');
        else assert.equal(typeof token.text, 'string');
      }
      if (t.kind === 'decimal-tenths') {
        assert.equal(t.answer, m.tenths);
      } else if (t.kind === 'decimal-compare') {
        assert.ok(Number.isInteger(m.aTenths) && Number.isInteger(m.bTenths));
        assert.notEqual(m.aTenths, m.bTenths);
        assert.equal(t.answer, m.ask === 'more' ? Math.max(m.aTenths, m.bTenths) : Math.min(m.aTenths, m.bTenths));
        assert.deepEqual(t.choices.map(c => c.value), [m.aTenths, m.bTenths]);
        assert.equal(t.relations[0], format(m.aTenths) + (m.aTenths > m.bTenths ? ' > ' : ' < ') + format(m.bTenths));
      } else if (t.kind === 'decimal-add') {
        assert.equal(t.answer, m.aTenths + m.bTenths);
        assert.ok(m.aTenths >= 1 && m.aTenths <= 9 && m.bTenths >= 1 && m.bTenths <= 9);
        assert.equal(t.relations[0], `${format(m.aTenths)} + ${format(m.bTenths)} = ${format(t.answer)}`);
        assert.equal(t.practice.tokens[0].text, format(m.aTenths));
        assert.equal(t.practice.tokens[2].text, format(m.bTenths));
      } else {
        assert.equal(m.whole, 1);
        assert.ok(Number.isInteger(m.extraTenths) && m.extraTenths >= 1 && m.extraTenths <= 5);
        assert.equal(t.answer, 10 + m.extraTenths);
      }
    }
  }
  assert.deepEqual([...seen].sort(), [...new Set(schedule)].sort());
});

test('the same round and seeded randomness recreate the same task and choices', () => {
  for (let seed = 0; seed < 100; seed++) {
    for (let round = 0; round < 10; round++) {
      assert.deepEqual(Core.createTask('decimal', { round, random: rng(seed) }), Core.createTask('decimal', { round, random: rng(seed) }));
      assert.deepEqual(Core.createTask('decimal', { round, random: rng(seed) }), Core.createTask('decimal', { round: round + 10, random: rng(seed) }));
    }
  }
});

test('zero, one whole and crossing one have exact decimal labels and explanatory regrouping', () => {
  const zero = Core.createTask('decimal', { round: 3 });
  const whole = Core.createTask('decimal', { round: 4 });
  const cross = Core.createTask('decimal', { round: 9, random: () => 0 });
  assert.equal(zero.choices.find(c => c.value === 0).label, '0.0');
  assert.equal(whole.choices.find(c => c.value === 10).label, '1.0');
  assert.match(zero.success, /一个小格也没涂/);
  assert.match(whole.success, /10 个小格刚好是一整条/);
  assert.equal(cross.answer, 11);
  assert.equal(cross.choices.find(c => c.value === 11).label, '1.1');
  assert.match(cross.success, /10 格拼成一整条/);
  assert.match(cross.success, /剩下的 1 格/);
});

test('scenes show ten equal cells per whole and never mark a result or comparison before solving', () => {
  for (let round = 0; round < 10; round++) {
    const t = freeze(Core.createTask('decimal', { round, random: rng(114 + round) }));
    const before = JSON.stringify(t);
    const plain = render(t);
    const hinted = render(t, { hinted: true });
    const solved = render(t, { solved: true });
    const expectedRows = t.kind === 'decimal-tenths' ? 1 : 2;
    assert.equal((plain.match(/class="decimal-cell[ "]/g) || []).length, expectedRows * 10);
    assert.equal((plain.match(/class="decimal-strip"/g) || []).length, expectedRows);
    const expectedFilled = t.kind === 'decimal-tenths' ? t.model.tenths : t.kind === 'decimal-whole' ? t.answer : t.model.aTenths + t.model.bTenths;
    assert.equal((plain.match(/class="decimal-cell is-filled /g) || []).length, expectedFilled);
    assert.doesNotMatch(plain, /class="decimal-answer"/);
    assert.doesNotMatch(hinted, /class="decimal-answer"/);
    assert.match(solved, /class="decimal-answer"/);
    assert.match(hinted, /class="decimal-scene-hint"/);
    if (t.kind === 'decimal-compare') {
      assert.doesNotMatch(plain, / &gt; | &lt; /);
      assert.match(solved, / &gt; | &lt; /);
    }
    if (t.kind === 'decimal-add') {
      assert.equal((solved.match(/class="decimal-cell is-filled /g) || []).length, t.answer);
      assert.equal((solved.match(/class="decimal-strip"/g) || []).length, t.answer > 10 ? 2 : 1);
      assert.equal((solved.match(/decimal-fill-a/g) || []).length, t.model.aTenths);
      assert.equal((solved.match(/decimal-fill-b/g) || []).length, t.model.bTenths);
    }
    assert.equal(JSON.stringify(t), before);
  }
});

test('rendered dynamic copy uses the context escaper and does not depend on optional interaction state', () => {
  const t = Core.createTask('decimal', { round: 1, random: () => 0 });
  t.hint = '<img src=x onerror="bad()"> & read this';
  const html = render(t, { hinted: true, local: undefined });
  assert.ok(html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; read this'));
  assert.ok(!html.includes('<img src=x'));
  assert.doesNotMatch(html, /<script|<button|https?:\/\//);
});
