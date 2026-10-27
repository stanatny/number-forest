'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../src/core.js');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('classic script works without a module loader and metadata does not leak generators', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/core.js'), 'utf8'), sandbox);
  assert.equal(sandbox.NumberForestCore.chapters.length, 5);
  assert.deepEqual(core.chapters.map(chapter => chapter.id), ['bonds', 'arithmetic', 'groups', 'sharing', 'clock']);
  for (const chapter of core.chapters) {
    assert.equal(core.getChapter(chapter.id), chapter);
    assert.equal(chapter.generator, undefined);
    assert.ok(Object.isFrozen(chapter));
  }
  assert.equal(core.getChapter('missing'), undefined);
});

test('seeded and extreme samples preserve quantity relationships and integer ranges', () => {
  const generators = [() => 0, () => 1 - Number.EPSILON, seededRandom(1), seededRandom(90210), seededRandom(0xffffffff)];
  const seen = new Set();
  for (const random of generators) {
    for (let round = 0; round < 500; round += 1) {
      for (const chapter of core.chapters) {
        const task = core.createTask(chapter.id, { round, random, challenge: round % 2 === 0 });
        const m = task.model;
        assert.equal(task.chapterId, chapter.id);
        assert.ok(Number.isInteger(task.answer));
        assert.ok(task.answer >= 0 && task.answer <= task.maxAnswer);
        assert.ok(task.prompt && task.instruction && task.hint && task.success);
        assert.ok(task.relations.length >= 2);
        assert.equal(core.checkAnswer(task, task.answer), true);
        assert.equal(core.checkAnswer(task, task.answer + 1), false);
        seen.add(task.kind);
        if (task.kind === 'bonds') {
          assert.ok(m.total >= 1 && m.total <= 10);
          assert.ok(m.visible >= 0 && m.visible <= m.total);
          assert.equal(m.visible + task.answer, m.total);
        } else if (task.kind === 'add') {
          assert.ok(m.a >= 0 && m.b >= 0);
          assert.equal(task.answer, m.a + m.b);
          assert.ok(task.answer <= 10);
        } else if (task.kind === 'subtract') {
          assert.ok(m.a >= 0 && m.a <= 10 && m.b >= 0 && m.b <= m.a);
          assert.equal(task.answer + m.b, m.a);
        } else if (task.kind === 'groups') {
          assert.ok(m.perGroup >= 2 && m.perGroup <= 4);
          assert.ok(m.groups >= 2 && m.groups <= 4);
          assert.equal(m.previousGroups + 1, m.groups);
          assert.equal(task.answer, m.perGroup * m.groups);
          assert.equal(task.answer - m.perGroup * m.previousGroups, m.perGroup);
          assert.ok(task.relations.includes(`${m.perGroup} × ${m.groups} = ${task.answer}`));
          assert.ok(task.relations.includes(`${m.perGroup} × ${m.previousGroups} = ${m.perGroup * m.previousGroups}`));
        } else if (task.kind === 'sharing') {
          assert.equal(task.maxAnswer, 4);
          assert.ok(m.groups >= 2 && m.groups <= 4);
          assert.ok(m.perGroup >= 1 && m.perGroup <= 4);
          assert.equal(m.total % m.groups, 0);
          assert.equal(task.answer, m.total / m.groups);
          assert.equal(m.perGroup, task.answer);
          assert.ok(task.relations.includes(`${m.perGroup} × ${m.groups} = ${m.total}`));
        } else if (task.kind === 'clock') {
          assert.ok(m.hour >= 1 && m.hour <= 12);
          assert.equal(m.minute, round < 3 ? 0 : 30);
          assert.equal(task.answer, m.hour * 60 + m.minute);
        } else {
          assert.fail('Unexpected task kind ' + task.kind);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['add', 'bonds', 'clock', 'groups', 'sharing', 'subtract']);
});

test('the first group task builds 3 × 4 from 3 × 3 using the same group convention', () => {
  const task = core.createTask('groups');
  assert.deepEqual(task.model, { perGroup: 3, groups: 4, previousGroups: 3 });
  assert.equal(task.answer, 12);
  assert.ok(task.relations.includes('3 × 3 = 9'));
  assert.ok(task.relations.includes('3 × 4 = 12'));
  assert.ok(task.relations.includes('9 + 3 = 12'));
  assert.ok(task.relations.includes('3 + 3 + 3 + 3 = 12'));
});

test('answer checking rejects coercion, nonintegers, nonfinite values and negative answers', () => {
  const zero = core.createTask('bonds', { random: () => 1 - Number.EPSILON });
  assert.equal(zero.answer, 0);
  assert.equal(core.checkAnswer(zero, 0), true);
  for (const input of ['', '0', null, undefined, false, true, [], {}, NaN, Infinity, -Infinity, -1, 0.1]) {
    assert.equal(core.checkAnswer(zero, input), false, `Unexpectedly accepted ${String(input)}`);
  }
  assert.equal(core.checkAnswer(null, 0), false);
});

test('clock introduces whole hours before half hours and wraps the hour-hand explanation after 12', () => {
  for (let round = 0; round < 5; round += 1) {
    const task = core.createTask('clock', { round, random: () => 1 - Number.EPSILON });
    assert.equal(task.model.hour, 12);
    assert.equal(task.model.minute, round < 3 ? 0 : 30);
    if (round >= 3) {
      assert.equal(task.answer, 750);
      assert.ok(task.relations.includes('12:30 = 12 点半'));
      assert.ok(task.relations.includes('半小时 = 30 分钟'));
      assert.ok(task.relations.includes('时针走在 12 和 1 的中间'));
    }
  }
});

test('invalid chapter, round and random inputs fail clearly', () => {
  assert.throws(() => core.createTask('unknown'), RangeError);
  for (const round of [-1, 0.5, NaN, Infinity, '2']) {
    assert.throws(() => core.createTask('bonds', { round }), RangeError);
  }
  for (const value of [-0.1, 1, NaN, Infinity, '0.5']) {
    assert.throws(() => core.createTask('bonds', { random: () => value }), RangeError);
  }
  assert.throws(() => core.createTask('bonds', { random: 3 }), TypeError);
});

test('new chapters register without changing existing generators and cannot shadow an existing chapter', () => {
  const before = core.createTask('groups');
  const metadata = core.registerChapter({
    id: 'test-patterns', title: '排一排', subtitle: '找规律', description: '测试扩展', icon: '●', accent: '#000', level: '探索',
    generator: ({ round, integer }) => ({
      kind: 'patterns', prompt: '下一颗是什么？', instruction: '找一找', answer: integer(1, 1), maxAnswer: 1,
      model: { round }, relations: ['一颗接一颗'], hint: '再看一眼', success: '找到了'
    })
  });
  assert.equal(core.getChapter('test-patterns'), metadata);
  assert.equal(core.chapters.at(-1), metadata);
  assert.equal(metadata.generator, undefined);
  assert.equal(core.createTask('test-patterns', { round: 3 }).model.round, 3);
  assert.deepEqual(core.createTask('groups'), before);
  assert.throws(() => core.registerChapter({ id: 'groups', generator() {} }), /already registered/);
  assert.throws(() => core.registerChapter({ id: 'empty' }), TypeError);
  assert.throws(() => core.registerChapter({ id: '', generator() {} }), TypeError);
  core.registerChapter({ id: 'test-invalid', generator: () => ({ answer: 2.5, maxAnswer: 3 }) });
  assert.throws(() => core.createTask('test-invalid'), TypeError);
});
