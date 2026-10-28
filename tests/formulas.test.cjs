'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../src/core.js');
const Formulas = require('../src/formulas.js');

function texts(row) { return row.tokens.map(token => token.text); }
function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function numericEquationIsTrue(row) {
  const values = texts(row);
  const equals = values.indexOf('=');
  if (equals < 0 || !/^\d+$/.test(values[0])) return;
  assert.equal(equals, values.length - 2);
  let actual = Number(values[0]);
  for (let i = 1; i < equals; i += 2) {
    assert.match(values[i + 1], /^\d+$/);
    const n = Number(values[i + 1]);
    switch (values[i]) {
      case '+': actual += n; break;
      case '−': actual -= n; break;
      case '×': actual *= n; break;
      case '÷': actual /= n; break;
      default: assert.fail('Unexpected arithmetic operator: ' + values[i]);
    }
  }
  assert.equal(actual, Number(values.at(-1)), values.join(' '));
}

test('formulas load as a classic script and validate their task contract', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/formulas.js'), 'utf8'), context);
  assert.equal(typeof context.NumberForestFormulas.describe, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(context.NumberForestFormulas.describe(Core.createTask('sharing')))), Formulas.describe(Core.createTask('sharing')));
  for (const task of [null, {}, { kind: 'add', model: {}, answer: NaN }, { kind: 'add', model: {}, answer: -1 }]) {
    assert.throws(() => Formulas.describe(task), TypeError);
  }
  assert.deepEqual(Formulas.describe({ kind: 'extension', model: {}, answer: 2, relations: ['2 = 2'] }).rows, []);
});

test('every generated kind has bounded presentation and true solved arithmetic without mutating input', () => {
  const kinds = new Set();
  const roles = new Set(['a', 'b', 'result', 'operator', 'neutral']);
  const random = rng(84913);
  for (let round = 0; round < 250; round++) {
    for (const chapter of Core.chapters) {
      const task = freeze(Core.createTask(chapter.id, { round, random }));
      kinds.add(task.kind);
      const before = JSON.stringify(task);
      const unanswered = Formulas.describe(task);
      const completed = Formulas.describe(task, { solved: true, selected: -999 });
      assert.equal(JSON.stringify(task), before);
      assert.ok(unanswered.title && unanswered.rows.length > 0 && unanswered.rows.length <= 2);
      assert.equal(unanswered.rows.length, completed.rows.length);
      let unknowns = 0;
      unanswered.rows.forEach((row, index) => {
        assert.equal(row.tokens.length, completed.rows[index].tokens.length);
        row.tokens.forEach((token, position) => {
          const after = completed.rows[index].tokens[position];
          assert.equal(typeof token.text, 'string');
          assert.equal(typeof token.label, 'string');
          assert.ok(roles.has(token.role));
          if (token.unknown) {
            unknowns++;
            assert.equal(token.text, '?');
            assert.equal(after.unknown, false);
            assert.notEqual(after.text, '?');
            if (!['clock', 'clock-forward', 'compare'].includes(task.kind)) assert.equal(Number(after.text), task.answer);
          } else assert.deepEqual(after, token);
        });
        if (task.kind !== 'compare') numericEquationIsTrue(completed.rows[index]);
      });
      assert.ok(unknowns >= 1, task.kind);
      for (const selected of [null, -1, task.maxAnswer + 1, '999', NaN, Infinity]) {
        assert.deepEqual(Formulas.describe(task, { solved: false, selected }), unanswered);
      }
      const preview = Formulas.describe(task, { selected: task.answer });
      const highlighted = preview.rows.flatMap(row => row.tokens).filter(token => token.preview);
      assert.ok(highlighted.length > 0, task.kind);
      if (task.kind !== 'compare') {
        assert.ok(highlighted.every(token => token.unknown === true));
        assert.equal(highlighted.length, unknowns);
      }
      assert.deepEqual(Formulas.describe(task, { solved: true, selected: task.answer + 1 }), completed);
    }
  }
  assert.deepEqual([...kinds].sort(), ['add', 'bonds', 'clock', 'clock-forward', 'compare', 'group-count', 'group-total', 'groups', 'numberline', 'pack', 'sequence', 'sharing', 'subtract'].sort());
});

