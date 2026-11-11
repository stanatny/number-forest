(function (root) {
  'use strict';
  var core = root.NumberForestCore;
  if (!core) throw new Error('Load NumberForestCore before the decimal chapter.');

  // All quantities and answers are integer counts of tenths. Decimal strings
  // are presentation only: no decimal-number arithmetic or rounding is used.
  function decimal(tenths) {
    var digits = String(tenths);
    return digits.length === 1 ? '0.' + digits : digits.slice(0, -1) + '.' + digits.slice(-1);
  }
  function part(text, role, label) { return { text: String(text), role: role, label: label || '' }; }
  function target(label) { return { target: true, role: 'result', label: label || '写成小数' }; }
  function choices(answer, maximum) {
    var values = [];
    [answer, answer - 1, answer + 1, answer - 2, answer + 2, 0, maximum].forEach(function (value) {
      if (value >= 0 && value <= maximum && values.indexOf(value) === -1 && values.length < 4) values.push(value);
    });
    return values.sort(function (a, b) { return a - b; }).map(function (value) { return { value: value, label: decimal(value) }; });
  }
  function task(kind, answer, maximum, model, prompt, instruction, hint, explanation, practice, relations) {
    return {
      kind: kind, answer: answer, maxAnswer: maximum, model: model,
      prompt: prompt, instruction: instruction, hint: hint, success: explanation,
      answerLabel: kind === 'decimal-compare' ? '选出要找的小数' : '选出表示这部分的小数', unit: '',
      choices: choices(answer, maximum), relations: relations,
      practice: { title: practice.title, tokens: practice.tokens, explanation: explanation }
    };
  }

  function tenthsTask(count) {
    var explanation = count === 0 ? '一个小格也没涂，就是 0。用一位小数写，是 0.0。' : count === 10 ?
      '每个小格是 0.1，10 个小格刚好是一整条，所以 10 个 0.1 是 1.0，也就是 1。' :
      '一整条平均分成 10 小格，每格是 0.1。涂了 ' + count + ' 小格，就是 ' + count + ' 个 0.1，写成 ' + decimal(count) + '。';
    return task('decimal-tenths', count, 10, { tenths: count, parts: 10 },
      count === 0 ? '花带还没有涂色。涂色的部分写成小数是多少？' : '一整条花带分成 10 小格，涂了 ' + count + ' 格。涂色部分写成小数是多少？',
      '每条花带都一样长，每个小格也一样大。一小格是 0.1。',
      count === 10 ? '数数是不是 10 格全涂满了。10 小格刚好是一整条。' : count === 0 ?
        '看看有没有涂色的小格。没有涂色，就表示零。' : '小数点后这一位，告诉我们有几个 0.1。可以一格一格地数。',
      explanation, { title: '十份中的小数', tokens: [part(count + ' 小格', 'a', '涂色的部分'), part('→', 'operator'), target()] },
      [count + ' 个 0.1 = ' + decimal(count), count === 10 ? '1.0 = 1' : '一整条 = 10 小格 = 1.0']);
  }

  function compareTask(context, ask) {
    var a = context.integer(0, 10);
    var b = context.integer(0, 9);
    if (b >= a) b++;
    var more = ask === 'more';
    var answer = more ? Math.max(a, b) : Math.min(a, b);
    var symbol = a > b ? '>' : '<';
    var word = more ? '大' : '小';
    var explanation = '两条花带一样长，也都分成 10 小格。左边涂了 ' + a + ' 格，右边涂了 ' + b + ' 格；' +
      '涂色格数越多，表示的小数越大。所以 ' + decimal(a) + ' ' + symbol + ' ' + decimal(b) + '，较' + word + '的是 ' + decimal(answer) + '。';
    var result = task('decimal-compare', answer, 10, { aTenths: a, bTenths: b, ask: ask, parts: 10 },
      decimal(a) + ' 和 ' + decimal(b) + '，哪个小数更' + word + '？',
      '比较一样长的两条花带，看看涂色的部分。',
      '把两条花带左端对齐。题目要找更' + word + '的，看看哪条涂色的格数符合要求。',
      explanation, { title: '找更' + word + '的小数', tokens: [part(decimal(a), 'a', '左边'), part('和', 'neutral'), part(decimal(b), 'b', '右边'), part('→', 'operator'), target('更' + word + '的小数')] },
      [decimal(a) + ' ' + symbol + ' ' + decimal(b), '每一小格 = 0.1']);
    // Comparison answers are the actual amounts, not left/right indices.
    result.choices = [a, b].map(function (value) { return { value: value, label: decimal(value) }; });
    return result;
  }

  function addTask(context, crossesWhole) {
    var total, a, b;
    if (crossesWhole) {
      total = context.integer(11, 15);
      a = context.integer(total - 9, 9);
      b = total - a;
    } else {
      a = context.integer(1, 4);
      b = context.integer(1, 10 - a);
      total = a + b;
    }
    var explanation = decimal(a) + ' 是 ' + a + ' 个小格，' + decimal(b) + ' 是 ' + b + ' 个小格。合起来有 ' + total + ' 个小格。' +
      (total >= 10 ? '先把 10 格拼成一整条，再看剩下的 ' + (total - 10) + ' 格，所以一共是 ' + decimal(total) + '。' : '每格都是 0.1，所以一共是 ' + decimal(total) + '。');
    return task('decimal-add', total, crossesWhole ? 20 : 10, { aTenths: a, bTenths: b, parts: 10 },
      '先涂 ' + decimal(a) + '，再接上 ' + decimal(b) + '，合起来是多少？',
      '把两种颜色的小格接起来。每满 10 格，就有一整条。',
      '先数两部分各有几个小格，再把格数合起来；10 个小格是一整条。',
      explanation, { title: '小数也能合起来', tokens: [part(decimal(a), 'a', '先有的部分'), part('+', 'operator'), part(decimal(b), 'b', '再添的部分'), part('=', 'operator'), target('合起来')] },
      [decimal(a) + ' + ' + decimal(b) + ' = ' + decimal(total), a + ' 个 0.1 + ' + b + ' 个 0.1 = ' + total + ' 个 0.1']);
  }

  function wholeTask(context) {
    var extra = context.integer(1, 5);
    var total = 10 + extra;
    var explanation = '一整条是 1.0，再添的 ' + extra + ' 小格是 ' + decimal(extra) + '。合起来是 1 个整条和 ' + extra + ' 个 0.1，写成 ' + decimal(total) + '。';
    return task('decimal-whole', total, 20, { whole: 1, extraTenths: extra, parts: 10 },
      '已经涂满一整条，再涂 ' + extra + ' 小格。合起来写成小数是多少？',
      '一整条是 1，后面还可以接着涂。每条仍分成一样大的 10 小格。',
      '小数点前表示几个整条，小数点后这一位表示另外几个小格。',
      explanation, { title: '一整条，再添一点', tokens: [part('1.0', 'a', '一整条'), part('+', 'operator'), part(decimal(extra), 'b', '再添的小格'), part('=', 'operator'), target('合起来')] },
      ['1.0 + ' + decimal(extra) + ' = ' + decimal(total), total + ' 个 0.1 = ' + decimal(total)]);
  }

  core.registerChapter({
    id: 'decimal', title: '小数花圃', subtitle: '十份里，藏着小数',
    description: '把整体平均分成十份，认识十分之一，比较小数并把小数合起来。',
    icon: '🌷', accent: '#3b958a', level: '十等份 · 小数初步',
    generator: function (context) {
      switch (context.round % 10) {
        case 0: return tenthsTask(1);
        case 1: return tenthsTask(context.integer(2, 5));
        case 2: return tenthsTask(context.integer(6, 9));
        case 3: return tenthsTask(0);
        case 4: return tenthsTask(10);
        case 5: return compareTask(context, 'more');
        case 6: return addTask(context, false);
        case 7: return compareTask(context, 'less');
        case 8: return wholeTask(context);
        default: return addTask(context, true);
      }
    }
  });

  function strip(ctx, filled, label, tone, splitAt) {
    var cells = '';
    for (var index = 0; index < 10; index++) {
      var color = splitAt !== undefined && index >= splitAt ? 'b' : tone;
      cells += '<span class="decimal-cell' + (index < filled ? ' is-filled decimal-fill-' + color : '') + '" aria-hidden="true"></span>';
    }
    return '<div class="decimal-unit"><div class="decimal-unit-heading"><strong>' + ctx.escape(label) + '</strong><span>一整条 = 1</span></div>' +
      '<div class="decimal-strip" role="img" aria-label="' + ctx.escape(label + '，平均分成10小格，涂色' + filled + '格') + '">' + cells + '</div></div>';
  }

  function render(ctx) {
    var task = ctx.task, m = task.model, content = '';
    var guide = '<div class="decimal-scale-key"><span class="decimal-mini-cell" aria-hidden="true"></span><span>1 小格 = 0.1</span><span class="decimal-key-dot" aria-hidden="true">·</span><span>10 小格 = 1 整条</span></div>';
    if (task.kind === 'decimal-tenths') {
      content = strip(ctx, m.tenths, '涂色的小花带', 'a');
    } else if (task.kind === 'decimal-compare') {
      content = strip(ctx, m.aTenths, '左边 ' + decimal(m.aTenths), 'a') + strip(ctx, m.bTenths, '右边 ' + decimal(m.bTenths), 'b');
    } else if (task.kind === 'decimal-whole') {
      content = strip(ctx, 10, '先有一整条', 'a') + strip(ctx, m.extraTenths, '再添 ' + m.extraTenths + ' 小格', 'b');
    } else if (task.kind === 'decimal-add') {
      if (ctx.solved) {
        var total = m.aTenths + m.bTenths;
        content = strip(ctx, Math.min(total, 10), '合起来的第一条', 'a', m.aTenths);
        if (total > 10) content += strip(ctx, total - 10, '接着涂第二条', 'b');
      } else {
        content = strip(ctx, m.aTenths, '先有 ' + decimal(m.aTenths), 'a') + strip(ctx, m.bTenths, '再添 ' + decimal(m.bTenths), 'b');
      }
    }
    var result = '';
    if (ctx.solved) {
      var text = task.kind === 'decimal-compare' ? decimal(m.aTenths) + (m.aTenths > m.bTenths ? ' > ' : ' < ') + decimal(m.bTenths) : '表示的小数：' + decimal(task.answer);
      result = '<div class="decimal-answer">' + ctx.escape(text) + '</div>';
    }
    var hint = ctx.hinted && !ctx.solved ? '<p class="decimal-scene-hint">' + ctx.escape(task.hint) + '</p>' : '';
    return '<div class="scene decimal-scene" data-decimal-kind="' + ctx.escape(task.kind) + '"><div class="decimal-garden-heading"><span aria-hidden="true">✿</span><strong>一样大的小格，慢慢数</strong></div>' +
      '<div class="decimal-boards">' + content + '</div>' + guide + hint + result + '</div>';
  }

  if (root.NumberForestViews && typeof root.NumberForestViews.register === 'function') {
    ['decimal-tenths', 'decimal-compare', 'decimal-add', 'decimal-whole'].forEach(function (kind) {
      root.NumberForestViews.register(kind, { render: render });
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
