(function (root) {
  'use strict';

  var Core = root.NumberForestCore;
  if (!Core) throw new Error('Load NumberForestCore before the parity chapter.');

  function parityName(value) { return value % 2 === 0 ? '偶数' : '奇数'; }
  function sign(delta) { return delta < 0 ? '−' : '+'; }
  function operation(delta) { return sign(delta) + ' ' + Math.abs(delta); }
  function pick(context, values) { return values[context.integer(0, values.length - 1)]; }
  function parityChoices(context) {
    var choices = [{ value: 0, label: '偶数' }, { value: 1, label: '奇数' }];
    return context.integer(0, 1) ? choices.reverse() : choices;
  }
  function target(label) { return { target: true, role: 'result', label: label }; }
  function word(text, role, label) { return { text: String(text), role: role || 'neutral', label: label || '' }; }

  function pairTask(context, zero) {
    var count = zero ? 0 : context.integer(1, 12);
    var remainder = count % 2;
    var pairs = Math.floor(count / 2);
    var explanation = count === 0 ? '0 颗没有剩下任何一颗，也能分成 0 对，所以 0 是偶数。' :
      count + ' 颗两两配对，能配成 ' + pairs + ' 对，' + (remainder ? '还剩 1 颗，所以是奇数。' : '一颗也不剩，所以是偶数。');
    return {
      kind: 'parity-pairs',
      prompt: count + ' 颗松果，两两配对后，是奇数还是偶数？',
      instruction: '每 2 颗配一对。刚好配完是偶数（双数），剩 1 颗是奇数（单数）。',
      answer: remainder, maxAnswer: 1, answerLabel: '这个数是奇数还是偶数？', unit: '',
      choices: parityChoices(context),
      model: { count: count, pairs: pairs, remainder: remainder },
      practice: { title: '把数量读成奇偶', tokens: [word(count, 'a', '松果颗数'), word('→', 'operator'), target('奇数或偶数')], explanation: explanation },
      hint: count === 0 ? '看看有没有单独剩下的一颗。0 颗没有剩下的一颗。' : '试着每 2 颗圈成一对，再看有没有单独剩下的 1 颗。',
      relations: [count + ' = 2 × ' + pairs + (remainder ? ' + 1' : ''), count + ' 是' + parityName(count)],
      success: explanation
    };
  }

  function candidates(min, max, parity) {
    var values = [];
    for (var value = min; value <= max; value++) if (value % 2 === parity) values.push(value);
    return values;
  }

  function trailTask(context, slot) {
    var operations = slot === 2 ? ['+', '−'] : slot === 3 ? ['−', '+'] : ['+', '−', '+'];
    var parities = slot === 2 ? [1, 0, 1] : Array.from({ length: operations.length + 1 }, function () { return context.integer(0, 1); });
    var firstParity = parities[0];
    // Concrete witnesses stay within 0..20 and never subtract past zero.
    // Their values are examples, not extra givens for the abstract challenge.
    var values = [pick(context, candidates(8, 11, firstParity))];
    var running = values[0];
    var steps = [];
    operations.forEach(function (operator, index) {
      var value = pick(context, candidates(0, 4, parities[index + 1]));
      var next = operator === '+' ? running + value : running - value;
      steps.push({ left: running, right: value, operator: operator, result: next,
        leftParity: running % 2, rightParity: value % 2, resultParity: next % 2 });
      values.push(value);
      running = next;
    });
    var expression = parityName(parities[0]);
    var tokens = [word(parityName(parities[0]), 'a', '第一个数')];
    operations.forEach(function (operator, index) {
      expression += ' ' + operator + ' ' + parityName(parities[index + 1]);
      tokens.push(word(operator, 'operator'), word(parityName(parities[index + 1]), index % 2 ? 'a' : 'b'));
    });
    tokens.push(word('→', 'operator'), target('最后的奇偶'));
    var breakdown = steps.map(function (step, index) {
      return '第 ' + (index + 1) + ' 步：' + parityName(step.leftParity) + ' ' + step.operator + ' ' + parityName(step.rightParity) + '，得到' + parityName(step.resultParity) +
        '。例如 ' + step.left + ' ' + step.operator + ' ' + step.right + ' = ' + step.result + '。';
    }).join('\n');
    var explanation = breakdown + '\n所以最后是' + parityName(running) + '。';
    return {
      kind: 'parity-trail', prompt: expression + '，最后是奇数还是偶数？',
      instruction: '从左到右想，先判断前两项的结果，再接着算下一项。减法都够减。',
      answer: running % 2, maxAnswer: 1, answerLabel: '最后得到哪一种数？', unit: '', choices: parityChoices(context),
      model: { parities: parities, operations: operations, exampleValues: values, steps: steps, resultParity: running % 2 },
      practice: { title: '沿着奇偶规则走', tokens: tokens, explanation: explanation },
      hint: '先看前两项。奇数和偶数相加或相减，结果都是奇数；同样奇偶的两个数相加或相减，结果都是偶数。再用上一步的结果继续想。',
      relations: steps.map(function (step) { return parityName(step.leftParity) + ' ' + step.operator + ' ' + parityName(step.rightParity) + ' → ' + parityName(step.resultParity); }),
      success: explanation
    };
  }

  function changeDigit(original, oddDelta, evenDelta) {
    var result = original + (original % 2 ? oddDelta : evenDelta);
    // A password has one output digit per original position. Never wrap or carry.
    if (!Number.isInteger(original) || original < 0 || original > 9 || result < 0 || result > 9) {
      throw new RangeError('A parity password rule must produce one digit from each original digit.');
    }
    return result;
  }

  function codeTask(context, slot) {
    var settings = slot === 5 ? { length: 5, odd: 2, even: -1, fixed: '12345' } :
      slot === 6 ? { length: 4, odd: 1, even: -2, first: 2 } :
      slot === 7 ? { length: 5, odd: -1, even: 2, first: 0 } :
      slot === 8 ? { length: 4, odd: 2, even: -1 } :
      { length: 5, odd: -2, even: 1 };
    var allowed = [];
    for (var digit = 0; digit <= 9; digit++) {
      var output = digit + (digit % 2 ? settings.odd : settings.even);
      if (output >= 0 && output <= 9) allowed.push(digit);
    }
    var original = settings.fixed || Array.from({ length: settings.length }, function (_, index) {
      return index === 0 && settings.first !== undefined ? settings.first : pick(context, allowed);
    }).join('');
    var digits = original.split('').map(Number);
    var transformed = digits.map(function (digit) { return changeDigit(digit, settings.odd, settings.even); });
    var correct = transformed.join('');
    var rule = '奇数 ' + operation(settings.odd) + '，偶数 ' + operation(settings.even);
    var steps = digits.map(function (digit, index) {
      var delta = digit % 2 ? settings.odd : settings.even;
      return { position: index + 1, original: digit, parity: digit % 2, delta: delta, result: transformed[index],
        explanation: '第 ' + (index + 1) + ' 位原来是 ' + digit + '，是' + parityName(digit) + '：' + digit + ' ' + operation(delta) + ' = ' + transformed[index] + '。' };
    });
    var explanation = steps.map(function (step) { return step.explanation; }).join('\n') + '\n按原来的位置排好，新密码是 ' + correct + '。' +
      (correct[0] === '0' ? '最前面的 0 也占一位，不能省掉。' : '');
    return {
      kind: 'parity-code', prompt: '原密码 ' + original + '，' + rule + '，新密码是什么？',
      instruction: '从左到右，每位只看原来的数字选规则，算一次。位置不换，开头的 0 也保留。',
      answer: Number(correct), maxAnswer: Math.pow(10, digits.length) - 1, codeLength: digits.length,
      answerLabel: '写出 ' + digits.length + ' 位新密码', unit: '',
      model: { originalCode: original, digits: digits, oddDelta: settings.odd, evenDelta: settings.even, correctCode: correct, steps: steps },
      practice: { title: '每一位各算一次', tokens: [word(original, 'a', '原密码'), word('→', 'operator'), target('新密码')], explanation: explanation },
      hint: '先试一位。' + steps[0].explanation + '其他位置也各做一次。不要按“第几位”判断奇偶，要看那一位原来的数字。',
      relations: steps.map(function (step) { return '第' + step.position + '位：' + step.original + ' ' + operation(step.delta) + ' = ' + step.result; }).concat([original + ' → ' + correct]),
      success: explanation
    };
  }

  Core.registerChapter({
    id: 'parity', title: '奇偶密码屋', subtitle: '找规律，解密码',
    description: '从两两配对认识奇偶，沿着加减规则推理，再逐位破解四位、五位密码。',
    icon: '🔐', accent: '#7b67a0', level: '奇偶推理 · 逐位密码',
    generator: function (context) {
      var slot = context.round % 10;
      if (slot < 2) return pairTask(context, slot === 1);
      if (slot < 5) return trailTask(context, slot);
      return codeTask(context, slot);
    }
  });

  function renderPairs(ctx) {
    var m = ctx.task.model, reveal = ctx.hinted || ctx.solved;
    var dots = function (count) { return Array.from({ length: count }, function () { return '<i class="parity-dot" aria-hidden="true"></i>'; }).join(''); };
    var contents = m.count === 0 ? '<span class="parity-empty">0<span>这里没有松果</span></span>' :
      reveal ? Array.from({ length: m.pairs }, function () { return '<span class="parity-pair">' + dots(2) + '</span>'; }).join('') +
        (m.remainder ? '<span class="parity-pair parity-single">' + dots(1) + '</span>' : '') : dots(m.count);
    var note = reveal ? (m.remainder ? '每两颗一对，还剩 1 颗。' : '没有单独剩下的一颗。') : '先数一数。需要时点提示，把松果两两配对。';
    return '<div class="scene parity-scene"><div class="parity-object-field' + (reveal ? ' is-paired' : '') + '" role="img" aria-label="' + ctx.escape(m.count + ' 颗松果' + (reveal ? '，配成 ' + m.pairs + ' 对，剩下 ' + m.remainder + ' 颗' : '，还没有配对')) + '">' + contents + '</div><p class="parity-scene-note">' + ctx.escape(note) + '</p></div>';
  }

  function renderTrail(ctx) {
    var m = ctx.task.model, reveal = ctx.hinted || ctx.solved;
    if (!reveal) return '<div class="scene parity-scene"><div class="parity-mystery" aria-hidden="true">?</div><h2 class="parity-scene-title">先想第一步，再接着走</h2><p class="parity-scene-note">每做完一步，就用它的奇偶继续想。<br>需要帮助时，点提示查看一步一步的例子。</p></div>';
    return '<div class="scene parity-scene"><ol class="parity-trail">' + m.steps.map(function (step, index) {
      return '<li><span class="parity-step-number">' + (index + 1) + '</span><div><strong>' + ctx.escape(parityName(step.leftParity) + ' ' + step.operator + ' ' + parityName(step.rightParity) + ' → ' + parityName(step.resultParity)) + '</strong><p>例如 ' + ctx.escape(step.left + ' ' + step.operator + ' ' + step.right + ' = ' + step.result) + '</p></div></li>';
    }).join('') + '</ol></div>';
  }

  function renderCode(ctx) {
    var m = ctx.task.model;
    var rules = '<div class="parity-code-rules"><div><span>原数字是奇数</span><strong>' + ctx.escape(operation(m.oddDelta)) + '</strong></div><div><span>原数字是偶数</span><strong>' + ctx.escape(operation(m.evenDelta)) + '</strong></div></div>';
    var digits = '<div class="parity-code-digits" role="group" aria-label="原密码 ' + ctx.escape(m.digits.join('，')) + '">' + m.digits.map(function (digit, index) {
      return '<div class="parity-digit"><span>第 ' + (index + 1) + ' 位</span><strong>' + digit + '</strong></div>';
    }).join('') + '</div>';
    var worked = ctx.solved ? m.steps : ctx.hinted ? m.steps.slice(0, 1) : [];
    var breakdown = worked.length ? '<ol class="parity-code-worked">' + worked.map(function (step) {
      return '<li><span class="parity-step-number">' + step.position + '</span><div><span>原来是' + ctx.escape(parityName(step.original)) + '</span><strong>' + ctx.escape(step.original + ' ' + operation(step.delta) + ' = ' + step.result) + '</strong></div></li>';
    }).join('') + '</ol>' + (!ctx.solved ? '<p class="parity-scene-note">其他位也看原数字，只算一次。</p>' : '') : '';
    return '<div class="scene parity-scene parity-code-scene">' + rules + digits + '<p class="parity-scene-note">看每一位的原数字，不能把“第几位”当成奇偶。</p>' + breakdown + '</div>';
  }

  if (root.NumberForestViews) {
    root.NumberForestViews.register('parity-pairs', { render: renderPairs });
    root.NumberForestViews.register('parity-trail', { render: renderTrail });
    root.NumberForestViews.register('parity-code', { render: renderCode });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
