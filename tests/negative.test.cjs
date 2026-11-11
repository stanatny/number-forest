'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../src/core.js');
require('../src/views.js');
require('../src/chapters/negative.js');

const schedule = ['negative-temperature', 'negative-temperature', 'negative-order', 'negative-order',
  'negative-compare', 'negative-compare', 'negative-steps', 'negative-steps', 'negative-steps', 'negative-steps'];
const display = n => n < 0 ? '−' + Math.abs(n) : String(n);
function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function escape(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function render(task, flags = {}) {
  return globalThis.NumberForestViews.get(task.kind).render({ task, escape, hinted: false, solved: false, ...flags });
}

test('negative chapter loads as an ordinary script with or without optional views', () => {
  for (const withViews of [false, true]) {
    const sandbox = {};
    for (const path of ['../src/core.js', ...(withViews ? ['../src/views.js'] : []), '../src/chapters/negative.js']) {
      vm.runInNewContext(fs.readFileSync(require.resolve(path), 'utf8'), sandbox);
    }
    assert.equal(sandbox.NumberForestCore.getChapter('negative').title, '雪山数轴');
    assert.equal(sandbox.NumberForestCore.createTask('negative', { round: 0, random: () => 0 }).answer, 5);
    if (withViews) for (const kind of new Set(schedule)) assert.equal(typeof sandbox.NumberForestViews.get(kind).render, 'function');
  }
  assert.equal(core.getChapter('negative').generator, undefined);
});

test('ten tasks retain their progression, signed arithmetic, and integer choice contract at every random boundary', () => {
  const randoms = [() => 0, () => 1 - Number.EPSILON, rng(71), rng(0xffffffff)];
  const targets = new Set();
  for (const random of randoms) for (let round = 0; round < 300; round++) {
    const task = core.createTask('negative', { round, random });
    const m = task.model;
    const slot = round % 10;
    assert.equal(task.kind, schedule[slot]);
    assert.equal(task.chapterId, 'negative');
    assert.equal(task.answer, m.target + m.offset);
    assert.equal(m.offset, 5);
    assert.equal(task.maxAnswer, 10);
    assert.ok(Number.isInteger(task.answer) && task.answer >= 0 && task.answer <= task.maxAnswer);
    assert.ok(m.target >= -5 && m.target <= 5);
    assert.ok(task.prompt && task.instruction && task.answerLabel && task.hint && task.success);
    assert.equal(typeof task.unit, 'string');
    assert.equal(task.success, task.practice.explanation);
    assert.equal(task.practice.tokens.filter(t => t.target).length, 1);
    assert.ok(task.practice.tokens.every(t => ['a', 'b', 'neutral', 'operator', 'result'].includes(t.role)));
    assert.ok(task.practice.title && task.practice.explanation.length > 20);
    assert.equal(task.choices.length, new Set(task.choices.map(c => c.value)).size);
    assert.ok(task.choices.length >= 2 && task.choices.length <= 3);
    assert.equal(task.choices.filter(c => c.value === task.answer).length, 1);
    for (const choice of task.choices) {
      assert.ok(Number.isInteger(choice.value) && choice.value >= 0 && choice.value <= task.maxAnswer);
      assert.equal(choice.label, display(choice.value - m.offset), 'never show the transport code as a number');
      assert.equal(core.checkAnswer(task, choice.value), choice.value === task.answer);
    }
    assert.ok(task.relations.length >= 2);
    targets.add(m.target);
    if (slot < 2) {
      assert.equal(m.target, m.below === 0 ? 0 : -m.below);
      assert.ok(slot === 0 ? m.below === 0 : m.below >= 1 && m.below <= 3);
      assert.equal(task.unit, '℃');
    } else if (slot < 4) {
      assert.equal(m.values.filter(v => v === null).length, 1);
      assert.equal(m.values[m.missingIndex], null);
      const filled = m.values.map(v => v === null ? m.target : v);
      for (let i = 1; i < filled.length; i++) assert.equal(filled[i] - filled[i - 1], 1);
      assert.ok(task.relations.includes(filled.map(display).join(' → ')));
      assert.ok(m.target < 0);
    } else if (slot < 6) {
      assert.notEqual(m.a, m.b);
      assert.equal(m.target, m.ask === 'more' ? Math.max(m.a, m.b) : Math.min(m.a, m.b));
      if (slot === 4) assert.ok(m.a < 0 && m.b < 0 && m.ask === 'more');
      else assert.ok(Math.min(m.a, m.b) < 0 && Math.max(m.a, m.b) >= 0 && m.ask === 'less');
      assert.ok(task.relations.includes(display(Math.min(m.a, m.b)) + ' < ' + display(Math.max(m.a, m.b))));
    } else {
      assert.equal(m.target, m.start + m.step);
      assert.equal(m.path.length, Math.abs(m.step));
      assert.equal(m.path.at(-1), m.target);
      m.path.forEach((value, index) => assert.equal(value, m.start + (index + 1) * Math.sign(m.step)));
      assert.ok(task.relations.includes(display(m.start) + (m.step > 0 ? ' + ' : ' − ') + Math.abs(m.step) + ' = ' + display(m.target)));
      if (slot === 6) assert.ok(m.start === 0 && m.target < 0);
      if (slot === 7) assert.ok(m.start < 0 && m.target === 0);
      if (slot === 8) assert.ok(m.start < 0 && m.target > 0 && m.path.includes(0));
      if (slot === 9) assert.ok(m.start > 0 && m.target < 0 && m.path.includes(0));
    }
  }
  assert.ok(targets.has(0) && targets.has(-3) && targets.has(2));
});

test('resuming the same round and seed recreates all numbers, shuffled choices, and explanations', () => {
  for (const seed of [0, 1, 8191, 0xffffffff]) for (let round = 0; round < 20; round++) {
    assert.deepEqual(core.createTask('negative', { round, random: rng(seed) }), core.createTask('negative', { round, random: rng(seed) }));
  }
});

test('scenes disclose the target only through help or validated completion, without changing the task', () => {
  for (let round = 0; round < 10; round++) {
    const task = core.createTask('negative', { round, random: rng(452) });
    const before = JSON.stringify(task);
    const initial = render(task);
    const hinted = render(task, { hinted: true });
    const solved = render(task, { solved: true });
    assert.match(initial, /class="scene negative-scene/);
    assert.doesNotMatch(initial, /is-solved|is-destination|negative-journey|class="negative-walk"/);
    assert.doesNotMatch(hinted, /is-solved/);
    assert.ok(!initial.includes(escape(task.practice.explanation)));
    assert.ok(hinted.includes(escape(task.practice.explanation)));
    assert.ok(solved.includes(escape(task.practice.explanation)));
    if (task.kind === 'negative-temperature') {
      assert.match(initial, /class="negative-temperature-reading">\?<small>℃/);
      assert.ok(hinted.includes('class="negative-temperature-reading">' + display(task.model.target)));
    } else if (task.kind === 'negative-order') {
      assert.match(initial, /negative-order-tile is-blank">\?/);
      assert.ok(hinted.includes('negative-order-tile is-blank">' + display(task.model.target)));
    } else if (task.kind === 'negative-steps') {
      assert.match(hinted, /negative-journey/);
      assert.match(hinted, /class="negative-walk"/);
      assert.match(solved, /is-destination is-solved/);
    }
    assert.equal(JSON.stringify(task), before);
  }
});

test('renderers escape variable explanations and never emit interactive answer encodings', () => {
  for (const round of [0, 2, 4, 8]) {
    const task = core.createTask('negative', { round, random: () => 0 });
    task.practice.explanation = '<img src=x onerror="bad()">';
    const html = render(task, { hinted: true });
    assert.ok(html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt;'));
    assert.doesNotMatch(html, /<img|data-answer=/);
  }
});