test('bonds hides the missing addend, including zero, without parsing completed relation strings', () => {
  for (const [visible, total] of [[3, 7], [5, 5], [0, 1], [12, 20]]) {
    const task = { kind: 'bonds', answer: total - visible, model: { visible, total, equation: 'DO NOT READ' }, relations: ['DO NOT READ THE ANSWER'] };
    assert.deepEqual(texts(Formulas.describe(task).rows[0]), [String(visible), '+', '?', '=', String(total)]);
    assert.deepEqual(texts(Formulas.describe(task, { solved: true }).rows[0]), [String(visible), '+', String(total - visible), '=', String(total)]);
  }
  const task = Core.createTask('bonds', { random: () => 0 });
  for (const solved of [1, 'true', null, undefined]) assert.ok(Formulas.describe(task, { solved }).rows[0].tokens.some(t => t.unknown));
});

test('addition, subtraction and numberline keep the operation and position units', () => {
  const cases = [
    [{ kind: 'add', model: { a: 8, b: 7 }, answer: 15 }, ['8', '+', '7', '=', '?']],
    [{ kind: 'subtract', model: { a: 12, b: 7 }, answer: 5 }, ['12', '−', '7', '=', '?']],
    [{ kind: 'subtract', model: { a: 0, b: 0 }, answer: 0 }, ['0', '−', '0', '=', '?']],
    [{ kind: 'numberline', model: { start: 2, step: -2 }, answer: 0 }, ['2', '−', '2', '=', '?']],
    [{ kind: 'numberline', model: { start: 15, step: 5 }, answer: 20 }, ['15', '+', '5', '=', '?']]
  ];
  for (const [task, expected] of cases) {
    const description = Formulas.describe(task);
    assert.deepEqual(texts(description.rows[0]), expected);
    if (task.kind === 'numberline') assert.doesNotMatch(JSON.stringify(description), /颗/);
    numericEquationIsTrue(Formulas.describe(task, { solved: true }).rows[0]);
  }
});

test('an extra group connects multiplication to adding one whole basket, hiding both totals', () => {
  const task = Core.createTask('groups', { round: 0 });
  const before = Formulas.describe(task);
  assert.deepEqual(before.rows.map(texts), [['3', '×', '4', '=', '?'], ['9', '+', '3', '=', '?']]);
  const after = Formulas.describe(task, { solved: true });
  assert.deepEqual(after.rows.map(texts), [['3', '×', '4', '=', '12'], ['9', '+', '3', '=', '12']]);
  const total = { kind: 'group-total', model: { perGroup: 2, groups: 5, total: 10 }, answer: 10 };
  assert.deepEqual(Formulas.describe(total).rows.map(texts), [
    ['2', '×', '5', '=', '?'], ['2', '+', '2', '+', '2', '+', '2', '+', '2', '=', '?']
  ]);
});

test('counting baskets, packing and equal sharing hide the distinct requested quantity', () => {
  const m = { total: 20, perGroup: 4, groups: 5 };
  const basket = Formulas.describe({ kind: 'group-count', model: m, answer: 5 });
  const pack = Formulas.describe({ kind: 'pack', model: m, answer: 5 });
  const share = Formulas.describe({ kind: 'sharing', model: m, answer: 4 });
  assert.deepEqual(basket.rows.map(texts), [['4', '×', '?', '=', '20'], ['20', '÷', '4', '=', '?']]);
  assert.deepEqual(pack.rows.map(texts), [['20', '÷', '4', '=', '?'], ['4', '×', '?', '=', '20']]);
  assert.deepEqual(share.rows.map(texts), [['20', '÷', '5', '=', '?'], ['?', '×', '5', '=', '20']]);
  for (const token of basket.rows.flatMap(r => r.tokens).filter(t => t.unknown)) assert.match(token.label, /篮/);
  for (const token of pack.rows.flatMap(r => r.tokens).filter(t => t.unknown)) assert.match(token.label, /袋/);
  for (const token of share.rows.flatMap(r => r.tokens).filter(t => t.unknown)) assert.match(token.label, /每人几颗/);
  assert.ok(!basket.rows.flatMap(texts).includes('5'));
  assert.ok(!pack.rows.flatMap(texts).includes('5'));
  assert.ok(!share.rows.flatMap(texts).includes('4'));
});

