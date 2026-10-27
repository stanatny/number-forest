(function (root, factory) {
  'use strict';
  var core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  root.NumberForestCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var registry = new Map();
  var metadataKeys = ['id', 'title', 'subtitle', 'description', 'icon', 'accent', 'level'];

  function registerChapter(definition) {
    if (!definition || typeof definition.id !== 'string' || !definition.id.trim()) {
      throw new TypeError('A chapter needs a nonempty id.');
    }
    if (typeof definition.generator !== 'function') {
      throw new TypeError('A chapter needs a generator function.');
    }
    if (registry.has(definition.id)) throw new Error('Chapter already registered: ' + definition.id);
    var metadata = {};
    metadataKeys.forEach(function (key) { metadata[key] = definition[key]; });
    Object.freeze(metadata);
    registry.set(definition.id, { metadata: metadata, generator: definition.generator });
    return metadata;
  }

  function getChapter(id) {
    var entry = registry.get(id);
    return entry ? entry.metadata : undefined;
  }

  function createTask(chapterId, options) {
    var entry = registry.get(chapterId);
    if (!entry) throw new RangeError('Unknown chapter: ' + chapterId);
    options = options || {};
    var round = options.round === undefined ? 0 : options.round;
    var random = options.random === undefined ? Math.random : options.random;
    if (!Number.isInteger(round) || round < 0) throw new RangeError('round must be a nonnegative integer.');
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    function integer(min, max) {
      var sample = random();
      if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError('random must return a number in [0, 1).');
      }
      return min + Math.floor(sample * (max - min + 1));
    }
    var task = entry.generator({
      round: round,
      random: random,
      integer: integer,
      challenge: options.challenge === true
    });
    if (!task || !Number.isInteger(task.answer) || !Number.isInteger(task.maxAnswer) ||
        task.answer < 0 || task.answer > task.maxAnswer) {
      throw new TypeError('A generated task must have an integer answer within its bounds.');
    }
    return Object.assign({}, task, { chapterId: chapterId });
  }

  function checkAnswer(task, value) {
    // The UI explicitly converts a complete input. Empty strings, booleans and
    // numeric-looking strings must never silently become a correct answer.
    return !!task && typeof value === 'number' && Number.isFinite(value) &&
      Number.isInteger(value) && value === task.answer;
  }

  function timeText(hour, minute) {
    return hour + ':' + (minute === 0 ? '00' : '30');
  }

  function bondTask(total, visible, equation) {
    var missing = total - visible;
    return {
      kind: 'bonds', prompt: '篮子需要 ' + total + ' 颗松果，已经有 ' + visible + ' 颗，还要补几颗？',
      instruction: equation ? '把空格里的数补出来，也可以用松果摆一摆。' : '看看篮子里已有的松果，把剩下的空位补齐。',
      answer: missing, maxAnswer: total > 10 ? 20 : 10, answerLabel: '还要补几颗？', unit: '颗',
      model: equation ? { total: total, visible: visible, equation: equation } : { total: total, visible: visible },
      relations: [visible + ' + ' + missing + ' = ' + total, total + ' − ' + visible + ' = ' + missing],
      hint: '从已有的 ' + visible + ' 颗接着数到 ' + total + '，还差几颗？也可以数一数空位。',
      success: '已有 ' + visible + ' 颗，再补上 ' + missing + ' 颗，篮子里就有 ' + total + ' 颗了。'
    };
  }

  function groupModel(context) {
    var perGroup = context.integer(2, 5);
    var groups = context.integer(2, Math.min(5, Math.floor(20 / perGroup)));
    return { perGroup: perGroup, groups: groups, total: perGroup * groups };
  }

  registerChapter({
    id: 'bonds', title: '松果小屋', subtitle: '补一补，比一比',
    description: '分与合、比较多少，再找出数列里缺少的数。', icon: '🌰', accent: '#b86937', level: '分合 · 比较 · 数序',
    generator: function (context) {
      var slot = context.round % 10;
      if ([1, 4, 7].includes(slot)) {
        var a = context.integer(0, 20);
        var b = context.integer(0, 19);
        if (b >= a) b += 1;
        var ask = slot === 4 ? 'less' : 'more';
        var answer = ask === 'more' ? Math.max(a, b) : Math.min(a, b);
        var other = ask === 'more' ? Math.min(a, b) : Math.max(a, b);
        var label = ask === 'more' ? '多' : '少';
        return {
          kind: 'compare', prompt: '两篮松果，哪一篮更' + label + '？',
          instruction: '可以把两边一颗对一颗地比，再选更' + label + '的那一篮。',
          answer: answer, maxAnswer: 20, answerLabel: '选松果更' + label + '的一篮', unit: '颗',
          model: { a: a, b: b, ask: ask },
          relations: [answer + (ask === 'more' ? ' > ' : ' < ') + other, Math.max(a, b) + ' − ' + Math.min(a, b) + ' = ' + Math.abs(a - b)],
          hint: '一颗对一颗地比。有剩余的那一篮更多，另一篮更少。',
          success: answer + ' 颗比 ' + other + ' 颗更' + label + '。两篮相差 ' + Math.abs(a - b) + ' 颗。'
        };
      }
      if ([2, 5, 8].includes(slot)) {
        var step = slot === 2 ? 1 : slot === 5 ? 2 : -1;
        var first = step > 0 ? context.integer(0, 20 - step * 3) : context.integer(3, 20);
        var values = Array.from({ length: 4 }, function (_, index) { return first + step * index; });
        var missingIndex = context.integer(1, 3);
        var missing = values[missingIndex];
        var complete = values.slice();
        values[missingIndex] = null;
        return {
          kind: 'sequence', prompt: '小松果排好队，空位里应该是几？',
          instruction: step > 0 ? '从左往右看，每次多 ' + step + '。' : '从左往右看，每次少 ' + Math.abs(step) + '。',
          answer: missing, maxAnswer: 20, answerLabel: '空位里填几？', unit: '',
          model: { values: values, step: step, missingIndex: missingIndex },
          relations: [complete.join(' → '), complete[missingIndex - 1] + (step > 0 ? ' + ' : ' − ') + Math.abs(step) + ' = ' + missing],
          hint: '看空位前面的数，再' + (step > 0 ? '加上 ' : '减去 ') + Math.abs(step) + '。',
          success: '空位里是 ' + missing + '。这一队每次' + (step > 0 ? '增加 ' : '减少 ') + Math.abs(step) + '。'
        };
      }
      var total = context.integer(1, 10);
      return bondTask(total, context.integer(0, total));
    }
  });

  registerChapter({
    id: 'arithmetic', title: '森林补给', subtitle: '合起来，向前跳',
    description: '20 以内加减、补数和数线上跳一跳。', icon: '🧺', accent: '#47866d', level: '20 以内 · 四种玩法',
    generator: function (context) {
      var slot = context.round % 10;
      if (slot === 2 || slot === 6) {
        var total = context.integer(11, 20);
        var visible = context.integer(1, total - 1);
        return bondTask(total, visible, visible + ' + □ = ' + total);
      }
      if (slot === 3 || slot === 7) {
        var distance = context.integer(2, 5);
        var step = slot === 3 ? distance : -distance;
        var start = step > 0 ? context.integer(0, 20 - step) : context.integer(distance, 20);
        var end = start + step;
        return {
          kind: 'numberline', prompt: '从 ' + start + ' 出发，向' + (step > 0 ? '前' : '后') + '跳 ' + distance + ' 格，会到几？',
          instruction: '出发点不算一步，每跨过一格才算一步。',
          answer: end, maxAnswer: 20, answerLabel: '最后停在哪个数？', unit: '',
          model: { start: start, step: step },
          relations: [start + (step > 0 ? ' + ' : ' − ') + distance + ' = ' + end, end + (step > 0 ? ' − ' : ' + ') + distance + ' = ' + start],
          hint: '先找到 ' + start + '，再朝' + (step > 0 ? '大数' : '小数') + '的方向数 ' + distance + ' 步。',
          success: '从 ' + start + ' ' + (step > 0 ? '加上 ' : '减去 ') + distance + '，就到了 ' + end + '。'
        };
      }
      var subtract = slot === 1 || slot === 5 || slot === 9;
      var a, b, answer;
      if (subtract) {
        a = context.integer(slot === 5 ? 0 : 11, 20);
        b = context.integer(slot === 5 ? 0 : 1, slot === 1 ? 10 : a);
        answer = a - b;
        return {
          kind: 'subtract', prompt: '有 ' + a + ' 颗果子，拿走 ' + b + ' 颗，还剩几颗？',
          instruction: '看清拿走的那一部分，再数留下的果子。', answer: answer, maxAnswer: 20,
          answerLabel: '还剩几颗？', unit: '颗', model: { a: a, b: b },
          relations: [a + ' − ' + b + ' = ' + answer, answer + ' + ' + b + ' = ' + a, a + ' − ' + answer + ' = ' + b],
          hint: '把 ' + b + ' 颗果子拿走。剩下的和拿走的，合起来还是 ' + a + ' 颗。',
          success: '剩下 ' + answer + ' 颗；把拿走的 ' + b + ' 颗放回来，又有 ' + a + ' 颗。'
        };
      }
      answer = context.integer(11, 20);
      a = context.integer(answer - 10, 10);
      b = answer - a;
      return {
        kind: 'add', prompt: '原来有 ' + a + ' 颗果子，又送来 ' + b + ' 颗，一共有几颗？',
        instruction: '把两边合起来，可以先凑成 10，再看还多几颗。', answer: answer, maxAnswer: 20,
        answerLabel: '一共有几颗？', unit: '颗', model: { a: a, b: b },
        relations: [a + ' + ' + b + ' = ' + answer, '10 + ' + (answer - 10) + ' = ' + answer, answer + ' − ' + b + ' = ' + a],
        hint: a === 10 ? '这一篮已经有 10 颗，再添上另一篮的 ' + b + ' 颗。' : '先给 ' + a + ' 颗补上 ' + (10 - a) + ' 颗凑成 10，再看看另一篮还剩几颗。',
        success: '两部分合起来有 ' + answer + ' 颗，也就是 10 颗再加 ' + (answer - 10) + ' 颗。'
      };
    }
  });

  registerChapter({
    id: 'groups', title: '种子花园', subtitle: '一组一组地发现',
    description: '多一组、数总数、找组数，连接重复加法与乘法。', icon: '🌱', accent: '#638745', level: '20 以内 · 成组探索',
    generator: function (context) {
      var slot = context.round % 10;
      var model = slot === 0 ? { perGroup: 3, groups: 4, total: 12 } : groupModel(context);
      var perGroup = model.perGroup, groups = model.groups, total = model.total;
      var repeated = Array(groups).fill(perGroup).join(' + ') + ' = ' + total;
      if ([1, 4, 7].includes(slot)) {
        return {
          kind: 'group-total', prompt: '每篮 ' + perGroup + ' 颗松果，一共有 ' + groups + ' 篮，总共有几颗？',
          instruction: '一篮一篮地数，每次都加上一篮的数量。', answer: total, maxAnswer: 20,
          answerLabel: '一共有几颗？', unit: '颗', model: model,
          relations: [repeated, perGroup + ' × ' + groups + ' = ' + total],
          hint: '每一篮都有 ' + perGroup + ' 颗。把 ' + groups + ' 个 ' + perGroup + ' 加起来。',
          success: '每篮 ' + perGroup + ' 颗，' + groups + ' 篮合起来是 ' + total + ' 颗。'
        };
      }
      if ([2, 5, 8].includes(slot)) {
        return {
          kind: 'group-count', prompt: '共有 ' + total + ' 颗松果，每篮 ' + perGroup + ' 颗，这里有几篮？',
          instruction: '把每一篮当成一组，数数有几组。', answer: groups, maxAnswer: 5,
          answerLabel: '一共有几篮？', unit: '篮', model: model,
          relations: [total + ' ÷ ' + perGroup + ' = ' + groups, perGroup + ' × ' + groups + ' = ' + total, repeated],
          hint: '每次数一整篮；不要把篮子里的每颗松果当成一篮。',
          success: '一共有 ' + groups + ' 篮。每篮 ' + perGroup + ' 颗，合起来正好 ' + total + ' 颗。'
        };
      }
      var previousGroups = groups - 1;
      var previousTotal = perGroup * previousGroups;
      return {
        kind: 'groups', prompt: '每篮 ' + perGroup + ' 颗松果，原来有 ' + previousGroups + ' 篮，再添一篮后一共有几颗？',
        instruction: '先看原来的 ' + previousGroups + ' 篮松果，想想再添一篮会多几颗。',
        answer: total, maxAnswer: 20, answerLabel: '再添一篮后一共有几颗？', unit: '颗',
        model: { perGroup: perGroup, groups: groups, previousGroups: previousGroups },
        relations: [repeated, perGroup + ' × ' + previousGroups + ' = ' + previousTotal, perGroup + ' × ' + groups + ' = ' + total, previousTotal + ' + ' + perGroup + ' = ' + total],
        hint: '原来的 ' + previousGroups + ' 篮有 ' + previousTotal + ' 颗松果。多一篮，就是再添 ' + perGroup + ' 颗。',
        success: '每篮 ' + perGroup + ' 颗松果，' + groups + ' 篮就是 ' + total + ' 颗。多一篮，总数就多 ' + perGroup + ' 颗！'
      };
    }
  });

  registerChapter({
    id: 'sharing', title: '野餐草地', subtitle: '平均分，装成袋',
    description: '分给几个人、每袋装几个，认识两种平均分。', icon: '🍎', accent: '#c36b67', level: '20 以内 · 平均分',
    generator: function (context) {
      var slot = context.round % 10;
      if ([1, 4, 7].includes(slot)) {
        var model = groupModel(context);
        return {
          kind: 'pack', prompt: model.total + ' 颗松果，每袋装 ' + model.perGroup + ' 颗，可以装几袋？',
          instruction: '每 ' + model.perGroup + ' 颗圈成一组，一组装一袋。',
          answer: model.groups, maxAnswer: 5, answerLabel: '可以装几袋？', unit: '袋', model: model,
          relations: [model.total + ' ÷ ' + model.perGroup + ' = ' + model.groups, model.perGroup + ' × ' + model.groups + ' = ' + model.total],
          hint: '一袋装 ' + model.perGroup + ' 颗。把所有松果分成这样的几组，就能装几袋。',
          success: '可以装 ' + model.groups + ' 袋，每袋 ' + model.perGroup + ' 颗，正好用完 ' + model.total + ' 颗。'
        };
      }
      var groups = slot === 0 ? 4 : context.integer(2, 5);
      var perGroup = slot === 0 ? 3 : context.integer(1, Math.min(5, Math.floor(20 / groups)));
      var total = groups * perGroup;
      return {
        kind: 'sharing', prompt: total + ' 颗果子分给 ' + groups + ' 个小伙伴，每人一样多，每人分到几颗？',
        instruction: '试着一人分一颗，再分一轮，直到果子分完。',
        answer: perGroup, maxAnswer: 5, answerLabel: '每个小伙伴分到几颗？', unit: '颗',
        model: { total: total, groups: groups, perGroup: perGroup },
        relations: [total + ' ÷ ' + groups + ' = ' + perGroup, perGroup + ' × ' + groups + ' = ' + total, Array(groups).fill(perGroup).join(' + ') + ' = ' + total],
        hint: '每轮都给每人一颗。每个小伙伴得到的数量要一样，最后也不能剩下。',
        success: '每人 ' + perGroup + ' 颗，' + groups + ' 个人合起来正好是 ' + total + ' 颗。'
      };
    }
  });

  registerChapter({
    id: 'clock', title: '滴答树屋', subtitle: '读时间，看变化',
    description: '整点、半点，再看看半小时或一小时以后。', icon: '🕰️', accent: '#6b7caf', level: '整点 · 半点 · 时间变化',
    generator: function (context) {
      var slot = context.round % 10;
      var hour = context.integer(1, 12);
      var minute = slot < 3 ? 0 : slot < 6 ? 30 : context.integer(0, 1) * 30;
      var nextHour = hour === 12 ? 1 : hour + 1;
      var time = timeText(hour, minute);
      if (slot === 7 || slot === 9) {
        var advance = slot === 7 ? 30 : 60;
        var target = ((hour % 12) * 60 + minute + advance) % 720;
        var targetHour = Math.floor(target / 60) || 12;
        var targetMinute = target % 60;
        var targetTime = timeText(targetHour, targetMinute);
        var duration = advance === 30 ? '半小时' : '一小时';
        return {
          kind: 'clock-forward', prompt: '现在是 ' + time + '，再过' + duration + '是几点？',
          instruction: '想想分针向前走' + (advance === 30 ? '半圈' : '一圈') + '，时针也会跟着往前走。',
          answer: targetHour * 60 + targetMinute, maxAnswer: 750, answerLabel: '再过' + duration + '是几点？', unit: '',
          model: { hour: hour, minute: minute, advance: advance, targetHour: targetHour, targetMinute: targetMinute },
          relations: [time + ' → ' + targetTime, duration + ' = ' + advance + ' 分钟'],
          hint: advance === 30 ? '半小时是 30 分钟。整点走到半点；半点再往前走，就到下一个整点。' : '一小时后，分钟不变，小时向前走一个；12 点的下一小时是 1 点。',
          success: time + ' 再过' + duration + '，就是 ' + targetTime + '。'
        };
      }
      return {
        kind: 'clock', prompt: '小松鼠的钟现在是几点？',
        instruction: '先找短短的时针，再看长长的分针。选出钟上的时间。',
        answer: hour * 60 + minute, maxAnswer: 750, answerLabel: '现在是几点？', unit: '',
        model: { hour: hour, minute: minute },
        relations: minute === 0 ? [time + ' = ' + hour + ' 点整', '分针指着 12，时针指着 ' + hour] : [time + ' = ' + hour + ' 点半', '半小时 = 30 分钟', '时针走在 ' + hour + ' 和 ' + nextHour + ' 的中间'],
        hint: minute === 0 ? '长针指向 12，表示整点。短针指着几，就是几点整。' : '长针指向 6，表示过了半小时。短针刚走过 ' + hour + '，还没到 ' + nextHour + '。',
        success: minute === 0 ? '这是 ' + hour + ' 点整。分针走一整圈，时间就过去一小时。' : '这是 ' + hour + ' 点半。过了半小时，时针也走到了两个数字中间。'
      };
    }
  });

  return Object.freeze({
    get chapters() {
      return Object.freeze(Array.from(registry.values(), function (entry) { return entry.metadata; }));
    },
    registerChapter: registerChapter,
    getChapter: getChapter,
    createTask: createTask,
    checkAnswer: checkAnswer
  });
});
