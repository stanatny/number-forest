'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../src/core.js');
const chapter = require('../src/chapters/negative-operations.js');
const formulas = require('../src/formulas.js');
const feedback = require('../src/feedback.js');

const number = value => value < 0 ? '−' + Math.abs(value) : String(value);
const term = value => value < 0 ? '(' + number(value) + ')' : number(value);
function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function make(round, random = rng(121)) { return core.createTask('negative-operations', { round, random }); }
function signedValue(cards) { return cards.positive - cards.negative; }

test('the independent chapter registers in Node and ordinary scripts without a view dependency', () => {
  assert.equal(chapter.id, 'negative-operations');
  assert.equal(chapter.title, '雪地加减站');
  assert.equal(chapter.generator, undefined);
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/core.js'), 'utf8'), sandbox);
  const oldIds = sandbox.NumberForestCore.chapters.map(c => c.id);
  const originals = oldIds.map(id => JSON.stringify(sandbox.NumberForestCore.createTask(id, { random: () => .3 })));
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/chapters/negative-operations.js'), 'utf8'), sandbox);
  assert.equal(sandbox.NumberForestCore.chapters.length, oldIds.length + 1);
  assert.equal(sandbox.NumberForestCore.getChapter('negative-operations').title, '雪地加减站');
  oldIds.forEach((id, index) => assert.equal(JSON.stringify(sandbox.NumberForestCore.createTask(id, { random: () => .3 })), originals[index]));
  assert.equal(sandbox.NumberForestViews, undefined);
});

test('fixed opening questions contrast adding and subtracting the same negative number', () => {
  for (const random of [() => 0, () => 1 - Number.EPSILON, rng(31)]) {
    const add = make(0, random), subtract = make(1, random);
    assert.equal(add.model.equation, '3 + (−2) = 1');
    assert.equal(subtract.model.equation, '3 − (−2) = 5');
    assert.deepEqual(add.model.path, [2, 1]);
    assert.deepEqual(subtract.model.path, [4, 5]);
    assert.equal(add.model.pair.equation, subtract.model.equation);
    assert.equal(subtract.model.pair.equation, add.model.equation);
    assert.equal(subtract.model.cards.addZeroPairs, 2);
    assert.deepEqual(subtract.model.cards.prepared, { positive: 5, negative: 2 });
    assert.deepEqual(subtract.model.cards.remaining, { positive: 5, negative: 0 });
  }
});

test('ten-stage progression has five of each operation, zero/negative starts and crossing-zero paths', () => {
  for (const random of [() => 0, () => 1 - Number.EPSILON, rng(84)]) {
    const tasks = Array.from({ length: 10 }, (_, round) => make(round, random));
    assert.equal(tasks.filter(task => task.model.operator === '+').length, 5);
    assert.equal(tasks.filter(task => task.model.operator === '−').length, 5);
    for (let stage = 0; stage < 4; stage++) assert(tasks[stage].model.start > 0);
    for (const stage of [4, 5]) assert.equal(tasks[stage].model.start, 0);
    for (const stage of [6, 7, 9]) assert(tasks[stage].model.start < 0);
    assert.equal(tasks[7].model.result, 0);
    assert(tasks[8].model.start > 0 && tasks[8].model.result < 0);
    assert(tasks[9].model.start < 0 && tasks[9].model.result > 0);
    for (const stage of [8, 9]) assert(tasks[stage].model.path.includes(0));
    assert.equal(tasks[2].model.mode, 'temperature');
    assert.equal(tasks[4].model.mode, 'temperature');
  }
});

