'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const Core = require('../src/core.js');
const Feedback = require('../src/feedback.js');

function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('feedback is available as a classic browser script without a loader', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/feedback.js'), 'utf8'), sandbox);
  const task = Core.createTask('bonds');
  assert.equal(sandbox.NumberForestFeedback.describe(task, task.answer).correct, true);
});

test('generated quantity diagnoses keep direction, differences and correctness consistent', () => {
  const random = rng(31289);
  for (let round = 0; round < 300; round++) {
    for (const id of ['bonds', 'arithmetic', 'groups', 'sharing']) {
      const task = Core.createTask(id, { round, random });
      for (const selected of [0, task.answer, task.answer + 1, Math.max(0, task.answer - 1)]) {
        const feedback = Feedback.describe(task, selected);
        assert.equal(feedback.correct, selected === task.answer);
        assert.equal(feedback.direction, selected > task.answer ? 'more' : selected < task.answer ? 'less' : 'equal');
        assert.equal(feedback.difference, Math.abs(selected - task.answer));
        assert.equal(feedback.selected, selected);
        assert.equal(feedback.target, task.answer);
        assert.ok(feedback.title && feedback.message && feedback.spoken);
      }
    }
  }
});

test('bonds compares the amount to add and separately explains the resulting total', () => {
  const task = { kind: 'bonds', answer: 4, model: { total: 7, visible: 3 } };
  const low = Feedback.describe(task, 2);
  assert.equal(low.target, 4);
  assert.equal(low.direction, 'less');
  assert.equal(low.difference, 2);
  assert.equal(low.model.currentTotal, 5);
  assert.equal(low.model.requiredTotal, 7);
  assert.match(low.message, /会有 5 颗/);
  const high = Feedback.describe(task, 7);
  assert.equal(high.direction, 'more');
  assert.equal(high.difference, 3);
  assert.equal(high.model.currentTotal, 10);
  const zero = Feedback.describe({ kind: 'bonds', answer: 0, model: { total: 5, visible: 5 } }, 0);
  assert.equal(zero.correct, true);
  assert.match(zero.message, /再补 0 颗/);
});

test('groups relates the known baskets to exactly one extra basket', () => {
  const task = Core.createTask('groups');
  const feedback = Feedback.describe(task, 9);
  assert.equal(feedback.direction, 'less');
  assert.equal(feedback.difference, 3);
  assert.equal(feedback.model.previousTotal, 9);
  assert.equal(feedback.model.extraGroup, 3);
  assert.match(feedback.message, /再添一篮就多 3 颗/);
});

test('sharing distinguishes a wrong amount per person from the total amount distributed', () => {
  const task = Core.createTask('sharing');
  const low = Feedback.describe(task, 2);
  assert.equal(low.kind, 'sharing');
  assert.equal(low.difference, 1);
  assert.equal(low.model.selectedTotal, 8);
  assert.match(low.message, /还剩 4 颗/);
  const high = Feedback.describe(task, 4);
  assert.equal(high.difference, 1);
  assert.equal(high.model.selectedTotal, 16);
  assert.match(high.message, /需要 16 颗，可只有 12 颗/);
});

test('sharing requires complete equal bowls only after the child has manipulated them', () => {
  const task = Core.createTask('sharing');
  assert.equal(Feedback.describe(task, 3).correct, true);
  assert.equal(Feedback.describe(task, 3, { changed: false, bowls: [0, 0, 0, 0] }).correct, true);
  const remaining = Feedback.describe(task, 3, { changed: true, bowls: [2, 2, 2, 2] });
  assert.equal(remaining.correct, false);
  assert.equal(remaining.direction, 'equal');
  assert.equal(remaining.difference, 0);
  assert.equal(remaining.model.reason, 'remaining');
  assert.equal(remaining.model.remaining, 4);
  const uneven = Feedback.describe(task, 3, { changed: true, bowls: [4, 2, 3, 3] });
  assert.equal(uneven.correct, false);
  assert.equal(uneven.model.reason, 'unequal');
  assert.equal(uneven.model.remaining, 0);
  assert.equal(uneven.model.unequal, true);
  assert.deepEqual(uneven.model.adjustments.map(row => row.direction), ['more', 'less', 'equal', 'equal']);
  const full = Feedback.describe(task, 3, { changed: true, bowls: [3, 3, 3, 3] });
  assert.equal(full.correct, true);
  assert.equal(full.model.reason, 'correct');
  assert.equal(full.model.remaining, 0);
  const overflow = Feedback.describe(task, 3, { changed: true, bowls: [4, 3, 3, 3] });
  assert.equal(overflow.correct, false);
  assert.equal(overflow.model.reason, 'overflow');
  assert.equal(overflow.model.overflow, 1);
  for (const bowls of [undefined, [3], [3, -1, 3, 3], [3, 2.5, 3, 3]]) {
    const invalid = Feedback.describe(task, 3, { changed: true, bowls });
    assert.equal(invalid.correct, false);
    assert.equal(invalid.model.reason, 'invalid');
  }
});