test('comparison preserves left/right order for both more and less questions', () => {
  for (const [a, b] of [[0, 4], [20, 3]]) {
    for (const ask of ['more', 'less']) {
      const task = { kind: 'compare', model: { a, b, ask }, answer: ask === 'more' ? Math.max(a, b) : Math.min(a, b) };
      const before = Formulas.describe(task);
      assert.deepEqual(texts(before.rows[0]), [String(a), '?', String(b)]);
      assert.equal(before.rows[0].tokens[1].label, '比较关系');
      assert.match(before.note, ask === 'more' ? /选松果更多的一篮/ : /选松果更少的一篮/);
      assert.deepEqual(texts(Formulas.describe(task, { solved: true }).rows[0]), [String(a), a > b ? '>' : '<', String(b)]);
    }
  }
});

test('sequence keeps only the actual blank unknown and relates it to an adjacent number', () => {
  for (const [values, step, answer, adjacent] of [
    [[0, null, 4, 6], 2, 2, ['0', '+', '2', '=', '?']],
    [[4, 3, null, 1], -1, 2, ['3', '−', '1', '=', '?']],
    [[3, 2, 1, null], -1, 0, ['1', '−', '1', '=', '?']],
    [[null, 2, 4, 6], 2, 0, ['?', '+', '2', '=', '2']]
  ]) {
    const task = { kind: 'sequence', model: { values, step, missingIndex: values.indexOf(null) }, answer };
    const before = Formulas.describe(task);
    assert.equal(before.rows[0].tokens.filter(t => t.unknown).length, 1);
    assert.deepEqual(before.rows[0].tokens.filter(t => t.role !== 'operator').map(t => t.text), values.map(v => v === null ? '?' : String(v)));
    assert.deepEqual(texts(before.rows[1]), adjacent);
    numericEquationIsTrue(Formulas.describe(task, { solved: true }).rows[1]);
  }
});

test('clocks hide unselected times and wrap solved 12-hour advances correctly', () => {
  const time = (hour, minute) => hour + (minute ? '点半' : '点整');
  for (let hour = 1; hour <= 12; hour++) {
    for (const minute of [0, 30]) {
      const clock = { kind: 'clock', model: { hour, minute }, answer: hour * 60 + minute };
      assert.deepEqual(texts(Formulas.describe(clock).rows[0]), ['钟面时间', '=', '?']);
      assert.deepEqual(texts(Formulas.describe(clock, { solved: true }).rows[0]), ['钟面时间', '=', time(hour, minute)]);
      for (const advance of [30, 60]) {
        const elapsed = hour * 60 + minute + advance;
        const targetHour = Math.floor(elapsed / 60) % 12 || 12;
        const targetMinute = elapsed % 60;
        const task = { kind: 'clock-forward', model: { hour, minute, advance, targetHour, targetMinute }, answer: targetHour * 60 + targetMinute };
        const before = Formulas.describe(task);
        assert.deepEqual(texts(before.rows[0]), [time(hour, minute), '再过', advance === 60 ? '1小时' : '30分钟', '→', '?']);
        assert.equal(Formulas.describe(task, { solved: true }).rows[0].tokens.at(-1).text, time(targetHour, targetMinute));
        assert.ok(before.rows[0].tokens.every(t => !/^\d+$/.test(t.text)), 'No encoded minute totals in a clock formula');
      }
    }
  }
});