test('generated arithmetic, choices, and card conservation remain correct at random boundaries and 6,000 tasks', () => {
  const randoms = [() => 0, () => 1 - Number.EPSILON, rng(0), rng(1), rng(8191), rng(0xffffffff)];
  const seen = new Set();
  for (const random of randoms) for (let round = 0; round < 1000; round++) {
    const task = make(round, random), m = task.model, c = m.cards;
    assert.equal(task.kind, 'negative-operation');
    assert.equal(m.lessonIndex, round % 10);
    assert.equal(m.offset, 10);
    assert(Number.isInteger(m.operand) && m.operand < 0);
    assert.equal(m.displacement, m.operator === '+' ? m.operand : -m.operand);
    assert.equal(m.result, m.start + m.displacement);
    assert(m.result >= -5 && m.result <= 8);
    assert.equal(task.answer, m.result + 10);
    assert.equal(task.maxAnswer, 20);
    assert.equal(m.path.length, Math.abs(m.operand));
    m.path.forEach((value, index) => assert.equal(value, m.start + Math.sign(m.displacement) * (index + 1)));
    assert.equal(m.path.at(-1), m.result);
    assert.equal(m.pair.operator, m.operator === '+' ? '−' : '+');
    assert.equal(m.pair.operand, m.operand);
    assert.equal(m.pair.displacement, -m.displacement);
    assert.equal(m.pair.result, m.start - m.displacement);
    assert(m.pair.result >= -10 && m.pair.result <= 10);
    assert.equal(m.pair.path.at(-1), m.pair.result);
    assert.equal(m.equation, term(m.start) + ' ' + m.operator + ' ' + term(m.operand) + ' = ' + number(m.result));
    assert.equal(signedValue(c.initial), m.start);
    assert.equal(signedValue(c.prepared), m.start, 'adding zero pairs must not change the starting value');
    assert.equal(c.prepared.positive, c.initial.positive + c.addZeroPairs);
    assert.equal(c.prepared.negative, c.initial.negative + c.addZeroPairs);
    assert.equal(c.quantity, -m.operand);
    assert.equal(c.action, m.operator === '+' ? 'add-negative' : 'remove-negative');
    assert.equal(c.addZeroPairs, m.operator === '+' ? 0 : Math.max(0, c.quantity - c.initial.negative));
    assert.equal(c.afterAction.positive, c.prepared.positive);
    assert.equal(c.afterAction.negative, c.prepared.negative + (m.operator === '+' ? c.quantity : -c.quantity));
    assert.equal(signedValue(c.afterAction), m.result);
    assert.equal(c.cancelPairs, Math.min(c.afterAction.positive, c.afterAction.negative));
    assert.equal(c.remaining.positive, c.afterAction.positive - c.cancelPairs);
    assert.equal(c.remaining.negative, c.afterAction.negative - c.cancelPairs);
    assert.equal(signedValue(c.remaining), m.result);
    assert.equal(Math.min(c.remaining.positive, c.remaining.negative), 0);
    for (const cards of [c.initial, c.prepared, c.afterAction, c.remaining]) {
      assert(Object.values(cards).every(n => Number.isInteger(n) && n >= 0));
    }
    assert.equal(task.choices.length, 4);
    assert.equal(new Set(task.choices.map(choice => choice.value)).size, 4);
    assert.equal(task.choices.filter(choice => choice.value === task.answer).length, 1);
    assert(task.choices.some(choice => choice.value === m.pair.result + 10), 'opposite-direction distractor is present');
    for (const choice of task.choices) {
      assert(Number.isInteger(choice.value) && choice.value >= 0 && choice.value <= 20);
      assert.equal(choice.label, number(choice.value - 10));
      assert.equal(core.answerText(task, choice.value), choice.label);
      assert.equal(core.checkAnswer(task, choice.value), choice.value === task.answer);
    }
    assert.equal(task.practice.tokens.filter(token => token.target).length, 1);
    assert.equal(task.practice.tokens[2].text, term(m.operand));
    assert.equal(task.practice.tokens.at(-1).target, true);
    assert.equal(task.practice.explanation, task.success);
    assert(task.practice.explanation.includes(m.equation));
    assert(task.relations.includes(m.equation));
    assert(task.prompt && task.instruction && task.answerLabel && task.hint);
    seen.add(m.result);
  }
  for (const value of [-5, 0, 1, 5, 8]) assert(seen.has(value));
});

test('round and seed reproduce quantities, choice order, explanation, and demo states', () => {
  for (const seed of [0, 1, 631, 0xffffffff]) for (let round = 0; round < 50; round++) {
    assert.deepEqual(make(round, rng(seed)), make(round, rng(seed)));
  }
});

test('common formula and feedback modules display signed labels, not offset transport values', () => {
  for (let round = 0; round < 10; round++) {
    const task = make(round), before = JSON.stringify(task);
    const unselected = formulas.describe(task, { solved: false, selected: null });
    assert.equal(unselected.rows[0].tokens.at(-1).text, '?');
    assert.equal(unselected.rows[0].tokens.at(-1).unknown, true);
    for (const choice of task.choices) {
      const draft = formulas.describe(task, { solved: false, selected: choice.value }).rows[0].tokens.at(-1);
      assert.equal(draft.text, choice.label);
      assert.equal(draft.unknown, true);
      assert.equal(draft.preview, true);
      const diagnosis = feedback.describe(task, choice.value);
      assert.equal(diagnosis.correct, choice.value === task.answer);
      if (!diagnosis.correct) assert(diagnosis.message.includes('你填了 ' + choice.label));
    }
    const solved = formulas.describe(task, { solved: true, selected: null }).rows[0].tokens.at(-1);
    assert.equal(solved.text, number(task.model.result));
    assert.equal(solved.unknown, false);
    assert.equal(solved.preview, false);
    for (const invalid of [null, undefined, '10', -1, 1.5, NaN, Infinity, 21]) {
      assert.equal(core.checkAnswer(task, invalid), false);
      assert.equal(formulas.describe(task, { selected: invalid }).rows[0].tokens.at(-1).text, '?');
    }
    assert.equal(JSON.stringify(task), before);
  }
});
