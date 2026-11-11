'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../src/core.js');
require('../src/views.js');
require('../src/chapters/parity.js');

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function task(round, seed = 1) { return Core.createTask('parity', { round, random: seeded(seed) }); }
function escape(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function render(t, options = {}) {
  return globalThis.NumberForestViews.get(t.kind).render({ task: t, hinted: false, solved: false, escape, ...options });
}

test('parity registers through the ordinary script interfaces with or without views', () => {
  assert.equal(Core.getChapter('parity').title, '奇偶密码屋');
  const source = fs.readFileSync(require.resolve('../src/chapters/parity.js'), 'utf8');
  for (const withViews of [false, true]) {
    const chapters = [], views = [];
    const context = { NumberForestCore: { registerChapter(definition) { chapters.push(definition); } } };
    if (withViews) context.NumberForestViews = { register(kind, view) { views.push([kind, view]); } };
    vm.runInNewContext(source, context);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].id, 'parity');
    assert.equal(typeof chapters[0].generator, 'function');
    assert.equal(views.length, withViews ? 3 : 0);
    for (const [kind, view] of views) {
      assert.match(kind, /^parity-/);
      assert.equal(typeof view.render, 'function');
    }
  }
});

test('ten tasks progress from two pair tasks through three parity trails to five codes', () => {
  const expected = ['parity-pairs', 'parity-pairs', 'parity-trail', 'parity-trail', 'parity-trail',
    'parity-code', 'parity-code', 'parity-code', 'parity-code', 'parity-code'];
  for (let round = 0; round < 30; round++) assert.equal(task(round).kind, expected[round % 10]);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => task(index + 5).codeLength), [5, 4, 5, 4, 5]);
});

test('all generated tasks are deterministic, bounded and have unambiguous labeled choices', () => {
  for (let seed = 0; seed < 160; seed++) {
    for (let round = 0; round < 10; round++) {
      const t = task(round, seed);
      assert.deepEqual(t, task(round, seed));
      assert.equal(t.chapterId, 'parity');
      assert(Number.isSafeInteger(t.answer) && t.answer >= 0 && t.answer <= t.maxAnswer);
      if (t.codeLength) {
        assert.equal(Core.answerText(t, t.answer), t.model.correctCode);
      } else {
        assert.equal(new Set(t.choices.map(choice => choice.value)).size, t.choices.length);
        assert.equal(new Set(t.choices.map(choice => choice.label)).size, t.choices.length);
        assert.equal(t.choices.filter(choice => Core.checkAnswer(t, choice.value)).length, 1);
      }
      assert.equal(Core.checkAnswer(t, String(t.answer)), false);
      assert.equal(Core.checkAnswer(t, null), false);
      assert.equal(t.unit, '');
      assert(t.prompt && t.instruction && t.success && t.hint && t.relations.length);
      assert.equal(t.practice.tokens.filter(token => token.target).length, 1);
      assert(t.practice.explanation && t.practice.title);
      for (const token of t.practice.tokens) {
        assert(token.target || typeof token.text === 'string');
        assert(['a', 'b', 'result', 'neutral', 'operator'].includes(token.role));
      }
    }
  }
});

test('pairing covers odd and even counts and explicitly includes zero as even', () => {
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const t = task(0, seed * 9949);
    seen.add(t.answer);
    assert.equal(t.model.pairs * 2 + t.model.remainder, t.model.count);
    assert.equal(t.answer, t.model.count % 2);
  }
  assert.deepEqual([...seen].sort(), [0, 1]);
  const zero = task(1);
  assert.equal(zero.model.count, 0);
  assert.equal(zero.answer, 0);
  assert.equal(zero.choices.find(choice => choice.value === 0).label, '偶数');
  assert.match(zero.success, /0 是偶数/);
});

test('multi-step trails obey both parity truth tables and have coherent nonnegative examples', () => {
  const truthTable = new Set(), outcomes = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    for (let round = 2; round <= 4; round++) {
      const t = task(round, seed * 577);
      const m = t.model;
      if (round === 2) {
        assert.deepEqual(m.parities, [1, 0, 1]);
        assert.match(t.prompt, /^奇数 \+ 偶数 − 奇数/);
        assert.equal(t.answer, 0);
      }
      assert.equal(m.steps.length, round === 4 ? 3 : 2);
      assert(m.operations.includes('+') && m.operations.includes('−'));
      let numeric = m.exampleValues[0];
      let parity = m.parities[0];
      m.steps.forEach((step, index) => {
        assert.equal(step.left, numeric);
        assert.equal(step.right, m.exampleValues[index + 1]);
        assert.equal(step.leftParity, step.left % 2);
        assert.equal(step.rightParity, m.parities[index + 1]);
        assert.equal(step.operator, m.operations[index]);
        numeric = step.operator === '+' ? numeric + step.right : numeric - step.right;
        parity ^= m.parities[index + 1]; // Addition and subtraction have the same mod-2 result.
        assert.equal(step.result, numeric);
        assert.equal(step.resultParity, parity);
        assert(Number.isInteger(numeric) && numeric >= 0 && numeric <= 20);
        truthTable.add(step.operator + ':' + step.leftParity + ':' + step.rightParity);
      });
      assert.equal(t.answer, numeric % 2);
      assert.equal(t.answer, parity);
      outcomes.add(t.answer);
    }
  }
  assert.equal(truthTable.size, 8, 'Both operators exercise all four input-parity pairs');
  assert.deepEqual([...outcomes].sort(), [0, 1]);
});