test('numeric selections preview zero and both right and wrong choices without confirming them', () => {
  const task = freeze({ kind: 'subtract', model: { a: 5, b: 5 }, answer: 0, maxAnswer: 20 });
  const before = JSON.stringify(task);
  for (const selected of [0, 3, 20]) {
    const options = freeze({ solved: false, selected });
    const result = Formulas.describe(task, options).rows[0].tokens.at(-1);
    assert.deepEqual(result, { text: String(selected), role: 'result', label: '还剩几颗', unknown: true, preview: true });
    const confirmed = Formulas.describe(task, { solved: true, selected }).rows[0].tokens.at(-1);
    assert.equal(confirmed.text, '0');
    assert.equal(confirmed.unknown, false);
    assert.equal(confirmed.preview, false);
  }
  assert.equal(JSON.stringify(task), before);
  const zeroBound = { ...task, maxAnswer: 0 };
  assert.equal(Formulas.describe(zeroBound, { selected: 0 }).rows[0].tokens.at(-1).preview, true);
  assert.equal(Formulas.describe(zeroBound, { selected: 1 }).rows[0].tokens.at(-1).text, '?');
});

test('previews reject coerced, noninteger and out-of-range input, including malformed explicit bounds', () => {
  const task = { kind: 'add', model: { a: 2, b: 3 }, answer: 5, maxAnswer: 8 };
  const unselected = Formulas.describe(task);
  for (const selected of [undefined, null, '', '5', true, false, NaN, Infinity, -Infinity, -1, 1.5, 9, Number.MAX_SAFE_INTEGER + 1, 5n, Symbol('5')]) {
    assert.deepEqual(Formulas.describe(task, { selected }), unselected);
  }
  for (const maxAnswer of [null, NaN, -1, '8', 8.5]) {
    const result = Formulas.describe({ ...task, maxAnswer }, { selected: 5 });
    assert.equal(result.rows[0].tokens.at(-1).text, '?');
  }
  const { maxAnswer, ...fixture } = task;
  assert.equal(Formulas.describe(fixture, { selected: 9 }).rows[0].tokens.at(-1).text, '9');
  assert.equal(Formulas.describe(fixture, { selected: 21 }).rows[0].tokens.at(-1).text, '?');
  assert.deepEqual(Formulas.describe({ kind: 'extension', model: {}, answer: 2, maxAnswer: 5 }, { selected: 3 }).rows, []);
});

test('a preview fills the actual missing addend and synchronizes related formulas', () => {
  const bonds = { kind: 'bonds', model: { visible: 3, total: 7 }, answer: 4, maxAnswer: 10 };
  const preview = Formulas.describe(bonds, { selected: 2 });
  assert.deepEqual(texts(preview.rows[0]), ['3', '+', '2', '=', '7']);
  assert.equal(preview.rows[0].tokens[2].role, 'b');
  assert.equal(preview.rows[0].tokens[2].unknown, true);
  assert.equal(preview.rows[0].tokens[2].preview, true);
  const cases = [
    [Core.createTask('groups'), 9, [['3', '×', '4', '=', '9'], ['9', '+', '3', '=', '9']]],
    [{ kind: 'group-total', model: { perGroup: 2, groups: 3, total: 6 }, answer: 6, maxAnswer: 20 }, 7, [['2', '×', '3', '=', '7'], ['2', '+', '2', '+', '2', '=', '7']]],
    [{ kind: 'group-count', model: { perGroup: 3, groups: 4, total: 12 }, answer: 4, maxAnswer: 5 }, 2, [['3', '×', '2', '=', '12'], ['12', '÷', '3', '=', '2']]],
    [Core.createTask('sharing'), 2, [['12', '÷', '4', '=', '2'], ['2', '×', '4', '=', '12']]],
    [{ kind: 'pack', model: { perGroup: 3, groups: 4, total: 12 }, answer: 4, maxAnswer: 5 }, 2, [['12', '÷', '3', '=', '2'], ['3', '×', '2', '=', '12']]],
    [{ kind: 'sequence', model: { values: [0, null, 4, 6], step: 2, missingIndex: 1 }, answer: 2, maxAnswer: 20 }, 3, [['0', '→', '3', '→', '4', '→', '6'], ['0', '+', '2', '=', '3']]]
  ];
  for (const [task, selected, expected] of cases) {
    const result = Formulas.describe(task, { selected });
    assert.deepEqual(result.rows.map(texts), expected);
    const targets = result.rows.flatMap(row => row.tokens).filter(token => token.unknown);
    assert.equal(targets.length, 2);
    assert.ok(targets.every(token => token.text === String(selected) && token.preview === true));
    assert.ok(result.rows.flatMap(row => row.tokens).filter(token => !token.unknown).every(token => !token.preview));
  }
});

