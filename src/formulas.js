(function (root, factory) {
  'use strict';
  var formulas = factory();
  if (typeof module === 'object' && module.exports) module.exports = formulas;
  root.NumberForestFormulas = formulas;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function token(text, role, label) {
    return { text: String(text), role: role, label: label || '' };
  }

  function operator(text) {
    var labels = { '+': '加上', '−': '减去', '×': '乘', '÷': '除以', '=': '等于', '→': '接着是' };
    return token(text, 'operator', labels[text] || '比较关系');
  }

  function row(tokens, caption) {
    var result = { tokens: tokens };
    if (caption) result.caption = caption;
    return result;
  }

  function equation(a, sign, b, result, caption) {
    return row([a, operator(sign), b, operator('='), result], caption);
  }

  function clockText(hour, minute) {
    return hour + (minute === 0 ? '点整' : minute === 30 ? '点半' : '点' + minute + '分');
  }

  function selectionLimit(task) {
    if (task.maxAnswer !== undefined) {
      return Number.isSafeInteger(task.maxAnswer) && task.maxAnswer >= 0 ? task.maxAnswer : -1;
    }
    // Generated tasks always supply maxAnswer. Standalone examples can omit it;
    // use the existing lesson's keypad range while retaining larger extensions.
    var limit = task.kind === 'clock' || task.kind === 'clock-forward' ? 750 :
      task.kind === 'sharing' || task.kind === 'pack' || task.kind === 'group-count' ? 5 :
      task.kind === 'bonds' && task.model.total <= 10 ? 10 : 20;
    return Math.max(limit, task.answer);
  }

  // A selection is a preview, not a correctness decision. Preview targets keep
  // unknown=true; the caller must distinguish them visually from solved facts.
  // Only solved === true reveals the answer, regardless of the selected value.
  function describe(task, options) {
    if (!task || typeof task.kind !== 'string' || !task.model ||
        !Number.isSafeInteger(task.answer) || task.answer < 0) {
      throw new TypeError('Formulas need a task with a model and a nonnegative integer answer.');
    }
    var m = task.model;
    var solved = !!options && options.solved === true;
    var selected = options && options.selected;
    var canPreview = !solved && Number.isSafeInteger(selected) && selected >= 0 && selected <= selectionLimit(task);
    var clock = task.kind === 'clock' || task.kind === 'clock-forward';
    if (clock && canPreview) {
      var hour = Math.floor(selected / 60), minute = selected % 60;
      canPreview = canPreview && hour >= 1 && hour <= 12 && (minute === 0 || minute === 30);
    }
    var previewText = canPreview ? (clock ? clockText(hour, minute) : String(selected)) : '?';
    function target(role, label, value) {
      var preview = canPreview && task.kind !== 'compare';
      var result = token(solved ? (value === undefined ? task.answer : value) : preview ? previewText : '?', role, label);
      result.unknown = !solved;
      result.preview = preview;
      return result;
    }
    var a, b, result, rows;

    if (task.kind === 'bonds') {
      return { title: '补齐的算式', rows: [
        equation(token(m.visible, 'a', '已有的颗数'), '+', target('b', '还要补几颗'), token(m.total, 'result', '需要的颗数'))
      ], note: '已有的和补上的合起来，就是篮子需要的数量。' };
    }

    if (task.kind === 'add' || task.kind === 'subtract') {
      var add = task.kind === 'add';
      return { title: add ? '合起来的算式' : '拿走后的算式', rows: [
        equation(token(m.a, 'a', '原来的颗数'), add ? '+' : '−', token(m.b, 'b', add ? '添来的颗数' : '拿走的颗数'), target('result', add ? '一共几颗' : '还剩几颗'))
      ] };
    }

    if (task.kind === 'numberline') {
      return { title: '跳一跳的算式', rows: [
        equation(token(m.start, 'a', '出发的数'), m.step > 0 ? '+' : '−', token(Math.abs(m.step), 'b', '跳过的格数'), target('result', '到达的数'))
      ], note: m.step > 0 ? '往前跳，数变大。出发点不算一步。' : '往后跳，数变小。出发点不算一步。' };
    }

    if (task.kind === 'groups' || task.kind === 'group-total') {
      rows = [equation(token(m.perGroup, 'a', '每篮几颗'), '×', token(m.groups, 'b', task.kind === 'groups' ? '添完有几篮' : '一共几篮'), target('result', '一共几颗'))];
      if (task.kind === 'groups') {
        rows.push(equation(token(m.perGroup * m.previousGroups, 'a', '原来的颗数'), '+', token(m.perGroup, 'b', '新一篮的颗数'), target('result', '一共几颗'), '已经知道原来的数量，再添一篮。'));
      } else {
        var repeated = [];
        for (var index = 0; index < m.groups; index++) {
          if (index) repeated.push(operator('+'));
          repeated.push(token(m.perGroup, 'a', '一篮的颗数'));
        }
        repeated.push(operator('='), target('result', '一共几颗'));
        rows.push(row(repeated, '每篮一样多，也可以一篮一篮加起来。'));
      }
      return { title: '一篮一篮的算式', rows: rows, note: '每篮的颗数 × 篮数 = 总颗数。' };
    }

    if (task.kind === 'group-count') {
      return { title: '找篮数的算式', rows: [
        equation(token(m.perGroup, 'a', '每篮几颗'), '×', target('b', '一共几篮'), token(m.total, 'result', '总共几颗')),
        equation(token(m.total, 'a', '总共几颗'), '÷', token(m.perGroup, 'b', '每篮几颗'), target('result', '一共几篮'), '看看总数里有几份这样的整篮。')
      ] };
    }

    if (task.kind === 'sharing') {
      return { title: '平均分的算式', rows: [
        equation(token(m.total, 'a', '总共几颗'), '÷', token(m.groups, 'b', '分给几个人'), target('result', '每人几颗')),
        equation(target('a', '每人几颗'), '×', token(m.groups, 'b', '一共几个人'), token(m.total, 'result', '总共几颗'), '每人分得一样多，合起来还是这些果子。')
      ] };
    }

    if (task.kind === 'pack') {
      return { title: '装成袋的算式', rows: [
        equation(token(m.total, 'a', '总共几颗'), '÷', token(m.perGroup, 'b', '每袋几颗'), target('result', '能装几袋')),
        equation(token(m.perGroup, 'a', '每袋几颗'), '×', target('b', '能装几袋'), token(m.total, 'result', '总共几颗'), '每袋装同样多，一袋就是一组。')
      ] };
    }

    if (task.kind === 'compare') {
      var left = token(m.a, 'a', '左篮的颗数');
      var right = token(m.b, 'b', '右篮的颗数');
      if (canPreview && selected === m.a) left.preview = true;
      if (canPreview && selected === m.b) right.preview = true;
      return { title: '看看两边的大小', rows: [row([
        left, target('operator', '比较关系', m.a > m.b ? '>' : m.a < m.b ? '<' : '='), right
      ], '大口朝着较大的数，尖尖朝着较小的数。')], note: '题目要选松果更' + (m.ask === 'less' ? '少' : '多') + '的一篮，比较符号帮我们看两边的关系。' };
    }

    if (task.kind === 'sequence') {
      var sequence = [];
      m.values.forEach(function (value, index) {
        if (index) sequence.push(operator('→'));
        sequence.push(value === null ? target('result', '空位里的数') : token(value, 'neutral', '队列里的数'));
      });
      rows = [row(sequence)];
      var missingIndex = m.values.indexOf(null);
      if (missingIndex > 0) {
        a = token(m.values[missingIndex - 1], 'a', '前面的数');
        b = token(Math.abs(m.step), 'b', '每次变化');
        result = target('result', '空位里的数');
      } else if (missingIndex === 0 && m.values.length > 1) {
        a = target('a', '空位里的数');
        b = token(Math.abs(m.step), 'b', '每次变化');
        result = token(m.values[1], 'result', '后面的数');
      }
      if (a) rows.push(equation(a, m.step > 0 ? '+' : '−', b, result, '相邻的两个数，也能写成算式。'));
      return { title: '数字排队的规律', rows: rows, note: '从左往右，每次' + (m.step > 0 ? '加 ' : '减 ') + Math.abs(m.step) + '。' };
    }

    if (task.kind === 'clock') {
      return { title: '把钟面读成时间', rows: [row([
        token('钟面时间', 'neutral', '看短针和长针'), operator('='), target('result', '现在是几点', clockText(m.hour, m.minute))
      ])], note: '短针告诉我们小时，长针告诉我们分钟。' };
    }

    if (task.kind === 'clock-forward') {
      return { title: '看看时间怎样走', rows: [row([
        token(clockText(m.hour, m.minute), 'a', '现在的时间'), token('再过', 'neutral', ''),
        token(m.advance === 60 ? '1小时' : m.advance + '分钟', 'b', '经过的时间'), operator('→'),
        target('result', '后来的时间', clockText(m.targetHour, m.targetMinute))
      ])], note: '60 分钟是 1 小时，12 点后接着走到 1 点。' };
    }

    // An extension without a formula renderer can keep playing. Do not invent
    // an equation or read completed relation strings that may expose answers.
    return { title: '一起找关系', rows: [] };
  }

  return Object.freeze({ describe: describe });
});
