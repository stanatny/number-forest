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

const schedules = {
  bonds: ['bonds', 'compare', 'sequence', 'bonds', 'compare', 'sequence', 'bonds', 'compare', 'sequence', 'bonds'],
  arithmetic: ['add', 'subtract', 'bonds', 'numberline', 'add', 'subtract', 'bonds', 'numberline', 'add', 'subtract'],
  groups: ['groups', 'group-total', 'group-count', 'groups', 'group-total', 'group-count', 'groups', 'group-total', 'group-count', 'groups'],
  sharing: ['sharing', 'pack', 'sharing', 'sharing', 'pack', 'sharing', 'sharing', 'pack', 'sharing', 'sharing'],
  clock: ['clock', 'clock', 'clock', 'clock', 'clock', 'clock', 'clock', 'clock-forward', 'clock', 'clock-forward']
};

function assertTask(task, round) {
  const m = task.model;
  assert.ok(Number.isInteger(task.answer));
  assert.ok(Number.isInteger(task.maxAnswer));
  assert.ok(task.answer >= 0 && task.answer <= task.maxAnswer);
  assert.ok(task.prompt && task.instruction && task.hint && task.success && task.answerLabel);
  assert.equal(typeof task.unit, 'string');
  assert.ok(task.relations.length >= 2);
  assert.equal(core.checkAnswer(task, task.answer), true);
  assert.equal(core.checkAnswer(task, task.answer + 1), false);
  switch (task.kind) {
    case 'bonds':
      assert.ok(m.total >= 1 && m.total <= 20);
      assert.ok(m.visible >= 0 && m.visible <= m.total);
      assert.equal(m.visible + task.answer, m.total);
      assert.equal(task.unit, '颗');
      if (task.chapterId === 'arithmetic') {
        assert.ok(m.total > 10);
        assert.equal(m.equation, `${m.visible} + □ = ${m.total}`);
      } else {
        assert.ok(m.total <= 10);
      }
      break;
    case 'compare': {
      assert.ok(m.a >= 0 && m.a <= 20 && m.b >= 0 && m.b <= 20);
      assert.notEqual(m.a, m.b, 'two basket choices must be distinct');
      assert.ok(['more', 'less'].includes(m.ask));
      assert.equal(task.answer, m.ask === 'more' ? Math.max(m.a, m.b) : Math.min(m.a, m.b));
      assert.equal(task.unit, '颗');
      break;
    }
    case 'sequence': {
      assert.equal(m.values.length, 4);
      assert.equal(m.values.filter(value => value === null).length, 1);
      assert.equal(m.values[m.missingIndex], null);
      assert.ok(m.missingIndex >= 1 && m.missingIndex <= 3);
      assert.ok([1, 2, -1].includes(m.step));
      const completed = m.values.map(value => value === null ? task.answer : value);
      for (let i = 0; i < completed.length; i++) {
        assert.ok(Number.isInteger(completed[i]) && completed[i] >= 0 && completed[i] <= 20);
        if (i) assert.equal(completed[i] - completed[i - 1], m.step);
      }
      assert.ok(task.relations.includes(completed.join(' → ')));
      assert.equal(task.unit, '');
      break;
    }
    case 'add':
      assert.ok(m.a >= 1 && m.a <= 10 && m.b >= 1 && m.b <= 10);
      assert.equal(task.answer, m.a + m.b);
      assert.ok(task.answer > 10 && task.answer <= 20, 'every addition crosses the old 10 boundary');
      assert.ok(task.relations.includes(`10 + ${task.answer - 10} = ${task.answer}`));
      break;
    case 'subtract':
      assert.ok(m.a >= 0 && m.a <= 20 && m.b >= 0 && m.b <= m.a);
      assert.equal(task.answer + m.b, m.a);
      if (round % 10 === 1) {
        assert.ok(m.a > 10 && m.b > 0 && m.b < m.a, 'the first subtraction is not a zero or self-subtraction');
      }
      break;
    case 'numberline':
      assert.ok(Number.isInteger(m.start) && m.start >= 0 && m.start <= 20);
      assert.ok(Number.isInteger(m.step) && Math.abs(m.step) >= 2 && Math.abs(m.step) <= 5);
      assert.equal(task.answer, m.start + m.step);
      assert.ok(task.answer >= 0 && task.answer <= 20);
      assert.equal(task.unit, '');
      break;
    case 'groups':
    case 'group-total':
    case 'group-count':
    case 'pack': {
      assert.ok(m.perGroup >= 2 && m.perGroup <= 5);
      assert.ok(m.groups >= 2 && m.groups <= 5);
      const total = m.perGroup * m.groups;
      assert.ok(total <= 20);
      assert.ok(task.relations.includes(`${m.perGroup} × ${m.groups} = ${total}`));
      if (task.kind === 'groups') {
        assert.equal(m.previousGroups + 1, m.groups);
        assert.equal(task.answer, total);
        assert.ok(task.relations.includes(`${m.perGroup} × ${m.previousGroups} = ${m.perGroup * m.previousGroups}`));
      } else {
        assert.equal(m.total, total);
        assert.equal(task.answer, task.kind === 'group-total' ? total : m.groups);
      }
      assert.equal(task.unit, task.kind === 'group-count' ? '篮' : task.kind === 'pack' ? '袋' : '颗');
      break;
    }
    case 'sharing':
      assert.equal(task.maxAnswer, 5);
      assert.ok(m.groups >= 2 && m.groups <= 5);
      assert.ok(m.perGroup >= 1 && m.perGroup <= 5);
      assert.ok(m.total <= 20);
      assert.equal(m.total % m.groups, 0);
      assert.equal(task.answer, m.total / m.groups);
      assert.equal(m.perGroup, task.answer);
      assert.ok(task.relations.includes(`${m.perGroup} × ${m.groups} = ${m.total}`));
      assert.equal(task.unit, '颗');
      break;
    case 'clock':
    case 'clock-forward': {
      assert.ok(m.hour >= 1 && m.hour <= 12);
      assert.ok([0, 30].includes(m.minute));
      const slot = round % 10;
      if (slot < 3) assert.equal(m.minute, 0);
      else if (slot < 6) assert.equal(m.minute, 30);
      if (task.kind === 'clock-forward') {
        assert.equal(m.advance, slot === 7 ? 30 : 60);
        assert.ok(m.targetHour >= 1 && m.targetHour <= 12);
        assert.ok([0, 30].includes(m.targetMinute));
        const expected = ((m.hour % 12) * 60 + m.minute + m.advance) % 720;
        assert.equal((m.targetHour % 12) * 60 + m.targetMinute, expected);
        assert.equal(task.answer, m.targetHour * 60 + m.targetMinute);
      } else {
        assert.equal(task.answer, m.hour * 60 + m.minute);
      }
      assert.equal(task.unit, '');
      break;
    }
    default:
      assert.fail('Unexpected task kind ' + task.kind);
  }
}