test('clock diagnoses hands rather than treating encoded times as quantities', () => {
  for (const hour of [1, 3, 11, 12]) {
    for (const minute of [0, 30]) {
      const task = { kind: 'clock', answer: hour * 60 + minute, model: { hour, minute } };
      const wrongHour = hour % 12 + 1;
      const wrongMinute = minute === 0 ? 30 : 0;
      for (const [selectedHour, selectedMinute] of [[hour, minute], [wrongHour, minute], [hour, wrongMinute], [wrongHour, wrongMinute]]) {
        const feedback = Feedback.describe(task, selectedHour * 60 + selectedMinute);
        const correct = selectedHour === hour && selectedMinute === minute;
        assert.equal(feedback.kind, 'clock');
        assert.equal(feedback.correct, correct);
        assert.equal(feedback.direction, correct ? 'equal' : null);
        assert.equal(feedback.difference, correct ? 0 : null);
        assert.equal(feedback.model.hourMismatch, selectedHour !== hour);
        assert.equal(feedback.model.minuteMismatch, selectedMinute !== minute);
        assert.equal(feedback.model.hourAngle, hour % 12 * 30 + minute / 2);
        assert.doesNotMatch(feedback.message, /颗/);
      }
    }
  }
  const halfPast12 = { kind: 'clock', answer: 750, model: { hour: 12, minute: 30 } };
  assert.match(Feedback.describe(halfPast12, 90).message, /短针走过 12，还没到 1/);
  assert.equal(Feedback.describe(halfPast12, 0).kind, 'input');
});

test('describing feedback does not change task or manipulation state and rejects nonnumeric answers', () => {
  const task = Core.createTask('sharing');
  const options = { changed: true, bowls: [4, 2, 3, 3] };
  const before = JSON.stringify({ task, options });
  const feedback = Feedback.describe(task, 3, options);
  feedback.model.bowls[0] = 0;
  assert.equal(JSON.stringify({ task, options }), before);
  for (const selected of [null, undefined, '', '3', NaN, Infinity, -1, 1.5, true]) {
    const invalid = Feedback.describe(task, selected);
    assert.equal(invalid.kind, 'input');
    assert.equal(invalid.correct, false);
    assert.equal(invalid.difference, null);
  }
  assert.throws(() => Feedback.describe(null, 0), TypeError);
});

test('compare explains which pile the question asks for without presenting a missing-amount task', () => {
  for (const [a, b] of [[0, 4], [12, 7], [3, 20]]) {
    for (const ask of ['more', 'less']) {
      const answer = ask === 'more' ? Math.max(a, b) : Math.min(a, b);
      const task = { kind: 'compare', unit: '颗', answer, model: { a, b, ask } };
      const other = answer === a ? b : a;
      const wrong = Feedback.describe(task, other);
      assert.equal(wrong.kind, 'compare');
      assert.equal(wrong.correct, false);
      assert.equal(wrong.unit, '颗');
      assert.equal(wrong.model.unpairedCount, Math.abs(a - b));
      assert.equal(wrong.model.targetSide, answer === a ? 'left' : 'right');
      assert.match(wrong.title, ask === 'more' ? /找更多/ : /找更少/);
      assert.doesNotMatch(wrong.message, /还差|还少|补/);
      assert.equal(Feedback.describe(task, answer).correct, true);
    }
  }
});

