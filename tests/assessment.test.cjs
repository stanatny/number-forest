'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Assessment = require('../src/assessment.js');

function legacy(overrides = {}) {
  return { version: 2, round: 2, attempts: 0, solved: false, completed: 2, ...overrides };
}
function current(overrides = {}) {
  return { version: 3, round: 2, attempts: 0, solved: false,
    outcomes: ['incorrect', 'correct', null, null], ...overrides };
}

test('assessment is available as a dependency-free classic script and creates independent blank rounds', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/assessment.js'), 'utf8'), context);
  assert.equal(typeof context.NumberForestAssessment.submit, 'function');
  assert.deepEqual(Array.from(context.NumberForestAssessment.create()), Array(10).fill(null));
  const first = Assessment.create(2), second = Assessment.create(2);
  first[0] = 'incorrect';
  assert.deepEqual(second, [null, null]);
  assert.deepEqual(Assessment.create(1), [null]);
  for (const rounds of [0, -1, 2.5, null, '10', true, NaN, Infinity, 4294967296, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => Assessment.create(rounds), RangeError);
  }
});

test('the first wrong answer remains incorrect through correction and duplicate submissions', () => {
  const blank = Object.freeze(Assessment.create(3));
  const wrong = Assessment.submit(blank, 0, false);
  assert.deepEqual(wrong, { outcomes: ['incorrect', null, null], first: true, outcome: 'incorrect' });
  assert.deepEqual(blank, [null, null, null]);
  const correction = Assessment.submit(Object.freeze(wrong.outcomes), 0, true);
  assert.deepEqual(correction, { outcomes: ['incorrect', null, null], first: false, outcome: 'incorrect' });
  assert.notEqual(correction.outcomes, wrong.outcomes);
  assert.deepEqual(Assessment.submit(correction.outcomes, 0, false), correction);
  correction.outcomes[0] = 'correct';
  assert.equal(wrong.outcomes[0], 'incorrect');
});

test('first correct answers and unknown legacy grades also cannot be overwritten', () => {
  const first = Assessment.submit(Assessment.create(2), 0, true);
  assert.equal(first.first, true);
  assert.equal(first.outcome, 'correct');
  for (const correct of [false, true]) {
    const duplicate = Assessment.submit(first.outcomes, 0, correct);
    assert.equal(duplicate.first, false);
    assert.equal(duplicate.outcome, 'correct');
    const old = Assessment.submit(Object.freeze(['legacy', null]), 0, correct);
    assert.deepEqual(old, { outcomes: ['legacy', null], first: false, outcome: 'legacy' });
  }
});

test('submitting validates a boolean assessment independently of numeric answers, including zero', () => {
  const blank = Assessment.create();
  for (const correct of [0, 1, 'false', 'true', null, undefined, NaN, {}, []]) {
    assert.throws(() => Assessment.submit(blank, 0, correct), TypeError);
  }
  // A caller checking a valid mathematical answer of zero passes true, not 0.
  assert.equal(Assessment.submit(blank, 0, 0 === 0).outcome, 'correct');
  for (const round of [-1, 10, 1.5, '0', null, undefined, NaN, Infinity]) {
    assert.throws(() => Assessment.submit(blank, round, true), RangeError);
  }
  for (const outcomes of [null, {}, [], ['wrong'], [undefined], [false], [0], Array(2)]) {
    assert.throws(() => Assessment.submit(outcomes, 0, true), TypeError);
    assert.throws(() => Assessment.summarize(outcomes), TypeError);
  }
  assert.deepEqual(blank, Array(10).fill(null));
});

test('summary counts legacy separately and repeated corrections never change first-result totals', () => {
  assert.deepEqual(Assessment.summarize(Assessment.create()), { correct: 0, incorrect: 0, legacy: 0, answered: 0 });
  assert.deepEqual(Assessment.summarize(['legacy', 'incorrect', 'correct', null, 'legacy']), { correct: 1, incorrect: 1, legacy: 2, answered: 4 });
  for (let mask = 0; mask < 64; mask++) {
    let outcomes = Assessment.create(6);
    let firstCorrect = 0;
    for (let round = 0; round < 6; round++) {
      const correct = !!(mask & (1 << round));
      firstCorrect += Number(correct);
      const first = Assessment.submit(outcomes, round, correct);
      assert.equal(first.first, true);
      outcomes = first.outcomes;
      for (const retry of [true, false, true]) {
        const repeated = Assessment.submit(outcomes, round, retry);
        assert.equal(repeated.first, false);
        outcomes = repeated.outcomes;
      }
    }
    assert.deepEqual(Assessment.summarize(outcomes), { correct: firstCorrect, incorrect: 6 - firstCorrect, legacy: 0, answered: 6 });
  }
});