test('classic script works without a module loader and metadata does not leak generators', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/core.js'), 'utf8'), sandbox);
  assert.equal(sandbox.NumberForestCore.chapters.length, 5);
  assert.deepEqual(core.chapters.map(chapter => chapter.id), Object.keys(schedules));
  for (const chapter of core.chapters) {
    assert.equal(core.getChapter(chapter.id), chapter);
    assert.equal(chapter.generator, undefined);
    assert.ok(Object.isFrozen(chapter));
  }
  assert.equal(core.getChapter('missing'), undefined);
});

test('every 10-task chapter follows its varied schedule and preserves all mathematical invariants', () => {
  const randoms = [() => 0, () => 1 - Number.EPSILON, seededRandom(1), seededRandom(90210), seededRandom(0xffffffff)];
  const seen = new Set();
  for (const random of randoms) {
    for (let cycle = 0; cycle < 100; cycle++) {
      for (let round = 0; round < 10; round++) {
        for (const chapter of core.chapters) {
          const task = core.createTask(chapter.id, { round, random });
          assert.equal(task.chapterId, chapter.id);
          assert.equal(task.kind, schedules[chapter.id][round]);
          seen.add(task.kind);
          assertTask(task, round);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['add', 'bonds', 'clock', 'clock-forward', 'compare', 'group-count', 'group-total', 'groups', 'numberline', 'pack', 'sequence', 'sharing', 'subtract'].sort());
});

test('same chapter, round and random seed reproduce the same task for resume', () => {
  for (const chapter of core.chapters) {
    for (let round = 0; round < 10; round++) {
      const first = core.createTask(chapter.id, { round, random: seededRandom(700 + round) });
      const replay = core.createTask(chapter.id, { round, random: seededRandom(700 + round) });
      assert.deepEqual(first, replay);
    }
  }
});

test('each session guarantees larger arithmetic, both comparison directions and all sequence steps', () => {
  for (const random of [() => 0, () => 1 - Number.EPSILON, seededRandom(23)]) {
    const arithmetic = Array.from({ length: 10 }, (_, round) => core.createTask('arithmetic', { round, random }));
    assert.equal(arithmetic.length, 10);
    assert.equal(arithmetic.filter(task => task.kind === 'add' && task.answer > 10).length, 3);
    assert.equal(arithmetic.filter(task => task.kind === 'bonds' && task.model.total > 10).length, 2);
    assert.deepEqual(arithmetic.filter(task => task.kind === 'numberline').map(task => Math.sign(task.model.step)), [1, -1]);
    const bonds = Array.from({ length: 10 }, (_, round) => core.createTask('bonds', { round, random }));
    assert.deepEqual(new Set(bonds.filter(task => task.kind === 'compare').map(task => task.model.ask)), new Set(['more', 'less']));
    assert.deepEqual(bonds.filter(task => task.kind === 'sequence').map(task => task.model.step), [1, 2, -1]);
  }
});

test('first group task keeps the 3 × 3 to 3 × 4 relationship and first sharing task stays linked', () => {
  const task = core.createTask('groups');
  assert.deepEqual(task.model, { perGroup: 3, groups: 4, previousGroups: 3 });
  assert.equal(task.answer, 12);
  for (const relation of ['3 × 3 = 9', '3 × 4 = 12', '9 + 3 = 12', '3 + 3 + 3 + 3 = 12']) assert.ok(task.relations.includes(relation));
  const sharing = core.createTask('sharing');
  assert.deepEqual(sharing.model, { total: 12, groups: 4, perGroup: 3 });
  assert.equal(sharing.answer, 3);
});

test('zero and twenty boundaries remain valid across answer meanings', () => {
  const max = () => 1 - Number.EPSILON;
  assert.equal(core.createTask('bonds', { round: 0, random: max }).answer, 0);
  assert.equal(core.createTask('bonds', { round: 4, random: () => 0 }).answer, 0);
  assert.equal(core.createTask('arithmetic', { round: 0, random: max }).answer, 20);
  assert.equal(core.createTask('arithmetic', { round: 5, random: () => 0 }).answer, 0);
  assert.equal(core.createTask('arithmetic', { round: 9, random: max }).answer, 0);
  assert.equal(core.createTask('arithmetic', { round: 7, random: () => 0 }).answer, 0);
  assert.equal(core.createTask('groups', { round: 1, random: max }).answer, 20);
  const samples = [0, 1 - Number.EPSILON];
  assert.equal(core.createTask('bonds', { round: 8, random: () => samples.shift() }).answer, 0);
});

test('clock progression introduces whole, half and mixed times, and advances across 12 correctly', () => {
  const max = () => 1 - Number.EPSILON;
  for (let round = 0; round < 10; round++) assertTask(core.createTask('clock', { round, random: max }), round);
  const half = core.createTask('clock', { round: 3, random: max });
  assert.equal(half.answer, 750);
  assert.ok(half.relations.includes('时针走在 12 和 1 的中间'));
  const nextHalfHour = core.createTask('clock', { round: 7, random: max });
  assert.deepEqual(nextHalfHour.model, { hour: 12, minute: 30, advance: 30, targetHour: 1, targetMinute: 0 });
  assert.equal(nextHalfHour.answer, 60);
  const nextHour = core.createTask('clock', { round: 9, random: max });
  assert.equal(nextHour.answer, 90);
  const samples = [10 / 12, 1 - Number.EPSILON];
  const reachesTwelve = core.createTask('clock', { round: 7, random: () => samples.shift() });
  assert.equal(reachesTwelve.model.hour, 11);
  assert.equal(reachesTwelve.answer, 720);
});

test('answer checking rejects coercion, nonintegers, nonfinite values and negative answers', () => {
  const zero = core.createTask('bonds', { random: () => 1 - Number.EPSILON });
  assert.equal(core.checkAnswer(zero, 0), true);
  for (const input of ['', '0', null, undefined, false, true, [], {}, NaN, Infinity, -Infinity, -1, 0.1]) assert.equal(core.checkAnswer(zero, input), false);
  assert.equal(core.checkAnswer(null, 0), false);
});

test('invalid chapter, round and random inputs fail clearly', () => {
  assert.throws(() => core.createTask('unknown'), RangeError);
  for (const round of [-1, 0.5, NaN, Infinity, '2']) assert.throws(() => core.createTask('bonds', { round }), RangeError);
  for (const value of [-0.1, 1, NaN, Infinity, '0.5']) assert.throws(() => core.createTask('bonds', { random: () => value }), RangeError);
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
