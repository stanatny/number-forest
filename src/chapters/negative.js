(function (root) {
  'use strict';

  // Only the answer transport uses this offset. Every child-facing number is
  // formatted from the signed model value, including hints and related facts.
  var OFFSET = 5;
  function number(value) { return value < 0 ? '−' + Math.abs(value) : String(value); }
  function part(text, role, label) { return { text: String(text), role: role || 'neutral', label: label || '' }; }
  function target(label) { return { target: true, role: 'result', label: label || '' }; }
  function operation(a, sign, b, label) {
    return [part(number(a), 'a', '出发的数'), part(sign, 'operator'), part(b, 'b', '走几步'), part('=', 'operator'), target(label || '到达的数')];
  }
  function choices(values, context) {
    var unique = Array.from(new Set(values));
    for (var i = unique.length - 1; i > 0; i--) {
      var j = context.integer(0, i);
      var saved = unique[i]; unique[i] = unique[j]; unique[j] = saved;
    }
    return unique.map(function (value) { return { value: value + OFFSET, label: number(value) }; });
  }
  function finish(task, signedAnswer, values, context) {
    task.answer = signedAnswer + OFFSET;
    task.maxAnswer = OFFSET * 2;
    task.choices = choices(values, context);
    task.model.target = signedAnswer;
    task.model.offset = OFFSET;
    task.unit = task.unit || '';
    task.success = task.practice.explanation;
    return task;
  }

  function temperature(context, zero) {
    var below = zero ? 0 : context.integer(1, 3);
    var value = below === 0 ? 0 : -below;
    var explanation = zero ? '零度写成 0℃。它是零上和零下的分界，0 不是正数，也不是负数。' :
      '从 0℃ 往下数 ' + below + ' 格，是零下 ' + below + ' 度，写成 ' + number(value) + '℃。数前面的“−”表示低于零度。';
    return finish({
      kind: 'negative-temperature',
      prompt: zero ? '雪山气温正好是零度。温度计上应该填哪个数？' : '气温比 0℃ 低 ' + below + '℃，应该记作多少℃？',
      instruction: '温度计每一小格是 1℃。看看气温在零度线的哪一边。',
      answerLabel: '选择气温的数（℃）', unit: '℃',
      model: { below: below },
      hint: zero ? '零度线把零上和零下分开，零度用数字 0 表示。' : '从零度线往下数 ' + below + ' 格。零下的温度，要在数前面写一个负号“−”。',
      relations: zero ? ['零度 = 0℃', '−1 < 0 < 1'] : ['0 − ' + below + ' = ' + number(value), number(value) + ' < 0'],
      practice: {
        title: zero ? '认识零度' : '零度以下的温度',
        tokens: zero ? [part('零度', 'a'), part('=', 'operator'), target('气温 / ℃')] :
          [part('0', 'a', '零度 / ℃'), part('−', 'operator'), part(below, 'b', '降低 / ℃'), part('=', 'operator'), target('气温 / ℃')],
        explanation: explanation
      }
    }, value, zero ? [-1, 0, 1] : [value, 0, below], context);
  }

  function order(context, first) {
    var start = first ? -2 : context.integer(-5, -3);
    var missingIndex = first ? 1 : 2;
    var completed = [start, start + 1, start + 2, start + 3];
    var answer = completed[missingIndex];
    var values = completed.slice();
    values[missingIndex] = null;
    var tokens = [];
    values.forEach(function (value, index) {
      if (index) tokens.push(part('→', 'operator'));
      tokens.push(value === null ? target('空位里的数') : part(number(value), 'a'));
    });
    var explanation = '向右每走一格，数就增加 1。' + number(answer - 1) + ' 的右边是 ' + number(answer) +
      '，再右边是 ' + number(answer + 1) + '，所以空位填 ' + number(answer) + '。';
    return finish({
      kind: 'negative-order',
      prompt: '这些数从左到右，每次增加 1。空位里应该填几？',
      instruction: '沿着数轴，从空位左边的数接着往右走一格。',
      answerLabel: '补上空位里的数',
      model: { values: values, missingIndex: missingIndex, step: 1 },
      hint: '先找到 ' + number(answer - 1) + '。往右走一格，数增加 1；负数也按这个顺序排队。',
      relations: [completed.map(number).join(' → '), number(answer - 1) + ' < ' + number(answer) + ' < ' + number(answer + 1)],
      practice: { title: '把数排好队', tokens: tokens, explanation: explanation }
    }, answer, [answer - 1, answer, answer + 1], context);
  }

  function compare(context, bothNegative) {
    var a = -context.integer(1, 2);
    var b = bothNegative ? a - context.integer(1, 2) : context.integer(0, 2);
    // Vary which given number appears first without changing the lesson.
    if (context.integer(0, 1)) { var saved = a; a = b; b = saved; }
    var ask = bothNegative ? 'more' : 'less';
    var smaller = Math.min(a, b), larger = Math.max(a, b);
    var answer = bothNegative ? larger : smaller;
    var label = bothNegative ? '大' : '小';
    var explanation = '数轴上，越往右数越大。' + number(smaller) + ' 在 ' + number(larger) +
      ' 的左边，所以 ' + number(smaller) + ' < ' + number(larger) + '。较' + label + '的数是 ' + number(answer) + '。';
    return finish({
      kind: 'negative-compare',
      prompt: number(a) + ' 和 ' + number(b) + '，哪个数更' + label + '？',
      instruction: '在数轴上找到这两个数，再比较它们的位置。',
      answerLabel: '选择较' + label + '的数',
      model: { a: a, b: b, ask: ask },
      hint: '越往左，数越小；越往右，数越大。负数也遵守这个规则。',
      relations: [number(smaller) + ' < ' + number(larger), number(larger) + ' > ' + number(smaller)],
      practice: {
        title: '看看谁更' + label,
        tokens: [part(number(a), 'a'), part('和', 'neutral'), part(number(b), 'b'), part('→', 'operator'), target('较' + label + '的数')],
        explanation: explanation
      }
    }, answer, [a, b], context);
  }

  function steps(context, slot) {
    var start, step;
    if (slot === 6) { start = 0; step = -context.integer(1, 3); }
    else if (slot === 7) { start = -context.integer(1, 3); step = -start; }
    else if (slot === 8) { start = -context.integer(1, 3); step = -start + context.integer(1, 2); }
    else { start = context.integer(1, 3); step = -start - context.integer(1, 2); }
    var answer = start + step;
    var direction = step > 0 ? '右' : '左';
    var distance = Math.abs(step);
    var path = [];
    for (var i = 1; i <= distance; i++) path.push(start + i * Math.sign(step));
    var crossing = start * answer < 0;
    var explanation = '从 ' + number(start) + ' 向' + direction + '走 ' + distance + ' 步，依次到 ' + path.map(number).join('、') +
      '，最后停在 ' + number(answer) + '。' + (crossing ? '经过 0 时也只走一格，步数继续数。' : '起点不算一步，每走一格才算一步。');
    return finish({
      kind: 'negative-steps',
      prompt: '从 ' + number(start) + ' 出发，向' + direction + '走 ' + distance + ' 步，最后停在哪个数？',
      instruction: '每一格是一步。先找起点，再看清向左还是向右。',
      answerLabel: '选择最后到达的数',
      model: { start: start, step: step, path: path },
      hint: '先站在 ' + number(start) + '。向' + direction + '走一格，数就' + (step > 0 ? '增加' : '减少') + ' 1；起点不算一步。',
      relations: [number(start) + (step > 0 ? ' + ' : ' − ') + distance + ' = ' + number(answer),
        number(answer) + (step > 0 ? ' − ' : ' + ') + distance + ' = ' + number(start)],
      practice: { title: crossing ? '走过零点' : '沿着数轴走', tokens: operation(start, step > 0 ? '+' : '−', distance), explanation: explanation }
    }, answer, answer === 0 ? [-1, 0, 1] : start === 0 ? [answer, 0, -answer] : [answer, 0, start], context);
  }

  root.NumberForestCore.registerChapter({
    id: 'negative', title: '雪山数轴', subtitle: '从零出发，认识负数',
    description: '从零下的气温认识负数，在数轴上排一排、比一比，再向左或向右走过零点。',
    icon: '❄️', accent: '#477d91', level: '负数 · 排序 · 跨过零点',
    generator: function (context) {
      var slot = context.round % 10;
      if (slot < 2) return temperature(context, slot === 0);
      if (slot < 4) return order(context, slot === 2);
      if (slot < 6) return compare(context, slot === 4);
      return steps(context, slot);
    }
  });

  function thermometer(ctx) {
    var m = ctx.task.model, show = ctx.hinted || ctx.solved, escape = ctx.escape;
    var ticks = [];
    for (var value = 5; value >= -5; value--) {
      var selected = value === m.target;
      ticks.push('<div class="negative-temperature-tick' + (value === 0 ? ' is-zero' : '') + (selected ? ' is-reading' : '') +
        '"><span class="negative-temperature-number">' + escape(selected && !show ? '?' : number(value)) + '</span><i aria-hidden="true"></i>' +
        (value === 0 ? '<span class="negative-zero-label">零度线</span>' : '') + '</div>');
    }
    return '<div class="scene negative-scene negative-temperature-scene"><div class="negative-thermometer" role="img" aria-label="' +
      escape(m.below ? '气温在零度线下 ' + m.below + ' 格，每格一度。' : '气温正好在零度线上。') + '">' +
      '<div class="negative-temperature-tube" aria-hidden="true"><span style="height:' + ((m.target + 5) * 10) + '%"></span></div>' +
      '<div class="negative-temperature-scale">' + ticks.join('') + '</div></div><div class="negative-temperature-card">' +
      '<span class="negative-snow" aria-hidden="true">❄</span><span class="negative-weather-label">雪山气温</span>' +
      '<strong class="negative-temperature-reading' + (ctx.solved ? ' is-solved' : '') + '">' + escape(show ? number(m.target) : '?') + '<small>℃</small></strong>' +
      '<p>' + escape(m.below ? '比零度低 ' + m.below + ' 度' : '正好在零度线') + '</p></div>' +
      '<p class="scene-note">' + escape(show ? ctx.task.practice.explanation : '零度线以上是零上，以下是零下。每一小格是 1℃。') + '</p></div>';
  }

  function numberLine(ctx) {
    var t = ctx.task, m = t.model, escape = ctx.escape, show = ctx.hinted || ctx.solved;
    var isOrder = t.kind === 'negative-order';
    var isCompare = t.kind === 'negative-compare';
    var given = isOrder ? m.values.filter(function (value) { return value !== null; }).concat(m.target) :
      isCompare ? [m.a, m.b] : [m.start, m.target];
    // Keep zero and both sides visible, with fewer crowded labels on phones.
    var minimum = Math.min.apply(null, [-3].concat(given));
    var maximum = Math.max.apply(null, [3].concat(given));
    var count = maximum - minimum + 1;
    var ticks = [];
    for (var value = minimum; value <= maximum; value++) {
      var hidden = isOrder && value === m.target && !show;
      var mark = '', classes = value === 0 ? ' is-zero' : '';
      if (hidden) classes += ' is-blank';
      if (isCompare && value === m.a) classes += ' is-a';
      if (isCompare && value === m.b) classes += ' is-b';
      if (!isOrder && !isCompare && value === m.start) {
        classes += ' is-start'; mark = '<span class="negative-position-label">起点</span>';
      }
      if (show && value === m.target && !isCompare) {
        classes += ctx.solved ? ' is-destination is-solved' : ' is-destination';
        mark = '<span class="negative-position-label">' + (ctx.solved ? '找到了' : '看看这里') + '</span>';
      }
      ticks.push('<span class="negative-tick' + classes + '">' + mark + '<i aria-hidden="true"></i><strong>' + escape(hidden ? '?' : number(value)) + '</strong></span>');
    }
    var arrows = '';
    if (t.kind === 'negative-steps' && show) {
      var left = ((Math.min(m.start, m.target) - minimum + 0.5) / count) * 100;
      var width = (Math.abs(m.step) / count) * 100;
      arrows = '<span class="negative-journey ' + (m.step > 0 ? 'go-right' : 'go-left') + '" style="left:' + left + '%;width:' + width + '%" aria-hidden="true"></span>';
    }
    var introduction = isOrder ? '把空位补出来' : isCompare ? '找找这两个数的位置' : '从 ' + number(m.start) + ' 向' + (m.step > 0 ? '右' : '左') + '走 ' + Math.abs(m.step) + ' 步';
    var extra = '';
    if (isOrder) {
      extra = '<div class="negative-order-strip" aria-label="按从左到右的顺序排列">' + m.values.map(function (value) {
        return '<span class="negative-order-tile' + (value === null ? ' is-blank' : '') + '">' + escape(value === null ? show ? number(m.target) : '?' : number(value)) + '</span>';
      }).join('<span class="negative-order-arrow" aria-hidden="true">→</span>') + '</div>';
    } else if (isCompare) {
      extra = '<div class="negative-pair"><strong class="negative-value-a">' + escape(number(m.a)) + '</strong><span>和</span><strong class="negative-value-b">' + escape(number(m.b)) + '</strong></div>';
    } else if (show) {
      extra = '<ol class="negative-walk" aria-label="每一步到达的数">' + m.path.map(function (value, index) {
        return '<li><span>第 ' + (index + 1) + ' 步</span><strong>' + escape(number(value)) + '</strong></li>';
      }).join('') + '</ol>';
    }
    var caption = show ? t.practice.explanation : isOrder || isCompare ? '数轴上，越往左数越小，越往右数越大。' : '起点不算一步。需要时，点“给我提示”看看每一步。';
    return '<div class="scene negative-scene negative-numberline-scene"><div class="negative-scene-title">' + escape(introduction) + '</div>' + extra +
      '<div class="negative-axis" role="img" aria-label="' + escape('从左到右是 ' + number(minimum) + ' 到 ' + number(maximum) + '。' + (isOrder ? '问号处的数字需要填写。' : introduction)) + '">' +
      '<div class="negative-axis-directions"><span>← 数更小</span><span>数更大 →</span></div><div class="negative-ticks" style="--negative-count:' + count + ';--negative-edge:' + (50 / count) + '%">' + arrows + ticks.join('') + '</div></div>' +
      '<p class="scene-note">' + escape(caption) + '</p></div>';
  }

  if (root.NumberForestViews) {
    root.NumberForestViews.register('negative-temperature', { render: thermometer });
    ['negative-order', 'negative-compare', 'negative-steps'].forEach(function (kind) {
      root.NumberForestViews.register(kind, { render: numberLine });
    });
  }
})(globalThis);