test('v2 migration preserves previous completions as legacy and remembers an unsolved wrong attempt', () => {
  assert.deepEqual(Assessment.restore(legacy(), 4), ['legacy', 'legacy', null, null]);
  assert.deepEqual(Assessment.restore(legacy({ attempts: 1 }), 4), ['legacy', 'legacy', 'incorrect', null]);
  assert.deepEqual(Assessment.restore(legacy({ attempts: 5, selected: 0, feedbackSelected: null }), 4), ['legacy', 'legacy', 'incorrect', null]);
  assert.deepEqual(Assessment.restore(legacy({ attempts: 3, solved: true, completed: 3 }), 4), ['legacy', 'legacy', 'legacy', null]);
  assert.deepEqual(Assessment.restore(legacy({ round: 0, completed: 0 }), 4), [null, null, null, null]);
  assert.deepEqual(Assessment.restore(legacy({ round: 3, attempts: 2, completed: 3 }), 4), ['legacy', 'legacy', 'legacy', 'incorrect']);
  assert.deepEqual(Assessment.restore(legacy({ round: 3, attempts: 2, solved: true, completed: 4 }), 4), ['legacy', 'legacy', 'legacy', 'legacy']);
  const { completed, ...minimal } = legacy({ attempts: 1 });
  assert.deepEqual(Assessment.restore(minimal, 4), ['legacy', 'legacy', 'incorrect', null]);
});

test('v3 restores valid initial, reviewed-wrong, corrected, and legacy states without sharing arrays', () => {
  const empty = { version: 3, round: 0, attempts: 0, solved: false, outcomes: Assessment.create() };
  assert.deepEqual(Assessment.restore(empty), Assessment.create());
  assert.deepEqual(Assessment.restore(current(), 4), current().outcomes);
  for (const [outcome, solved] of [['incorrect', false], ['incorrect', true], ['correct', true], ['legacy', true]]) {
    const session = Object.freeze(current({ attempts: 2, solved, outcomes: Object.freeze(['legacy', 'incorrect', outcome, null]) }));
    const restored = Assessment.restore(session, 4);
    assert.deepEqual(restored, session.outcomes);
    assert.notEqual(restored, session.outcomes);
    restored[0] = 'correct';
    assert.equal(session.outcomes[0], 'legacy');
  }
});

test('migrated v2 outcomes round-trip into v3 without regrading historical answers', () => {
  for (let round = 0; round < 10; round++) {
    for (const [attempts, solved] of [[0, false], [1, false], [4, false], [1, true], [4, true]]) {
      const session = legacy({ round, attempts, solved, completed: round + Number(solved) });
      const before = JSON.stringify(session);
      const outcomes = Assessment.restore(session);
      assert.ok(outcomes);
      const recovered = Assessment.restore({ ...session, version: 3, outcomes });
      assert.deepEqual(recovered, outcomes);
      assert.equal(JSON.stringify(session), before);
      const counts = Assessment.summarize(outcomes);
      assert.equal(counts.correct, 0);
      assert.equal(counts.incorrect, !solved && attempts > 0 ? 1 : 0);
      assert.equal(counts.legacy, round + Number(solved));
      assert.equal(counts.answered, round + Number(solved || attempts > 0));
    }
  }
});

test('restore rejects malformed types and inconsistent legacy completion counts instead of guessing', () => {
  for (const session of [null, undefined, [], {}, 'session', { ...legacy(), version: 1 }, { ...legacy(), version: '2' }]) {
    assert.equal(Assessment.restore(session, 4), null);
  }
  for (const field of ['round', 'attempts']) {
    for (const value of [-1, 1.5, '1', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(Assessment.restore(legacy({ [field]: value }), 4), null);
    }
  }
  for (const solved of [0, 1, 'false', undefined, null]) assert.equal(Assessment.restore(legacy({ solved }), 4), null);
  assert.equal(Assessment.restore(legacy({ round: 4 }), 4), null);
  assert.equal(Assessment.restore(legacy({ solved: true, attempts: 0, completed: 3 }), 4), null);
  for (const completed of [0, 3, -1, '2', NaN, null]) assert.equal(Assessment.restore(legacy({ completed }), 4), null);
  for (const rounds of [0, -1, 3.5, '4', null]) assert.equal(Assessment.restore(legacy(), rounds), null);
});

test('v3 rejects lost grades, missing previous rounds, premature future grades and invalid values', () => {
  for (const outcomes of [null, [], Array(4), ['incorrect', 'correct', null], ['incorrect', 'correct', null, null, null],
    ['incorrect', 'correct', undefined, null], ['incorrect', 'correct', 'wrong', null],
    [null, 'correct', null, null], ['incorrect', null, null, null], ['incorrect', 'correct', null, 'incorrect']]) {
    assert.equal(Assessment.restore(current({ outcomes }), 4), null);
  }
  assert.equal(Assessment.restore(current({ attempts: 1 }), 4), null, 'A prior wrong submit cannot disappear into null');
  for (const outcome of ['correct', 'incorrect', 'legacy']) {
    assert.equal(Assessment.restore(current({ outcomes: ['incorrect', 'correct', outcome, null] }), 4), null);
  }
  for (const outcome of ['correct', 'legacy']) {
    assert.equal(Assessment.restore(current({ attempts: 1, outcomes: ['incorrect', 'correct', outcome, null] }), 4), null);
  }
});