test('comparison previews the selected basket only and never inserts a count into the comparison sign', () => {
  for (const [a, b] of [[0, 4], [20, 3]]) {
    for (const ask of ['more', 'less']) {
      const task = { kind: 'compare', model: { a, b, ask }, answer: ask === 'more' ? Math.max(a, b) : Math.min(a, b), maxAnswer: 20 };
      for (const [selected, index] of [[a, 0], [b, 2]]) {
        const result = Formulas.describe(task, { selected }).rows[0];
        assert.deepEqual(texts(result), [String(a), '?', String(b)]);
        assert.deepEqual(result.tokens.map((token, position) => token.preview ? position : null).filter(i => i !== null), [index]);
        assert.equal(result.tokens[1].unknown, true);
        assert.equal(result.tokens[1].preview, false);
        const solved = Formulas.describe(task, { solved: true, selected }).rows[0];
        assert.equal(solved.tokens[1].text, a > b ? '>' : '<');
        assert.ok(solved.tokens.every(token => !token.preview));
      }
      assert.ok(Formulas.describe(task, { selected: 2 }).rows[0].tokens.every(token => !token.preview));
    }
  }
});

test('clock previews decode selected time, respect the bound, and confirm only the target time', () => {
  const tasks = [
    { kind: 'clock', model: { hour: 3, minute: 30 }, answer: 210, maxAnswer: 750 },
    { kind: 'clock-forward', model: { hour: 12, minute: 30, advance: 30, targetHour: 1, targetMinute: 0 }, answer: 60, maxAnswer: 750 }
  ];
  for (const task of tasks) {
    for (const [selected, text] of [[60, '1点整'], [90, '1点半'], [210, '3点半'], [720, '12点整'], [750, '12点半']]) {
      const result = Formulas.describe(task, { selected }).rows[0].tokens.at(-1);
      assert.equal(result.text, text);
      assert.equal(result.preview, true);
      assert.equal(result.unknown, true);
      const solved = Formulas.describe(task, { solved: true, selected }).rows[0].tokens.at(-1);
      assert.equal(solved.text, task.kind === 'clock' ? '3点半' : '1点整');
      assert.equal(solved.preview, false);
      assert.equal(solved.unknown, false);
    }
    for (const selected of [0, 30, 59, 61, 719, 751, 780, '750', null, 750n, Symbol('750')]) {
      const result = Formulas.describe(task, { selected }).rows[0].tokens.at(-1);
      assert.equal(result.text, '?');
      assert.equal(result.preview, false);
    }
    assert.equal(Formulas.describe({ ...task, maxAnswer: 720 }, { selected: 750 }).rows[0].tokens.at(-1).text, '?');
    const { maxAnswer, ...fixture } = task;
    assert.equal(Formulas.describe(fixture, { selected: 750 }).rows[0].tokens.at(-1).text, '12点半');
  }
});