test('the 12345 password uses each original digit once and yields 31537, including 3 + 2 = 5', () => {
  for (let seed = 0; seed < 30; seed++) {
    const t = task(5, seed);
    assert.equal(t.model.originalCode, '12345');
    assert.equal(t.model.oddDelta, 2);
    assert.equal(t.model.evenDelta, -1);
    assert.equal(t.model.correctCode, '31537');
    assert.equal(t.answer, 31537);
    assert.equal(t.maxAnswer, 99999);
    assert.equal(Core.answerText(t, 31537), '31537');
    assert.match(t.practice.explanation, /第 2 位原来是 2，是偶数：2 − 1 = 1/);
    assert.match(t.practice.explanation, /第 3 位原来是 3，是奇数：3 \+ 2 = 5/);
    assert.match(t.instruction, /原来的数字/);
    assert.match(t.instruction, /算一次/);
  }
});

test('every password position stays a digit without carry, wrap or parity reclassification', () => {
  const originalDigits = new Set();
  for (let seed = 0; seed < 300; seed++) {
    for (let round = 5; round < 10; round++) {
      const t = task(round, seed * 541 + 13), m = t.model;
      assert.equal(m.originalCode.length, t.codeLength);
      assert.equal(m.correctCode.length, t.codeLength);
      assert.equal(t.maxAnswer, 10 ** t.codeLength - 1);
      assert.equal(String(t.answer).padStart(t.codeLength, '0'), m.correctCode);
      let expected = '';
      m.digits.forEach((original, index) => {
        originalDigits.add(original);
        const delta = original % 2 ? m.oddDelta : m.evenDelta;
        const output = original + delta;
        assert(output >= 0 && output <= 9, 'Rules must never need a carry or wrap');
        expected += output;
        assert.deepEqual({ original: m.steps[index].original, delta: m.steps[index].delta, result: m.steps[index].result, position: m.steps[index].position },
          { original, delta, result: output, position: index + 1 });
        assert(t.practice.explanation.includes(m.steps[index].explanation));
      });
      assert.equal(m.correctCode, expected);
      assert.equal(t.answer, Number(expected));
    }
  }
  assert.deepEqual([...originalDigits].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('original and decoded leading zeros stay visible, including the all-zero answer', () => {
  for (let seed = 0; seed < 50; seed++) {
    const leadingOutput = task(6, seed);
    assert.equal(leadingOutput.model.correctCode[0], '0');
    assert.equal(Core.answerText(leadingOutput, leadingOutput.answer), leadingOutput.model.correctCode);
    const leadingInput = task(7, seed);
    assert.equal(leadingInput.model.originalCode[0], '0');
    assert.equal(leadingInput.practice.tokens[0].text, leadingInput.model.originalCode);
    assert(leadingInput.prompt.includes(leadingInput.model.originalCode));
    assert.equal(leadingInput.model.steps[0].parity, 0);
    assert.equal(leadingInput.model.steps[0].result, 2);
  }
  const zeros = Core.createTask('parity', { round: 6, random: () => 0.125 });
  assert.equal(zeros.model.originalCode, '2222');
  assert.equal(zeros.model.correctCode, '0000');
  assert.equal(zeros.answer, 0);
  assert.equal(Core.answerText(zeros, 0), '0000');
  assert.equal(Core.answerText(zeros, 10000), undefined);
  assert.match(zeros.success, /0 也占一位/);
});

test('scene scaffolds reveal worked solutions only after hint or completion', () => {
  const pairs = task(0);
  const before = render(pairs);
  assert.equal((before.match(/class="parity-dot"/g) || []).length, pairs.model.count);
  assert.doesNotMatch(before, /class="parity-pair/);
  const paired = render(pairs, { hinted: true });
  assert.equal((paired.match(/class="parity-dot"/g) || []).length, pairs.model.count);
  assert.equal((paired.match(/class="parity-pair(?:"| )/g) || []).length, pairs.model.pairs + pairs.model.remainder);
  const trail = task(4);
  assert.doesNotMatch(render(trail), /parity-trail|例如/);
  assert.equal((render(trail, { hinted: true }).match(/<li>/g) || []).length, 3);
  const code = task(5);
  const question = render(code);
  assert.doesNotMatch(question, /parity-code-worked|31537|3 \+ 2 = 5/);
  assert.equal((question.match(/class="parity-digit"/g) || []).length, 5);
  assert.equal((render(code, { hinted: true }).match(/<li>/g) || []).length, 1);
  assert.equal((render(code, { solved: true }).match(/<li>/g) || []).length, 5);
});

test('views escape supplied dynamic labels rather than injecting markup', () => {
  const code = task(5);
  code.model.oddDelta = '<img src=x onerror=bad>';
  assert.doesNotMatch(render(code), /<img/);
  const trail = task(3);
  trail.model.steps[0].operator = '<b>bad</b>';
  const html = render(trail, { hinted: true });
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
});