test('sequence explains positive and negative steps at each possible gap without counting acorns', () => {
  for (const step of [1, 2, -1]) {
    const complete = Array.from({ length: 4 }, (_, i) => (step < 0 ? 10 : 2) + step * i);
    for (let missingIndex = 0; missingIndex < 4; missingIndex++) {
      const values = complete.map((value, i) => i === missingIndex ? null : value);
      const task = { kind: 'sequence', unit: '', answer: complete[missingIndex], model: { values, step, missingIndex } };
      const wrong = Feedback.describe(task, task.answer + 1);
      assert.equal(wrong.kind, 'sequence');
      assert.equal(wrong.unit, '');
      assert.equal(wrong.differenceUnit, '');
      assert.deepEqual(wrong.model.completedValues, complete);
      assert.equal(wrong.model.values[missingIndex], null);
      assert.match(wrong.message, step > 0 ? /每次往后都加/ : /每次往后都减/);
      assert.doesNotMatch(wrong.title + wrong.message, /颗|松果|篮|袋/);
      assert.equal(Feedback.describe(task, task.answer).correct, true);
      wrong.model.values[0] = 999;
      assert.notEqual(task.model.values[0], 999);
    }
  }
});

test('numberline distinguishes the landing number from the number and direction of corrective steps', () => {
  for (const [start, step] of [[3, 4], [8, -3], [5, -5], [17, 3]]) {
    const task = { kind: 'numberline', unit: '', answer: start + step, model: { start, step } };
    for (const selected of [Math.max(0, task.answer - 2), task.answer, task.answer + 2]) {
      const feedback = Feedback.describe(task, selected);
      assert.equal(feedback.kind, 'numberline');
      assert.equal(feedback.unit, '');
      assert.equal(feedback.differenceUnit, '步');
      assert.equal(feedback.model.landing, start + step);
      assert.equal(feedback.model.correctionSteps, Math.abs(selected - task.answer));
      assert.equal(feedback.model.correctionDirection, selected === task.answer ? null : selected > task.answer ? 'left' : 'right');
      assert.doesNotMatch(feedback.message, /颗|松果/);
      assert.match(feedback.message, /落在数字/);
    }
  }
});

test('group-total counts items while group-count and pack count baskets or bags', () => {
  const m = { perGroup: 3, groups: 4, total: 12 };
  const total = Feedback.describe({ kind: 'group-total', unit: '颗', answer: 12, model: m }, 10);
  assert.equal(total.unit, '颗');
  assert.equal(total.difference, 2);
  assert.match(total.message, /每篮 3 颗，4 篮合起来有 12 颗/);
  for (const [kind, unit] of [['group-count', '篮'], ['pack', '袋']]) {
    const task = { kind, unit, answer: 4, model: m };
    const low = Feedback.describe(task, 3);
    assert.equal(low.kind, 'quantity');
    assert.equal(low.unit, unit);
    assert.equal(low.differenceUnit, unit);
    assert.equal(low.difference, 1);
    assert.equal(low.model.selectedTotal, 9);
    assert.equal(low.model.remaining, 3);
    assert.equal(low.title, `还少 1 ${unit}`);
    const high = Feedback.describe(task, 5);
    assert.equal(high.title, `多了 1 ${unit}`);
    assert.equal(high.model.extraCapacity, 3);
    assert.equal(Feedback.describe(task, 4).correct, true);
  }
});

test('clock-forward diagnoses the destination after thirty or sixty minutes, including crossing twelve', () => {
  for (const hour of [1, 11, 12]) {
    for (const minute of [0, 30]) {
      for (const advance of [30, 60]) {
        const absolute = hour % 12 * 60 + minute + advance;
        const targetHour = Math.floor(absolute / 60) % 12 || 12;
        const targetMinute = absolute % 60;
        const task = { kind: 'clock-forward', unit: '', answer: targetHour * 60 + targetMinute, model: { hour, minute, advance, targetHour, targetMinute } };
        const correct = Feedback.describe(task, task.answer);
        assert.equal(correct.correct, true);
        assert.equal(correct.kind, 'clock');
        assert.equal(correct.model.startHour, hour);
        assert.equal(correct.model.startMinute, minute);
        assert.equal(correct.model.targetHour, targetHour);
        assert.equal(correct.model.targetMinute, targetMinute);
        assert.equal(correct.model.advance, advance);
        assert.match(correct.message, advance === 30 ? /过半小时/ : /过一小时/);
        const wrong = Feedback.describe(task, hour * 60 + minute);
        assert.equal(wrong.correct, false);
        assert.equal(wrong.direction, null);
        assert.equal(wrong.difference, null);
        assert.doesNotMatch(wrong.message, /颗|还差 \d+|多了 \d+/);
      }
    }
  }
});
